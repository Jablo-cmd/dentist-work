import type { Invoice, Payment } from '@dpms/contracts';

export interface StatementRow {
  date: string; // YYYY-MM-DD
  sortKey: string;
  kind: 'Invoice' | 'Credit note' | 'Payment';
  reference: string;
  description: string;
  /** Amounts in cents (integers) — never floating-point rand values. */
  debitCents: number;
  creditCents: number;
  balanceCents: number;
  note?: string;
}

/** Parses a decimal string ("1234.50") into integer cents without floating-point arithmetic. */
export function toCents(v: string): number {
  const [whole = '0', frac = ''] = v.split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
}
export function fromCents(c: number): string {
  const sign = c < 0 ? '-' : '';
  const abs = Math.abs(c);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Builds a chronological statement. Balance = invoices − credit notes − recorded payments, the same
 * quantity the API reports as the patient's account balance (positive = patient owes).
 * Reversed payments are listed for transparency but do not affect the balance.
 */
export function buildStatement(
  invoices: readonly Invoice[],
  payments: readonly Payment[],
): { rows: StatementRow[]; balanceCents: number } {
  type Ev = Omit<StatementRow, 'balanceCents'>;
  const evs: Ev[] = [];
  for (const i of invoices) {
    if (i.status !== 'POSTED' || !i.issueDate || !i.number) continue;
    const c = toCents(i.total);
    evs.push({
      date: i.issueDate,
      sortKey: `${i.issueDate}|${i.postedAt ?? ''}|${i.number}`,
      kind: i.kind === 'CREDIT_NOTE' ? 'Credit note' : 'Invoice',
      reference: i.number,
      description: i.lines.map((l) => l.description).join('; '),
      debitCents: i.kind === 'INVOICE' ? c : 0,
      creditCents: i.kind === 'CREDIT_NOTE' ? c : 0,
    });
  }
  for (const p of payments) {
    const c = toCents(p.amount);
    const reversed = p.status === 'REVERSED';
    evs.push({
      date: p.receivedOn,
      sortKey: `${p.receivedOn}|${p.createdAt}|${p.id}`,
      kind: 'Payment',
      reference: p.reference ?? p.method.toLowerCase(),
      description: `Payment received (${p.method.toLowerCase()})`,
      debitCents: 0,
      creditCents: reversed ? 0 : c,
      note: reversed ? 'Reversed — not counted' : undefined,
    });
  }
  evs.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
  let bal = 0;
  const rows = evs.map((e) => {
    bal += e.debitCents - e.creditCents;
    return { ...e, balanceCents: bal };
  });
  return { rows, balanceCents: bal };
}
