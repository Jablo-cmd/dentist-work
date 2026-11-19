import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Permission } from '@dpms/contracts';
import { hasPermission, practiceScope } from '../access/permissions';
import type { Principal } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import type { Ctx } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The single place that decides which patients a caller may touch.
 * A patient is visible only through the practices it is linked to. Scope is derived from the
 * server-side principal and combined with AND — never built from client input.
 */
@Injectable()
export class PatientAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  where(p: Principal, permission: Permission): Prisma.PatientWhereInput {
    const scope = practiceScope(p.assignments, permission);
    if (scope.orgWide) return { organisationId: p.organisationId };
    return {
      organisationId: p.organisationId,
      practices: { some: { practiceId: { in: scope.practiceIds } } },
    };
  }

  /** True if the caller holds `permission` in at least one of the given practices. */
  allowedAtAny(p: Principal, permission: Permission, practiceIds: readonly string[]): boolean {
    return practiceIds.some((practiceId) =>
      hasPermission(p.assignments, permission, { practiceId }),
    );
  }

  /** Loads a patient the caller may access; otherwise 404 (indistinguishable from missing) + audit. */
  async require(p: Principal, id: string, permission: Permission, ctx: Ctx) {
    const patient = await this.prisma.patient.findFirst({
      where: { AND: [this.where(p, permission), { id }] },
      include: { practices: true },
    });
    if (!patient) {
      await this.audit.recordBestEffort({
        action: 'access.denied',
        outcome: 'DENIED',
        actorUserId: p.id,
        organisationId: p.organisationId,
        targetType: 'patient',
        targetId: id,
        requestId: ctx.requestId,
        ipAddress: ctx.ip,
        metadata: { permission },
      });
      throw new NotFoundException();
    }
    return patient;
  }
}
