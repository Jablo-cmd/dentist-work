import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AllocatePaymentRequest,
  CreateCreditNoteRequest,
  CreateInvoiceRequest,
  Invoice,
  InvoiceLineInput,
  PatientAccount,
  Payment,
  RecordPaymentRequest,
  ReversePaymentRequest,
} from '@dpms/contracts';
import { hasPermission, practiceScope } from '../access/permissions';
import type { Principal } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import type { Ctx } from '../common/request-context';
import { PatientAccessService } from '../patients/patient-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { computeLines, dec, fmt, ZERO, type Dec } from './money';

type InvRow = Prisma.InvoiceGetPayload<{ include: { lines: true } }>;
type PayRow = Prisma.PaymentGetPayload<{ include: { allocations: true } }>;

/** Authored messages for the database-level financial guards (they backstop the service checks). */
const DB_GUARDS: [string, string][] = [
  ['credit notes cannot exceed', 'Credit notes cannot exceed the invoice total.'],
  ['allocations exceed the payment', 'Allocations exceed the payment amount.'],
  ['allocation exceeds the outstanding', "Allocation exceeds the invoice's outstanding balance."],
  ['cannot allocate a reversed payment', 'A reversed payment cannot be allocated.'],
  [
    'only be allocated to posted invoices',
    'Payments can only be allocated to posted invoices of the same patient and practice.',
  ],
  [
    'must reference a posted invoice',
    'A credit note must reference a posted invoice of the same patient and practice.',
  ],
  [
    'immutable',
    'Posted financial records cannot be changed; issue a credit note or reverse the payment.',
  ],
];
function guardConflict(e: unknown): ConflictException | null {
  const msg = e instanceof Error ? e.message : '';
  const hit = DB_GUARDS.find(([needle]) => msg.includes(needle));
  return hit ? new ConflictException(hit[1]) : null;
}

