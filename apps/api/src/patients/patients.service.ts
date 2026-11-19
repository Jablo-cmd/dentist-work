import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Patient as PatientRow } from '@prisma/client';
import {
  normalisePhone,
  type AddContactRequest,
  type CreatePatientRequest,
  type CreatePatientResponse,
  type DuplicateCandidate,
  type DuplicateFlag,
  type Paginated,
  type Patient,
  type PatientRevision,
  type PatientSearchQuery,
  type PatientSummary,
  type ReviewDuplicateRequest,
  type UpdatePatientRequest,
} from '@dpms/contracts';
import { hasPermission } from '../access/permissions';
import type { Principal } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { escapeLike } from '../common/like';
import type { Ctx } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { PatientAccessService } from './patient-access.service';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
const EDITABLE = [
  'firstName',
  'lastName',
  'preferredName',
  'dateOfBirth',
  'sex',
  'idNumber',
  'email',
  'mobilePhone',
  'homePhone',
  'addressLine1',
  'addressLine2',
  'suburb',
  'city',
  'postalCode',
  'isActive',
] as const;

type WithLinks = PatientRow & { practices: { practiceId: string }[] };
const summary = (r: WithLinks): PatientSummary => ({
  id: r.id,
  firstName: r.firstName,
  lastName: r.lastName,
  dateOfBirth: iso(r.dateOfBirth),
  practiceIds: r.practices.map((x) => x.practiceId),
});

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PatientAccessService,
    private readonly audit: AuditService,
  ) {}

  private async toPatient(p: Principal, id: string): Promise<Patient> {
    const r = await this.prisma.patient.findUniqueOrThrow({
      where: { id },
      include: { practices: true, contacts: { orderBy: { createdAt: 'asc' } } },
    });
    const ids = r.practices.map((x) => x.practiceId);
    let severe: number | null = null;
    if (this.access.allowedAtAny(p, 'medical_history.read', ids)) {
      severe = await this.prisma.allergy.count({
        where: { patientId: id, severity: 'SEVERE', resolvedAt: null },
      });
    }
    return {
      ...summary(r),
      preferredName: r.preferredName,
      sex: r.sex,
      idNumber: r.idNumber,
      email: r.email,
      mobilePhone: r.mobilePhone,
      homePhone: r.homePhone,
      addressLine1: r.addressLine1,
      addressLine2: r.addressLine2,
      suburb: r.suburb,
      city: r.city,
      postalCode: r.postalCode,
      isActive: r.isActive,
      registeringPracticeId: r.registeringPracticeId,
      createdAt: r.createdAt.toISOString(),
      contacts: r.contacts.map((c) => ({
        id: c.id,
        name: c.name,
        relationship: c.relationship,
        phone: c.phone,
        isEmergencyContact: c.isEmergencyContact,
      })),
      severeAllergyCount: severe,
    };
  }

  // ---- duplicate detection (within the caller's visible scope; never merges) ----------------
  private async findCandidates(
    p: Principal,
    subject: {
      id?: string;
      firstName: string;
      lastName: string;
      dateOfBirth: string;
      idNumber?: string | null;
      mobilePhone?: string | null;
      email?: string | null;
    },
  ): Promise<DuplicateCandidate[]> {
    const lastName = { equals: escapeLike(subject.lastName), mode: 'insensitive' as const };
    const or: Prisma.PatientWhereInput[] = [{ dateOfBirth: toDate(subject.dateOfBirth), lastName }];
    if (subject.idNumber) or.push({ idNumber: subject.idNumber });
    if (subject.mobilePhone) or.push({ mobilePhone: subject.mobilePhone, lastName });
    if (subject.email) or.push({ email: subject.email, lastName });
    const rows = await this.prisma.patient.findMany({
      where: {
        AND: [
          this.access.where(p, 'patient.read'),
          { isActive: true },
          { OR: or },
          subject.id ? { id: { not: subject.id } } : {},
        ],
      },
      include: { practices: true },
      take: 20,
    });
    const out: DuplicateCandidate[] = [];
    for (const r of rows) {
      const reasons: string[] = [];
      const sameLast = r.lastName.toLowerCase() === subject.lastName.toLowerCase();
      const sameFirst = r.firstName.toLowerCase() === subject.firstName.toLowerCase();
      const sameInitial = r.firstName[0]?.toLowerCase() === subject.firstName[0]?.toLowerCase();
      if (subject.idNumber && r.idNumber === subject.idNumber) reasons.push('Same ID number');
      if (sameLast && iso(r.dateOfBirth) === subject.dateOfBirth && (sameFirst || sameInitial))
        reasons.push(
          sameFirst
            ? 'Same name and date of birth'
            : 'Same surname, first initial and date of birth',
        );
      if (sameLast && subject.mobilePhone && r.mobilePhone === subject.mobilePhone)
        reasons.push('Same surname and mobile number');
      if (sameLast && subject.email && r.email === subject.email)
        reasons.push('Same surname and email');
      if (reasons.length) out.push({ ...summary(r), reasons });
    }
    return out;
  }

  private async flagPairs(patientId: string, candidates: DuplicateCandidate[]): Promise<void> {
    if (!candidates.length) return;
    await this.prisma.patientDuplicateFlag.createMany({
      data: candidates.map((c) => {
        const [a, b] = patientId < c.id ? [patientId, c.id] : [c.id, patientId];
        return { patientAId: a, patientBId: b, reasons: c.reasons };
      }),
      skipDuplicates: true,
    });
  }

  // ---- create / read / search / update --------------------------------------------------------
  async create(
    p: Principal,
    input: CreatePatientRequest,
    ctx: Ctx,
  ): Promise<CreatePatientResponse> {
    if (!hasPermission(p.assignments, 'patient.create', { practiceId: input.practiceId }))
      throw new ForbiddenException();
    const practice = await this.prisma.practice.findFirst({
      where: { id: input.practiceId, organisationId: p.organisationId, isActive: true },
    });
    if (!practice) throw new NotFoundException();
    const { practiceId, ...details } = input;
    const patient = await this.prisma.$transaction(async (tx) => {
      const row = await tx.patient.create({
        data: {
          ...details,
          dateOfBirth: toDate(details.dateOfBirth),
          organisationId: p.organisationId,
          registeringPracticeId: practiceId,
          createdByUserId: p.id,
          practices: { create: { practiceId, linkedByUserId: p.id } },
        },
      });
      await this.audit.record(
        {
          action: 'patient.create',
          outcome: 'SUCCESS',
          actorUserId: p.id,
          organisationId: p.organisationId,
          practiceId,
          targetType: 'patient',
          targetId: row.id,
          requestId: ctx.requestId,
          ipAddress: ctx.ip,
        },
        tx,
      );
      return row;
    });
    const candidates = await this.findCandidates(p, { ...details, id: patient.id });
    await this.flagPairs(patient.id, candidates);
    return { patient: await this.toPatient(p, patient.id), duplicateCandidates: candidates };
  }

  async search(p: Principal, q: PatientSearchQuery, ctx: Ctx): Promise<Paginated<PatientSummary>> {
    const and: Prisma.PatientWhereInput[] = [
      this.access.where(p, 'patient.read'),
      { isActive: true },
    ];
    if (q.dateOfBirth) and.push({ dateOfBirth: toDate(q.dateOfBirth) });
    if (q.q) {
      const phone = normalisePhone(q.q);
      if (/^\+?\d{7,15}$/.test(phone)) {
        // Looks like a phone number or ID number: exact match only (no prefix scans on identifiers).
        and.push({ OR: [{ mobilePhone: phone }, { homePhone: phone }, { idNumber: q.q }] });
      } else {
        for (const token of q.q.split(/\s+/).filter(Boolean)) {
          const sw = { startsWith: escapeLike(token), mode: 'insensitive' as const };
          and.push({
            OR: [{ firstName: sw }, { lastName: sw }, { preferredName: sw }, { idNumber: token }],
          });
        }
      }
    }
    const where = { AND: and };
    const [total, rows] = await Promise.all([
      this.prisma.patient.count({ where }),
      this.prisma.patient.findMany({
        where,
        include: { practices: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    // Search terms are never written to the audit trail (they may be identifiers).
    await this.audit.recordBestEffort({
      action: 'patient.search',
      outcome: 'SUCCESS',
      actorUserId: p.id,
      organisationId: p.organisationId,
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
      metadata: { resultCount: total, byDob: !!q.dateOfBirth },
    });
    return {
      data: rows.map(summary),
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.ceil(total / q.pageSize),
      },
    };
  }

  async get(p: Principal, id: string, ctx: Ctx): Promise<Patient> {
    const row = await this.access.require(p, id, 'patient.read', ctx);
    await this.audit.record({
      action: 'patient.view',
      outcome: 'SUCCESS',
      actorUserId: p.id,
      organisationId: p.organisationId,
      targetType: 'patient',
      targetId: id,
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
    void row;
    return this.toPatient(p, id);
  }

  async update(p: Principal, id: string, input: UpdatePatientRequest, ctx: Ctx): Promise<Patient> {
    const current = await this.access.require(p, id, 'patient.update', ctx);
    const data: Record<string, unknown> = {};
    const changed: string[] = [];
    for (const key of EDITABLE) {
      if (!(key in input)) continue;
      const next = (input as Record<string, unknown>)[key];
      const prev =
        key === 'dateOfBirth'
          ? iso(current.dateOfBirth)
          : (current as Record<string, unknown>)[key];
      if (next === undefined || next === prev) continue;
      data[key] = key === 'dateOfBirth' ? toDate(next as string) : next;
      changed.push(key);
    }
    if (changed.length) {
      await this.prisma.$transaction(async (tx) => {
        await tx.patient.update({ where: { id }, data });
        await tx.patientRevision.create({
          data: { patientId: id, changedByUserId: p.id, fields: changed },
        });
        await this.audit.record(
          {
            action: 'patient.update',
            outcome: 'SUCCESS',
            actorUserId: p.id,
            organisationId: p.organisationId,
            targetType: 'patient',
            targetId: id,
            requestId: ctx.requestId,
            ipAddress: ctx.ip,
            metadata: { fieldCount: changed.length },
          },
          tx,
        );
      });
      const updated = await this.prisma.patient.findUniqueOrThrow({ where: { id } });
      const cands = await this.findCandidates(p, {
        id,
        firstName: updated.firstName,
        lastName: updated.lastName,
        dateOfBirth: iso(updated.dateOfBirth),
        idNumber: updated.idNumber,
        mobilePhone: updated.mobilePhone,
        email: updated.email,
      });
      await this.flagPairs(id, cands);
    }
    return this.toPatient(p, id);
  }

  async revisions(p: Principal, id: string, ctx: Ctx): Promise<PatientRevision[]> {
    await this.access.require(p, id, 'patient.read', ctx);
    const rows = await this.prisma.patientRevision.findMany({
      where: { patientId: id },
      orderBy: { changedAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      changedAt: r.changedAt.toISOString(),
      changedByUserId: r.changedByUserId,
      fields: r.fields,
    }));
  }

  /** Explicit cross-practice sharing: caller must hold patient.update in the patient's practice AND the target practice. */
  async linkPractice(p: Principal, id: string, practiceId: string, ctx: Ctx): Promise<Patient> {
    await this.access.require(p, id, 'patient.update', ctx);
    if (!hasPermission(p.assignments, 'patient.update', { practiceId }))
      throw new ForbiddenException();
    const practice = await this.prisma.practice.findFirst({
      where: { id: practiceId, organisationId: p.organisationId, isActive: true },
    });
    if (!practice) throw new NotFoundException();
    await this.prisma.$transaction(async (tx) => {
      await tx.patientPractice.createMany({
        data: [{ patientId: id, practiceId, linkedByUserId: p.id }],
        skipDuplicates: true,
      });
      await this.audit.record(
        {
          action: 'patient.link_practice',
          outcome: 'SUCCESS',
          actorUserId: p.id,
          organisationId: p.organisationId,
          practiceId,
          targetType: 'patient',
          targetId: id,
          requestId: ctx.requestId,
          ipAddress: ctx.ip,
        },
        tx,
      );
    });
    return this.toPatient(p, id);
  }

  async addContact(p: Principal, id: string, input: AddContactRequest, ctx: Ctx): Promise<Patient> {
    await this.access.require(p, id, 'patient.update', ctx);
    await this.prisma.$transaction(async (tx) => {
      await tx.patientContact.create({ data: { patientId: id, ...input } });
      await this.audit.record(
        {
          action: 'patient.contact_add',
          outcome: 'SUCCESS',
          actorUserId: p.id,
          organisationId: p.organisationId,
          targetType: 'patient',
          targetId: id,
          requestId: ctx.requestId,
          ipAddress: ctx.ip,
        },
        tx,
      );
    });
    return this.toPatient(p, id);
  }

  async removeContact(p: Principal, id: string, contactId: string, ctx: Ctx): Promise<Patient> {
    await this.access.require(p, id, 'patient.update', ctx);
    const r = await this.prisma.patientContact.deleteMany({
      where: { id: contactId, patientId: id },
    });
    if (r.count === 0) throw new NotFoundException();
    await this.audit.record({
      action: 'patient.contact_remove',
      outcome: 'SUCCESS',
      actorUserId: p.id,
      organisationId: p.organisationId,
      targetType: 'patient',
      targetId: id,
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
    return this.toPatient(p, id);
  }

  // ---- duplicate review -----------------------------------------------------------------------
  async listFlags(
    p: Principal,
    status: DuplicateFlag['status'],
    page: number,
    pageSize: number,
  ): Promise<Paginated<DuplicateFlag>> {
    const vis = this.access.where(p, 'patient.update');
    const where: Prisma.PatientDuplicateFlagWhereInput = { status, patientA: vis, patientB: vis };
    const [total, rows] = await Promise.all([
      this.prisma.patientDuplicateFlag.count({ where }),
      this.prisma.patientDuplicateFlag.findMany({
        where,
        include: {
          patientA: { include: { practices: true } },
          patientB: { include: { practices: true } },
        },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map((f) => ({
        id: f.id,
        status: f.status,
        reasons: f.reasons,
        patientA: summary(f.patientA),
        patientB: summary(f.patientB),
      })),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async reviewFlag(
    p: Principal,
    id: string,
    input: ReviewDuplicateRequest,
    ctx: Ctx,
  ): Promise<void> {
    const vis = this.access.where(p, 'patient.update');
    const flag = await this.prisma.patientDuplicateFlag.findFirst({
      where: { id, patientA: vis, patientB: vis },
    });
    if (!flag) throw new NotFoundException();
    if (flag.status !== 'PENDING')
      throw new ConflictException('This pair has already been reviewed.');
    await this.prisma.$transaction(async (tx) => {
      await tx.patientDuplicateFlag.update({
        where: { id },
        data: { status: input.decision, reviewedByUserId: p.id, reviewedAt: new Date() },
      });
      await this.audit.record(
        {
          action: 'patient.duplicate_review',
          outcome: 'SUCCESS',
          actorUserId: p.id,
          organisationId: p.organisationId,
          targetType: 'patient_duplicate_flag',
          targetId: id,
          requestId: ctx.requestId,
          ipAddress: ctx.ip,
          metadata: { decision: input.decision },
        },
        tx,
      );
    });
    // NOTE: CONFIRMED_DUPLICATE only records the human decision. Merging records is not implemented.
  }
}
