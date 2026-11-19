import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AddAllergyRequest, AddHistoryEntryRequest, MedicalHistory } from '@dpms/contracts';
import type { Principal } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import type { Ctx } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { PatientAccessService } from './patient-access.service';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const toDate = (s: string) => new Date(`${s}T00:00:00Z`);

@Injectable()
export class MedicalHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PatientAccessService,
    private readonly audit: AuditService,
  ) {}

  async get(p: Principal, patientId: string, ctx: Ctx): Promise<MedicalHistory> {
    await this.access.require(p, patientId, 'medical_history.read', ctx);
    const [entries, allergies] = await Promise.all([
      this.prisma.medicalHistoryEntry.findMany({
        where: { patientId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.allergy.findMany({ where: { patientId }, orderBy: { createdAt: 'desc' } }),
    ]);
    await this.audit.record({
      action: 'medical_history.view',
      outcome: 'SUCCESS',
      actorUserId: p.id,
      organisationId: p.organisationId,
      targetType: 'patient',
      targetId: patientId,
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
    return {
      entries: entries.map((e) => ({
        id: e.id,
        category: e.category,
        description: e.description,
        isAlert: e.isAlert,
        recordedOn: iso(e.recordedOn),
        source: e.source,
        createdByUserId: e.createdByUserId,
        resolvedAt: e.resolvedAt?.toISOString() ?? null,
      })),
      allergies: allergies.map((a) => ({
        id: a.id,
        substance: a.substance,
        reaction: a.reaction,
        severity: a.severity,
        recordedOn: iso(a.recordedOn),
        source: a.source,
        createdByUserId: a.createdByUserId,
        resolvedAt: a.resolvedAt?.toISOString() ?? null,
      })),
    };
  }

  async addEntry(
    p: Principal,
    patientId: string,
    input: AddHistoryEntryRequest,
    ctx: Ctx,
  ): Promise<MedicalHistory> {
    await this.access.require(p, patientId, 'medical_history.update', ctx);
    await this.prisma.$transaction(async (tx) => {
      const e = await tx.medicalHistoryEntry.create({
        data: {
          patientId,
          category: input.category,
          description: input.description,
          source: input.source,
          recordedOn: toDate(input.recordedOn),
          isAlert: input.isAlert,
          createdByUserId: p.id,
        },
      });
      await this.audit.record(
        {
          action: 'medical_history.add',
          outcome: 'SUCCESS',
          actorUserId: p.id,
          organisationId: p.organisationId,
          targetType: 'medical_history_entry',
          targetId: e.id,
          requestId: ctx.requestId,
          ipAddress: ctx.ip,
          metadata: { category: input.category },
        },
        tx,
      );
    });
    return this.get(p, patientId, ctx);
  }

  async addAllergy(
    p: Principal,
    patientId: string,
    input: AddAllergyRequest,
    ctx: Ctx,
  ): Promise<MedicalHistory> {
    await this.access.require(p, patientId, 'medical_history.update', ctx);
    await this.prisma.$transaction(async (tx) => {
      const a = await tx.allergy.create({
        data: {
          patientId,
          substance: input.substance,
          reaction: input.reaction ?? null,
          severity: input.severity,
          source: input.source,
          recordedOn: toDate(input.recordedOn),
          createdByUserId: p.id,
        },
      });
      await this.audit.record(
        {
          action: 'allergy.add',
          outcome: 'SUCCESS',
          actorUserId: p.id,
          organisationId: p.organisationId,
          targetType: 'allergy',
          targetId: a.id,
          requestId: ctx.requestId,
          ipAddress: ctx.ip,
          metadata: { severity: input.severity },
        },
        tx,
      );
    });
    return this.get(p, patientId, ctx);
  }

  async resolve(
    p: Principal,
    patientId: string,
    kind: 'entry' | 'allergy',
    id: string,
    ctx: Ctx,
  ): Promise<MedicalHistory> {
    await this.access.require(p, patientId, 'medical_history.update', ctx);
    const data = { resolvedAt: new Date(), resolvedByUserId: p.id };
    const where = { id, patientId, resolvedAt: null };
    const r =
      kind === 'entry'
        ? await this.prisma.medicalHistoryEntry.updateMany({ where, data })
        : await this.prisma.allergy.updateMany({ where, data });
    if (r.count === 0) {
      const exists =
        kind === 'entry'
          ? await this.prisma.medicalHistoryEntry.count({ where: { id, patientId } })
          : await this.prisma.allergy.count({ where: { id, patientId } });
      if (exists) throw new ConflictException('Already resolved.');
      throw new NotFoundException();
    }
    await this.audit.record({
      action: kind === 'entry' ? 'medical_history.resolve' : 'allergy.resolve',
      outcome: 'SUCCESS',
      actorUserId: p.id,
      organisationId: p.organisationId,
      targetType: kind === 'entry' ? 'medical_history_entry' : 'allergy',
      targetId: id,
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
    return this.get(p, patientId, ctx);
  }
}
