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
// Fully synthetic person. 8001015009087 is a checksum-valid ID format number used widely in docs/tests.
const person = (practiceId: string, over: Record<string, unknown> = {}) => ({
  firstName: 'Testa',
  lastName: 'Syntheticson',
  dateOfBirth: '1990-05-17',
  sex: 'FEMALE',
  mobilePhone: '082 000 0001',
  practiceId,
  ...over,
});

describe('patients (integration)', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  let fx: Fixtures;
  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    fx = await resetAndSeed(prisma);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });
  const post = (a: Agent, url: string, body?: object) =>
    a.post(url).set('Origin', ORIGIN).send(body);
  const patch = (a: Agent, url: string, body: object) =>
    a.patch(url).set('Origin', ORIGIN).send(body);
  const as = async (email: string) => (await loginAgent(app, email)).agent;

  describe('registration and validation', () => {
    it('registers a patient, normalises the phone number and links the registering practice', async () => {
      const a = await as(fx.users.recepA.email);
      const res = await post(a, '/api/v1/patients', person(fx.practiceA)).expect(201);
      expect(res.body.patient.mobilePhone).toBe('+27820000001');
      expect(res.body.patient.practiceIds).toEqual([fx.practiceA]);
      expect(res.body.duplicateCandidates).toEqual([]);
      expect(await prisma.auditEvent.count({ where: { action: 'patient.create' } })).toBe(1);
    });

    it('rejects registration in a practice where the caller has no patient.create right', async () => {
      const a = await as(fx.users.recepA.email);
      await post(a, '/api/v1/patients', person(fx.practiceB)).expect(403);
      expect(await prisma.patient.count()).toBe(0);
    });

    it('validates dates, IDs and phone numbers', async () => {
      const a = await as(fx.users.recepA.email);
      await post(a, '/api/v1/patients', person(fx.practiceA, { dateOfBirth: '2999-01-01' })).expect(
        400,
      );
      await post(a, '/api/v1/patients', person(fx.practiceA, { dateOfBirth: '1990-02-31' })).expect(
        400,
      );
      await post(a, '/api/v1/patients', person(fx.practiceA, { idNumber: '1234567890123' })).expect(
        400,
      ); // bad checksum
      await post(a, '/api/v1/patients', person(fx.practiceA, { mobilePhone: 'abc' })).expect(400);
      await post(a, '/api/v1/patients', person(fx.practiceA, { firstName: '<script>' })).expect(
        400,
      );
      await post(a, '/api/v1/patients', person(fx.practiceA, { idNumber: '8001015009087' })).expect(
        201,
      );
    });

    it('ignores client attempts to set server-controlled fields (mass assignment)', async () => {
      const a = await as(fx.users.recepA.email);
      const res = await post(
        a,
        '/api/v1/patients',
        person(fx.practiceA, {
          id: '00000000-0000-4000-8000-000000000000',
          organisationId: '00000000-0000-4000-8000-000000000000',
          createdByUserId: null,
        }),
      ).expect(201);
      expect(res.body.patient.id).not.toBe('00000000-0000-4000-8000-000000000000');
      expect(
        (await prisma.patient.findUniqueOrThrow({ where: { id: res.body.patient.id } }))
          .organisationId,
      ).toBe(fx.orgId);
    });
  });

  describe('duplicate handling (human review, never auto-merge)', () => {
    it('surfaces likely duplicates, records a flag and requires explicit review', async () => {
      const a = await as(fx.users.recepA.email);
      const first = await post(a, '/api/v1/patients', person(fx.practiceA)).expect(201);
      const second = await post(
        a,
        '/api/v1/patients',
        person(fx.practiceA, { firstName: 'T.' }),
      ).expect(201);
      expect(second.body.duplicateCandidates).toHaveLength(1);
      expect(second.body.duplicateCandidates[0].id).toBe(first.body.patient.id);
      expect(await prisma.patient.count()).toBe(2); // nothing merged or blocked
      const list = await a.get('/api/v1/patients/duplicates').expect(200);
      expect(list.body.meta.total).toBe(1);
      const flagId = list.body.data[0].id;
      await post(a, `/api/v1/patients/duplicates/${flagId}/review`, {
        decision: 'DISTINCT_PATIENTS',
      }).expect(204);
      await post(a, `/api/v1/patients/duplicates/${flagId}/review`, {
        decision: 'CONFIRMED_DUPLICATE',
      }).expect(409);
      expect((await a.get('/api/v1/patients/duplicates').expect(200)).body.meta.total).toBe(0);
      expect(await prisma.auditEvent.count({ where: { action: 'patient.duplicate_review' } })).toBe(
        1,
      );
    });

    it('matches on identical ID number even with different names', async () => {
      const a = await as(fx.users.recepA.email);
      await post(a, '/api/v1/patients', person(fx.practiceA, { idNumber: '8001015009087' })).expect(
        201,
      );
      const r = await post(
        a,
        '/api/v1/patients',
        person(fx.practiceA, {
          firstName: 'Other',
          lastName: 'Name',
          dateOfBirth: '1980-01-01',
          idNumber: '8001015009087',
        }),
      ).expect(201);
      expect(r.body.duplicateCandidates[0].reasons).toContain('Same ID number');
    });

    it('does not reveal patients from practices the caller cannot see', async () => {
      const b = await as(fx.users.recepB.email);
      const a = await as(fx.users.recepA.email);
      await post(a, '/api/v1/patients', person(fx.practiceA)).expect(201);
      const r = await post(b, '/api/v1/patients', person(fx.practiceB)).expect(201);
      expect(r.body.duplicateCandidates).toEqual([]);
    });
  });

  describe('practice isolation and audited access', () => {
    it('hides patients from other practices in search and by id (404 + audit), owner sees all', async () => {
      const a = await as(fx.users.recepA.email);
      const b = await as(fx.users.recepB.email);
      const created = await post(a, '/api/v1/patients', person(fx.practiceA)).expect(201);
      const id = created.body.patient.id;
      expect((await b.get('/api/v1/patients?q=Synth').expect(200)).body.meta.total).toBe(0);
      await b.get(`/api/v1/patients/${id}`).expect(404);
      await patch(b, `/api/v1/patients/${id}`, { firstName: 'Hacked' }).expect(404);
      await b.get(`/api/v1/patients/${id}/revisions`).expect(404);
      expect(
        await prisma.auditEvent.count({ where: { action: 'access.denied', targetId: id } }),
      ).toBe(3);
      const owner = await as(fx.users.owner.email);
      expect((await owner.get('/api/v1/patients?q=Synth').expect(200)).body.meta.total).toBe(1);
      expect((await prisma.patient.findUniqueOrThrow({ where: { id } })).firstName).toBe('Testa');
    });

    it('search needs criteria, supports prefix/phone/DOB and never logs search terms', async () => {
      const a = await as(fx.users.recepA.email);
      await post(a, '/api/v1/patients', person(fx.practiceA)).expect(201);
      await a.get('/api/v1/patients').expect(400);
      await a.get('/api/v1/patients?q=x').expect(400);
      expect((await a.get('/api/v1/patients?q=testa synth').expect(200)).body.meta.total).toBe(1);
      expect((await a.get('/api/v1/patients?q=0820000001').expect(200)).body.meta.total).toBe(1);
      expect(
        (await a.get('/api/v1/patients?dateOfBirth=1990-05-17').expect(200)).body.meta.total,
      ).toBe(1);
      expect((await a.get('/api/v1/patients?q=zzz').expect(200)).body.meta.total).toBe(0);
      const events = await prisma.auditEvent.findMany({ where: { action: 'patient.search' } });
      expect(events.length).toBe(4);
      expect(JSON.stringify(events)).not.toMatch(/Synth|Testa|0820000001/);
    });

    it('audits profile views without personal data in the audit record', async () => {
      const a = await as(fx.users.recepA.email);
      const id = (await post(a, '/api/v1/patients', person(fx.practiceA)).expect(201)).body.patient
        .id;
      await a.get(`/api/v1/patients/${id}`).expect(200);
      const views = await prisma.auditEvent.findMany({ where: { action: 'patient.view' } });
      expect(views).toHaveLength(1);
      expect(views[0]!.targetId).toBe(id);
      const all = JSON.stringify(await prisma.auditEvent.findMany());
      expect(all).not.toMatch(/Synth|Testa|1990-05-17|0820000001/);
    });

    it('explicit cross-practice sharing needs rights in both practices; owner can link', async () => {
      const a = await as(fx.users.recepA.email);
      const b = await as(fx.users.recepB.email);
      const id = (await post(a, '/api/v1/patients', person(fx.practiceA)).expect(201)).body.patient
        .id;
      await post(a, `/api/v1/patients/${id}/practices`, { practiceId: fx.practiceB }).expect(403);
      await b.get(`/api/v1/patients/${id}`).expect(404);
      const owner = await as(fx.users.owner.email);
      const linked = await post(owner, `/api/v1/patients/${id}/practices`, {
        practiceId: fx.practiceB,
      }).expect(200);
      expect(linked.body.practiceIds.sort()).toEqual([fx.practiceA, fx.practiceB].sort());
      await b.get(`/api/v1/patients/${id}`).expect(200);
      expect(await prisma.auditEvent.count({ where: { action: 'patient.link_practice' } })).toBe(1);
    });

    it('billing staff can read but not edit patients', async () => {
      const a = await as(fx.users.recepA.email);
      const id = (await post(a, '/api/v1/patients', person(fx.practiceA)).expect(201)).body.patient
        .id;
      const bill = await as(fx.users.billingA.email);
      await bill.get(`/api/v1/patients/${id}`).expect(200);
      await patch(bill, `/api/v1/patients/${id}`, { firstName: 'X' }).expect(403);
      await post(bill, '/api/v1/patients', person(fx.practiceA)).expect(403);
    });
  });

  describe('updates, revisions and contacts', () => {
    it('records which fields changed (not their values) and who changed them', async () => {
      const a = await as(fx.users.recepA.email);
      const id = (await post(a, '/api/v1/patients', person(fx.practiceA)).expect(201)).body.patient
        .id;
      const up = await patch(a, `/api/v1/patients/${id}`, {
        email: 'Testa@Example.INVALID',
        city: 'Pretoria',
        firstName: 'Testa',
      }).expect(200);
      expect(up.body.email).toBe('testa@example.invalid');
      const revs = await a.get(`/api/v1/patients/${id}/revisions`).expect(200);
      expect(revs.body).toHaveLength(1);
      expect(revs.body[0].fields.sort()).toEqual(['city', 'email']); // unchanged firstName not recorded
      expect(revs.body[0].changedByUserId).toBe(fx.users.recepA.id);
      expect(JSON.stringify(revs.body)).not.toMatch(/Pretoria|example/);
      await patch(a, `/api/v1/patients/${id}`, {}).expect(400);
    });

    it('manages emergency contacts', async () => {
      const a = await as(fx.users.recepA.email);
      const id = (await post(a, '/api/v1/patients', person(fx.practiceA)).expect(201)).body.patient
        .id;
      const withContact = await post(a, `/api/v1/patients/${id}/contacts`, {
        name: 'Next Ofkin',
        relationship: 'Spouse',
        phone: '083 000 0002',
      }).expect(201);
      expect(withContact.body.contacts[0]).toMatchObject({
        phone: '+27830000002',
        isEmergencyContact: true,
      });
      const cid = withContact.body.contacts[0].id;
      const removed = await a
        .delete(`/api/v1/patients/${id}/contacts/${cid}`)
        .set('Origin', ORIGIN)
        .expect(200);
      expect(removed.body.contacts).toEqual([]);
    });
  });

  describe('medical history and allergies', () => {
    const entry = {
      category: 'CONDITION',
      description: 'Synthetic hypertension entry',
      source: 'Patient reported',
      recordedOn: '2026-01-10',
      isAlert: true,
    };
    const allergy = {
      substance: 'Synthetic penicillin',
      reaction: 'Rash',
      severity: 'SEVERE',
      source: 'Patient reported',
      recordedOn: '2026-01-10',
    };

    it('is invisible to reception, and writable/readable by the dentist', async () => {
      const recep = await as(fx.users.recepA.email);
      const id = (await post(recep, '/api/v1/patients', person(fx.practiceA)).expect(201)).body
        .patient.id;
      await recep.get(`/api/v1/patients/${id}/medical-history`).expect(403);
      await post(recep, `/api/v1/patients/${id}/allergies`, allergy).expect(403);
      const dentist = await as(fx.users.dentistA.email);
      await post(dentist, `/api/v1/patients/${id}/medical-history`, entry).expect(201);
      const h = await post(dentist, `/api/v1/patients/${id}/allergies`, allergy).expect(201);
      expect(h.body.entries).toHaveLength(1);
      expect(h.body.allergies[0]).toMatchObject({
        severity: 'SEVERE',
        createdByUserId: fx.users.dentistA.id,
      });
      // severe-allergy alert visible on the profile only to those allowed to see medical history
      expect((await dentist.get(`/api/v1/patients/${id}`)).body.severeAllergyCount).toBe(1);
      expect((await recep.get(`/api/v1/patients/${id}`)).body.severeAllergyCount).toBeNull();
      expect(
        await prisma.auditEvent.count({ where: { action: 'medical_history.view' } }),
      ).toBeGreaterThan(0);
    });

    it('does not let a dentist from another practice in', async () => {
      const recep = await as(fx.users.recepA.email);
      const id = (await post(recep, '/api/v1/patients', person(fx.practiceA)).expect(201)).body
        .patient.id;
      const dentistB = await prisma.user.create({
        data: {
          organisationId: fx.orgId,
          email: 'dentist-b@test.invalid',
          displayName: 'Dentist B',
          passwordHash: (
            await prisma.user.findUniqueOrThrow({ where: { id: fx.users.dentistA.id } })
          ).passwordHash,
          roleAssignments: { create: { role: 'DENTIST', practiceId: fx.practiceB } },
        },
      });
      const d = await as(dentistB.email);
      await d.get(`/api/v1/patients/${id}/medical-history`).expect(404);
      await post(d, `/api/v1/patients/${id}/allergies`, allergy).expect(404);
    });

    it('keeps history append-only: resolve instead of edit, enforced by the database', async () => {
      const recep = await as(fx.users.recepA.email);
      const id = (await post(recep, '/api/v1/patients', person(fx.practiceA)).expect(201)).body
        .patient.id;
      const dentist = await as(fx.users.dentistA.email);
      const h = await post(dentist, `/api/v1/patients/${id}/medical-history`, entry).expect(201);
      const eid = h.body.entries[0].id;
      const resolved = await post(
        dentist,
        `/api/v1/patients/${id}/medical-history/${eid}/resolve`,
      ).expect(200);
      expect(resolved.body.entries[0].resolvedAt).not.toBeNull();
      await post(dentist, `/api/v1/patients/${id}/medical-history/${eid}/resolve`).expect(409);
      await expect(
        prisma.medicalHistoryEntry.update({
          where: { id: eid },
          data: { description: 'rewritten' },
        }),
      ).rejects.toThrow(/immutable/);
      await expect(prisma.medicalHistoryEntry.delete({ where: { id: eid } })).rejects.toThrow(
        /append-only/,
      );
    });
  });
});
