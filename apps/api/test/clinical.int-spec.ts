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
const SECRET_NOTE = 'SYNTHETIC-CLINICAL-TEXT-ALPHA';

describe('clinical records (integration)', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  let fx: Fixtures;
  let patient: string;
  let dentist2: { id: string; email: string };
  let dentistB: { id: string; email: string };

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    fx = await resetAndSeed(prisma);
    patient = (
      await prisma.patient.create({
        data: {
          organisationId: fx.orgId,
          registeringPracticeId: fx.practiceA,
          firstName: 'Clin',
          lastName: 'Syntheticson',
          dateOfBirth: new Date('1985-03-03'),
          practices: { create: { practiceId: fx.practiceA } },
        },
      })
    ).id;
    const hash = (await prisma.user.findUniqueOrThrow({ where: { id: fx.users.dentistA.id } }))
      .passwordHash;
    const mk = (email: string, practiceId: string) =>
      prisma.user.create({
        data: {
          organisationId: fx.orgId,
          email,
          displayName: email.split('@')[0]!,
          passwordHash: hash,
          roleAssignments: { create: { role: 'DENTIST', practiceId } },
        },
        select: { id: true, email: true },
      });
    dentist2 = await mk('dentist2-a@test.invalid', fx.practiceA);
    dentistB = await mk('dentist-b@test.invalid', fx.practiceB);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const as = async (email: string) => (await loginAgent(app, email)).agent;
  const post = (a: Agent, url: string, body?: object) =>
    a.post(url).set('Origin', ORIGIN).send(body);
  const put = (a: Agent, url: string, body?: object) => a.put(url).set('Origin', ORIGIN).send(body);
  const open = async (a: Agent, body?: string) =>
    (
      await post(a, `/api/v1/patients/${patient}/encounters`, {
        practiceId: fx.practiceA,
        ...(body ? { body } : {}),
      }).expect(201)
    ).body;

  describe('encounter lifecycle', () => {
    it('keeps a full version history of draft saves with authorship', async () => {
      const d = await as(fx.users.dentistA.email);
      const enc = await open(d, `${SECRET_NOTE} v1`);
      await put(d, `/api/v1/encounters/${enc.id}/draft`, { body: `${SECRET_NOTE} v2` }).expect(200);
      const r = await put(d, `/api/v1/encounters/${enc.id}/draft`, {
        body: `${SECRET_NOTE} v3`,
      }).expect(200);
      expect(r.body.currentBody).toBe(`${SECRET_NOTE} v3`);
      expect(r.body.versions.map((v: { versionNumber: number }) => v.versionNumber)).toEqual([
        1, 2, 3,
      ]);
      expect(r.body.versions[0]).toMatchObject({
        kind: 'DRAFT',
        authorUserId: fx.users.dentistA.id,
        body: `${SECRET_NOTE} v1`,
      });
    });

    it('lets only the encounter practitioner edit or finalise a draft', async () => {
      const d = await as(fx.users.dentistA.email);
      const other = await as(dentist2.email);
      const enc = await open(d, `${SECRET_NOTE} draft`);
      await other.get(`/api/v1/encounters/${enc.id}`).expect(200); // colleague may read
      await put(other, `/api/v1/encounters/${enc.id}/draft`, { body: 'hijack' }).expect(403);
      await post(other, `/api/v1/encounters/${enc.id}/finalise`).expect(403);
      expect(await prisma.clinicalNoteVersion.count({ where: { encounterId: enc.id } })).toBe(1);
    });

    it('requires a note before finalising, then locks the record', async () => {
      const d = await as(fx.users.dentistA.email);
      const empty = await open(d);
      await post(d, `/api/v1/encounters/${empty.id}/finalise`).expect(400);
      const enc = await open(d, `${SECRET_NOTE} final`);
      const fin = await post(d, `/api/v1/encounters/${enc.id}/finalise`).expect(200);
      expect(fin.body.status).toBe('FINALISED');
      expect(fin.body.finalisedAt).not.toBeNull();
      await put(d, `/api/v1/encounters/${enc.id}/draft`, { body: 'silent edit' }).expect(409);
      await post(d, `/api/v1/encounters/${enc.id}/finalise`).expect(409);
      expect((await d.get(`/api/v1/encounters/${enc.id}`)).body.currentBody).toBe(
        `${SECRET_NOTE} final`,
      );
    });

    it('is also enforced by the database, not just the API', async () => {
      const d = await as(fx.users.dentistA.email);
      const enc = await open(d, SECRET_NOTE);
      await post(d, `/api/v1/encounters/${enc.id}/finalise`).expect(200);
      await expect(
        prisma.clinicalNoteVersion.create({
          data: {
            encounterId: enc.id,
            versionNumber: 99,
            kind: 'DRAFT',
            body: 'x',
            authorUserId: fx.users.dentistA.id,
          },
        }),
      ).rejects.toThrow(/finalised/);
      await expect(
        prisma.clinicalEncounter.update({ where: { id: enc.id }, data: { status: 'DRAFT' } }),
      ).rejects.toThrow(/immutable/);
      await expect(prisma.clinicalEncounter.delete({ where: { id: enc.id } })).rejects.toThrow(
        /cannot be deleted/,
      );
      await expect(
        prisma.clinicalNoteVersion.updateMany({ data: { body: 'rewritten' } }),
      ).rejects.toThrow(/append-only/);
      await expect(prisma.clinicalNoteVersion.deleteMany({})).rejects.toThrow(/append-only/);
    });

    it('records amendments and addenda without altering the original', async () => {
      const d = await as(fx.users.dentistA.email);
      const other = await as(dentist2.email);
      const enc = await open(d, `${SECRET_NOTE} original`);
      await post(other, `/api/v1/encounters/${enc.id}/amendments`, {
        body: 'x',
        reason: 'too early reason',
      }).expect(409); // still draft
      await post(d, `/api/v1/encounters/${enc.id}/finalise`).expect(200);
      await post(other, `/api/v1/encounters/${enc.id}/amendments`, {
        body: `${SECRET_NOTE} corrected`,
        reason: '',
      }).expect(400); // reason required
      const am = await post(other, `/api/v1/encounters/${enc.id}/amendments`, {
        body: `${SECRET_NOTE} corrected`,
        reason: 'Wrong tooth recorded',
      }).expect(201);
      expect(am.body.currentBody).toBe(`${SECRET_NOTE} corrected`);
      const ad = await post(other, `/api/v1/encounters/${enc.id}/addenda`, {
        body: `${SECRET_NOTE} follow-up`,
      }).expect(201);
      expect(ad.body.currentBody).toBe(`${SECRET_NOTE} corrected`); // addenda do not replace the note
      expect(ad.body.versions.map((v: { kind: string }) => v.kind)).toEqual([
        'DRAFT',
        'AMENDMENT',
        'ADDENDUM',
      ]);
      expect(ad.body.versions[0].body).toBe(`${SECRET_NOTE} original`); // original preserved
      expect(ad.body.versions[1]).toMatchObject({
        amendsVersion: 1,
        reason: 'Wrong tooth recorded',
        authorUserId: dentist2.id,
      });
    });

    it('handles concurrent draft saves without losing or duplicating versions', async () => {
      const d = await as(fx.users.dentistA.email);
      const enc = await open(d, 'start');
      const results = await Promise.all(
        [1, 2, 3, 4, 5].map((i) =>
          put(d, `/api/v1/encounters/${enc.id}/draft`, { body: `save ${i}` }),
        ),
      );
      const ok = results.filter((r) => r.status === 200).length;
      expect(results.every((r) => [200, 409].includes(r.status))).toBe(true);
      const versions = await prisma.clinicalNoteVersion.findMany({
        where: { encounterId: enc.id },
        orderBy: { versionNumber: 'asc' },
      });
      expect(versions.length).toBe(1 + ok);
      expect(versions.map((v) => v.versionNumber)).toEqual(versions.map((_, i) => i + 1));
    });
  });

  describe('access control', () => {
    it('denies reception and billing outright, and other practices as not-found', async () => {
      const d = await as(fx.users.dentistA.email);
      const enc = await open(d, SECRET_NOTE);
      for (const email of [fx.users.recepA.email, fx.users.billingA.email, fx.users.adminA.email]) {
        const a = await as(email);
        await a.get(`/api/v1/encounters/${enc.id}`).expect(403);
        await a.get(`/api/v1/patients/${patient}/encounters`).expect(403);
        await post(a, `/api/v1/patients/${patient}/encounters`, {
          practiceId: fx.practiceA,
          body: 'x',
        }).expect(403);
      }
      const b = await as(dentistB.email);
      await b.get(`/api/v1/encounters/${enc.id}`).expect(404);
      await b.get(`/api/v1/patients/${patient}/encounters`).expect(404);
      await post(b, `/api/v1/patients/${patient}/encounters`, { practiceId: fx.practiceA }).expect(
        404,
      );
      await post(b, `/api/v1/patients/${patient}/encounters`, { practiceId: fx.practiceB }).expect(
        404,
      ); // patient not linked to B
      expect(
        await prisma.auditEvent.count({ where: { action: 'access.denied', targetId: enc.id } }),
      ).toBeGreaterThan(0);
    });

    it('grants access to the second practice only after an explicit link', async () => {
      const d = await as(fx.users.dentistA.email);
      const enc = await open(d, SECRET_NOTE);
      const b = await as(dentistB.email);
      await b.get(`/api/v1/encounters/${enc.id}`).expect(404);
      await prisma.patientPractice.create({
        data: { patientId: patient, practiceId: fx.practiceB },
      });
      await b.get(`/api/v1/encounters/${enc.id}`).expect(200);
    });

    it('never writes clinical text into audit records, but audits every access', async () => {
      const d = await as(fx.users.dentistA.email);
      const enc = await open(d, SECRET_NOTE);
      await put(d, `/api/v1/encounters/${enc.id}/draft`, { body: `${SECRET_NOTE} more` });
      await post(d, `/api/v1/encounters/${enc.id}/finalise`);
      await d.get(`/api/v1/encounters/${enc.id}`);
      const events = await prisma.auditEvent.findMany();
      expect(JSON.stringify(events)).not.toContain(SECRET_NOTE);
      const actions = events.map((e) => e.action);
      for (const a of [
        'clinical_record.create',
        'clinical_record.draft_save',
        'clinical_record.finalise',
        'clinical_record.view',
      ])
        expect(actions).toContain(a);
    });
  });

  describe('dental chart', () => {
    it('records FDI-numbered findings, rejects invalid teeth, and keeps history on resolve', async () => {
      const d = await as(fx.users.dentistA.email);
      for (const bad of ['19', '49', '56', '00', 'A1', '1'])
        await post(d, `/api/v1/patients/${patient}/chart`, {
          toothNumber: bad,
          condition: 'CARIES',
        }).expect(400);
      const entry = (
        await post(d, `/api/v1/patients/${patient}/chart`, {
          toothNumber: '26',
          surfaces: ['OCCLUSAL', 'MESIAL', 'OCCLUSAL'],
          condition: 'CARIES',
          note: 'Synthetic note',
        }).expect(201)
      ).body;
      expect(entry.surfaces.sort()).toEqual(['MESIAL', 'OCCLUSAL']);
      await post(d, `/api/v1/patients/${patient}/chart`, {
        toothNumber: '55',
        condition: 'MISSING',
      }).expect(201); // primary tooth
      const resolved = await post(
        d,
        `/api/v1/patients/${patient}/chart/${entry.id}/resolve`,
      ).expect(200);
      expect(resolved.body.resolvedAt).not.toBeNull();
      await post(d, `/api/v1/patients/${patient}/chart/${entry.id}/resolve`).expect(409);
      expect((await d.get(`/api/v1/patients/${patient}/chart`).expect(200)).body).toHaveLength(2);
      await expect(
        prisma.dentalChartEntry.update({ where: { id: entry.id }, data: { condition: 'CROWN' } }),
      ).rejects.toThrow(/immutable/);
    });

    it('is closed to reception and other practices', async () => {
      const r = await as(fx.users.recepA.email);
      await r.get(`/api/v1/patients/${patient}/chart`).expect(403);
      const b = await as(dentistB.email);
      await b.get(`/api/v1/patients/${patient}/chart`).expect(404);
      await post(b, `/api/v1/patients/${patient}/chart`, {
        toothNumber: '11',
        condition: 'CROWN',
      }).expect(404);
    });
  });

  describe('treatment plans', () => {
    const plan = {
      practiceId: '',
      title: 'Synthetic plan',
      items: [
        { toothNumber: '26', description: 'Restoration', estimatedAmount: '1500.50' },
        { description: 'Hygiene visit' },
      ],
    };

    it('stores money as exact decimals and rejects float-style amounts', async () => {
      const d = await as(fx.users.dentistA.email);
      const res = await post(d, `/api/v1/patients/${patient}/treatment-plans`, {
        ...plan,
        practiceId: fx.practiceA,
      }).expect(201);
      expect(res.body.items[0]).toMatchObject({ estimatedAmount: '1500.50', status: 'PROPOSED' });
      expect(res.body.items[1].estimatedAmount).toBeNull();
      await post(d, `/api/v1/patients/${patient}/treatment-plans`, {
        ...plan,
        practiceId: fx.practiceA,
        items: [{ description: 'x y', estimatedAmount: '12.345' }],
      }).expect(400);
      await post(d, `/api/v1/patients/${patient}/treatment-plans`, {
        ...plan,
        practiceId: fx.practiceA,
        items: [{ description: 'x y', estimatedAmount: '-5' }],
      }).expect(400);
      await post(d, `/api/v1/patients/${patient}/treatment-plans`, {
        ...plan,
        practiceId: fx.practiceA,
        items: [],
      }).expect(400);
    });

    it('enforces item status transitions and preserves their history', async () => {
      const d = await as(fx.users.dentistA.email);
      const created = (
        await post(d, `/api/v1/patients/${patient}/treatment-plans`, {
          ...plan,
          practiceId: fx.practiceA,
        }).expect(201)
      ).body;
      const item = created.items[0].id;
      const status = (s: string, note?: string) =>
        post(d, `/api/v1/treatment-plans/items/${item}/status`, { status: s, note });
      await status('COMPLETED').expect(409); // must be accepted first
      await status('DEFERRED', 'Patient will decide later').expect(200);
      await status('ACCEPTED').expect(200);
      const done = await status('COMPLETED').expect(200);
      await status('ACCEPTED').expect(409); // terminal
      const hist = done.body.items[0].history;
      expect(hist.map((h: { toStatus: string }) => h.toStatus)).toEqual([
        'PROPOSED',
        'DEFERRED',
        'ACCEPTED',
        'COMPLETED',
      ]);
      expect(hist[1]).toMatchObject({
        fromStatus: 'PROPOSED',
        note: 'Patient will decide later',
        actorUserId: fx.users.dentistA.id,
      });
      await expect(prisma.treatmentPlanItemEvent.deleteMany({})).rejects.toThrow(/append-only/);
    });

    it('adds items to an existing plan and isolates plans between practices and roles', async () => {
      const d = await as(fx.users.dentistA.email);
      const created = (
        await post(d, `/api/v1/patients/${patient}/treatment-plans`, {
          ...plan,
          practiceId: fx.practiceA,
        }).expect(201)
      ).body;
      const more = await post(d, `/api/v1/treatment-plans/${created.id}/items`, {
        description: 'Extra item here',
      }).expect(201);
      expect(more.body.items).toHaveLength(3);
      const b = await as(dentistB.email);
      await b.get(`/api/v1/treatment-plans/${created.id}`).expect(404);
      await post(b, `/api/v1/treatment-plans/items/${created.items[0].id}/status`, {
        status: 'ACCEPTED',
      }).expect(404);
      const r = await as(fx.users.recepA.email);
      await r.get(`/api/v1/treatment-plans/${created.id}`).expect(403);
    });
  });
});
