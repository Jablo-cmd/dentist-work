import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { CurrentUser, LoginRequest } from '@dpms/contracts';
import { CodedHttpException } from '../common/http-exception.filter';
import { ENV, type Env } from '../config/env';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { permissionsFor } from '../access/permissions';
import { PasswordService } from './password.service';
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
    @Inject(ENV) private readonly env: Env,
  ) {}

  async login(
    input: LoginRequest,
    ctx: RequestContext,
  ): Promise<{ user: CurrentUser; token: string; expiresAt: Date }> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: { roleAssignments: true },
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
    const { token, expiresAt } = await this.sessions.create(user.id, ctx.userAgent);
    // Fail closed: if the success event cannot be recorded, the login is not completed.
    try {
      await this.audit.record({ ...auditBase, outcome: 'SUCCESS' });
    } catch (err) {
      await this.sessions.revokeAllForUser(user.id, 'audit_failure');
      throw err;
    }
    const assignments = user.roleAssignments.map((a) => ({
      role: a.role,
      practiceId: a.practiceId,
    }));
    return {
      token,
      expiresAt,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        organisationId: user.organisationId,
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
}
