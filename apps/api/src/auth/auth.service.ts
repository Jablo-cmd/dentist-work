import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  ChangePasswordRequest,
  CurrentUser,
  LoginRequest,
  MfaVerifyRequest,
} from '@dpms/contracts';

export type LoginResult =
  | { kind: 'session'; user: CurrentUser; token: string; expiresAt: Date }
  | { kind: 'mfa'; challenge: string };
import { CodedHttpException } from '../common/http-exception.filter';
import { ENV, type Env } from '../config/env';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { permissionsFor } from '../access/permissions';
import type { Principal } from './auth.types';
import { MfaService, mfaFlags } from './mfa.service';
import { assertAcceptablePassword, PasswordService } from './password.service';
import { SessionService } from './session.service';

export interface RequestContext {
  requestId: string;
  ip?: string;
  userAgent?: string;
}

const invalid = () =>
  new CodedHttpException(
    HttpStatus.UNAUTHORIZED,
    'INVALID_CREDENTIALS',
    'Invalid email or password.',
  );

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly mfa: MfaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async login(input: LoginRequest, ctx: RequestContext): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: { roleAssignments: true, mfa: true, organisation: { select: { name: true } } },
    });
    const base = { requestId: ctx.requestId, ipAddress: ctx.ip };

    if (!user) {
      await this.passwords.verifyDummy(input.password);
      await this.audit.recordBestEffort({
        ...base,
        action: 'auth.login',
        outcome: 'FAILURE',
        metadata: { reason: 'unknown_user' },
      });
      throw invalid();
    }

    const passwordOk = await this.passwords.verify(user.passwordHash, input.password);
    const locked = user.lockedUntil !== null && user.lockedUntil.getTime() > Date.now();
    const auditBase = {
      ...base,
      actorUserId: user.id,
      organisationId: user.organisationId,
      action: 'auth.login',
    };

    if (!user.isActive || locked) {
      // Same client-visible result as a wrong password; reason is recorded for administrators only.
      await this.audit.recordBestEffort({
        ...auditBase,
        outcome: 'DENIED',
        metadata: { reason: locked ? 'locked' : 'inactive' },
      });
      throw invalid();
    }

    if (!passwordOk) {
      const updated = await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: { increment: 1 } },
        select: { failedLoginCount: true },
      });
      let lockedNow = false;
      if (updated.failedLoginCount >= this.env.loginMaxFailedAttempts) {
        lockedNow = true;
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: 0,
            lockedUntil: new Date(Date.now() + this.env.loginLockoutMinutes * 60_000),
          },
        });
      }
      await this.audit.recordBestEffort({
        ...auditBase,
        outcome: 'FAILURE',
        metadata: { reason: 'bad_password', lockedNow },
      });
      throw invalid();
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    if (this.passwords.needsRehash(user.passwordHash)) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await this.passwords.hash(input.password) },
      });
    }
    // Password accepted. If a second factor is enrolled, no session exists until it is proven.
    if (user.mfa?.confirmedAt) {
      const challenge = await this.mfa.createChallenge(user.id);
      return { kind: 'mfa', challenge };
    }
    return this.completeLogin(user, ctx);
  }

  /** Second step of a two-step sign-in: exchange the challenge plus a code for a session. */
  async verifyMfa(
    input: MfaVerifyRequest,
    ctx: RequestContext,
  ): Promise<Extract<LoginResult, { kind: 'session' }>> {
    const userId = await this.mfa.verifyChallenge(input, { requestId: ctx.requestId, ip: ctx.ip });
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roleAssignments: true, mfa: true, organisation: { select: { name: true } } },
    });
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    return this.completeLogin(user, ctx);
  }

  private async completeLogin(
    user: Prisma.UserGetPayload<{
      include: { roleAssignments: true; mfa: true; organisation: { select: { name: true } } };
    }>,
    ctx: RequestContext,
  ): Promise<Extract<LoginResult, { kind: 'session' }>> {
    const { token, expiresAt } = await this.sessions.create(user.id, ctx.userAgent);
    // Fail closed: if the success event cannot be recorded, the login is not completed.
    try {
      await this.audit.record({
        requestId: ctx.requestId,
        ipAddress: ctx.ip,
        actorUserId: user.id,
        organisationId: user.organisationId,
        action: 'auth.login',
        outcome: 'SUCCESS',
        metadata: { mfa: !!user.mfa?.confirmedAt },
      });
    } catch (err) {
      await this.sessions.revokeAllForUser(user.id, 'audit_failure');
      throw err;
    }
    const assignments = user.roleAssignments.map((a) => ({
      role: a.role,
      practiceId: a.practiceId,
    }));
    return {
      kind: 'session',
      token,
      expiresAt,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        organisationId: user.organisationId,
        organisationName: user.organisation.name,
        mustChangePassword: user.mustChangePassword,
        ...mfaFlags(this.env, assignments, !!user.mfa?.confirmedAt),
        assignments,
        permissions: permissionsFor(assignments),
      },
    };
  }

  async logout(principalId: string, sessionId: string, ctx: RequestContext): Promise<void> {
    await this.sessions.revoke(sessionId, 'logout');
    await this.audit.recordBestEffort({
      action: 'auth.logout',
      outcome: 'SUCCESS',
      actorUserId: principalId,
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
  }

  /** Changes the caller's own password. Revokes every other session; keeps the current one. */
  async changePassword(
    p: Principal,
    input: ChangePasswordRequest,
    ctx: RequestContext,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: p.id } });
    const base = {
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
      actorUserId: p.id,
      organisationId: p.organisationId,
      action: 'auth.password_change',
    };
    if (!(await this.passwords.verify(user.passwordHash, input.currentPassword))) {
      await this.audit.recordBestEffort({
        ...base,
        outcome: 'FAILURE',
        metadata: { reason: 'bad_current_password' },
      });
      throw new CodedHttpException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'Current password is incorrect.',
      );
    }
    assertAcceptablePassword(input.newPassword, user.email);
    if (input.newPassword === input.currentPassword) {
      throw new CodedHttpException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'New password must differ from the current password.',
      );
    }
    const passwordHash = await this.passwords.hash(input.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: p.id },
        data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() },
      });
      await tx.session.updateMany({
        where: { userId: p.id, revokedAt: null, id: { not: p.sessionId } },
        data: { revokedAt: new Date(), revokedReason: 'password_changed' },
      });
      await this.audit.record({ ...base, outcome: 'SUCCESS' }, tx);
    });
  }
}
