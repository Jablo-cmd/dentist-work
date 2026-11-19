import { Injectable, Logger } from '@nestjs/common';
import { AuditOutcome, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditRecord {
  action: string;
  outcome: AuditOutcome;
  actorUserId?: string | null;
  organisationId?: string | null;
  practiceId?: string | null;
  targetType?: string;
  targetId?: string;
  requestId?: string;
  ipAddress?: string;
  /** Non-sensitive context only. NEVER clinical text, credentials, tokens or patient free text. */
  metadata?: Record<string, string | number | boolean | null>;
}

/**
 * Writes append-only audit events. `record` throws on failure so callers performing a
 * sensitive action can fail closed; `recordBestEffort` is for denial/failure paths where
 * the original error must still reach the client.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(private readonly prisma: PrismaService) {}

  async record(event: AuditRecord, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.auditEvent.create({
      data: {
        action: event.action,
        outcome: event.outcome,
        actorUserId: event.actorUserId ?? null,
        organisationId: event.organisationId ?? null,
        practiceId: event.practiceId ?? null,
        targetType: event.targetType ?? null,
        targetId: event.targetId ?? null,
        requestId: event.requestId ?? null,
        ipAddress: event.ipAddress ?? null,
        metadata: event.metadata ?? {},
      },
    });
  }

  async recordBestEffort(event: AuditRecord): Promise<void> {
    try {
      await this.record(event);
    } catch (err) {
      this.logger.error({
        msg: 'audit write failed',
        action: event.action,
        requestId: event.requestId,
        errName: err instanceof Error ? err.name : 'unknown',
      });
    }
  }
}
