import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import {
  ORIGIN,
  TEST_DATABASE_URL,
  createTestApp,
  loginAgent,
  resetAndSeed,
  type Fixtures,
} from './helpers';

type Agent = ReturnType<typeof request.agent>;
const HOUR = 3600_000;
const at = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * HOUR).toISOString();

describe('appointments (integration)', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  let fx: Fixtures;
  let patientA: string;
  let patientA2: string;
  let dentist2: string;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    fx = await resetAndSeed(prisma);
    const mkPatient = (firstName: string, practiceId: string) =>
      prisma.patient.create({
        data: {
          organisationId: fx.orgId,
          registeringPracticeId: practiceId,
          firstName,
          lastName: 'Syntheticson',
          dateOfBirth: new Date('1990-01-01'),
          practices: { create: { practiceId } },
        },
      });
    patientA = (await mkPatient('Alpha', fx.practiceA)).id;
    patientA2 = (await mkPatient('Bravo', fx.practiceA)).id;
    const hash = (await prisma.user.findUniqueOrThrow({ where: { id: fx.users.dentistA.id } }))
      .passwordHash;
    dentist2 = (
      await prisma.user.create({
        data: {
          organisationId: fx.orgId,
          email: 'dentist2-a@test.invalid',
          displayName: 'Dentist Two',
          passwordHash: hash,
          roleAssignments: { create: { role: 'DENTIST', practiceId: fx.practiceA } },
        },
      })
    ).id;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const as = async (email: string) => (await loginAgent(app, email)).agent;
  const post = (a: Agent, url: string, body?: object) =>
    a.post(url).set('Origin', ORIGIN).send(body);
  const book = (a: Agent, over: Record<string, unknown> = {}) =>
    post(a, '/api/v1/appointments', {
      practiceId: fx.practiceA,
      patientId: patientA,
      practitionerUserId: fx.users.dentistA.id,
      startsAt: at(24),
      durationMinutes: 30,
      reason: 'Check-up',
      ...over,
    });

  it('books an appointment and shows the patient name to authorised staff', async () => {
    const a = await as(fx.users.recepA.email);
    const res = await book(a).expect(201);
    expect(res.body).toMatchObject({
      status: 'SCHEDULED',
      patientName: 'Syntheticson, Alpha',
      practitionerName: 'dentist-a',
    });
    expect(await prisma.auditEvent.count({ where: { action: 'appointment.create' } })).toBe(1);
  });

  describe('conflict detection', () => {
    it('rejects overlapping bookings for the same practitioner but allows back-to-back', async () => {
      const a = await as(fx.users.recepA.email);
      await book(a, { startsAt: at(24), durationMinutes: 30 }).expect(201);
      await book(a, { patientId: patientA2, startsAt: at(24.25), durationMinutes: 30 }).expect(409);
      await book(a, { patientId: patientA2, startsAt: at(24.5), durationMinutes: 30 }).expect(201); // adjacent
    });

    it('rejects a patient double-booked with a different practitioner', async () => {
      const a = await as(fx.users.recepA.email);
      await book(a).expect(201);
      const r = await book(a, { practitionerUserId: dentist2, startsAt: at(24.1) }).expect(409);
      expect(r.body.error.message).toMatch(/patient/i);
    });

    it('lets exactly one of two simultaneous requests win the slot', async () => {
      const a = await as(fx.users.recepA.email);
      const [x, y] = await Promise.all([
        book(a, { startsAt: at(48) }),
        book(a, { patientId: patientA2, startsAt: at(48) }),
      ]);
      expect([x.status, y.status].sort()).toEqual([201, 409]);
      expect(await prisma.appointment.count()).toBe(1);
    });

    it('frees the slot when an appointment is cancelled', async () => {
      const a = await as(fx.users.recepA.email);
      const first = await book(a).expect(201);
      await post(a, `/api/v1/appointments/${first.body.id}/cancel`, {
        reason: 'Patient called',
      }).expect(200);
      await book(a, { patientId: patientA2 }).expect(201);
    });
  });

  describe('validation and boundaries', () => {
    it('rejects past bookings, non-dentist practitioners and unknown patients', async () => {
      const a = await as(fx.users.recepA.email);
      await book(a, { startsAt: at(-5) }).expect(400);
      await book(a, { practitionerUserId: fx.users.recepA.id }).expect(400);
      await book(a, { practitionerUserId: fx.users.inactive.id }).expect(400);
      await book(a, { patientId: '00000000-0000-4000-8000-000000000000' }).expect(404);
      await book(a, { durationMinutes: 1 }).expect(400);
    });

    it('keeps practices separate for booking, reading and changing', async () => {
      const a = await as(fx.users.recepA.email);
      const b = await as(fx.users.recepB.email);
      const appt = (await book(a).expect(201)).body;
      await book(b).expect(403); // not allowed to book in practice A
      await b.get(`/api/v1/appointments/${appt.id}`).expect(404);
      await post(b, `/api/v1/appointments/${appt.id}/cancel`, { reason: 'Nope' }).expect(404);
      await post(b, `/api/v1/appointments/${appt.id}/reschedule`, { startsAt: at(30) }).expect(404);
      const list = await b
        .get(
          `/api/v1/appointments?from=${encodeURIComponent(at(0))}&to=${encodeURIComponent(at(100))}`,
        )
        .expect(200);
      expect(list.body).toEqual([]);
      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe(
        'SCHEDULED',
      );
    });

    it('does not allow booking a patient who is not registered at that practice', async () => {
      const b = await as(fx.users.recepB.email);
      await post(b, '/api/v1/appointments', {
        practiceId: fx.practiceB,
        patientId: patientA,
        practitionerUserId: fx.users.dentistA.id,
        startsAt: at(24),
        durationMinutes: 30,
      }).expect(404);
    });

    it('denies roles without appointment permissions', async () => {
      const bill = await as(fx.users.billingA.email);
      await bill
        .get(
          `/api/v1/appointments?from=${encodeURIComponent(at(0))}&to=${encodeURIComponent(at(24))}`,
        )
        .expect(403);
    });

    it('bounds the calendar range', async () => {
      const a = await as(fx.users.recepA.email);
      await a.get('/api/v1/appointments').expect(400);
      await a
        .get(
          `/api/v1/appointments?from=${encodeURIComponent(at(0))}&to=${encodeURIComponent(at(24 * 60))}`,
        )
        .expect(400);
      const ok = await a
        .get(
          `/api/v1/appointments?from=${encodeURIComponent(at(0))}&to=${encodeURIComponent(at(24 * 30))}&practiceId=${fx.practiceA}`,
        )
        .expect(200);
      expect(ok.body).toEqual([]);
    });

    it('lists practitioners for a practice only to those who can read its calendar', async () => {
      const a = await as(fx.users.recepA.email);
      const b = await as(fx.users.recepB.email);
      const r = await a
        .get(`/api/v1/appointments/practitioners?practiceId=${fx.practiceA}`)
        .expect(200);
      expect(r.body.map((x: { id: string }) => x.id).sort()).toEqual(
        [fx.users.dentistA.id, dentist2].sort(),
      );
      await b.get(`/api/v1/appointments/practitioners?practiceId=${fx.practiceA}`).expect(404);
    });
  });

  describe('lifecycle and history', () => {
    it('reschedules with history, rejects conflicting reschedules, and blocks non-scheduled ones', async () => {
      const a = await as(fx.users.recepA.email);
      const one = (await book(a, { startsAt: at(24) }).expect(201)).body;
      const two = (await book(a, { patientId: patientA2, startsAt: at(26) }).expect(201)).body;
      await post(a, `/api/v1/appointments/${two.id}/reschedule`, { startsAt: at(24.1) }).expect(
        409,
      );
      const moved = await post(a, `/api/v1/appointments/${one.id}/reschedule`, {
        startsAt: at(30),
        durationMinutes: 45,
      }).expect(200);
      expect(new Date(moved.body.endsAt).getTime() - new Date(moved.body.startsAt).getTime()).toBe(
        45 * 60_000,
      );
      const history = (await a.get(`/api/v1/appointments/${one.id}/history`).expect(200)).body;
      expect(history.map((e: { type: string }) => e.type)).toEqual(['CREATED', 'RESCHEDULED']);
      expect(history[1].fromStartsAt).toBe(one.startsAt);
      await post(a, `/api/v1/appointments/${one.id}/cancel`, { reason: 'Changed mind' }).expect(
        200,
      );
      await post(a, `/api/v1/appointments/${one.id}/reschedule`, { startsAt: at(40) }).expect(409);
      await post(a, `/api/v1/appointments/${one.id}/cancel`, { reason: 'Again' }).expect(409);
      const h2 = (await a.get(`/api/v1/appointments/${one.id}/history`).expect(200)).body;
      expect(h2.at(-1)).toMatchObject({ type: 'CANCELLED', reason: 'Changed mind' });
    });

    it('enforces the status workflow', async () => {
      const a = await as(fx.users.recepA.email);
      const appt = (await book(a).expect(201)).body;
      await post(a, `/api/v1/appointments/${appt.id}/status`, { status: 'COMPLETED' }).expect(409); // not checked in
      await post(a, `/api/v1/appointments/${appt.id}/status`, { status: 'NO_SHOW' }).expect(409); // not started
      await post(a, `/api/v1/appointments/${appt.id}/status`, { status: 'CHECKED_IN' }).expect(200);
      await post(a, `/api/v1/appointments/${appt.id}/status`, { status: 'CHECKED_IN' }).expect(409);
      const done = await post(a, `/api/v1/appointments/${appt.id}/status`, {
        status: 'COMPLETED',
      }).expect(200);
      expect(done.body.status).toBe('COMPLETED');
      await post(a, `/api/v1/appointments/${appt.id}/cancel`, { reason: 'Too late' }).expect(409);
    });

    it('marks a started, unattended appointment as no-show', async () => {
      const a = await as(fx.users.recepA.email);
      const appt = (await book(a).expect(201)).body;
      await prisma.appointment.update({
        where: { id: appt.id },
        data: { startsAt: new Date(Date.now() - 2 * HOUR), endsAt: new Date(Date.now() - HOUR) },
      });
      await post(a, `/api/v1/appointments/${appt.id}/status`, { status: 'NO_SHOW' }).expect(200);
    });

    it('keeps history append-only at the database layer', async () => {
      const a = await as(fx.users.recepA.email);
      await book(a).expect(201);
      await expect(prisma.appointmentEvent.deleteMany({})).rejects.toThrow(/append-only/);
      await expect(prisma.appointmentEvent.updateMany({ data: { reason: 'x' } })).rejects.toThrow(
        /append-only/,
      );
    });
  });
});
