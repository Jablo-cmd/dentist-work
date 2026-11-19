import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  auditEventsQuerySchema,
  type AuditEvent,
  type AuditEventsQuery,
  type Paginated,
} from '@dpms/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentPrincipal, RequirePermission } from '../auth/decorators';
import type { Principal } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('audit')
@Controller('audit-events')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission('audit.read', { orgWide: true })
  async list(
    @Query(new ZodValidationPipe(auditEventsQuerySchema)) q: AuditEventsQuery,
    @CurrentPrincipal() p: Principal,
  ): Promise<Paginated<AuditEvent>> {
    // Tenant boundary: only this organisation's events (events without an org are never listed).
    const where = { organisationId: p.organisationId, ...(q.action ? { action: q.action } : {}) };
    const [total, rows] = await Promise.all([
      this.prisma.auditEvent.count({ where }),
      this.prisma.auditEvent.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        occurredAt: r.occurredAt.toISOString(),
        actorUserId: r.actorUserId,
        practiceId: r.practiceId,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        outcome: r.outcome,
        requestId: r.requestId,
      })),
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.ceil(total / q.pageSize),
      },
    };
  }
}
