import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { RoleAssignment } from '@dpms/contracts';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { permissionsFor } from '../access/permissions';
import type { Principal } from './auth.types';

const TOUCH_INTERVAL_MS = 60_000;

export function hashToken(token: string): string {
  // Tokens are 256-bit random values, so a fast hash is sufficient (no brute-force surface).
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  get cookieName(): string {
    // __Host- prefix pins the cookie to the exact host, Secure, Path=/ (only valid with Secure).
    return this.env.cookieSecure ? '__Host-dpms_session' : 'dpms_session';
  }

  async create(userId: string, userAgent?: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.env.sessionTtlMinutes * 60_000);
    await this.prisma.session.create({
      data: { userId, tokenHash: hashToken(token), expiresAt, userAgent: userAgent?.slice(0, 256) },
    });
    return { token, expiresAt };
  }

  /** Resolves a bearer token to a principal, or null when invalid/expired/revoked/user inactive. */
  async resolve(token: string): Promise<Principal | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { include: { roleAssignments: true } } },
    });
    if (!session || session.revokedAt) return null;
    const now = Date.now();
    if (session.expiresAt.getTime() <= now) return null;
    if (now - session.lastSeenAt.getTime() > this.env.sessionIdleTimeoutMinutes * 60_000) {
      await this.revoke(session.id, 'idle_timeout');
      return null;
    }
    const { user } = session;
    if (!user.isActive) {
      await this.revoke(session.id, 'user_inactive');
      return null;
    }
    if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      });
    }
    const assignments: RoleAssignment[] = user.roleAssignments.map((a) => ({
      role: a.role,
      practiceId: a.practiceId,
    }));
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      organisationId: user.organisationId,
      assignments,
      permissions: permissionsFor(assignments),
      sessionId: session.id,
    };
  }

  async revoke(sessionId: string, reason: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeAllForUser(userId: string, reason: string): Promise<number> {
    const r = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return r.count;
  }
}
