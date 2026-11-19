import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

const RETENTION_MS = 7 * 24 * 60 * 60_000;
const INTERVAL_MS = 60 * 60_000;

/**
 * Deletes sessions that expired or were revoked more than 7 days ago. Idempotent, so safe with
 * several API instances. Disabled when NODE_ENV=test. Audit events are never purged here.
 */
@Injectable()
export class SessionPurgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionPurgeService.name);
  private timer?: NodeJS.Timeout;
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    if (this.env.nodeEnv === 'test') return;
    this.timer = setInterval(() => void this.purge(), INTERVAL_MS);
    this.timer.unref();
  }
  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async purge(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - RETENTION_MS);
    try {
      const r = await this.prisma.session.deleteMany({
        where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
      });
      return r.count;
    } catch (err) {
      this.logger.error({
        msg: 'session purge failed',
        errName: err instanceof Error ? err.name : 'unknown',
      });
      return 0;
    }
  }
}
