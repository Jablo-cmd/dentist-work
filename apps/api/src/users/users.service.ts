import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type RoleKey } from '@prisma/client';
import type {
  AddAssignmentRequest,
  CreateUserRequest,
  Paginated,
  PaginationQuery,
  ResetPasswordRequest,
  UpdateUserRequest,
  UserSummary,
} from '@dpms/contracts';
import { hasPermission, practiceScope } from '../access/permissions';
import type { Principal } from '../auth/auth.types';
import { assertAcceptablePassword, PasswordService } from '../auth/password.service';
import { MfaService } from '../auth/mfa.service';
import { SessionService } from '../auth/session.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

/** Roles a practice administrator may grant (never equal-or-higher privilege). */
const PRACTICE_GRANTABLE: readonly RoleKey[] = ['DENTIST', 'RECEPTIONIST', 'BILLING_ADMINISTRATOR'];

type UserRow = Prisma.UserGetPayload<{ include: { roleAssignments: true; mfa: true } }>;

const toDto = (u: UserRow): UserSummary => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  isActive: u.isActive,
  mustChangePassword: u.mustChangePassword,
  mfaEnabled: !!u.mfa?.confirmedAt,
  lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  assignments: u.roleAssignments.map((a) => ({ id: a.id, role: a.role, practiceId: a.practiceId })),
});

