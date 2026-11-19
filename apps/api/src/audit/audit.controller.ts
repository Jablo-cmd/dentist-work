import { Controller, Get, Query } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import {
  auditEventsQuerySchema,
  type AuditEvent,
  type AuditEventsQuery,
  type Paginated,
} from '@dpms/contracts';
import { escapeLike } from '../common/like';
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
    const where: Prisma.AuditEventWhereInput = {
      organisationId: p.organisationId,
      ...(q.action ? { action: { startsWith: escapeLike(q.action) } } : {}),
      ...(q.outcome ? { outcome: q.outcome } : {}),
      ...(q.actorUserId ? { actorUserId: q.actorUserId } : {}),
      ...(q.from || q.to
        ? {
            occurredAt: {
              ...(q.from ? { gte: new Date(`${q.from}T00:00:00Z`) } : {}),
              ...(q.to
                ? { lt: new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 86_400_000) }
                : {}),
            },
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditEvent.count({ where }),
      this.prisma.auditEvent.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { actor: { select: { displayName: true } } },
      }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        occurredAt: r.occurredAt.toISOString(),
        actorUserId: r.actorUserId,
        actorName: r.actor?.displayName ?? null,
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
