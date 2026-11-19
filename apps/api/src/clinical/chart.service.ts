import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AddChartEntryRequest, ChartEntry } from '@dpms/contracts';
import type { Principal } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import type { Ctx } from '../common/request-context';
import { PatientAccessService } from '../patients/patient-access.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PatientAccessService,
    private readonly audit: AuditService,
  ) {}

  private toDto(r: {
    id: string;
    toothNumber: string;
    surfaces: ChartEntry['surfaces'];
    condition: ChartEntry['condition'];
    note: string | null;
    encounterId: string | null;
    recordedByUserId: string;
    createdAt: Date;
    resolvedAt: Date | null;
  }): ChartEntry {
    return {
      id: r.id,
      toothNumber: r.toothNumber,
      surfaces: r.surfaces,
      condition: r.condition,
      note: r.note,
      encounterId: r.encounterId,
      recordedByUserId: r.recordedByUserId,
      recordedAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
    };
  }

  async get(p: Principal, patientId: string, ctx: Ctx): Promise<ChartEntry[]> {
    await this.access.require(p, patientId, 'clinical_record.read', ctx);
    const rows = await this.prisma.dentalChartEntry.findMany({
      where: { patientId },
      orderBy: [{ toothNumber: 'asc' }, { createdAt: 'desc' }],
    });
    await this.audit.record({
      action: 'dental_chart.view',
      outcome: 'SUCCESS',
      actorUserId: p.id,
      organisationId: p.organisationId,
      targetType: 'patient',
      targetId: patientId,
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
    return rows.map((r) => this.toDto(r));
  }

  async add(
    p: Principal,
    patientId: string,
    input: AddChartEntryRequest,
    ctx: Ctx,
  ): Promise<ChartEntry> {
    await this.access.require(p, patientId, 'clinical_record.create', ctx);
    if (input.encounterId) {
      const ok = await this.prisma.clinicalEncounter.count({
        where: { id: input.encounterId, patientId },
      });
      if (!ok) throw new BadRequestException('Encounter does not belong to this patient.');
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const r = await tx.dentalChartEntry.create({
        data: {
          patientId,
          encounterId: input.encounterId ?? null,
          toothNumber: input.toothNumber,
          surfaces: [...new Set(input.surfaces)],
          condition: input.condition,
          note: input.note ?? null,
          recordedByUserId: p.id,
        },
      });
      await this.audit.record(
        {
          action: 'dental_chart.add',
          outcome: 'SUCCESS',
          actorUserId: p.id,
          organisationId: p.organisationId,
          targetType: 'dental_chart_entry',
          targetId: r.id,
          requestId: ctx.requestId,
          ipAddress: ctx.ip,
          metadata: { condition: input.condition },
        },
        tx,
      );
      return r;
    });
    return this.toDto(row);
  }

  async resolve(p: Principal, patientId: string, entryId: string, ctx: Ctx): Promise<ChartEntry> {
    await this.access.require(p, patientId, 'clinical_record.create', ctx);
    const r = await this.prisma.dentalChartEntry.updateMany({
      where: { id: entryId, patientId, resolvedAt: null },
      data: { resolvedAt: new Date(), resolvedByUserId: p.id },
    });
    if (r.count === 0) {
      if (await this.prisma.dentalChartEntry.count({ where: { id: entryId, patientId } }))
        throw new ConflictException('Already resolved.');
      throw new NotFoundException();
    }
    await this.audit.record({
      action: 'dental_chart.resolve',
      outcome: 'SUCCESS',
      actorUserId: p.id,
      organisationId: p.organisationId,
      targetType: 'dental_chart_entry',
      targetId: entryId,
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
    return this.toDto(
      await this.prisma.dentalChartEntry.findUniqueOrThrow({ where: { id: entryId } }),
    );
  }
}
