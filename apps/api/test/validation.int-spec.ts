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

/**
 * Cross-cutting clinical / financial / appointment validation edge cases that the per-module
 * suites do not cover. Synthetic data only. See docs/19-CLINICAL-AND-FINANCIAL-VALIDATION.md.
 */
describe('validation edge cases (integration)', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  let fx: Fixtures;
  let p1: string;
  let p2: string;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    fx = await resetAndSeed(prisma);
    const mk = async (firstName: string) =>
      (
        await prisma.patient.create({
          data: {
            organisationId: fx.orgId,
            registeringPracticeId: fx.practiceA,
            firstName,
            lastName: 'Syntheticson',
            dateOfBirth: new Date('1980-02-02'),
            practices: { create: { practiceId: fx.practiceA } },
          },
        })
      ).id;
    p1 = await mk('One');
    p2 = await mk('Two');
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const as = async (email: string) => (await loginAgent(app, email)).agent;
  const post = (a: Agent, url: string, body?: object, key?: string) => {
    const r = a.post(url).set('Origin', ORIGIN);
    if (key) r.set('Idempotency-Key', key);
    return r.send(body);
  };

  describe('invoice lines linked to treatment items', () => {
    const planItem = async (patientId: string) =>
      (
        await prisma.treatmentPlan.create({
          data: {
            organisationId: fx.orgId,
            practiceId: fx.practiceA,
            patientId,
            title: 'Synthetic plan',
            createdByUserId: fx.users.dentistA.id,
            items: { create: { description: 'Synthetic item' } },
          },
          include: { items: true },
        })
      ).items[0]!.id;

    const invoiceWith = (a: Agent, patientId: string, treatmentItemId: string) =>
      post(a, `/api/v1/patients/${patientId}/invoices`, {
        practiceId: fx.practiceA,
        lines: [{ description: 'Linked', quantity: '1', unitPrice: '10.00', treatmentItemId }],
      });

    it("rejects a line linked to another patient's treatment item", async () => {
      const a = await as(fx.users.billingA.email);
      const foreign = await planItem(p2);
      const r = await invoiceWith(a, p1, foreign);
      expect(r.status).toBe(400);
      expect(await prisma.invoice.count()).toBe(0);
    });

    it("accepts the patient's own item and rejects a nonexistent one", async () => {
      const a = await as(fx.users.billingA.email);
      await invoiceWith(a, p1, await planItem(p1)).expect(201);
      const r = await invoiceWith(a, p1, '00000000-0000-4000-8000-000000000000');
      expect(r.status).toBe(400);
    });
  });

  describe('money', () => {
    const draft = (a: Agent, line: object) =>
      post(a, `/api/v1/patients/${p1}/invoices`, { practiceId: fx.practiceA, lines: [line] });

    it('records tax exactly as entered and never calculates it', async () => {
      const a = await as(fx.users.billingA.email);
      const r = await draft(a, {
        description: 'No tax entered',
        quantity: '2',
        unitPrice: '100.00',
      }).expect(201);
      expect(r.body.taxTotal).toBe('0.00');
      expect(r.body.total).toBe('200.00');
      // an arbitrary tax figure is stored as given: there is no rate or VAT logic in the system
      const t = await draft(a, {
        description: 'Tax as entered',
        quantity: '1',
        unitPrice: '100.00',
        taxAmount: '7.77',
      }).expect(201);
      expect(t.body.taxTotal).toBe('7.77');
    });

    it.each([
      ['zero quantity', { quantity: '0', unitPrice: '10.00' }],
      ['negative price', { quantity: '1', unitPrice: '-1.00' }],
      ['three decimal places', { quantity: '1', unitPrice: '10.001' }],
      ['exponent notation', { quantity: '1', unitPrice: '1e2' }],
      ['numeric (non-string) amount', { quantity: 1, unitPrice: 10 }],
      ['negative tax', { quantity: '1', unitPrice: '10.00', taxAmount: '-1.00' }],
    ])('rejects %s', async (_n, bad) => {
      const a = await as(fx.users.billingA.email);
      await draft(a, { description: 'x', ...bad }).expect(400);
      expect(await prisma.invoice.count()).toBe(0);
    });

    it('rejects a zero or negative payment amount', async () => {
      const a = await as(fx.users.billingA.email);
      for (const amount of ['0.00', '-5.00']) {
        await post(
          a,
          `/api/v1/patients/${p1}/payments`,
          { practiceId: fx.practiceA, amount, method: 'CARD' },
          'key-for-validation-0001',
        ).expect(400);
      }
      expect(await prisma.payment.count()).toBe(0);
    });
  });

  describe('appointment time handling', () => {
    const book = (a: Agent, over: Record<string, unknown>) =>
      post(a, '/api/v1/appointments', {
        practiceId: fx.practiceA,
        patientId: p1,
        practitionerUserId: fx.users.dentistA.id,
        durationMinutes: 30,
        ...over,
      });
    const start = () => new Date(Date.now() + 48 * HOUR);
    const withOffset = (d: Date, hours: number) => {
      // same instant, written in a +hh:00 offset
      const shifted = new Date(d.getTime() + hours * HOUR).toISOString().replace('Z', '');
      return `${shifted.slice(0, 19)}+${String(hours).padStart(2, '0')}:00`;
    };

    it('enforces duration bounds (5–480 minutes, integers only)', async () => {
      const a = await as(fx.users.recepA.email);
      const s = start().toISOString();
      for (const d of [0, 4, 481, 30.5, '30'])
        await book(a, { startsAt: s, durationMinutes: d }).expect(400);
      await book(a, { startsAt: s, durationMinutes: 5 }).expect(201);
      await book(a, {
        startsAt: new Date(start().getTime() + 24 * HOUR).toISOString(),
        durationMinutes: 480,
      }).expect(201);
    });

    it('rejects timestamps without an explicit offset, and non-dates', async () => {
      const a = await as(fx.users.recepA.email);
      for (const startsAt of ['2030-01-01T10:00:00', '2030-01-01', 'tomorrow', '', null])
        await book(a, { startsAt }).expect(400);
    });

    it('treats the same instant in different offsets as the same slot', async () => {
      const a = await as(fx.users.recepA.email);
      const s = start();
      await book(a, { startsAt: s.toISOString() }).expect(201);
      const clash = await book(a, { startsAt: withOffset(s, 2), patientId: p2 });
      expect(clash.status).toBe(409);
      expect(await prisma.appointment.count()).toBe(1);
    });

    it('stores instants in UTC regardless of the offset sent', async () => {
      const a = await as(fx.users.recepA.email);
      const s = start();
      s.setMilliseconds(0);
      const r = await book(a, { startsAt: withOffset(s, 2) }).expect(201);
      expect(new Date(r.body.startsAt).getTime()).toBe(s.getTime());
      expect(new Date(r.body.endsAt).getTime()).toBe(s.getTime() + 30 * 60_000);
    });
  });
});