const sastToday = (): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PatientAccessService,
    private readonly audit: AuditService,
  ) {}

  private ev(
    p: Principal,
    ctx: Ctx,
    action: string,
    targetType: string,
    targetId: string,
    practiceId: string,
  ) {
    return {
      action,
      outcome: 'SUCCESS' as const,
      actorUserId: p.id,
      organisationId: p.organisationId,
      practiceId,
      targetType,
      targetId,
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    };
  }

  private readWhere(p: Principal): { organisationId: string; practiceId?: { in: string[] } } {
    const s = practiceScope(p.assignments, 'billing.read');
    return s.orgWide
      ? { organisationId: p.organisationId }
      : { organisationId: p.organisationId, practiceId: { in: s.practiceIds } };
  }

  // ---- DTO mapping -------------------------------------------------------------------------------
  private async invoiceDtos(rows: InvRow[]): Promise<Invoice[]> {
    const ids = rows.filter((r) => r.kind === 'INVOICE' && r.status === 'POSTED').map((r) => r.id);
    const paid = new Map<string, Dec>();
    const credited = new Map<string, Dec>();
    if (ids.length) {
      const a = await this.prisma.paymentAllocation.groupBy({
        by: ['invoiceId'],
        where: { invoiceId: { in: ids }, payment: { status: 'RECORDED' } },
        _sum: { amount: true },
      });
      for (const x of a) paid.set(x.invoiceId, x._sum.amount ?? ZERO);
      const c = await this.prisma.invoice.groupBy({
        by: ['creditsInvoiceId'],
        where: { creditsInvoiceId: { in: ids }, kind: 'CREDIT_NOTE', status: 'POSTED' },
        _sum: { total: true },
      });
      for (const x of c)
        if (x.creditsInvoiceId) credited.set(x.creditsInvoiceId, x._sum.total ?? ZERO);
    }
    return rows.map((r) => {
      const isLiveInvoice = r.kind === 'INVOICE' && r.status === 'POSTED';
      const amountPaid = isLiveInvoice ? (paid.get(r.id) ?? ZERO) : ZERO;
      const amountCredited = isLiveInvoice ? (credited.get(r.id) ?? ZERO) : ZERO;
      const outstanding = isLiveInvoice
        ? r.total.sub(amountPaid).sub(amountCredited)
        : r.kind === 'INVOICE' && r.status === 'DRAFT'
          ? r.total
          : ZERO;
      return {
        id: r.id,
        kind: r.kind,
        status: r.status,
        number: r.number,
        patientId: r.patientId,
        practiceId: r.practiceId,
        issueDate: r.issueDate ? r.issueDate.toISOString().slice(0, 10) : null,
        currency: 'ZAR' as const,
        lines: [...r.lines]
          .sort((x, y) => x.lineNo - y.lineNo)
          .map((l) => ({
            id: l.id,
            lineNo: l.lineNo,
            description: l.description,
            quantity: fmt(l.quantity),
            unitPrice: fmt(l.unitPrice),
            taxAmount: fmt(l.taxAmount),
            lineTotal: fmt(l.lineTotal),
            treatmentItemId: l.treatmentItemId,
          })),
        subtotal: fmt(r.subtotal),
        taxTotal: fmt(r.taxTotal),
        total: fmt(r.total),
        amountPaid: fmt(amountPaid),
        amountCredited: fmt(amountCredited),
        outstanding: fmt(outstanding),
        creditsInvoiceId: r.creditsInvoiceId,
        reason: r.reason,
        createdAt: r.createdAt.toISOString(),
        postedAt: r.postedAt?.toISOString() ?? null,
      };
    });
  }

  private paymentDto(r: PayRow): Payment {
    const allocated = r.allocations.reduce((s, a) => s.add(a.amount), ZERO);
    return {
      id: r.id,
      patientId: r.patientId,
      practiceId: r.practiceId,
      amount: fmt(r.amount),
      method: r.method,
      reference: r.reference,
      receivedOn: r.receivedOn.toISOString().slice(0, 10),
      status: r.status,
      allocated: fmt(allocated),
      unallocated: fmt(r.status === 'RECORDED' ? r.amount.sub(allocated) : ZERO),
      allocations: r.allocations.map((a) => ({ invoiceId: a.invoiceId, amount: fmt(a.amount) })),
      reversalReason: r.reversalReason,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private async loadInvoice(p: Principal, id: string, ctx: Ctx): Promise<InvRow> {
    const row = await this.prisma.invoice.findFirst({
      where: { AND: [{ id }, this.readWhere(p)] },
      include: { lines: true },
    });
    if (!row) {
      await this.audit.recordBestEffort({
        action: 'access.denied',
        outcome: 'DENIED',
        actorUserId: p.id,
        organisationId: p.organisationId,
        targetType: 'invoice',
        targetId: id,
        requestId: ctx.requestId,
        ipAddress: ctx.ip,
      });
      throw new NotFoundException();
    }
    return row;
  }
  private async loadManageable(p: Principal, id: string, ctx: Ctx): Promise<InvRow> {
    const row = await this.loadInvoice(p, id, ctx);
    if (!hasPermission(p.assignments, 'billing.manage', { practiceId: row.practiceId }))
      throw new ForbiddenException();
    return row;
  }
  private async validateTreatmentLinks(
    patientId: string,
    lines: readonly InvoiceLineInput[],
  ): Promise<void> {
    const ids = [...new Set(lines.map((l) => l.treatmentItemId).filter((x): x is string => !!x))];
    if (!ids.length) return;
    const n = await this.prisma.treatmentPlanItem.count({
      where: { id: { in: ids }, plan: { patientId } },
    });
    if (n !== ids.length)
      throw new BadRequestException('A treatment item does not belong to this patient.');
  }

  // ---- invoices ----------------------------------------------------------------------------------
  async createDraft(
    p: Principal,
    patientId: string,
    input: CreateInvoiceRequest,
    ctx: Ctx,
  ): Promise<Invoice> {
    const patient = await this.access.require(p, patientId, 'billing.manage', ctx);
    if (!hasPermission(p.assignments, 'billing.manage', { practiceId: input.practiceId }))
      throw new ForbiddenException();
    if (!patient.practices.some((x) => x.practiceId === input.practiceId))
      throw new NotFoundException();
    await this.validateTreatmentLinks(patientId, input.lines);
    const c = computeLines(input.lines);
    const id = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          organisationId: p.organisationId,
          practiceId: input.practiceId,
          patientId,
          subtotal: c.subtotal,
          taxTotal: c.taxTotal,
          total: c.total,
          createdByUserId: p.id,
          lines: { create: c.lines },
        },
      });
      await this.audit.record(
        this.ev(p, ctx, 'invoice.create_draft', 'invoice', inv.id, input.practiceId),
        tx,
      );
      return inv.id;
    });
    return (
      await this.invoiceDtos([
        await this.prisma.invoice.findUniqueOrThrow({ where: { id }, include: { lines: true } }),
      ])
    )[0]!;
  }

  async listForPatient(p: Principal, patientId: string, ctx: Ctx): Promise<Invoice[]> {
    await this.access.require(p, patientId, 'billing.read', ctx);
    const rows = await this.prisma.invoice.findMany({
      where: { AND: [{ patientId }, this.readWhere(p)] },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    await this.audit.record({
      action: 'billing.list',
      outcome: 'SUCCESS',
      actorUserId: p.id,
      organisationId: p.organisationId,
      targetType: 'patient',
      targetId: patientId,
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
    return this.invoiceDtos(rows);
  }

  async get(p: Principal, id: string, ctx: Ctx): Promise<Invoice> {
    const row = await this.loadInvoice(p, id, ctx);
    await this.audit.record(this.ev(p, ctx, 'invoice.view', 'invoice', id, row.practiceId));
    return (await this.invoiceDtos([row]))[0]!;
  }

  async replaceLines(
    p: Principal,
    id: string,
    lines: readonly InvoiceLineInput[],
    ctx: Ctx,
  ): Promise<Invoice> {
    const inv = await this.loadManageable(p, id, ctx);
    if (inv.status !== 'DRAFT' || inv.kind !== 'INVOICE')
      throw new ConflictException(
        'Only draft invoices can be edited. Issue a credit note to correct a posted invoice.',
      );
    await this.validateTreatmentLinks(inv.patientId, lines);
    const c = computeLines(lines);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
        await tx.invoiceLine.createMany({ data: c.lines.map((l) => ({ ...l, invoiceId: id })) });
        await tx.invoice.update({
          where: { id },
          data: { subtotal: c.subtotal, taxTotal: c.taxTotal, total: c.total },
        });
        await this.audit.record(
          this.ev(p, ctx, 'invoice.update_lines', 'invoice', id, inv.practiceId),
          tx,
        );
      });
    } catch (e) {
      throw guardConflict(e) ?? e;
    }
    return (
      await this.invoiceDtos([
        await this.prisma.invoice.findUniqueOrThrow({ where: { id }, include: { lines: true } }),
      ])
    )[0]!;
  }

  async discard(p: Principal, id: string, ctx: Ctx): Promise<Invoice> {
    const inv = await this.loadManageable(p, id, ctx);
    if (inv.status !== 'DRAFT') throw new ConflictException('Only drafts can be discarded.');
    try {
      await this.prisma.$transaction(async (tx) => {
        const r = await tx.invoice.updateMany({
          where: { id, status: 'DRAFT' },
          data: { status: 'CANCELLED' },
        });
        if (r.count === 0)
          throw new ConflictException('The invoice changed; reload and try again.');
        await this.audit.record(
          this.ev(p, ctx, 'invoice.discard', 'invoice', id, inv.practiceId),
          tx,
        );
      });
    } catch (e) {
      throw guardConflict(e) ?? e;
    }
    return (
      await this.invoiceDtos([
        await this.prisma.invoice.findUniqueOrThrow({ where: { id }, include: { lines: true } }),
      ])
    )[0]!;
  }

  /** Gap-free number: taken inside the posting transaction, so a rollback releases it. */
  private async nextNumber(
    tx: Prisma.TransactionClient,
    orgId: string,
    kind: 'INVOICE' | 'CREDIT_NOTE',
  ): Promise<string> {
    const rows = await tx.$queryRaw<{ value: number }[]>`
      INSERT INTO invoice_sequences ("organisationId", "kind", "nextValue")
      VALUES (${orgId}::uuid, ${kind}::"InvoiceKind", 2)
      ON CONFLICT ("organisationId", "kind") DO UPDATE SET "nextValue" = invoice_sequences."nextValue" + 1
      RETURNING "nextValue" - 1 AS value`;
    return `${kind === 'INVOICE' ? 'INV' : 'CN'}-${String(rows[0]!.value).padStart(6, '0')}`;
  }

  async post(p: Principal, id: string, ctx: Ctx): Promise<Invoice> {
    const inv = await this.loadManageable(p, id, ctx);
    if (inv.status !== 'DRAFT' || inv.kind !== 'INVOICE')
      throw new ConflictException('Only draft invoices can be posted.');
    if (inv.total.lte(0))
      throw new BadRequestException('An invoice must have a total greater than zero.');
    try {
      await this.prisma.$transaction(async (tx) => {
        const number = await this.nextNumber(tx, p.organisationId, 'INVOICE');
        const r = await tx.invoice.updateMany({
          where: { id, status: 'DRAFT' },
          data: {
            status: 'POSTED',
            number,
            issueDate: new Date(`${sastToday()}T00:00:00Z`),
            postedAt: new Date(),
            postedByUserId: p.id,
          },
        });
        if (r.count === 0)
          throw new ConflictException('The invoice changed; reload and try again.');
        await this.audit.record(
          {
            ...this.ev(p, ctx, 'invoice.post', 'invoice', id, inv.practiceId),
            metadata: { number },
          },
          tx,
        );
      });
    } catch (e) {
      throw guardConflict(e) ?? e;
    }
    return (
      await this.invoiceDtos([
        await this.prisma.invoice.findUniqueOrThrow({ where: { id }, include: { lines: true } }),
      ])
    )[0]!;
  }

  async createCreditNote(
    p: Principal,
    invoiceId: string,
    input: CreateCreditNoteRequest,
    ctx: Ctx,
  ): Promise<Invoice> {
    const orig = await this.loadManageable(p, invoiceId, ctx);
    if (orig.kind !== 'INVOICE' || orig.status !== 'POSTED')
      throw new ConflictException('Credit notes can only be issued against posted invoices.');
    await this.validateTreatmentLinks(orig.patientId, input.lines);
    const c = computeLines(input.lines);
    if (c.total.lte(0))
      throw new BadRequestException('A credit note must have a total greater than zero.');
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const number = await this.nextNumber(tx, p.organisationId, 'CREDIT_NOTE');
        const cn = await tx.invoice.create({
          data: {
            organisationId: p.organisationId,
            practiceId: orig.practiceId,
            patientId: orig.patientId,
            kind: 'CREDIT_NOTE',
            creditsInvoiceId: orig.id,
            reason: input.reason,
            subtotal: c.subtotal,
            taxTotal: c.taxTotal,
            total: c.total,
            createdByUserId: p.id,
            lines: { create: c.lines },
          },
        });
        // The database guard validates the credit limit (race-safe) when the draft becomes posted.
        await tx.invoice.update({
          where: { id: cn.id },
          data: {
            status: 'POSTED',
            number,
            issueDate: new Date(`${sastToday()}T00:00:00Z`),
            postedAt: new Date(),
            postedByUserId: p.id,
          },
        });
        await this.audit.record(
          {
            ...this.ev(p, ctx, 'invoice.credit_note', 'invoice', cn.id, orig.practiceId),
            metadata: { number, credits: orig.number ?? '' },
          },
          tx,
        );
        return cn.id;
      });
      return (
        await this.invoiceDtos([
          await this.prisma.invoice.findUniqueOrThrow({ where: { id }, include: { lines: true } }),
        ])
      )[0]!;
    } catch (e) {
      throw guardConflict(e) ?? e;
    }
  }

  // ---- payments ----------------------------------------------------------------------------------
  private requestHash(patientId: string, i: RecordPaymentRequest): string {
    const canonical = JSON.stringify({
      patientId,
      practiceId: i.practiceId,
      amount: dec(i.amount).toFixed(2),
      method: i.method,
      reference: i.reference ?? null,
      receivedOn: i.receivedOn ?? null,
      allocations: [...i.allocations].map((a) => [a.invoiceId, dec(a.amount).toFixed(2)]).sort(),
    });
    return createHash('sha256').update(canonical).digest('hex');
  }

  private async loadPayment(p: Principal, id: string, ctx: Ctx): Promise<PayRow> {
    const row = await this.prisma.payment.findFirst({
      where: { AND: [{ id }, this.readWhere(p)] },
      include: { allocations: true },
    });
    if (!row) {
      await this.audit.recordBestEffort({
        action: 'access.denied',
        outcome: 'DENIED',
        actorUserId: p.id,
        organisationId: p.organisationId,
        targetType: 'payment',
        targetId: id,
        requestId: ctx.requestId,
        ipAddress: ctx.ip,
      });
      throw new NotFoundException();
    }
    return row;
  }

  /** Returns the payment and whether it was a replay of an earlier identical request. */
  async recordPayment(
    p: Principal,
    patientId: string,
    key: string,
    input: RecordPaymentRequest,
    ctx: Ctx,
  ): Promise<{ payment: Payment; replayed: boolean }> {
    const patient = await this.access.require(p, patientId, 'payment.record', ctx);
    if (!hasPermission(p.assignments, 'payment.record', { practiceId: input.practiceId }))
      throw new ForbiddenException();
    if (!patient.practices.some((x) => x.practiceId === input.practiceId))
      throw new NotFoundException();
    const receivedOn = input.receivedOn ?? sastToday();
    if (receivedOn > sastToday())
      throw new BadRequestException('A payment cannot be dated in the future.');
    const total = dec(input.amount);
    if (input.allocations.reduce((s, a) => s.add(dec(a.amount)), ZERO).gt(total))
      throw new BadRequestException('Allocations exceed the payment amount.');
    const hash = this.requestHash(patientId, input);

    const replay = async (): Promise<{ payment: Payment; replayed: boolean } | null> => {
      const existing = await this.prisma.payment.findUnique({
        where: {
          organisationId_idempotencyKey: { organisationId: p.organisationId, idempotencyKey: key },
        },
        include: { allocations: true },
      });
      if (!existing) return null;
      if (existing.requestHash !== hash)
        throw new ConflictException(
          'This Idempotency-Key was already used for a different request.',
        );
      return { payment: this.paymentDto(existing), replayed: true };
    };
    const prior = await replay();
    if (prior) return prior;

    try {
      const id = randomUUID();
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.create({
          data: {
            id,
            organisationId: p.organisationId,
            practiceId: input.practiceId,
            patientId,
            amount: total,
            method: input.method,
            reference: input.reference ?? null,
            receivedOn: new Date(`${receivedOn}T00:00:00Z`),
            idempotencyKey: key,
            requestHash: hash,
            createdByUserId: p.id,
          },
        });
        for (const a of input.allocations)
          await tx.paymentAllocation.create({
            data: { paymentId: id, invoiceId: a.invoiceId, amount: dec(a.amount) },
          });
        await this.audit.record(
          this.ev(p, ctx, 'payment.record', 'payment', id, input.practiceId),
          tx,
        );
      });
      return {
        payment: this.paymentDto(
          await this.prisma.payment.findUniqueOrThrow({
            where: { id },
            include: { allocations: true },
          }),
        ),
        replayed: false,
      };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // A concurrent request with the same key won the race: return its result (idempotent).
        const raced = await replay();
        if (raced) return raced;
      }
      throw guardConflict(e) ?? e;
    }
  }

  async allocate(
    p: Principal,
    paymentId: string,
    input: AllocatePaymentRequest,
    ctx: Ctx,
  ): Promise<Payment> {
    const pay = await this.loadPayment(p, paymentId, ctx);
    if (!hasPermission(p.assignments, 'payment.record', { practiceId: pay.practiceId }))
      throw new ForbiddenException();
    if (pay.status !== 'RECORDED')
      throw new ConflictException('A reversed payment cannot be allocated.');
    try {
      await this.prisma.$transaction(async (tx) => {
        for (const a of input.allocations)
          await tx.paymentAllocation.create({
            data: { paymentId, invoiceId: a.invoiceId, amount: dec(a.amount) },
          });
        await this.audit.record(
          this.ev(p, ctx, 'payment.allocate', 'payment', paymentId, pay.practiceId),
          tx,
        );
      });
    } catch (e) {
      throw guardConflict(e) ?? e;
    }
    return this.paymentDto(
      await this.prisma.payment.findUniqueOrThrow({
        where: { id: paymentId },
        include: { allocations: true },
      }),
    );
  }

  async reverse(
    p: Principal,
    paymentId: string,
    input: ReversePaymentRequest,
    ctx: Ctx,
  ): Promise<Payment> {
    const pay = await this.loadPayment(p, paymentId, ctx);
    if (
      !hasPermission(p.assignments, 'billing.manage', { practiceId: pay.practiceId }) ||
      !hasPermission(p.assignments, 'payment.record', { practiceId: pay.practiceId })
    )
      throw new ForbiddenException();
    try {
      await this.prisma.$transaction(async (tx) => {
        const r = await tx.payment.updateMany({
          where: { id: paymentId, status: 'RECORDED' },
          data: {
            status: 'REVERSED',
            reversedAt: new Date(),
            reversedByUserId: p.id,
            reversalReason: input.reason,
          },
        });
        if (r.count === 0) throw new ConflictException('This payment has already been reversed.');
        await this.audit.record(
          this.ev(p, ctx, 'payment.reverse', 'payment', paymentId, pay.practiceId),
          tx,
        );
      });
    } catch (e) {
      throw guardConflict(e) ?? e;
    }
    return this.paymentDto(
      await this.prisma.payment.findUniqueOrThrow({
        where: { id: paymentId },
        include: { allocations: true },
      }),
    );
  }

  async account(p: Principal, patientId: string, ctx: Ctx): Promise<PatientAccount> {
    await this.access.require(p, patientId, 'billing.read', ctx);
    const [invRows, payRows] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { AND: [{ patientId }, this.readWhere(p)] },
        include: { lines: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.payment.findMany({
        where: { AND: [{ patientId }, this.readWhere(p)] },
        include: { allocations: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);
    const invoices = await this.invoiceDtos(invRows);
    const payments = payRows.map((r) => this.paymentDto(r));
    const owed = invoices
      .filter((i) => i.kind === 'INVOICE' && i.status === 'POSTED')
      .reduce((s, i) => s.add(dec(i.outstanding)), ZERO);
    const onAccount = payments
      .filter((x) => x.status === 'RECORDED')
      .reduce((s, x) => s.add(dec(x.unallocated)), ZERO);
    await this.audit.record({
      action: 'billing.account_view',
      outcome: 'SUCCESS',
      actorUserId: p.id,
      organisationId: p.organisationId,
      targetType: 'patient',
      targetId: patientId,
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
    return {
      balance: fmt(owed.sub(onAccount)),
      outstandingInvoices: fmt(owed),
      unallocatedPayments: fmt(onAccount),
      invoices,
      payments,
    };
  }
}
