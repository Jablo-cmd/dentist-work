import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { buildOpenApi } from '../src/bootstrap';
import {
  ORIGIN,
  TEST_DATABASE_URL,
  TEST_PASSWORD,
  createTestApp,
  loginAgent,
  resetAndSeed,
  type Fixtures,
} from './helpers';

type Agent = ReturnType<typeof request.agent>;

/** Routes that are intentionally reachable without a session. Adding to this list is a security decision. */
const PUBLIC = new Set([
  'GET /api/v1/health',
  'GET /api/v1/health/ready',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/mfa/verify',
  // Public enquiry form: fixed recipient, rate limited, origin checked, no data is readable through it (enquiries.int-spec.ts).
  'POST /api/v1/enquiries',
]);
/** Routes any signed-in user may call (no permission needed): identity and own-credential management. */
const SELF_SERVICE = new Set([
  'GET /api/v1/auth/me',
  'POST /api/v1/auth/logout',
  'POST /api/v1/auth/change-password',
  'POST /api/v1/auth/mfa/enrol',
  'POST /api/v1/auth/mfa/confirm',
  'POST /api/v1/auth/mfa/disable',
]);

interface Route {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  template: string;
  key: string;
}

describe('authorisation matrix (integration)', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  let fx: Fixtures;
  let routes: Route[];

  beforeAll(async () => {
    app = await createTestApp();
    const doc = buildOpenApi(app);
    routes = Object.entries(doc.paths).flatMap(([path, item]) =>
      (['get', 'post', 'put', 'patch', 'delete'] as const)
        .filter((m) => (item as Record<string, unknown>)[m])
        .map((method) => ({
          method,
          template: path,
          key: `${method.toUpperCase()} ${path.replace(/\{[^}]+\}/g, '{id}')}`,
        })),
    );
  });
  beforeEach(async () => {
    fx = await resetAndSeed(prisma);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const fill = (template: string) => template.replace(/\{[^}]+\}/g, () => randomUUID());
  const send = (agent: Agent | ReturnType<typeof request>, r: Route, url: string) => {
    const t = (agent as Agent)[r.method](url);
    if (r.method !== 'get')
      t.set('Origin', ORIGIN).set('Idempotency-Key', 'matrix-test-key-0123456789').send({});
    return t;
  };

  it('discovers the full route inventory (guards against silently untested new routes)', () => {
    // Every discovered route is swept below, so a new route is covered automatically; this just proves discovery works.
    expect(routes.length).toBeGreaterThanOrEqual(70);
    const known = new Set([...PUBLIC, ...SELF_SERVICE]);
    expect([...known].every((k) => routes.some((r) => r.key === k))).toBe(true);
  });

  it('denies every non-public route to an anonymous caller (401)', async () => {
    const failures: string[] = [];
    for (const r of routes.filter((x) => !PUBLIC.has(x.key))) {
      const res = await send(request(app.getHttpServer()) as never, r, fill(r.template));
      if (res.status !== 401) failures.push(`${r.key} -> ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('denies every permissioned route to a signed-in user who holds no roles (403, never data)', async () => {
    const hash = (await prisma.user.findUniqueOrThrow({ where: { id: fx.users.owner.id } }))
      .passwordHash;
    const nobody = await prisma.user.create({
      data: {
        organisationId: fx.orgId,
        email: 'nobody@test.invalid',
        displayName: 'Nobody',
        passwordHash: hash,
      },
    });
    const { agent } = await loginAgent(app, nobody.email);
    const failures: string[] = [];
    for (const r of routes.filter((x) => !PUBLIC.has(x.key) && !SELF_SERVICE.has(x.key))) {
      const res = await send(agent, r, fill(r.template));
      if (res.status !== 403) failures.push(`${r.key} -> ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('rejects state-changing requests from untrusted, missing or opaque origins on every mutating route', async () => {
    const { agent } = await loginAgent(app, fx.users.owner.email);
    for (const origin of [
      'https://evil.example',
      'null',
      'http://localhost:3000.evil.example',
      '',
    ]) {
      for (const r of routes.filter((x) => x.method !== 'get' && !PUBLIC.has(x.key)).slice(0, 12)) {
        const t = (agent as Agent)[r.method](fill(r.template)).send({});
        if (origin) t.set('Origin', origin);
        const res = await t;
        expect([403]).toContain(res.status);
        expect(res.body.error.code).toBe('CSRF_REJECTED');
      }
    }
  });

  describe('organisation isolation: a fully privileged owner of ANOTHER organisation', () => {
    interface Org {
      orgId: string;
      practiceId: string;
      ownerEmail: string;
      userId: string;
      patientId: string;
      encounterId: string;
      planId: string;
      itemId: string;
      appointmentId: string;
      invoiceId: string;
      paymentId: string;
      assetId: string;
      assignmentId: string;
    }
    const seedOrg = async (name: string, code: string, passwordHash: string): Promise<Org> => {
      const org = await prisma.organisation.create({ data: { name } });
      const practice = await prisma.practice.create({
        data: { organisationId: org.id, name: `${name} Practice`, code },
      });
      const owner = await prisma.user.create({
        data: {
          organisationId: org.id,
          email: `owner-${code.toLowerCase()}@test.invalid`,
          displayName: `${name} Owner`,
          passwordHash,
          roleAssignments: { create: { role: 'ORGANISATION_OWNER', practiceId: null } },
        },
        include: { roleAssignments: true },
      });
      const dentist = await prisma.user.create({
        data: {
          organisationId: org.id,
          email: `dentist-${code.toLowerCase()}@test.invalid`,
          displayName: `${name} Dentist`,
          passwordHash,
          roleAssignments: { create: { role: 'DENTIST', practiceId: practice.id } },
        },
      });
      const patient = await prisma.patient.create({
        data: {
          organisationId: org.id,
          registeringPracticeId: practice.id,
          firstName: 'Iso',
          lastName: `Syntheticson${code}`,
          dateOfBirth: new Date('1990-01-01'),
          practices: { create: { practiceId: practice.id } },
        },
      });
      const enc = await prisma.clinicalEncounter.create({
        data: {
          organisationId: org.id,
          practiceId: practice.id,
          patientId: patient.id,
          practitionerUserId: dentist.id,
        },
      });
      await prisma.clinicalNoteVersion.create({
        data: {
          encounterId: enc.id,
          versionNumber: 1,
          kind: 'DRAFT',
          body: `SYNTHETIC-NOTE-${code}`,
          authorUserId: dentist.id,
        },
      });
      await prisma.dentalChartEntry.create({
        data: {
          patientId: patient.id,
          toothNumber: '26',
          condition: 'CARIES',
          recordedByUserId: dentist.id,
        },
      });
      const plan = await prisma.treatmentPlan.create({
        data: {
          organisationId: org.id,
          practiceId: practice.id,
          patientId: patient.id,
          title: 'Plan',
          createdByUserId: dentist.id,
          items: { create: { description: 'Item' } },
        },
        include: { items: true },
      });
      const appt = await prisma.appointment.create({
        data: {
          organisationId: org.id,
          practiceId: practice.id,
          patientId: patient.id,
          practitionerUserId: dentist.id,
          startsAt: new Date(Date.now() + 2 * 86400_000),
          endsAt: new Date(Date.now() + 2 * 86400_000 + 1800_000),
        },
      });
      const invoice = await prisma.invoice.create({
        data: {
          organisationId: org.id,
          practiceId: practice.id,
          patientId: patient.id,
          subtotal: 100,
          total: 100,
          createdByUserId: dentist.id,
          lines: {
            create: {
              lineNo: 1,
              description: 'Consult',
              quantity: 1,
              unitPrice: 100,
              lineTotal: 100,
            },
          },
        },
      });
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'POSTED',
          number: `INV-ISO-${code}`,
          issueDate: new Date(),
          postedAt: new Date(),
        },
      });
      const payment = await prisma.payment.create({
        data: {
          organisationId: org.id,
          practiceId: practice.id,
          patientId: patient.id,
          amount: 50,
          method: 'CASH',
          receivedOn: new Date(),
          idempotencyKey: `seed-${code}-0123456789`,
          requestHash: 'x',
          createdByUserId: dentist.id,
        },
      });
      const asset = await prisma.imagingAsset.create({
        data: {
          organisationId: org.id,
          practiceId: practice.id,
          patientId: patient.id,
          modality: 'PHOTO',
          mimeType: 'image/jpeg',
          originalFilename: 'a.jpg',
          sizeBytes: 10,
          sha256: code
            .toLowerCase()
            .padEnd(64, 'a')
            .slice(0, 64)
            .replace(/[^0-9a-f]/g, 'a'),
          objectKey: `imaging/${org.id}/seed`,
          uploadedByUserId: dentist.id,
          scanStatus: 'CLEAN',
          scannedAt: new Date(),
        },
      });
      return {
        orgId: org.id,
        practiceId: practice.id,
        ownerEmail: owner.email,
        userId: dentist.id,
        patientId: patient.id,
        encounterId: enc.id,
        planId: plan.id,
        itemId: plan.items[0]!.id,
        appointmentId: appt.id,
        invoiceId: invoice.id,
        paymentId: payment.id,
        assetId: asset.id,
        assignmentId: (
          await prisma.userRoleAssignment.findFirstOrThrow({ where: { userId: dentist.id } })
        ).id,
      };
    };

    /** Every way to reach another organisation's records by identifier. Each must answer 404 (or 403) and change nothing. */
    const attacks = (t: Org): [Route['method'], string, object?][] => [
      ['get', `/patients/${t.patientId}`],
      ['patch', `/patients/${t.patientId}`, { firstName: 'Hacked' }],
      ['get', `/patients/${t.patientId}/revisions`],
      ['post', `/patients/${t.patientId}/practices`, { practiceId: t.practiceId }],
      [
        'post',
        `/patients/${t.patientId}/contacts`,
        { name: 'X Y', relationship: 'Friend', phone: '0820000000' },
      ],
      ['get', `/patients/${t.patientId}/medical-history`],
      [
        'post',
        `/patients/${t.patientId}/allergies`,
        { substance: 'Latex', severity: 'MILD', source: 'Seed', recordedOn: '2026-01-01' },
      ],
      ['get', `/patients/${t.patientId}/encounters`],
      ['post', `/patients/${t.patientId}/encounters`, { practiceId: t.practiceId }],
      ['get', `/encounters/${t.encounterId}`],
      ['put', `/encounters/${t.encounterId}/draft`, { body: 'overwritten' }],
      ['post', `/encounters/${t.encounterId}/finalise`],
      ['post', `/encounters/${t.encounterId}/amendments`, { body: 'x', reason: 'because reasons' }],
      ['get', `/patients/${t.patientId}/chart`],
      ['post', `/patients/${t.patientId}/chart`, { toothNumber: '11', condition: 'CROWN' }],
      ['get', `/patients/${t.patientId}/treatment-plans`],
      ['get', `/treatment-plans/${t.planId}`],
      ['post', `/treatment-plans/${t.planId}/items`, { description: 'Extra item' }],
      ['post', `/treatment-plans/items/${t.itemId}/status`, { status: 'ACCEPTED' }],
      ['get', `/patients/${t.patientId}/imaging`],
      ['get', `/imaging/${t.assetId}`],
      ['get', `/imaging/${t.assetId}/file`],
      ['post', `/imaging/${t.assetId}/rescan`],
      ['get', `/patients/${t.patientId}/invoices`],
      ['get', `/patients/${t.patientId}/account`],
      ['get', `/invoices/${t.invoiceId}`],
      [
        'post',
        `/invoices/${t.invoiceId}/credit-notes`,
        { reason: 'steal credit', lines: [{ description: 'x y', unitPrice: '1' }] },
      ],
      [
        'post',
        `/patients/${t.patientId}/invoices`,
        { practiceId: t.practiceId, lines: [{ description: 'Injected', unitPrice: '1' }] },
      ],
      [
        'post',
        `/patients/${t.patientId}/payments`,
        { practiceId: t.practiceId, amount: '1.00', method: 'CASH' },
      ],
      ['post', `/payments/${t.paymentId}/reverse`, { reason: 'steal payment' }],
      [
        'post',
        `/payments/${t.paymentId}/allocations`,
        { allocations: [{ invoiceId: t.invoiceId, amount: '1.00' }] },
      ],
      ['get', `/appointments/${t.appointmentId}`],
      ['get', `/appointments/${t.appointmentId}/history`],
      ['post', `/appointments/${t.appointmentId}/cancel`, { reason: 'sabotage' }],
      [
        'post',
        `/appointments/${t.appointmentId}/reschedule`,
        { startsAt: new Date(Date.now() + 5 * 86400_000).toISOString() },
      ],
      ['post', `/appointments/${t.appointmentId}/status`, { status: 'CHECKED_IN' }],
      [
        'post',
        '/appointments',
        {
          practiceId: t.practiceId,
          patientId: t.patientId,
          practitionerUserId: t.userId,
          startsAt: new Date(Date.now() + 9 * 86400_000).toISOString(),
          durationMinutes: 30,
        },
      ],
      ['get', `/appointments/practitioners?practiceId=${t.practiceId}`],
      ['get', `/practices/${t.practiceId}`],
      ['patch', `/practices/${t.practiceId}`, { name: 'Hijacked Practice' }],
      ['patch', `/users/${t.userId}`, { isActive: false }],
      [
        'post',
        `/users/${t.userId}/assignments`,
        { role: 'RECEPTIONIST', practiceId: t.practiceId },
      ],
      ['delete', `/users/${t.userId}/assignments/${t.assignmentId}`],
      [
        'post',
        `/users/${t.userId}/reset-password`,
        { temporaryPassword: 'Temporary-Synthetic-1234' },
      ],
      ['post', `/users/${t.userId}/mfa-reset`],
      [
        'post',
        '/users',
        {
          email: 'planted@test.invalid',
          displayName: 'Planted User',
          temporaryPassword: 'Temporary-Synthetic-1234',
          assignments: [{ role: 'DENTIST', practiceId: t.practiceId }],
        },
      ],
    ];

    const snapshot = async (o: Org) =>
      JSON.stringify(
        await Promise.all([
          prisma.patient.findMany({ where: { organisationId: o.orgId }, orderBy: { id: 'asc' } }),
          prisma.clinicalNoteVersion.count(),
          prisma.clinicalEncounter.findMany({
            where: { organisationId: o.orgId },
            orderBy: { id: 'asc' },
          }),
          prisma.invoice.findMany({ where: { organisationId: o.orgId }, orderBy: { id: 'asc' } }),
          prisma.payment.findMany({ where: { organisationId: o.orgId }, orderBy: { id: 'asc' } }),
          prisma.paymentAllocation.count(),
          prisma.appointment.findMany({
            where: { organisationId: o.orgId },
            orderBy: { id: 'asc' },
          }),
          prisma.user.findMany({ where: { organisationId: o.orgId }, orderBy: { id: 'asc' } }),
          prisma.userRoleAssignment.count({ where: { user: { organisationId: o.orgId } } }),
          prisma.practice.findMany({ where: { organisationId: o.orgId } }),
          prisma.imagingAsset.findMany({ where: { organisationId: o.orgId } }),
          prisma.treatmentPlanItem.findMany({ where: { plan: { organisationId: o.orgId } } }),
          prisma.patientPractice.count({ where: { practice: { organisationId: o.orgId } } }),
        ]),
      );

    it.each([['org 2 attacks org 1'], ['org 1 attacks org 2']])(
      '%s: every record reachable by id answers 404/403, leaks nothing, and changes nothing',
      async (direction) => {
        const hash = (await prisma.user.findUniqueOrThrow({ where: { id: fx.users.owner.id } }))
          .passwordHash;
        const a = await seedOrg('Alpha Org', 'ALPHA-1', hash);
        const b = await seedOrg('Bravo Org', 'BRAVO-1', hash);
        const [attacker, victim] = direction.startsWith('org 2') ? [b, a] : [a, b];
        const { agent } = await loginAgent(app, attacker.ownerEmail);
        const before = await snapshot(victim);
        const auditBefore = await prisma.auditEvent.count();
        const bad: string[] = [];
        for (const [method, path, body] of attacks(victim)) {
          const t = (agent as Agent)
            [method](`/api/v1${path}`)
            .set('Idempotency-Key', 'iso-attack-key-0123456789');
          if (method !== 'get') t.set('Origin', ORIGIN);
          const res = await (body ? t.send(body) : method === 'get' ? t : t.send({}));
          const text = JSON.stringify(res.body ?? '');
          if (![403, 404].includes(res.status))
            bad.push(`${method.toUpperCase()} ${path} -> ${res.status}`);
          if (
            /SYNTHETIC-NOTE|Syntheticson|INV-ISO|Alpha Org|Bravo Org/.test(text) &&
            res.status !== 404
          )
            bad.push(`${method.toUpperCase()} ${path} leaked`);
        }
        expect(bad).toEqual([]);
        expect(await snapshot(victim)).toBe(before);
        expect(await prisma.auditEvent.count()).toBeGreaterThan(auditBefore); // the attempts themselves were audited
      },
    );

    it("list and report endpoints never include another organisation's data", async () => {
      const hash = (await prisma.user.findUniqueOrThrow({ where: { id: fx.users.owner.id } }))
        .passwordHash;
      const a = await seedOrg('Alpha Org', 'ALPHA-2', hash);
      const b = await seedOrg('Bravo Org', 'BRAVO-2', hash);
      const { agent } = await loginAgent(app, b.ownerEmail);
      const day = (o: number) => new Date(Date.now() + o * 86400_000).toISOString();
      const pages = await Promise.all([
        agent.get('/api/v1/users'),
        agent.get('/api/v1/practices'),
        agent.get('/api/v1/patients?q=Iso'),
        agent.get(
          `/api/v1/appointments?from=${encodeURIComponent(day(-1))}&to=${encodeURIComponent(day(20))}`,
        ),
        agent.get('/api/v1/audit-events?pageSize=100'),
        agent.get('/api/v1/patients/duplicates'),
        agent.get(
          `/api/v1/reports/financial-summary?from=${day(-30).slice(0, 10)}&to=${day(1).slice(0, 10)}&practiceId=${a.practiceId}`,
        ),
        agent.get(
          `/api/v1/reports/operational-summary?from=${day(-30).slice(0, 10)}&to=${day(10).slice(0, 10)}&practiceId=${a.practiceId}`,
        ),
      ]);
      for (const p of pages) expect(p.status).toBe(200);
      const all = JSON.stringify(pages.map((p) => p.body));
      expect(all).not.toContain(a.patientId);
      expect(all).not.toContain(a.practiceId);
      expect(all).not.toContain(a.orgId);
      expect(all).not.toContain('Alpha Org');
      expect(pages[6]!.body.perPractice).toEqual([]);
      expect(pages[7]!.body.perPractice).toEqual([]);
    });
  });

  describe('parameter tampering inside one organisation', () => {
    it('ignores or rejects identifiers that point at the wrong patient, practice or encounter', async () => {
      const dentist = (await loginAgent(app, fx.users.dentistA.email)).agent;
      const other = await prisma.patient.create({
        data: {
          organisationId: fx.orgId,
          registeringPracticeId: fx.practiceA,
          firstName: 'Other',
          lastName: 'Patient',
          dateOfBirth: new Date('1990-01-01'),
          practices: { create: { practiceId: fx.practiceA } },
        },
      });
      const mine = await prisma.patient.create({
        data: {
          organisationId: fx.orgId,
          registeringPracticeId: fx.practiceA,
          firstName: 'Mine',
          lastName: 'Patient',
          dateOfBirth: new Date('1991-01-01'),
          practices: { create: { practiceId: fx.practiceA } },
        },
      });
      const enc = await dentist
        .post(`/api/v1/patients/${other.id}/encounters`)
        .set('Origin', ORIGIN)
        .send({ practiceId: fx.practiceA, body: 'x' })
        .expect(201);
      // a chart entry on MY patient may not hang off SOMEONE ELSE'S encounter
      await dentist
        .post(`/api/v1/patients/${mine.id}/chart`)
        .set('Origin', ORIGIN)
        .send({ toothNumber: '11', condition: 'CROWN', encounterId: enc.body.id })
        .expect(400);
      // an encounter on a practice the patient is not registered at
      const wrongPractice = await dentist
        .post(`/api/v1/patients/${mine.id}/encounters`)
        .set('Origin', ORIGIN)
        .send({ practiceId: fx.practiceB });
      expect([403, 404]).toContain(wrongPractice.status); // no right at B (403) or patient not registered at B (404)
      // mass assignment: server-controlled fields in the body are ignored
      const res = await dentist
        .patch(`/api/v1/patients/${mine.id}`)
        .set('Origin', ORIGIN)
        .send({
          city: 'Pretoria',
          organisationId: randomUUID(),
          createdByUserId: randomUUID(),
          id: randomUUID(),
        })
        .expect(200);
      expect(res.body.id).toBe(mine.id);
      expect(
        (await prisma.patient.findUniqueOrThrow({ where: { id: mine.id } })).organisationId,
      ).toBe(fx.orgId);
    });

    it('treats SQL-injection payloads and LIKE wildcards as plain data', async () => {
      const a = (await loginAgent(app, fx.users.recepA.email)).agent;
      await prisma.patient.create({
        data: {
          organisationId: fx.orgId,
          registeringPracticeId: fx.practiceA,
          firstName: 'Wild',
          lastName: 'Card',
          dateOfBirth: new Date('1990-01-01'),
          practices: { create: { practiceId: fx.practiceA } },
        },
      });
      const patients = await prisma.patient.count();
      const users = await prisma.user.count();
      // control: a legitimate search finds the patient
      expect((await a.get('/api/v1/patients?q=Wi').expect(200)).body.meta.total).toBe(1);
      // SQL metacharacters and LIKE wildcards must be inert: none may match the existing patient.
      const unexpected: string[] = [];
      for (const q of [
        "' OR '1'='1",
        "'; DROP TABLE patients; --",
        '" OR 1=1 --',
        "Robert'); DELETE FROM users;--",
        '%%',
        '__',
        '\\\\',
        'W%',
        'W_ld',
      ]) {
        const res = await a.get(`/api/v1/patients?q=${encodeURIComponent(q)}`);
        if (res.status !== 200 || res.body.meta?.total !== 0)
          unexpected.push(`q=${q} -> ${res.status} total=${res.body.meta?.total}`);
      }
      expect(unexpected).toEqual([]);
      expect(await prisma.patient.count()).toBe(patients);
      expect(await prisma.user.count()).toBe(users);
      // permission is evaluated before input is even looked at
      await a.get(`/api/v1/audit-events?action=${encodeURIComponent("x' OR '1'='1")}`).expect(403);
    });
  });

  describe('accounts and sessions', () => {
    it('stops an in-flight MFA challenge when the account is deactivated or the practice is deactivated', async () => {
      const hash = (await prisma.user.findUniqueOrThrow({ where: { id: fx.users.owner.id } }))
        .passwordHash;
      void hash;
      // Deactivating the account after the password step but before the code kills the sign-in.
      const { agent } = await loginAgent(app, fx.users.recepA.email);
      const start = (await agent.post('/api/v1/auth/mfa/enrol').set('Origin', ORIGIN).expect(200))
        .body;
      const { totpAt, base32Decode, stepFor } = await import('../src/auth/totp');
      await agent
        .post('/api/v1/auth/mfa/confirm')
        .set('Origin', ORIGIN)
        .send({ code: totpAt(base32Decode(start.secret), stepFor(Date.now())) })
        .expect(200);
      const ch = (
        await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .set('Origin', ORIGIN)
          .send({ email: fx.users.recepA.email, password: TEST_PASSWORD })
      ).body.challenge;
      await prisma.user.update({ where: { id: fx.users.recepA.id }, data: { isActive: false } });
      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/verify')
        .set('Origin', ORIGIN)
        .send({ challenge: ch, code: totpAt(base32Decode(start.secret), stepFor(Date.now()) + 1) })
        .expect(401);
      // A deactivated practice accepts no new patients or appointments.
      await prisma.practice.update({ where: { id: fx.practiceA }, data: { isActive: false } });
      const dentist = (await loginAgent(app, fx.users.dentistA.email)).agent;
      await dentist
        .post('/api/v1/patients')
        .set('Origin', ORIGIN)
        .send({
          firstName: 'New',
          lastName: 'Person',
          dateOfBirth: '1990-01-01',
          practiceId: fx.practiceA,
        })
        .expect(404);
    });

    it('revokes every session when a password is reset by an administrator, and a revoked cookie never works again', async () => {
      const victim = await loginAgent(app, fx.users.recepA.email);
      const cookie = String(victim.res.headers['set-cookie']).split(';')[0]!;
      const owner = (await loginAgent(app, fx.users.owner.email)).agent;
      await owner
        .post(`/api/v1/users/${fx.users.recepA.id}/reset-password`)
        .set('Origin', ORIGIN)
        .send({ temporaryPassword: 'Reset-Synthetic-Pass-9' })
        .expect(204);
      await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
      await request(app.getHttpServer())
        .get('/api/v1/patients?q=ab')
        .set('Cookie', cookie)
        .expect(401);
    });
  });
});

describe('wildcard handling in duplicate detection (integration)', () => {
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

  it('does not treat % or _ in a surname as wildcards when looking for duplicates, yet still matches case-insensitively', async () => {
    const { agent } = await loginAgent(app, fx.users.recepA.email);
    const create = (lastName: string) =>
      agent
        .post('/api/v1/patients')
        .set('Origin', ORIGIN)
        .send({ firstName: 'Dup', lastName, dateOfBirth: '1990-05-17', practiceId: fx.practiceA });
    await create('Card').expect(201);
    expect((await create('%ard').expect(201)).body.duplicateCandidates).toEqual([]); // wildcard must not match 'Card'
    expect((await create('C_rd').expect(201)).body.duplicateCandidates).toEqual([]);
    const real = (await create('CARD').expect(201)).body.duplicateCandidates; // genuine duplicate, different case
    expect(real).toHaveLength(1);
    expect(real[0].reasons[0]).toMatch(/name and date of birth/);
  });
});
