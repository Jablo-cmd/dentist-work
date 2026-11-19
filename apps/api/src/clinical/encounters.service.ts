import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AddendumRequest,
  AmendEncounterRequest,
  CreateEncounterRequest,
  Encounter,
  EncounterSummary,
  SaveDraftRequest,
} from '@dpms/contracts';
import { hasPermission } from '../access/permissions';
import type { Principal } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import type { Ctx } from '../common/request-context';
import { PatientAccessService } from '../patients/patient-access.service';
import { PrismaService } from '../prisma/prisma.service';

type EncRow = Prisma.ClinicalEncounterGetPayload<object>;

@Injectable()
export class EncountersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PatientAccessService,
    private readonly audit: AuditService,
  ) {}

  private base(p: Principal, ctx: Ctx, action: string, enc: { id: string; practiceId?: string }) {
    return {
      action,
      outcome: 'SUCCESS' as const,
      actorUserId: p.id,
      organisationId: p.organisationId,
      practiceId: enc.practiceId ?? null,
      targetType: 'clinical_encounter',
      targetId: enc.id,
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    };
  }

  private async names(ids: string[]): Promise<Map<string, string>> {
    const u = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, displayName: true },
    });
    return new Map(u.map((x) => [x.id, x.displayName]));
  }

  private summary(e: EncRow, names: Map<string, string>): EncounterSummary {
    return {
      id: e.id,
      patientId: e.patientId,
      practiceId: e.practiceId,
      practitionerUserId: e.practitionerUserId,
      practitionerName: names.get(e.practitionerUserId) ?? 'Unknown',
      appointmentId: e.appointmentId,
      status: e.status,
      encounteredAt: e.encounteredAt.toISOString(),
      finalisedAt: e.finalisedAt?.toISOString() ?? null,
    };
  }

  /** Loads an encounter the caller may see (clinical_record.read via the patient's practices); else 404 + audit. */
  private async loadVisible(
    p: Principal,
    id: string,
    permission: 'clinical_record.read' | 'clinical_record.amend',
    ctx: Ctx,
  ): Promise<EncRow> {
    const enc = await this.prisma.clinicalEncounter.findFirst({
      where: { AND: [{ id }, { patient: this.access.where(p, permission) }] },
    });
    if (!enc) {
      await this.audit.recordBestEffort({
        action: 'access.denied',
        outcome: 'DENIED',
        actorUserId: p.id,
        organisationId: p.organisationId,
        targetType: 'clinical_encounter',
        targetId: id,
        requestId: ctx.requestId,
        ipAddress: ctx.ip,
        metadata: { permission },
      });
      throw new NotFoundException();
    }
    return enc;
  }

  private async full(enc: EncRow): Promise<Encounter> {
    const versions = await this.prisma.clinicalNoteVersion.findMany({
      where: { encounterId: enc.id },
      orderBy: { versionNumber: 'asc' },
    });
    const names = await this.names([
      enc.practitionerUserId,
      ...versions.map((v) => v.authorUserId),
    ]);
    const authoritative = [...versions].reverse().find((v) => v.kind !== 'ADDENDUM');
    return {
      ...this.summary(enc, names),
      currentBody: authoritative?.body ?? '',
      versions: versions.map((v) => ({
        versionNumber: v.versionNumber,
        kind: v.kind,
        body: v.body,
        reason: v.reason,
        amendsVersion: v.amendsVersion,
        authorUserId: v.authorUserId,
        authorName: names.get(v.authorUserId) ?? 'Unknown',
        createdAt: v.createdAt.toISOString(),
      })),
    };
  }

  async create(
    p: Principal,
    patientId: string,
    input: CreateEncounterRequest,
    ctx: Ctx,
  ): Promise<Encounter> {
    const patient = await this.access.require(p, patientId, 'clinical_record.create', ctx);
    if (!hasPermission(p.assignments, 'clinical_record.create', { practiceId: input.practiceId }))
      throw new ForbiddenException();
    if (!patient.practices.some((x) => x.practiceId === input.practiceId))
      throw new NotFoundException();
    if (input.appointmentId) {
      const ok = await this.prisma.appointment.count({
        where: {
          id: input.appointmentId,
          patientId,
          practiceId: input.practiceId,
          organisationId: p.organisationId,
        },
      });
      if (!ok)
        throw new BadRequestException('Appointment does not belong to this patient and practice.');
    }
    const enc = await this.prisma.$transaction(async (tx) => {
      const e = await tx.clinicalEncounter.create({
        data: {
          organisationId: p.organisationId,
          practiceId: input.practiceId,
          patientId,
          practitionerUserId: p.id,
          appointmentId: input.appointmentId ?? null,
        },
      });
      if (input.body)
        await tx.clinicalNoteVersion.create({
          data: {
            encounterId: e.id,
            versionNumber: 1,
            kind: 'DRAFT',
            body: input.body,
            authorUserId: p.id,
          },
        });
      await this.audit.record(this.base(p, ctx, 'clinical_record.create', e), tx);
      return e;
    });
    return this.full(enc);
  }

  async list(p: Principal, patientId: string, ctx: Ctx): Promise<EncounterSummary[]> {
    await this.access.require(p, patientId, 'clinical_record.read', ctx);
    const rows = await this.prisma.clinicalEncounter.findMany({
      where: { patientId },
      orderBy: { encounteredAt: 'desc' },
      take: 200,
    });
    await this.audit.record({
      action: 'clinical_record.list',
      outcome: 'SUCCESS',
      actorUserId: p.id,
      organisationId: p.organisationId,
      targetType: 'patient',
      targetId: patientId,
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
    const names = await this.names(rows.map((r) => r.practitionerUserId));
    return rows.map((r) => this.summary(r, names));
  }

  async get(p: Principal, id: string, ctx: Ctx): Promise<Encounter> {
    const enc = await this.loadVisible(p, id, 'clinical_record.read', ctx);
    await this.audit.record(this.base(p, ctx, 'clinical_record.view', enc));
    return this.full(enc);
  }

  /** Draft edits and finalisation belong to the encounter's own practitioner. */
  private async loadOwnDraft(p: Principal, id: string, ctx: Ctx): Promise<EncRow> {
    const enc = await this.loadVisible(p, id, 'clinical_record.read', ctx);
    if (
      enc.practitionerUserId !== p.id ||
      !hasPermission(p.assignments, 'clinical_record.create', { practiceId: enc.practiceId })
    )
      throw new ForbiddenException();
    if (enc.status !== 'DRAFT')
      throw new ConflictException('This record has been finalised. Use an amendment or addendum.');
    return enc;
  }

  async saveDraft(p: Principal, id: string, input: SaveDraftRequest, ctx: Ctx): Promise<Encounter> {
    const enc = await this.loadOwnDraft(p, id, ctx);
    try {
      await this.prisma.$transaction(async (tx) => {
        const last = await tx.clinicalNoteVersion.aggregate({
          where: { encounterId: id },
          _max: { versionNumber: true },
        });
        // Re-check status inside the transaction: finalisation may have happened since the load.
        if ((await tx.clinicalEncounter.count({ where: { id, status: 'DRAFT' } })) === 0)
          throw new ConflictException('This record has been finalised.');
        await tx.clinicalNoteVersion.create({
          data: {
            encounterId: id,
            versionNumber: (last._max.versionNumber ?? 0) + 1,
            kind: 'DRAFT',
            body: input.body,
            authorUserId: p.id,
          },
        });
        await this.audit.record(this.base(p, ctx, 'clinical_record.draft_save', enc), tx);
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new ConflictException(
          'Another save happened at the same time. Reload and try again.',
        );
      throw e;
    }
    return this.full(enc);
  }

  async finalise(p: Principal, id: string, ctx: Ctx): Promise<Encounter> {
    const enc = await this.loadOwnDraft(p, id, ctx);
    if (!hasPermission(p.assignments, 'clinical_record.finalise', { practiceId: enc.practiceId }))
      throw new ForbiddenException();
    const updated = await this.prisma.$transaction(async (tx) => {
      const hasBody = await tx.clinicalNoteVersion.count({
        where: { encounterId: id, kind: 'DRAFT' },
      });
      if (!hasBody) throw new BadRequestException('Write the clinical note before finalising.');
      const r = await tx.clinicalEncounter.updateMany({
        where: { id, status: 'DRAFT' },
        data: { status: 'FINALISED', finalisedAt: new Date() },
      });
      if (r.count === 0) throw new ConflictException('This record has already been finalised.');
      await this.audit.record(this.base(p, ctx, 'clinical_record.finalise', enc), tx);
      return tx.clinicalEncounter.findUniqueOrThrow({ where: { id } });
    });
    return this.full(updated);
  }

  private async addPostFinal(
    p: Principal,
    id: string,
    kind: 'AMENDMENT' | 'ADDENDUM',
    body: string,
    reason: string | null,
    ctx: Ctx,
  ): Promise<Encounter> {
    const enc = await this.loadVisible(p, id, 'clinical_record.amend', ctx);
    if (enc.status !== 'FINALISED')
      throw new ConflictException(
        'Only finalised records take amendments or addenda; edit the draft instead.',
      );
    try {
      await this.prisma.$transaction(async (tx) => {
        const versions = await tx.clinicalNoteVersion.findMany({
          where: { encounterId: id },
          select: { versionNumber: true, kind: true },
          orderBy: { versionNumber: 'desc' },
        });
        const authoritative = versions.find((v) => v.kind !== 'ADDENDUM');
        await tx.clinicalNoteVersion.create({
          data: {
            encounterId: id,
            versionNumber: (versions[0]?.versionNumber ?? 0) + 1,
            kind,
            body,
            reason,
            amendsVersion: kind === 'AMENDMENT' ? (authoritative?.versionNumber ?? null) : null,
            authorUserId: p.id,
          },
        });
        await this.audit.record(
          this.base(
            p,
            ctx,
            kind === 'AMENDMENT' ? 'clinical_record.amend' : 'clinical_record.addendum',
            enc,
          ),
          tx,
        );
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new ConflictException(
          'Another change happened at the same time. Reload and try again.',
        );
      throw e;
    }
    return this.full(enc);
  }

  amend(p: Principal, id: string, input: AmendEncounterRequest, ctx: Ctx): Promise<Encounter> {
    return this.addPostFinal(p, id, 'AMENDMENT', input.body, input.reason, ctx);
  }
  addendum(p: Principal, id: string, input: AddendumRequest, ctx: Ctx): Promise<Encounter> {
    return this.addPostFinal(p, id, 'ADDENDUM', input.body, null, ctx);
  }
}
