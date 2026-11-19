import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import {
  ConflictException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  MfaConfirmResponse,
  MfaDisableRequest,
  MfaEnrolResponse,
  MfaVerifyRequest,
  RoleAssignment,
} from '@dpms/contracts';
import { AuditService } from '../audit/audit.service';
import { CodedHttpException } from '../common/http-exception.filter';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import type { Principal } from './auth.types';
import { PasswordService } from './password.service';
import { newRecoveryCode, newSecret, otpauthUri, base32Encode, verifyTotp } from './totp';

const CHALLENGE_TTL_MS = 5 * 60_000;
const MAX_CHALLENGE_ATTEMPTS = 5;
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const invalidCode = () =>
  new CodedHttpException(HttpStatus.UNAUTHORIZED, 'MFA_INVALID', 'Invalid or expired code.');

interface Ctx {
  requestId: string;
  ip?: string;
}

/** Derives the MFA flags shown to the client and used by the guard. */
export function mfaFlags(env: Env, assignments: readonly RoleAssignment[], confirmed: boolean) {
  const required = assignments.some((a) => env.mfaRequiredRoles.includes(a.role));
  return { mfaEnabled: confirmed, mfaEnrolmentRequired: required && !confirmed };
}

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private key(): Buffer {
    if (!this.env.mfaKey)
      throw new ServiceUnavailableException(
        'Multi-factor authentication is not configured on this server.',
      );
    return this.env.mfaKey;
  }

  private encrypt(secret: Buffer): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key(), iv);
    const enc = Buffer.concat([c.update(secret), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
  }

  private decrypt(blob: string): Buffer {
    const raw = Buffer.from(blob, 'base64');
    const d = createDecipheriv('aes-256-gcm', this.key(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]);
  }

  // ---- enrolment -----------------------------------------------------------------------------
  async startEnrolment(p: Principal, ctx: Ctx): Promise<MfaEnrolResponse> {
    const secret = newSecret();
    const enc = this.encrypt(secret);
    const existing = await this.prisma.userMfa.findUnique({ where: { userId: p.id } });
    if (existing?.confirmedAt)
      throw new ConflictException(
        'A second factor is already enabled. Disable it first to enrol a new device.',
      );
    await this.prisma.userMfa.upsert({
      where: { userId: p.id },
      create: { userId: p.id, secretEnc: enc },
      update: { secretEnc: enc, lastUsedStep: null },
    });
    await this.audit.record({
      action: 'mfa.enrol_start',
      outcome: 'SUCCESS',
      actorUserId: p.id,
      organisationId: p.organisationId,
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
    return {
      secret: base32Encode(secret),
      otpauthUri: otpauthUri(this.env.mfaIssuer, p.email, secret),
    };
  }

  async confirmEnrolment(p: Principal, code: string, ctx: Ctx): Promise<MfaConfirmResponse> {
    const row = await this.prisma.userMfa.findUnique({ where: { userId: p.id } });
    if (!row || row.confirmedAt) throw new ConflictException('Start enrolment first.');
    const step = verifyTotp(this.decrypt(row.secretEnc), code);
    if (step === null) {
      await this.audit.recordBestEffort({
        action: 'mfa.enrol_confirm',
        outcome: 'FAILURE',
        actorUserId: p.id,
        organisationId: p.organisationId,
        requestId: ctx.requestId,
        ipAddress: ctx.ip,
      });
      throw invalidCode();
    }
    const codes = Array.from({ length: 10 }, newRecoveryCode);
    await this.prisma.$transaction(async (tx) => {
      await tx.userMfa.update({
        where: { userId: p.id },
        data: { confirmedAt: new Date(), lastUsedStep: BigInt(step) },
      });
      await tx.mfaRecoveryCode.deleteMany({ where: { userId: p.id } });
      await tx.mfaRecoveryCode.createMany({
        data: codes.map((c) => ({ userId: p.id, codeHash: hash(c) })),
      });
      await this.audit.record(
        {
          action: 'mfa.enrol_confirm',
          outcome: 'SUCCESS',
          actorUserId: p.id,
          organisationId: p.organisationId,
          requestId: ctx.requestId,
          ipAddress: ctx.ip,
        },
        tx,
      );
    });
    return { recoveryCodes: codes };
  }

  /** Disabling needs the password AND a current code, so a stolen session alone cannot remove the second factor. */
  async disable(p: Principal, input: MfaDisableRequest, ctx: Ctx): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: p.id },
      include: { mfa: true },
    });
    const ok =
      (await this.passwords.verify(user.passwordHash, input.password)) &&
      !!user.mfa?.confirmedAt &&
      verifyTotp(this.decrypt(user.mfa.secretEnc), input.code) !== null;
    if (!ok) {
      await this.audit.recordBestEffort({
        action: 'mfa.disable',
        outcome: 'FAILURE',
        actorUserId: p.id,
        organisationId: p.organisationId,
        requestId: ctx.requestId,
        ipAddress: ctx.ip,
      });
      throw invalidCode();
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.userMfa.delete({ where: { userId: p.id } });
      await tx.mfaRecoveryCode.deleteMany({ where: { userId: p.id } });
      await tx.session.updateMany({
        where: { userId: p.id, revokedAt: null, id: { not: p.sessionId } },
        data: { revokedAt: new Date(), revokedReason: 'mfa_disabled' },
      });
      await this.audit.record(
        {
          action: 'mfa.disable',
          outcome: 'SUCCESS',
          actorUserId: p.id,
          organisationId: p.organisationId,
          requestId: ctx.requestId,
          ipAddress: ctx.ip,
        },
        tx,
      );
    });
  }

  /** Administrative reset for a lost device. The caller (UsersService) has already checked authority. */
  async adminReset(actor: Principal, targetUserId: string, ctx: Ctx): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.userMfa.deleteMany({ where: { userId: targetUserId } });
      await tx.mfaRecoveryCode.deleteMany({ where: { userId: targetUserId } });
      await tx.session.updateMany({
        where: { userId: targetUserId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'mfa_reset' },
      });
      await this.audit.record(
        {
          action: 'user.mfa_reset',
          outcome: 'SUCCESS',
          actorUserId: actor.id,
          organisationId: actor.organisationId,
          targetType: 'user',
          targetId: targetUserId,
          requestId: ctx.requestId,
          ipAddress: ctx.ip,
        },
        tx,
      );
    });
  }

  // ---- login challenge -----------------------------------------------------------------------
  async createChallenge(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.mfaChallenge.create({
      data: { userId, tokenHash: hash(token), expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) },
    });
    return token;
  }

  /**
   * Verifies a TOTP code or recovery code for a challenge. Returns the user id on success.
   * Failures count against the challenge (5 tries) and against the account lockout.
   */
  async verifyChallenge(input: MfaVerifyRequest, ctx: Ctx): Promise<string> {
    const ch = await this.prisma.mfaChallenge.findUnique({
      where: { tokenHash: hash(input.challenge) },
      include: { user: { include: { mfa: true } } },
    });
    if (
      !ch ||
      ch.consumedAt ||
      ch.expiresAt.getTime() < Date.now() ||
      ch.attempts >= MAX_CHALLENGE_ATTEMPTS
    )
      throw invalidCode();
    const { user } = ch;
    const base = {
      actorUserId: user.id,
      organisationId: user.organisationId,
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    };
    const locked = user.lockedUntil !== null && user.lockedUntil.getTime() > Date.now();
    if (!user.isActive || locked || !user.mfa?.confirmedAt) throw invalidCode();

    let ok = false;
    let viaRecovery = false;
    if (input.code) {
      const step = verifyTotp(this.decrypt(user.mfa.secretEnc), input.code);
      // Replay protection: only a step newer than the last accepted one is valid, claimed atomically.
      if (step !== null) {
        const claimed = await this.prisma.userMfa.updateMany({
          where: {
            userId: user.id,
            OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: BigInt(step) } }],
          },
          data: { lastUsedStep: BigInt(step) },
        });
        ok = claimed.count === 1;
      }
    } else if (input.recoveryCode) {
      const used = await this.prisma.mfaRecoveryCode.updateMany({
        where: { userId: user.id, codeHash: hash(input.recoveryCode), usedAt: null },
        data: { usedAt: new Date() },
      });
      ok = used.count === 1;
      viaRecovery = ok;
    }

    if (!ok) {
      await this.prisma.mfaChallenge.update({
        where: { id: ch.id },
        data: { attempts: { increment: 1 } },
      });
      const u = await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: { increment: 1 } },
        select: { failedLoginCount: true },
      });
      if (u.failedLoginCount >= this.env.loginMaxFailedAttempts) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: 0,
            lockedUntil: new Date(Date.now() + this.env.loginLockoutMinutes * 60_000),
          },
        });
      }
      await this.audit.recordBestEffort({ ...base, action: 'auth.mfa_verify', outcome: 'FAILURE' });
      throw invalidCode();
    }
    // Single use: only one concurrent request can consume the challenge.
    const consumed = await this.prisma.mfaChallenge.updateMany({
      where: { id: ch.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw invalidCode();
    if (viaRecovery)
      await this.audit.recordBestEffort({
        ...base,
        action: 'auth.mfa_recovery_used',
        outcome: 'SUCCESS',
      });
    return user.id;
  }

  /** Housekeeping: drop expired challenges. */
  async purgeChallenges(): Promise<number> {
    return (
      await this.prisma.mfaChallenge.deleteMany({
        where: { expiresAt: { lt: new Date(Date.now() - 3600_000) } },
      })
    ).count;
  }
}
