import { z } from 'zod';
import { uuidSchema } from './common';

/** Money and quantities travel as decimal STRINGS, never floats. Currency is ZAR (assumption, Q12). */
export const moneySchema = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Use a decimal amount with at most 2 places, e.g. 150.00');
const positiveMoney = moneySchema.refine((v) => Number(v) > 0, 'Amount must be greater than zero');
const quantity = z
  .string()
  .regex(/^\d{1,6}(\.\d{1,2})?$/, 'Quantity must be a decimal with at most 2 places')
  .refine((v) => Number(v) > 0, 'Quantity must be greater than zero');

export const invoiceLineInputSchema = z.object({
  description: z.string().trim().min(2).max(300),
  quantity: quantity.default('1'),
  unitPrice: moneySchema,
  /** Tax is recorded as entered. No tax is calculated: tax treatment awaits client/accountant confirmation (Q12). */
  taxAmount: moneySchema.default('0'),
  treatmentItemId: uuidSchema.optional(),
});
export type InvoiceLineInput = z.infer<typeof invoiceLineInputSchema>;

export const createInvoiceRequestSchema = z.object({
  practiceId: uuidSchema,
  lines: z.array(invoiceLineInputSchema).min(1).max(100),
});
export type CreateInvoiceRequest = z.infer<typeof createInvoiceRequestSchema>;

export const replaceLinesRequestSchema = z.object({
  lines: z.array(invoiceLineInputSchema).min(1).max(100),
});
export type ReplaceLinesRequest = z.infer<typeof replaceLinesRequestSchema>;

export const createCreditNoteRequestSchema = z.object({
  reason: z.string().trim().min(5).max(500),
  lines: z.array(invoiceLineInputSchema).min(1).max(100),
});
export type CreateCreditNoteRequest = z.infer<typeof createCreditNoteRequestSchema>;

export const INVOICE_KINDS = ['INVOICE', 'CREDIT_NOTE'] as const;
export const INVOICE_STATUSES = ['DRAFT', 'POSTED', 'CANCELLED'] as const;

export const invoiceLineSchema = z.object({
  id: uuidSchema,
  lineNo: z.number().int(),
  description: z.string(),
  quantity: z.string(),
  unitPrice: z.string(),
  taxAmount: z.string(),
  lineTotal: z.string(),
  treatmentItemId: uuidSchema.nullable(),
});

export const invoiceSchema = z.object({
  id: uuidSchema,
  kind: z.enum(INVOICE_KINDS),
  status: z.enum(INVOICE_STATUSES),
  number: z.string().nullable(),
  patientId: uuidSchema,
  practiceId: uuidSchema,
  issueDate: z.string().nullable(),
  currency: z.literal('ZAR'),
  lines: z.array(invoiceLineSchema),
  subtotal: z.string(),
  taxTotal: z.string(),
  total: z.string(),
  /** Payments applied (reversed payments excluded). Always "0.00" for credit notes. */
  amountPaid: z.string(),
  /** Credit notes applied against this invoice. */
  amountCredited: z.string(),
  outstanding: z.string(),
  creditsInvoiceId: uuidSchema.nullable(),
  reason: z.string().nullable(),
  createdAt: z.string().datetime(),
  postedAt: z.string().datetime().nullable(),
});
export type Invoice = z.infer<typeof invoiceSchema>;

export const PAYMENT_METHODS = ['CASH', 'CARD', 'EFT', 'OTHER'] as const;
export const allocationInputSchema = z.object({ invoiceId: uuidSchema, amount: positiveMoney });
export type AllocationInput = z.infer<typeof allocationInputSchema>;

export const recordPaymentRequestSchema = z.object({
  practiceId: uuidSchema,
  amount: positiveMoney,
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(100).nullable().optional(),
  receivedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  allocations: z.array(allocationInputSchema).max(50).default([]),
});
export type RecordPaymentRequest = z.infer<typeof recordPaymentRequestSchema>;

export const allocatePaymentRequestSchema = z.object({
  allocations: z.array(allocationInputSchema).min(1).max(50),
});
export type AllocatePaymentRequest = z.infer<typeof allocatePaymentRequestSchema>;

export const reversePaymentRequestSchema = z.object({ reason: z.string().trim().min(5).max(300) });
export type ReversePaymentRequest = z.infer<typeof reversePaymentRequestSchema>;

export const IDEMPOTENCY_HEADER = 'idempotency-key';
export const idempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{16,100}$/, 'Idempotency-Key must be 16-100 URL-safe characters');

export const paymentSchema = z.object({
  id: uuidSchema,
  patientId: uuidSchema,
  practiceId: uuidSchema,
  amount: z.string(),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().nullable(),
  receivedOn: z.string(),
  status: z.enum(['RECORDED', 'REVERSED']),
  allocated: z.string(),
  unallocated: z.string(),
  allocations: z.array(z.object({ invoiceId: uuidSchema, amount: z.string() })),
  reversalReason: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type Payment = z.infer<typeof paymentSchema>;

export const patientAccountSchema = z.object({
  /** Positive = patient owes money; negative = patient is in credit. */
  balance: z.string(),
  outstandingInvoices: z.string(),
  unallocatedPayments: z.string(),
  invoices: z.array(invoiceSchema),
  payments: z.array(paymentSchema),
});
export type PatientAccount = z.infer<typeof patientAccountSchema>;

// ---- Reports -------------------------------------------------------------------------------------
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const reportQuerySchema = z
  .object({ from: day, to: day, practiceId: uuidSchema.optional() })
  .refine((v) => v.to >= v.from, 'to must not be before from')
  .refine(
    (v) => (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 <= 366,
    'Range may not exceed 366 days',
  );
export type ReportQuery = z.infer<typeof reportQuerySchema>;

export const financialSummarySchema = z.object({
  from: z.string(),
  to: z.string(),
  perPractice: z.array(
    z.object({
      practiceId: uuidSchema,
      invoiced: z.string(),
      credited: z.string(),
      netInvoiced: z.string(),
      paymentsReceived: z.string(),
      paymentsByMethod: z.record(z.string(), z.string()),
      /** Outstanding balance of invoices posted up to `to`, as at now. */
      outstandingInvoices: z.string(),
    }),
  ),
  totals: z.object({
    invoiced: z.string(),
    credited: z.string(),
    paymentsReceived: z.string(),
    outstandingInvoices: z.string(),
  }),
});
export type FinancialSummary = z.infer<typeof financialSummarySchema>;

export const operationalSummarySchema = z.object({
  from: z.string(),
  to: z.string(),
  perPractice: z.array(
    z.object({
      practiceId: uuidSchema,
      appointments: z.record(z.string(), z.number().int()),
      /** null when the caller may not read patients. */
      newPatients: z.number().int().nullable(),
    }),
  ),
});
export type OperationalSummary = z.infer<typeof operationalSummarySchema>;
