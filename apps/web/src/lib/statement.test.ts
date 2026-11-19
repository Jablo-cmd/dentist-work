import type { Invoice, Payment } from '@dpms/contracts';
import { describe, expect, it } from 'vitest';
import { buildStatement, fromCents, toCents } from './statement';

const inv = (
  o: Partial<Invoice> & Pick<Invoice, 'id' | 'total' | 'number' | 'issueDate'>,
): Invoice =>
  ({
    kind: 'INVOICE',
    status: 'POSTED',
    patientId: 'p',
    practiceId: 'x',
    currency: 'ZAR',
    lines: [
      {
        id: 'l',
        lineNo: 1,
        description: 'Consultation',
        quantity: '1.00',
        unitPrice: o.total,
        taxAmount: '0.00',
        lineTotal: o.total,
        treatmentItemId: null,
      },
    ],
    subtotal: o.total,
    taxTotal: '0.00',
    amountPaid: '0.00',
    amountCredited: '0.00',
    outstanding: o.total,
    creditsInvoiceId: null,
    reason: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    postedAt: `${o.issueDate}T08:00:00.000Z`,
    ...o,
  }) as Invoice;
const pay = (o: Partial<Payment> & Pick<Payment, 'id' | 'amount' | 'receivedOn'>): Payment =>
  ({
    patientId: 'p',
    practiceId: 'x',
    method: 'CARD',
    reference: null,
    status: 'RECORDED',
    allocated: '0.00',
    unallocated: o.amount,
    allocations: [],
    reversalReason: null,
    createdAt: `${o.receivedOn}T09:00:00.000Z`,
    ...o,
  }) as Payment;

describe('cents conversion is exact', () => {
  it('round-trips without floating point error', () => {
    expect(toCents('0.10') + toCents('0.20')).toBe(30);
    expect(fromCents(toCents('1234567.89'))).toBe('1234567.89');
    expect(toCents('5')).toBe(500);
    expect(toCents('5.5')).toBe(550);
    expect(fromCents(-3050)).toBe('-30.50');
  });
});

describe('buildStatement', () => {
  it('orders events and keeps a running balance (positive = patient owes)', () => {
    const s = buildStatement(
      [
        inv({ id: 'i1', number: 'INV-000001', issueDate: '2026-02-01', total: '100.00' }),
        inv({
          id: 'c1',
          kind: 'CREDIT_NOTE',
          number: 'CN-000001',
          issueDate: '2026-02-10',
          total: '20.00',
          creditsInvoiceId: 'i1',
          reason: 'Billed in error',
        }),
      ],
      [pay({ id: 'p1', receivedOn: '2026-02-05', amount: '50.00' })],
    );
    expect(s.rows.map((r) => [r.kind, r.balanceCents])).toEqual([
      ['Invoice', 10000],
      ['Payment', 5000],
      ['Credit note', 3000],
    ]);
    expect(s.balanceCents).toBe(3000);
  });
  it('ignores drafts and cancelled invoices, and does not count reversed payments', () => {
    const s = buildStatement(
      [
        inv({ id: 'd', number: null, issueDate: null, status: 'DRAFT', total: '999.00' }),
        inv({ id: 'x', status: 'CANCELLED', number: null, issueDate: null, total: '5.00' }),
        inv({ id: 'i1', number: 'INV-000001', issueDate: '2026-02-01', total: '100.00' }),
      ],
      [pay({ id: 'p1', receivedOn: '2026-02-02', amount: '100.00', status: 'REVERSED' })],
    );
    expect(s.balanceCents).toBe(10000);
    expect(s.rows.find((r) => r.kind === 'Payment')?.note).toMatch(/Reversed/);
  });
  it('shows a patient in credit as a negative balance (matches the API account balance)', () => {
    const s = buildStatement(
      [inv({ id: 'i1', number: 'INV-000001', issueDate: '2026-02-01', total: '100.00' })],
      [pay({ id: 'p1', receivedOn: '2026-02-02', amount: '130.00' })],
    );
    expect(fromCents(s.balanceCents)).toBe('-30.00');
  });
});
