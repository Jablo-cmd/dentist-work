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
let keySeq = 0;
const newKey = () => `test-key-${Date.now()}-${++keySeq}-abcdefghij`;

describe('billing (integration)', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  let fx: Fixtures;
  let patient: string;
  let otherPatient: string;
  let billingB: { id: string; email: string };

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    fx = await resetAndSeed(prisma);
    const mk = (firstName: string) =>
      prisma.patient.create({
        data: {
          organisationId: fx.orgId,
          registeringPracticeId: fx.practiceA,
          firstName,
          lastName: 'Syntheticson',
          dateOfBirth: new Date('1975-05-05'),
          practices: { create: { practiceId: fx.practiceA } },
        },
      });
    patient = (await mk('Bill')).id;
    otherPatient = (await mk('Other')).id;
    const hash = (await prisma.user.findUniqueOrThrow({ where: { id: fx.users.billingA.id } }))
      .passwordHash;
    billingB = await prisma.user.create({
      data: {
        organisationId: fx.orgId,
        email: 'billing-b@test.invalid',
        displayName: 'Billing B',
        passwordHash: hash,
        roleAssignments: { create: { role: 'BILLING_ADMINISTRATOR', practiceId: fx.practiceB } },
      },
      select: { id: true, email: true },
    });
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
  const draft = async (
    a: Agent,
    lines: object[] = [{ description: 'Consultation', quantity: '1', unitPrice: '100.00' }],
    pid = patient,
  ) =>
    (
      await post(a, `/api/v1/patients/${pid}/invoices`, { practiceId: fx.practiceA, lines }).expect(
        201,
      )
    ).body;
  const posted = async (a: Agent, lines?: object[], pid = patient) => {
    const d = await draft(a, lines, pid);
    return (await post(a, `/api/v1/invoices/${d.id}/post`).expect(200)).body;
  };
  const pay = (a: Agent, amount: string, extra: object = {}, key = newKey(), pid = patient) =>
    post(
      a,
      `/api/v1/patients/${pid}/payments`,
      { practiceId: fx.practiceA, amount, method: 'CARD', ...extra },
      key,
    );

  describe('invoices', () => {
    it('computes totals with exact decimals and leaves drafts unnumbered', async () => {
      const a = await as(fx.users.billingA.email);
      const inv = await draft(a, [
        { description: 'Item one', unitPrice: '0.10' },
        { description: 'Item two', unitPrice: '0.20' },
        { description: 'Taxed item', quantity: '3', unitPrice: '100.00', taxAmount: '45.00' },
      ]);
      expect(inv).toMatchObject({
        status: 'DRAFT',
        number: null,
        subtotal: '300.30',
        taxTotal: '45.00',
        total: '345.30',
        outstanding: '345.30',
        currency: 'ZAR',
      });
      expect(inv.lines).toHaveLength(3);
    });

    it('rejects float-style, negative and malformed amounts', async () => {
      const a = await as(fx.users.billingA.email);
      for (const unitPrice of ['0.001', '-5', '1e3', 'abc', '1,50', '']) {
        await post(a, `/api/v1/patients/${patient}/invoices`, {
          practiceId: fx.practiceA,
          lines: [{ description: 'x y', unitPrice }],
        }).expect(400);
      }
      await post(a, `/api/v1/patients/${patient}/invoices`, {
        practiceId: fx.practiceA,
        lines: [{ description: 'x y', quantity: '0', unitPrice: '1' }],
      }).expect(400);
      await post(a, `/api/v1/patients/${patient}/invoices`, {
        practiceId: fx.practiceA,
        lines: [],
      }).expect(400);
    });

    it('edits and discards drafts only; posting assigns a sequential number and locks the invoice', async () => {
      const a = await as(fx.users.billingA.email);
      const d = await draft(a);
      const edited = await a
        .put(`/api/v1/invoices/${d.id}/lines`)
        .set('Origin', ORIGIN)
        .send({ lines: [{ description: 'Revised', unitPrice: '250.50' }] })
        .expect(200);
      expect(edited.body.total).toBe('250.50');
      const p1 = (await post(a, `/api/v1/invoices/${d.id}/post`).expect(200)).body;
      expect(p1).toMatchObject({ status: 'POSTED', number: 'INV-000001', outstanding: '250.50' });
      expect(p1.issueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      await a
        .put(`/api/v1/invoices/${d.id}/lines`)
        .set('Origin', ORIGIN)
        .send({ lines: [{ description: 'Sneaky', unitPrice: '1' }] })
        .expect(409);
      await post(a, `/api/v1/invoices/${d.id}/post`).expect(409);
      await post(a, `/api/v1/invoices/${d.id}/discard`).expect(409);
      const second = await posted(a);
      expect(second.number).toBe('INV-000002');
      const gone = await draft(a);
      expect((await post(a, `/api/v1/invoices/${gone.id}/discard`).expect(200)).body.status).toBe(
        'CANCELLED',
      );
      await post(a, `/api/v1/invoices/${gone.id}/post`).expect(409);
    });

    it('assigns unique, gap-free numbers under concurrent posting', async () => {
      const a = await as(fx.users.billingA.email);
      const drafts = await Promise.all([1, 2, 3, 4, 5].map(() => draft(a)));
      const res = await Promise.all(drafts.map((d) => post(a, `/api/v1/invoices/${d.id}/post`)));
      expect(res.every((r) => r.status === 200)).toBe(true);
      const nums = res.map((r) => r.body.number).sort();
      expect(nums).toEqual(['INV-000001', 'INV-000002', 'INV-000003', 'INV-000004', 'INV-000005']);
    });

    it('is enforced by the database too: posted invoices cannot be altered or deleted', async () => {
      const a = await as(fx.users.billingA.email);
      const inv = await posted(a);
      await expect(
        prisma.invoice.update({ where: { id: inv.id }, data: { total: 1, subtotal: 1 } }),
      ).rejects.toThrow(/immutable/);
      await expect(prisma.invoice.delete({ where: { id: inv.id } })).rejects.toThrow(
        /cannot be deleted/,
      );
      await expect(prisma.invoiceLine.deleteMany({ where: { invoiceId: inv.id } })).rejects.toThrow(
        /immutable/,
      );
      await expect(
        prisma.invoiceLine.updateMany({ where: { invoiceId: inv.id }, data: { description: 'x' } }),
      ).rejects.toThrow(/immutable/);
    });

    it('requires billing.manage to create, and keeps reception/dentists out entirely', async () => {
      const admin = await as(fx.users.adminA.email);
      await post(admin, `/api/v1/patients/${patient}/invoices`, {
        practiceId: fx.practiceA,
        lines: [{ description: 'x y', unitPrice: '1' }],
      }).expect(403);
      for (const email of [fx.users.recepA.email, fx.users.dentistA.email]) {
        const x = await as(email);
        await x.get(`/api/v1/patients/${patient}/invoices`).expect(403);
        await x.get(`/api/v1/patients/${patient}/account`).expect(403);
      }
    });
  });

  describe('credit notes', () => {
    it('corrects a posted invoice without altering it, and cannot over-credit', async () => {
      const a = await as(fx.users.billingA.email);
      const inv = await posted(a, [{ description: 'Procedure', unitPrice: '100.00' }]);
      const cn = await post(a, `/api/v1/invoices/${inv.id}/credit-notes`, {
        reason: 'Billed in error',
        lines: [{ description: 'Credit part', unitPrice: '40.00' }],
      }).expect(201);
      expect(cn.body).toMatchObject({
        kind: 'CREDIT_NOTE',
        status: 'POSTED',
        number: 'CN-000001',
        total: '40.00',
        creditsInvoiceId: inv.id,
      });
      const after = (await a.get(`/api/v1/invoices/${inv.id}`).expect(200)).body;
      expect(after).toMatchObject({
        total: '100.00',
        amountCredited: '40.00',
        outstanding: '60.00',
      });
      await post(a, `/api/v1/invoices/${inv.id}/credit-notes`, {
        reason: 'Too much credit',
        lines: [{ description: 'x y', unitPrice: '60.01' }],
      }).expect(409);
      await post(a, `/api/v1/invoices/${inv.id}/credit-notes`, {
        reason: 'Rest of it here',
        lines: [{ description: 'x y', unitPrice: '60.00' }],
      }).expect(201);
      expect((await a.get(`/api/v1/invoices/${inv.id}`)).body.outstanding).toBe('0.00');
      const draftInv = await draft(a);
      await post(a, `/api/v1/invoices/${draftInv.id}/credit-notes`, {
        reason: 'On a draft!',
        lines: [{ description: 'x y', unitPrice: '1' }],
      }).expect(409);
      await post(a, `/api/v1/invoices/${inv.id}/credit-notes`, {
        reason: 'x',
        lines: [{ description: 'x y', unitPrice: '1' }],
      }).expect(400); // reason too short
    });

    it('lets only one of two simultaneous credit notes through when together they exceed the total', async () => {
      const a = await as(fx.users.billingA.email);
      const inv = await posted(a, [{ description: 'Procedure', unitPrice: '100.00' }]);
      const results = await Promise.all(
        [1, 2].map(() =>
          post(a, `/api/v1/invoices/${inv.id}/credit-notes`, {
            reason: 'Concurrent credit',
            lines: [{ description: 'x y', unitPrice: '60.00' }],
          }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    });
  });

  describe('payments', () => {
    it('is idempotent: a retried request never creates a second payment', async () => {
      const a = await as(fx.users.billingA.email);
      const key = newKey();
      const first = await pay(a, '75.00', { reference: 'RCPT-1' }, key).expect(201);
      const retry = await pay(a, '75.00', { reference: 'RCPT-1' }, key).expect(200);
      expect(retry.body.id).toBe(first.body.id);
      expect(retry.headers['idempotent-replay']).toBe('true');
      await pay(a, '76.00', { reference: 'RCPT-1' }, key).expect(409); // same key, different request
      expect(await prisma.payment.count()).toBe(1);
    });

    it('stays idempotent under concurrent duplicate submissions', async () => {
      const a = await as(fx.users.billingA.email);
      const key = newKey();
      const results = await Promise.all([1, 2, 3, 4, 5].map(() => pay(a, '10.00', {}, key)));
      expect(results.every((r) => [200, 201].includes(r.status))).toBe(true);
      expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
      expect(await prisma.payment.count()).toBe(1);
    });

    it('requires a valid idempotency key and sane values', async () => {
      const a = await as(fx.users.billingA.email);
      await post(a, `/api/v1/patients/${patient}/payments`, {
        practiceId: fx.practiceA,
        amount: '10.00',
        method: 'CASH',
      }).expect(400);
      await pay(a, '10.00', {}, 'short').expect(400);
      await pay(a, '0.00').expect(400);
      await pay(a, '-5.00').expect(400);
      await pay(a, '10.005').expect(400);
      await pay(a, '10.00', { receivedOn: '2999-01-01' }).expect(400);
      await pay(a, '10.00', { method: 'BITCOIN' }).expect(400);
      expect(await prisma.payment.count()).toBe(0);
    });

    it('allocates to posted invoices and updates balances; never beyond what is owed', async () => {
      const a = await as(fx.users.billingA.email);
      const inv = await posted(a, [{ description: 'Procedure', unitPrice: '100.00' }]);
      const p1 = await pay(a, '60.00', {
        allocations: [{ invoiceId: inv.id, amount: '60.00' }],
      }).expect(201);
      expect(p1.body).toMatchObject({ allocated: '60.00', unallocated: '0.00' });
      expect((await a.get(`/api/v1/invoices/${inv.id}`)).body).toMatchObject({
        amountPaid: '60.00',
        outstanding: '40.00',
      });
      const p2 = await pay(a, '50.00').expect(201); // on account
      expect(p2.body.unallocated).toBe('50.00');
      await post(a, `/api/v1/payments/${p2.body.id}/allocations`, {
        allocations: [{ invoiceId: inv.id, amount: '40.01' }],
      }).expect(409); // over-allocates invoice
      await post(a, `/api/v1/payments/${p2.body.id}/allocations`, {
        allocations: [{ invoiceId: inv.id, amount: '40.00' }],
      }).expect(200);
      expect((await a.get(`/api/v1/invoices/${inv.id}`)).body.outstanding).toBe('0.00');
      await post(a, `/api/v1/payments/${p2.body.id}/allocations`, {
        allocations: [{ invoiceId: inv.id, amount: '10.01' }],
      }).expect(409); // over-allocates payment (and invoice)
      await pay(a, '10.00', { allocations: [{ invoiceId: inv.id, amount: '20.00' }] }).expect(400); // allocation > payment
    });

    it("rejects allocations to drafts, to other patients' invoices, and to credit notes", async () => {
      const a = await as(fx.users.billingA.email);
      const d = await draft(a);
      const other = await posted(a, undefined, otherPatient);
      const inv = await posted(a, [{ description: 'Procedure', unitPrice: '100.00' }]);
      const cn = (
        await post(a, `/api/v1/invoices/${inv.id}/credit-notes`, {
          reason: 'Partial credit',
          lines: [{ description: 'x y', unitPrice: '10' }],
        }).expect(201)
      ).body;
      const p = (await pay(a, '50.00').expect(201)).body;
      for (const target of [d.id, other.id, cn.id])
        await post(a, `/api/v1/payments/${p.id}/allocations`, {
          allocations: [{ invoiceId: target, amount: '5.00' }],
        }).expect(409);
      expect(await prisma.paymentAllocation.count()).toBe(0);
    });

    it('does not let two simultaneous payments both settle the same invoice', async () => {
      const a = await as(fx.users.billingA.email);
      const inv = await posted(a, [{ description: 'Procedure', unitPrice: '100.00' }]);
      const results = await Promise.all(
        [1, 2].map(() =>
          pay(a, '100.00', { allocations: [{ invoiceId: inv.id, amount: '100.00' }] }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect((await a.get(`/api/v1/invoices/${inv.id}`)).body.outstanding).toBe('0.00');
    });

    it('reverses a payment without erasing it, restoring the balance', async () => {
      const a = await as(fx.users.billingA.email);
      const inv = await posted(a, [{ description: 'Procedure', unitPrice: '100.00' }]);
      const p = (
        await pay(a, '100.00', { allocations: [{ invoiceId: inv.id, amount: '100.00' }] }).expect(
          201,
        )
      ).body;
      await post(a, `/api/v1/payments/${p.id}/reverse`, { reason: 'abc' }).expect(400);
      const rev = await post(a, `/api/v1/payments/${p.id}/reverse`, {
        reason: 'Card chargeback received',
      }).expect(200);
      expect(rev.body).toMatchObject({
        status: 'REVERSED',
        unallocated: '0.00',
        reversalReason: 'Card chargeback received',
      });
      expect((await a.get(`/api/v1/invoices/${inv.id}`)).body).toMatchObject({
        amountPaid: '0.00',
        outstanding: '100.00',
      });
      await post(a, `/api/v1/payments/${p.id}/reverse`, { reason: 'Reverse it again' }).expect(409);
      await post(a, `/api/v1/payments/${p.id}/allocations`, {
        allocations: [{ invoiceId: inv.id, amount: '10.00' }],
      }).expect(409);
      expect(await prisma.payment.count()).toBe(1); // still on record
      await expect(prisma.payment.delete({ where: { id: p.id } })).rejects.toThrow(
        /cannot be deleted/,
      );
      await expect(
        prisma.payment.update({ where: { id: p.id }, data: { reversalReason: 'tamper' } }),
      ).rejects.toThrow(/immutable/);
    });

    it('protects recorded payments and allocations at the database layer', async () => {
      const a = await as(fx.users.billingA.email);
      const inv = await posted(a);
      const p = (
        await pay(a, '100.00', { allocations: [{ invoiceId: inv.id, amount: '100.00' }] }).expect(
          201,
        )
      ).body;
      await expect(
        prisma.payment.update({ where: { id: p.id }, data: { amount: 1 } }),
      ).rejects.toThrow(/immutable/);
      await expect(prisma.paymentAllocation.deleteMany({})).rejects.toThrow(/append-only/);
      await expect(prisma.paymentAllocation.updateMany({ data: { amount: 1 } })).rejects.toThrow(
        /append-only/,
      );
    });

    it('computes the patient account (negative balance = patient in credit)', async () => {
      const a = await as(fx.users.billingA.email);
      await posted(a, [{ description: 'Procedure', unitPrice: '100.00' }]);
      await draft(a, [{ description: 'Not yet billed', unitPrice: '999.00' }]); // drafts are not owed
      expect((await a.get(`/api/v1/patients/${patient}/account`).expect(200)).body).toMatchObject({
        balance: '100.00',
        outstandingInvoices: '100.00',
        unallocatedPayments: '0.00',
      });
      await pay(a, '130.00').expect(201);
      expect((await a.get(`/api/v1/patients/${patient}/account`)).body).toMatchObject({
        balance: '-30.00',
        unallocatedPayments: '130.00',
      });
    });
  });

  describe('practice isolation and roles', () => {
    it('keeps other practices out of invoices, payments and accounts', async () => {
      const a = await as(fx.users.billingA.email);
      const inv = await posted(a);
      const p = (await pay(a, '10.00').expect(201)).body;
      const b = await as(billingB.email);
      await b.get(`/api/v1/invoices/${inv.id}`).expect(404);
      await b.get(`/api/v1/patients/${patient}/invoices`).expect(404);
      await b.get(`/api/v1/patients/${patient}/account`).expect(404);
      await post(b, `/api/v1/invoices/${inv.id}/post`).expect(404);
      await post(b, `/api/v1/invoices/${inv.id}/credit-notes`, {
        reason: 'Not mine at all',
        lines: [{ description: 'x y', unitPrice: '1' }],
      }).expect(404);
      await post(b, `/api/v1/payments/${p.id}/reverse`, { reason: 'Not my payment' }).expect(404);
      await pay(b, '5.00').expect(404);
      expect(
        await prisma.auditEvent.count({ where: { action: 'access.denied', targetId: inv.id } }),
      ).toBeGreaterThanOrEqual(1);
    });

    it('lets the owner see everything', async () => {
      const a = await as(fx.users.billingA.email);
      const inv = await posted(a);
      const owner = await as(fx.users.owner.email);
      await owner.get(`/api/v1/invoices/${inv.id}`).expect(200);
    });

    it('audits financial actions without amounts or patient details beyond identifiers', async () => {
      const a = await as(fx.users.billingA.email);
      const inv = await posted(a);
      await pay(a, '12.34').expect(201);
      const actions = (await prisma.auditEvent.findMany()).map((e) => e.action);
      for (const x of ['invoice.create_draft', 'invoice.post', 'payment.record'])
        expect(actions).toContain(x);
      expect(JSON.stringify(await prisma.auditEvent.findMany())).not.toMatch(
        /12\.34|Syntheticson|Consultation/,
      );
      expect(inv.number).toBe('INV-000001');
    });
  });

  describe('reports', () => {
    const day = (offset: number) =>
      new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    const range = () => `from=${day(-30)}&to=${day(1)}`;

    it('summarises invoicing, credits, payments by method and outstanding per practice', async () => {
      const a = await as(fx.users.billingA.email);
      const inv = await posted(a, [{ description: 'Procedure', unitPrice: '200.00' }]);
      await post(a, `/api/v1/invoices/${inv.id}/credit-notes`, {
        reason: 'Small credit note',
        lines: [{ description: 'x y', unitPrice: '20.00' }],
      }).expect(201);
      await pay(a, '80.00', {
        method: 'CARD',
        allocations: [{ invoiceId: inv.id, amount: '80.00' }],
      }).expect(201);
      await pay(a, '20.00', { method: 'CASH' }).expect(201);
      const r = (await a.get(`/api/v1/reports/financial-summary?${range()}`).expect(200)).body;
      expect(r.perPractice).toHaveLength(1); // billing A sees only practice A
      expect(r.perPractice[0]).toMatchObject({
        practiceId: fx.practiceA,
        invoiced: '200.00',
        credited: '20.00',
        netInvoiced: '180.00',
        paymentsReceived: '100.00',
        paymentsByMethod: { CARD: '80.00', CASH: '20.00' },
        outstandingInvoices: '100.00',
      });
      expect(r.totals).toMatchObject({
        invoiced: '200.00',
        paymentsReceived: '100.00',
        outstandingInvoices: '100.00',
      });
    });

    it('excludes reversed payments and respects practice filters and roles', async () => {
      const a = await as(fx.users.billingA.email);
      const p = (await pay(a, '50.00').expect(201)).body;
      await post(a, `/api/v1/payments/${p.id}/reverse`, { reason: 'Reversed for the test' }).expect(
        200,
      );
      expect(
        (await a.get(`/api/v1/reports/financial-summary?${range()}`)).body.totals.paymentsReceived,
      ).toBe('0.00');
      const owner = await as(fx.users.owner.email);
      expect(
        (await owner.get(`/api/v1/reports/financial-summary?${range()}`)).body.perPractice,
      ).toHaveLength(2);
      expect(
        (
          await owner.get(`/api/v1/reports/financial-summary?${range()}&practiceId=${fx.practiceB}`)
        ).body.perPractice.map((x: { practiceId: string }) => x.practiceId),
      ).toEqual([fx.practiceB]);
      const recep = await as(fx.users.recepA.email);
      await recep.get(`/api/v1/reports/financial-summary?${range()}`).expect(403);
      const b = await as(billingB.email);
      expect(
        (await b.get(`/api/v1/reports/financial-summary?${range()}&practiceId=${fx.practiceA}`))
          .body.perPractice,
      ).toEqual([]);
    });

    it('validates report ranges', async () => {
      const owner = await as(fx.users.owner.email);
      await owner
        .get('/api/v1/reports/financial-summary?from=2026-01-02&to=2026-01-01')
        .expect(400);
      await owner
        .get('/api/v1/reports/financial-summary?from=2020-01-01&to=2026-01-01')
        .expect(400);
      await owner.get('/api/v1/reports/financial-summary').expect(400);
    });

    it('reports operational counts per practice, hiding patient counts from those who cannot read patients', async () => {
      const dentist = fx.users.dentistA.id;
      const start = new Date(Date.now() + 3600_000);
      await prisma.appointment.create({
        data: {
          organisationId: fx.orgId,
          practiceId: fx.practiceA,
          patientId: patient,
          practitionerUserId: dentist,
          startsAt: start,
          endsAt: new Date(start.getTime() + 1800_000),
          status: 'SCHEDULED',
        },
      });
      const to = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
      const recep = await as(fx.users.recepA.email);
      const r = (
        await recep.get(`/api/v1/reports/operational-summary?from=${day(-30)}&to=${to}`).expect(200)
      ).body;
      expect(r.perPractice).toHaveLength(1);
      expect(r.perPractice[0].appointments).toEqual({ SCHEDULED: 1 });
      expect(r.perPractice[0].newPatients).toBe(2);
      const bill = await as(fx.users.billingA.email);
      await bill.get(`/api/v1/reports/operational-summary?from=${day(-30)}&to=${to}`).expect(403);
    });
  });
});
