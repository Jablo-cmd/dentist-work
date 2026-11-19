import { Prisma } from '@prisma/client';
import type { InvoiceLineInput } from '@dpms/contracts';

const D = Prisma.Decimal;
export type Dec = Prisma.Decimal;
export const ZERO = new D(0);
export const dec = (v: string | number | Dec): Dec => new D(v);
/** Rounding rule for line amounts: half-up to 2 decimals (assumption; accountant to confirm, Q12). */
export const round2 = (d: Dec): Dec => d.toDecimalPlaces(2, D.ROUND_HALF_UP);
export const fmt = (d: Dec | null | undefined): string => (d ?? ZERO).toFixed(2);

export interface ComputedLine {
  lineNo: number;
  description: string;
  quantity: Dec;
  unitPrice: Dec;
  taxAmount: Dec;
  lineTotal: Dec;
  treatmentItemId: string | null;
}

/** All arithmetic is exact decimal; floating point is never used for money. */
export function computeLines(inputs: readonly InvoiceLineInput[]): {
  lines: ComputedLine[];
  subtotal: Dec;
  taxTotal: Dec;
  total: Dec;
} {
  let subtotal = ZERO;
  let taxTotal = ZERO;
  const lines = inputs.map((l, i) => {
    const quantity = dec(l.quantity);
    const unitPrice = dec(l.unitPrice);
    const taxAmount = dec(l.taxAmount);
    const base = round2(quantity.mul(unitPrice));
    subtotal = subtotal.add(base);
    taxTotal = taxTotal.add(taxAmount);
    return {
      lineNo: i + 1,
      description: l.description,
      quantity,
      unitPrice,
      taxAmount,
      lineTotal: base.add(taxAmount),
      treatmentItemId: l.treatmentItemId ?? null,
    };
  });
  return { lines, subtotal, taxTotal, total: subtotal.add(taxTotal) };
}
