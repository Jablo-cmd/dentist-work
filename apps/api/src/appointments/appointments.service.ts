import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type AppointmentEventType, type AppointmentStatus } from '@prisma/client';
import type {
  Appointment,
  AppointmentEvent,
  AppointmentsQuery,
  CancelAppointmentRequest,
  CreateAppointmentRequest,
  Practitioner,
  RescheduleAppointmentRequest,
} from '@dpms/contracts';
import { hasPermission, practiceScope } from '../access/permissions';
import type { Principal } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import type { Ctx } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

const GRACE_MS = 15 * 60_000;
type Row = Prisma.AppointmentGetPayload<object>;

/** Maps the database exclusion-constraint violations to friendly conflicts. */
function asConflict(e: unknown): ConflictException | null {
  const msg = e instanceof Error ? e.message : '';
  if (msg.includes('appointments_practitioner_no_overlap'))
    return new ConflictException('That practitioner is already booked during this time.');
  if (msg.includes('appointments_patient_no_overlap'))
    return new ConflictException('This patient already has an appointment during this time.');
  return null;
}

const TRANSITIONS: Record<
  'CHECKED_IN' | 'COMPLETED' | 'NO_SHOW',
  { from: AppointmentStatus[]; event: AppointmentEventType }
> = {
  CHECKED_IN: { from: ['SCHEDULED'], event: 'CHECKED_IN' },
  COMPLETED: { from: ['CHECKED_IN'], event: 'COMPLETED' },
  NO_SHOW: { from: ['SCHEDULED'], event: 'NO_SHOW' },
};

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private readWhere(p: Principal): Prisma.AppointmentWhereInput {
    const s = practiceScope(p.assignments, 'appointment.read');
    return s.orgWide
      ? { organisationId: p.organisationId }
      : { organisationId: p.organisationId, practiceId: { in: s.practiceIds } };
  }

  private async dto(p: Principal, rows: Row[]): Promise<Appointment[]> {
    if (!rows.length) return [];
    const practitioners = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.practitionerUserId))] } },
      select: { id: true, displayName: true },
    });
    const pname = new Map(practitioners.map((u) => [u.id, u.displayName]));
    // Patient names only where the caller may read patients in that appointment's practice.
    const readable = rows.filter((r) =>
      hasPermission(p.assignments, 'patient.read', { practiceId: r.practiceId }),
    );
    const patients = readable.length
      ? await this.prisma.patient.findMany({
          where: { id: { in: [...new Set(readable.map((r) => r.patientId))] } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const nameOf = new Map(patients.map((x) => [x.id, `${x.lastName}, ${x.firstName}`]));
    const readableIds = new Set(readable.map((r) => r.id));
    return rows.map((r) => ({
      id: r.id,
      practiceId: r.practiceId,
      patientId: r.patientId,
      patientName: readableIds.has(r.id) ? (nameOf.get(r.patientId) ?? null) : null,
      practitionerUserId: r.practitionerUserId,
      practitionerName: pname.get(r.practitionerUserId) ?? 'Unknown',
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      status: r.status,
      reason: r.reason,
      cancelReason: r.cancelReason,
    }));
  }

  private async load(p: Principal, id: string, ctx: Ctx): Promise<Row> {
    const row = await this.prisma.appointment.findFirst({
      where: { AND: [this.readWhere(p), { id }] },
    });
    if (!row) {
      await this.audit.recordBestEffort({
        action: 'access.denied',
        outcome: 'DENIED',
        actorUserId: p.id,
        organisationId: p.organisationId,
        targetType: 'appointment',
        targetId: id,
        requestId: ctx.requestId,
        ipAddress: ctx.ip,
      });
      throw new NotFoundException();
    }
    return row;
  }

  private async loadManageable(p: Principal, id: string, ctx: Ctx): Promise<Row> {
    const row = await this.load(p, id, ctx);
    if (!hasPermission(p.assignments, 'appointment.manage', { practiceId: row.practiceId }))
      throw new ForbiddenException();
    return row;
  }

  private async assertPractitioner(
    p: Principal,
    practiceId: string,
    userId: string,
  ): Promise<void> {
    const ok = await this.prisma.user.count({
      where: {
        id: userId,
        organisationId: p.organisationId,
        isActive: true,
        roleAssignments: { some: { role: 'DENTIST', OR: [{ practiceId }, { practiceId: null }] } },
      },
    });
    if (!ok)
      throw new BadRequestException(
        'Selected practitioner cannot take appointments at this practice.',
      );
  }

  private times(startsAt: string, minutes: number): { start: Date; end: Date } {
    const start = new Date(startsAt);
    if (start.getTime() < Date.now() - GRACE_MS)
      throw new BadRequestException('Appointments cannot be booked in the past.');
    return { start, end: new Date(start.getTime() + minutes * 60_000) };
  }

  async list(p: Principal, q: AppointmentsQuery): Promise<Appointment[]> {
    const rows = await this.prisma.appointment.findMany({
      where: {
        AND: [
          this.readWhere(p),
          { startsAt: { gte: new Date(q.from), lt: new Date(q.to) } },
          q.practiceId ? { practiceId: q.practiceId } : {},
          q.practitionerUserId ? { practitionerUserId: q.practitionerUserId } : {},
        ],
      },
      orderBy: { startsAt: 'asc' },
      take: 1000,
    });
    return this.dto(p, rows);
  }

  async get(p: Principal, id: string, ctx: Ctx): Promise<Appointment> {
    return (await this.dto(p, [await this.load(p, id, ctx)]))[0]!;
  }

  async practitioners(p: Principal, practiceId: string): Promise<Practitioner[]> {
    // An organisation-wide grant matches ANY practice id, so the id must be proven to belong to the
    // caller's organisation before it is used (otherwise a foreign id would be answered, not refused).
    const practice = await this.prisma.practice.findFirst({
      where: { id: practiceId, organisationId: p.organisationId },
      select: { id: true },
    });
    if (!practice || !hasPermission(p.assignments, 'appointment.read', { practiceId }))
      throw new NotFoundException();
    const users = await this.prisma.user.findMany({
      where: {
        organisationId: p.organisationId,
        isActive: true,
        roleAssignments: { some: { role: 'DENTIST', OR: [{ practiceId }, { practiceId: null }] } },
      },
      select: { id: true, displayName: true },
      orderBy: { displayName: 'asc' },
    });
    return users;
  }

  async create(p: Principal, input: CreateAppointmentRequest, ctx: Ctx): Promise<Appointment> {
    if (!hasPermission(p.assignments, 'appointment.manage', { practiceId: input.practiceId }))
      throw new ForbiddenException();
    const practice = await this.prisma.practice.findFirst({
      where: { id: input.practiceId, organisationId: p.organisationId, isActive: true },
    });
    if (!practice) throw new NotFoundException();
    const link = await this.prisma.patientPractice.findFirst({
      where: {
        patientId: input.patientId,
        practiceId: input.practiceId,
        patient: { organisationId: p.organisationId, isActive: true },
      },
    });
    if (!link) throw new NotFoundException(); // patient not registered at this practice
    await this.assertPractitioner(p, input.practiceId, input.practitionerUserId);
    const { start, end } = this.times(input.startsAt, input.durationMinutes);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const a = await tx.appointment.create({
          data: {
            organisationId: p.organisationId,
            practiceId: input.practiceId,
            patientId: input.patientId,
            practitionerUserId: input.practitionerUserId,
            startsAt: start,
            endsAt: end,
            reason: input.reason ?? null,
            createdByUserId: p.id,
          },
        });
        await tx.appointmentEvent.create({
          data: {
            appointmentId: a.id,
            type: 'CREATED',
            actorUserId: p.id,
            toStartsAt: start,
            toEndsAt: end,
          },
        });
        await this.audit.record(
          {
            action: 'appointment.create',
            outcome: 'SUCCESS',
            actorUserId: p.id,
            organisationId: p.organisationId,
            practiceId: input.practiceId,
            targetType: 'appointment',
            targetId: a.id,
            requestId: ctx.requestId,
            ipAddress: ctx.ip,
          },
          tx,
        );
        return a;
      });
      return (await this.dto(p, [row]))[0]!;
    } catch (e) {
      throw asConflict(e) ?? e;
    }
  }

  async reschedule(
    p: Principal,
    id: string,
    input: RescheduleAppointmentRequest,
    ctx: Ctx,
  ): Promise<Appointment> {
    const current = await this.loadManageable(p, id, ctx);
    if (current.status !== 'SCHEDULED')
      throw new ConflictException('Only scheduled appointments can be rescheduled.');
    const minutes =
      input.durationMinutes ??
      Math.round((current.endsAt.getTime() - current.startsAt.getTime()) / 60_000);
    const { start, end } = this.times(input.startsAt, minutes);
    const practitioner = input.practitionerUserId ?? current.practitionerUserId;
    if (practitioner !== current.practitionerUserId)
      await this.assertPractitioner(p, current.practiceId, practitioner);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        // Guard against a concurrent status change between load and update.
        const r = await tx.appointment.updateMany({
          where: { id, status: 'SCHEDULED' },
          data: { startsAt: start, endsAt: end, practitionerUserId: practitioner },
        });
        if (r.count === 0)
          throw new ConflictException('The appointment changed; reload and try again.');
        await tx.appointmentEvent.create({
          data: {
            appointmentId: id,
            type: 'RESCHEDULED',
            actorUserId: p.id,
            fromStartsAt: current.startsAt,
            fromEndsAt: current.endsAt,
            toStartsAt: start,
            toEndsAt: end,
          },
        });
        await this.audit.record(
          {
            action: 'appointment.reschedule',
            outcome: 'SUCCESS',
            actorUserId: p.id,
            organisationId: p.organisationId,
            practiceId: current.practiceId,
            targetType: 'appointment',
            targetId: id,
            requestId: ctx.requestId,
            ipAddress: ctx.ip,
          },
          tx,
        );
        return tx.appointment.findUniqueOrThrow({ where: { id } });
      });
      return (await this.dto(p, [row]))[0]!;
    } catch (e) {
      throw asConflict(e) ?? e;
    }
  }

  async cancel(
    p: Principal,
    id: string,
    input: CancelAppointmentRequest,
    ctx: Ctx,
  ): Promise<Appointment> {
    const current = await this.loadManageable(p, id, ctx);
    const row = await this.prisma.$transaction(async (tx) => {
      const r = await tx.appointment.updateMany({
        where: { id, status: { in: ['SCHEDULED', 'CHECKED_IN'] } },
        data: { status: 'CANCELLED', cancelReason: input.reason },
      });
      if (r.count === 0)
        throw new ConflictException('This appointment can no longer be cancelled.');
      await tx.appointmentEvent.create({
        data: {
          appointmentId: id,
          type: 'CANCELLED',
          actorUserId: p.id,
          fromStartsAt: current.startsAt,
          reason: input.reason,
        },
      });
      await this.audit.record(
        {
          action: 'appointment.cancel',
          outcome: 'SUCCESS',
          actorUserId: p.id,
          organisationId: p.organisationId,
          practiceId: current.practiceId,
          targetType: 'appointment',
          targetId: id,
          requestId: ctx.requestId,
          ipAddress: ctx.ip,
        },
        tx,
      );
      return tx.appointment.findUniqueOrThrow({ where: { id } });
    });
    return (await this.dto(p, [row]))[0]!;
  }

  async transition(
    p: Principal,
    id: string,
    status: 'CHECKED_IN' | 'COMPLETED' | 'NO_SHOW',
    ctx: Ctx,
  ): Promise<Appointment> {
    const current = await this.loadManageable(p, id, ctx);
    const rule = TRANSITIONS[status];
    if (status === 'NO_SHOW' && current.startsAt.getTime() > Date.now())
      throw new ConflictException('An appointment cannot be a no-show before it starts.');
    const row = await this.prisma.$transaction(async (tx) => {
      const r = await tx.appointment.updateMany({
        where: { id, status: { in: rule.from } },
        data: { status },
      });
      if (r.count === 0)
        throw new ConflictException(
          `Cannot mark a ${current.status.toLowerCase().replace('_', ' ')} appointment as ${status.toLowerCase().replace('_', ' ')}.`,
        );
      await tx.appointmentEvent.create({
        data: { appointmentId: id, type: rule.event, actorUserId: p.id },
      });
      await this.audit.record(
        {
          action: `appointment.${status.toLowerCase()}`,
          outcome: 'SUCCESS',
          actorUserId: p.id,
          organisationId: p.organisationId,
          practiceId: current.practiceId,
          targetType: 'appointment',
          targetId: id,
          requestId: ctx.requestId,
          ipAddress: ctx.ip,
        },
        tx,
      );
      return tx.appointment.findUniqueOrThrow({ where: { id } });
    });
    return (await this.dto(p, [row]))[0]!;
  }

  async history(p: Principal, id: string, ctx: Ctx): Promise<AppointmentEvent[]> {
    await this.load(p, id, ctx);
    const rows = await this.prisma.appointmentEvent.findMany({
      where: { appointmentId: id },
      orderBy: { occurredAt: 'asc' },
    });
    return rows.map((e) => ({
      id: e.id,
      type: e.type,
      occurredAt: e.occurredAt.toISOString(),
      actorUserId: e.actorUserId,
      fromStartsAt: e.fromStartsAt?.toISOString() ?? null,
      toStartsAt: e.toStartsAt?.toISOString() ?? null,
      reason: e.reason,
    }));
  }
}
