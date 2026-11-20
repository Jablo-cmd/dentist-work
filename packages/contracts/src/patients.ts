import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common';

/** Strips formatting; converts South African local numbers (0XXXXXXXXX) to +27XXXXXXXXX. */
export function normalisePhone(input: string): string {
  const compact = input.replace(/[\s\-().]/g, '');
  if (/^0\d{9}$/.test(compact)) return `+27${compact.slice(1)}`;
  return compact;
}

/** Luhn check used by the South African 13-digit ID number. */
export function isValidSaIdChecksum(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let d = Number(id[12 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

const nameField = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[^\p{C}<>]+$/u, 'Contains invalid characters');

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  // Round-trip: the JS parser rolls impossible dates (e.g. 02-31) over instead of rejecting them.
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'Invalid date')
  .refine((v) => v >= '1900-01-01', 'Date too early')
  .refine((v) => v <= new Date().toISOString().slice(0, 10), 'Date cannot be in the future');
export const dateOnlySchema = dateOnly;

const phone = z
  .string()
  .trim()
  .transform(normalisePhone)
  .refine((v) => /^\+?\d{7,15}$/.test(v), 'Enter a valid phone number')
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null));

const idNumber = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{5,20}$/, 'Use 5-20 letters/digits')
  .refine((v) => !/^\d{13}$/.test(v) || isValidSaIdChecksum(v), 'Invalid South African ID number')
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null));

export const SEX_VALUES = ['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED'] as const;

export const patientDetailsShape = {
  firstName: nameField,
  lastName: nameField,
  preferredName: optionalText(80),
  dateOfBirth: dateOnly,
  // No default here: `.partial()` would still apply it and silently overwrite stored values on update.
  sex: z.enum(SEX_VALUES),
  idNumber,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .max(254)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  mobilePhone: phone,
  homePhone: phone,
  addressLine1: optionalText(120),
  addressLine2: optionalText(120),
  suburb: optionalText(80),
  city: optionalText(80),
  postalCode: optionalText(10),
};

export const createPatientRequestSchema = z.object({
  ...patientDetailsShape,
  sex: z.enum(SEX_VALUES).default('UNSPECIFIED'),
  /** Registering practice; the caller needs patient.create there. */
  practiceId: uuidSchema,
});
export type CreatePatientRequest = z.infer<typeof createPatientRequestSchema>;

export const updatePatientRequestSchema = z
  .object({ ...patientDetailsShape, isActive: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field');
export type UpdatePatientRequest = z.infer<typeof updatePatientRequestSchema>;

export const patientSummarySchema = z.object({
  id: uuidSchema,
  firstName: z.string(),
  lastName: z.string(),
  dateOfBirth: z.string(),
  practiceIds: z.array(uuidSchema),
});
export type PatientSummary = z.infer<typeof patientSummarySchema>;

/** Search result row: the summary plus the primary contact number (already within the caller's patient.read scope). */
export const patientSearchResultSchema = patientSummarySchema.extend({
  mobilePhone: z.string().nullable(),
});
export type PatientSearchResult = z.infer<typeof patientSearchResultSchema>;

export const patientContactSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  relationship: z.string(),
  phone: z.string(),
  isEmergencyContact: z.boolean(),
});
export type PatientContact = z.infer<typeof patientContactSchema>;

export const addContactRequestSchema = z.object({
  name: nameField,
  relationship: z.string().trim().min(2).max(50),
  phone: z
    .string()
    .trim()
    .transform(normalisePhone)
    .refine((v) => /^\+?\d{7,15}$/.test(v), 'Enter a valid phone number'),
  isEmergencyContact: z.boolean().default(true),
});
export type AddContactRequest = z.infer<typeof addContactRequestSchema>;