export interface Ctx {
  requestId: string;
  ip?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly mfa: MfaService,
    private readonly audit: AuditService,
  ) {}

  private isOrgAdmin(p: Principal): boolean {
    return hasPermission(p.assignments, 'user.manage', { orgWide: true });
  }

  /** May `p` grant/revoke this role at this scope? Prevents privilege escalation. */
  private canGrant(p: Principal, role: RoleKey, practiceId: string | null): boolean {
    if (this.isOrgAdmin(p)) return true;
    if (practiceId === null) return false;
    return (
      PRACTICE_GRANTABLE.includes(role) &&
      hasPermission(p.assignments, 'user.manage', { practiceId })
    );
  }

  /** May `p` administer this existing user at all? */
  private canAdminister(p: Principal, target: UserRow): boolean {
    if (this.isOrgAdmin(p)) return true;
    if (target.roleAssignments.length === 0) return false;
    return target.roleAssignments.every(
      (a) =>
        a.practiceId !== null &&
        PRACTICE_GRANTABLE.includes(a.role) &&
        hasPermission(p.assignments, 'user.manage', { practiceId: a.practiceId }),
    );
  }

  private async load(p: Principal, id: string): Promise<UserRow> {
    const u = await this.prisma.user.findFirst({
      where: { id, organisationId: p.organisationId },
      include: { roleAssignments: true, mfa: true },
    });
    if (!u) throw new NotFoundException();
    return u;
  }

  private async loadManageable(p: Principal, id: string, ctx: Ctx): Promise<UserRow> {
    const u = await this.load(p, id);
    if (!this.canAdminister(p, u)) {
      await this.audit.recordBestEffort({
        action: 'access.denied',
        outcome: 'DENIED',
        actorUserId: p.id,
        organisationId: p.organisationId,
        targetType: 'user',
        targetId: id,
        requestId: ctx.requestId,
        ipAddress: ctx.ip,
      });
      throw new NotFoundException(); // not distinguishable from absent
    }
    return u;
  }

  async list(p: Principal, q: PaginationQuery): Promise<Paginated<UserSummary>> {
    const scope = practiceScope(p.assignments, 'user.read');
    const where: Prisma.UserWhereInput = scope.orgWide
      ? { organisationId: p.organisationId }
      : {
          organisationId: p.organisationId,
          roleAssignments: { some: { practiceId: { in: scope.practiceIds } } },
        };
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: { roleAssignments: true, mfa: true },
        orderBy: { displayName: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return {
      data: rows.map(toDto),
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.ceil(total / q.pageSize),
      },
    };
  }

  private async assertPracticesInOrg(p: Principal, practiceIds: (string | null)[]): Promise<void> {
    const ids = [...new Set(practiceIds.filter((x): x is string => x !== null))];
    if (!ids.length) return;
    const n = await this.prisma.practice.count({
      where: { id: { in: ids }, organisationId: p.organisationId },
    });
    if (n !== ids.length) throw new NotFoundException();
  }

  async create(p: Principal, input: CreateUserRequest, ctx: Ctx): Promise<UserSummary> {
    await this.assertPracticesInOrg(
      p,
      input.assignments.map((a) => a.practiceId),
    );
    for (const a of input.assignments)
      if (!this.canGrant(p, a.role, a.practiceId)) throw new ForbiddenException();
    assertAcceptablePassword(input.temporaryPassword, input.email);
    const passwordHash = await this.passwords.hash(input.temporaryPassword);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: {
            organisationId: p.organisationId,
            email: input.email,
            displayName: input.displayName,
            passwordHash,
            mustChangePassword: true,
            roleAssignments: {
              create: input.assignments.map((a) => ({ role: a.role, practiceId: a.practiceId })),
            },
          },
          include: { roleAssignments: true, mfa: true },
        });
        await this.audit.record(
          {
            action: 'user.create',
            outcome: 'SUCCESS',
            actorUserId: p.id,
            organisationId: p.organisationId,
            targetType: 'user',
            targetId: u.id,
            requestId: ctx.requestId,
            ipAddress: ctx.ip,
            metadata: { roles: input.assignments.map((a) => a.role).join(',') },
          },
          tx,
        );
        return toDto(u);
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new ConflictException('A user with that email already exists.');
      throw e;
    }
  }

  private async activeOwnerCountExcluding(p: Principal, userId: string): Promise<number> {
    return this.prisma.user.count({
      where: {
        organisationId: p.organisationId,
        isActive: true,
        id: { not: userId },
        roleAssignments: { some: { role: 'ORGANISATION_OWNER', practiceId: null } },
      },
    });
  }

  async update(p: Principal, id: string, input: UpdateUserRequest, ctx: Ctx): Promise<UserSummary> {
    const target = await this.loadManageable(p, id, ctx);
    if (input.isActive === false) {
      if (id === p.id) throw new ConflictException('You cannot deactivate your own account.');
      const isOwner = target.roleAssignments.some((a) => a.role === 'ORGANISATION_OWNER');
      if (isOwner && (await this.activeOwnerCountExcluding(p, id)) === 0)
        throw new ConflictException('The last active Organisation Owner cannot be deactivated.');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data: { displayName: input.displayName, isActive: input.isActive },
        include: { roleAssignments: true, mfa: true },
      });
      await this.audit.record(
        {
          action:
            input.isActive === undefined
              ? 'user.update'
              : input.isActive
                ? 'user.activate'
                : 'user.deactivate',
          outcome: 'SUCCESS',
          actorUserId: p.id,
          organisationId: p.organisationId,
          targetType: 'user',
          targetId: id,
          requestId: ctx.requestId,
          ipAddress: ctx.ip,
        },
        tx,
      );
      return u;
    });
    if (input.isActive === false) await this.sessions.revokeAllForUser(id, 'user_deactivated');
    return toDto(updated);
  }

  async addAssignment(
    p: Principal,
    id: string,
    input: AddAssignmentRequest,
    ctx: Ctx,
  ): Promise<UserSummary> {
    const target = await this.loadManageable(p, id, ctx);
    await this.assertPracticesInOrg(p, [input.practiceId]);
    if (!this.canGrant(p, input.role, input.practiceId)) throw new ForbiddenException();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.userRoleAssignment.create({
          data: { userId: target.id, role: input.role, practiceId: input.practiceId },
        });
        await this.audit.record(
          {
            action: 'user.role_grant',
            outcome: 'SUCCESS',
            actorUserId: p.id,
            organisationId: p.organisationId,
            practiceId: input.practiceId,
            targetType: 'user',
            targetId: id,
            requestId: ctx.requestId,
            ipAddress: ctx.ip,
            metadata: { role: input.role },
          },
          tx,
        );
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new ConflictException('That assignment already exists.');
      throw e;
    }
    return toDto(await this.load(p, id));
  }

  async removeAssignment(
    p: Principal,
    id: string,
    assignmentId: string,
    ctx: Ctx,
  ): Promise<UserSummary> {
    const target = await this.loadManageable(p, id, ctx);
    const a = target.roleAssignments.find((x) => x.id === assignmentId);
    if (!a) throw new NotFoundException();
    if (!this.canGrant(p, a.role, a.practiceId)) throw new ForbiddenException();
    if (
      a.role === 'ORGANISATION_OWNER' &&
      a.practiceId === null &&
      target.isActive &&
      (await this.activeOwnerCountExcluding(p, id)) === 0
    ) {
      throw new ConflictException('The last active Organisation Owner cannot lose that role.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.userRoleAssignment.delete({ where: { id: assignmentId } });
      await this.audit.record(
        {
          action: 'user.role_revoke',
          outcome: 'SUCCESS',
          actorUserId: p.id,
          organisationId: p.organisationId,
          practiceId: a.practiceId,
          targetType: 'user',
          targetId: id,
          requestId: ctx.requestId,
          ipAddress: ctx.ip,
          metadata: { role: a.role },
        },
        tx,
      );
    });
    // Permissions are re-read from the database on every request, so the change is effective immediately.
    return toDto(await this.load(p, id));
  }

  async resetPassword(
    p: Principal,
    id: string,
    input: ResetPasswordRequest,
    ctx: Ctx,
  ): Promise<void> {
    if (id === p.id) throw new ConflictException('Use "change password" for your own account.');
    const target = await this.loadManageable(p, id, ctx);
    assertAcceptablePassword(input.temporaryPassword, target.email);
    const passwordHash = await this.passwords.hash(input.temporaryPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null },
      });
      await this.audit.record(
        {
          action: 'user.password_reset',
          outcome: 'SUCCESS',
          actorUserId: p.id,
          organisationId: p.organisationId,
          targetType: 'user',
          targetId: id,
          requestId: ctx.requestId,
          ipAddress: ctx.ip,
        },
        tx,
      );
    });
    await this.sessions.revokeAllForUser(id, 'password_reset');
  }

  /** Lost authenticator: remove the second factor so the user can enrol again. Same authority rules as other user changes. */
  async resetMfa(p: Principal, id: string, ctx: Ctx): Promise<void> {
    if (id === p.id)
      throw new ConflictException('Use "disable two-factor" from your own security settings.');
    await this.loadManageable(p, id, ctx);
    await this.mfa.adminReset(p, id, ctx);
  }
}