export const patientSchema = patientSummarySchema.extend({
  preferredName: z.string().nullable(),
  sex: z.enum(SEX_VALUES),
  idNumber: z.string().nullable(),
  email: z.string().nullable(),
  mobilePhone: z.string().nullable(),
  homePhone: z.string().nullable(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  suburb: z.string().nullable(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
  isActive: z.boolean(),
  registeringPracticeId: uuidSchema,
  createdAt: z.string().datetime(),
  contacts: z.array(patientContactSchema),
  /** Present only when the caller holds medical_history.read: count of active severe allergies. */
  severeAllergyCount: z.number().int().nullable(),
});
export type Patient = z.infer<typeof patientSchema>;

export const duplicateCandidateSchema = patientSummarySchema.extend({
  reasons: z.array(z.string()),
});
export type DuplicateCandidate = z.infer<typeof duplicateCandidateSchema>;

export const createPatientResponseSchema = z.object({
  patient: patientSchema,
  /** Possible duplicates for human review. Nothing is merged automatically. */
  duplicateCandidates: z.array(duplicateCandidateSchema),
});
export type CreatePatientResponse = z.infer<typeof createPatientResponseSchema>;

export const patientSearchQuerySchema = paginationQuerySchema
  .extend({
    q: z.string().trim().min(2).max(80).optional(),
    dateOfBirth: dateOnly.optional(),
  })
  .refine(
    (v) => v.q !== undefined || v.dateOfBirth !== undefined,
    'Provide a search term or date of birth',
  );
export type PatientSearchQuery = z.infer<typeof patientSearchQuerySchema>;

export const linkPracticeRequestSchema = z.object({ practiceId: uuidSchema });
export type LinkPracticeRequest = z.infer<typeof linkPracticeRequestSchema>;

export const patientRevisionSchema = z.object({
  id: uuidSchema,
  changedAt: z.string().datetime(),
  changedByUserId: uuidSchema.nullable(),
  /** Field names only: values are not repeated in the history feed. */
  fields: z.array(z.string()),
});
export type PatientRevision = z.infer<typeof patientRevisionSchema>;

export const DUPLICATE_STATUSES = ['PENDING', 'DISTINCT_PATIENTS', 'CONFIRMED_DUPLICATE'] as const;
export const duplicateFlagSchema = z.object({
  id: uuidSchema,
  status: z.enum(DUPLICATE_STATUSES),
  reasons: z.array(z.string()),
  patientA: patientSummarySchema,
  patientB: patientSummarySchema,
});
export type DuplicateFlag = z.infer<typeof duplicateFlagSchema>;
export const reviewDuplicateRequestSchema = z.object({
  decision: z.enum(['DISTINCT_PATIENTS', 'CONFIRMED_DUPLICATE']),
});
export type ReviewDuplicateRequest = z.infer<typeof reviewDuplicateRequestSchema>;
export const duplicatesQuerySchema = paginationQuerySchema.extend({
  status: z.enum(DUPLICATE_STATUSES).default('PENDING'),
});

// ---- Medical history and allergies --------------------------------------------------------
export const HISTORY_CATEGORIES = [
  'CONDITION',
  'MEDICATION',
  'SURGERY',
  'FAMILY',
  'OTHER',
] as const;
export const ALLERGY_SEVERITIES = ['MILD', 'MODERATE', 'SEVERE', 'UNKNOWN'] as const;

export const addHistoryEntryRequestSchema = z.object({
  category: z.enum(HISTORY_CATEGORIES),
  description: z.string().trim().min(2).max(500),
  /** Where the information came from, e.g. "Patient reported", "Referral letter". */
  source: z.string().trim().min(2).max(100),
  recordedOn: dateOnly,
  isAlert: z.boolean().default(false),
});
export type AddHistoryEntryRequest = z.infer<typeof addHistoryEntryRequestSchema>;

export const addAllergyRequestSchema = z.object({
  substance: z.string().trim().min(2).max(100),
  reaction: z.string().trim().max(200).nullable().optional(),
  severity: z.enum(ALLERGY_SEVERITIES),
  source: z.string().trim().min(2).max(100),
  recordedOn: dateOnly,
});
export type AddAllergyRequest = z.infer<typeof addAllergyRequestSchema>;

const resolvedFields = {
  recordedOn: z.string(),
  source: z.string(),
  createdByUserId: uuidSchema.nullable(),
  resolvedAt: z.string().datetime().nullable(),
};
export const historyEntrySchema = z.object({
  id: uuidSchema,
  category: z.enum(HISTORY_CATEGORIES),
  description: z.string(),
  isAlert: z.boolean(),
  ...resolvedFields,
});
export const allergySchema = z.object({
  id: uuidSchema,
  substance: z.string(),
  reaction: z.string().nullable(),
  severity: z.enum(ALLERGY_SEVERITIES),
  ...resolvedFields,
});
export const medicalHistorySchema = z.object({
  entries: z.array(historyEntrySchema),
  allergies: z.array(allergySchema),
});
export type MedicalHistory = z.infer<typeof medicalHistorySchema>;
