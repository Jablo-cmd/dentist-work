import { z } from 'zod';
import { uuidSchema } from './common';

const noteBody = z.string().trim().min(1).max(20_000);

// ---- Encounters and notes -------------------------------------------------------------------
export const createEncounterRequestSchema = z.object({
  practiceId: uuidSchema,
  appointmentId: uuidSchema.optional(),
  body: noteBody.optional(),
});
export type CreateEncounterRequest = z.infer<typeof createEncounterRequestSchema>;

export const saveDraftRequestSchema = z.object({ body: noteBody });
export type SaveDraftRequest = z.infer<typeof saveDraftRequestSchema>;

export const amendEncounterRequestSchema = z.object({
  body: noteBody,
  /** Why the finalised record is being changed. Required and permanent. */
  reason: z.string().trim().min(5).max(500),
});
export type AmendEncounterRequest = z.infer<typeof amendEncounterRequestSchema>;

export const addendumRequestSchema = z.object({ body: noteBody });
export type AddendumRequest = z.infer<typeof addendumRequestSchema>;

export const NOTE_KINDS = ['DRAFT', 'AMENDMENT', 'ADDENDUM'] as const;
export const noteVersionSchema = z.object({
  versionNumber: z.number().int(),
  kind: z.enum(NOTE_KINDS),
  body: z.string(),
  reason: z.string().nullable(),
  amendsVersion: z.number().int().nullable(),
  authorUserId: uuidSchema,
  authorName: z.string(),
  createdAt: z.string().datetime(),
});
export type NoteVersion = z.infer<typeof noteVersionSchema>;

export const encounterSummarySchema = z.object({
  id: uuidSchema,
  patientId: uuidSchema,
  practiceId: uuidSchema,
  practitionerUserId: uuidSchema,
  practitionerName: z.string(),
  appointmentId: uuidSchema.nullable(),
  status: z.enum(['DRAFT', 'FINALISED']),
  encounteredAt: z.string().datetime(),
  finalisedAt: z.string().datetime().nullable(),
});
export type EncounterSummary = z.infer<typeof encounterSummarySchema>;

export const encounterSchema = encounterSummarySchema.extend({
  /** Latest authoritative text (latest draft save, or latest amendment once finalised). */
  currentBody: z.string(),
  /** Complete, ordered history: every draft save, amendment and addendum. Nothing is ever overwritten. */
  versions: z.array(noteVersionSchema),
});
export type Encounter = z.infer<typeof encounterSchema>;

// ---- Dental chart (FDI notation is the working default; client confirmation pending, Q22) ----
export const FDI_TOOTH = /^([1-4][1-8]|[5-8][1-5])$/;
export const TOOTH_SURFACES = [
  'MESIAL',
  'DISTAL',
  'OCCLUSAL',
  'INCISAL',
  'BUCCAL_LABIAL',
  'LINGUAL_PALATAL',
] as const;
export const TOOTH_CONDITIONS = [
  'CARIES',
  'FILLING',
  'CROWN',
  'BRIDGE_PONTIC',
  'IMPLANT',
  'ROOT_CANAL_TREATED',
  'FRACTURE',
  'MISSING',
  'IMPACTED',
  'EROSION_WEAR',
  'PERIODONTAL_CONCERN',
  'OTHER',
] as const;

export const addChartEntryRequestSchema = z.object({
  toothNumber: z.string().regex(FDI_TOOTH, 'Use FDI tooth numbers, e.g. 18, 24, 55'),
  surfaces: z.array(z.enum(TOOTH_SURFACES)).max(6).default([]),
  condition: z.enum(TOOTH_CONDITIONS),
  note: z.string().trim().max(500).nullable().optional(),
  encounterId: uuidSchema.optional(),
});
export type AddChartEntryRequest = z.infer<typeof addChartEntryRequestSchema>;

export const chartEntrySchema = z.object({
  id: uuidSchema,
  toothNumber: z.string(),
  surfaces: z.array(z.enum(TOOTH_SURFACES)),
  condition: z.enum(TOOTH_CONDITIONS),
  note: z.string().nullable(),
  encounterId: uuidSchema.nullable(),
  recordedByUserId: uuidSchema,
  recordedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
});
export type ChartEntry = z.infer<typeof chartEntrySchema>;

// ---- Treatment plans -------------------------------------------------------------------------
export const ITEM_STATUSES = ['PROPOSED', 'ACCEPTED', 'DECLINED', 'DEFERRED', 'COMPLETED'] as const;
export const itemStatusSchema = z.enum(ITEM_STATUSES);
export type ItemStatus = z.infer<typeof itemStatusSchema>;

/** Allowed status moves. COMPLETED is terminal; corrections are new items, not rewrites. */
export const ITEM_TRANSITIONS: Readonly<Record<ItemStatus, readonly ItemStatus[]>> = {
  PROPOSED: ['ACCEPTED', 'DECLINED', 'DEFERRED'],
  ACCEPTED: ['COMPLETED', 'DEFERRED', 'DECLINED'],
  DECLINED: ['ACCEPTED'],
  DEFERRED: ['ACCEPTED', 'DECLINED'],
  COMPLETED: [],
};

const money = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Amount must be a decimal with at most 2 places')
  .nullable()
  .optional();

export const treatmentItemInputSchema = z.object({
  toothNumber: z.string().regex(FDI_TOOTH).nullable().optional(),
  description: z.string().trim().min(2).max(300),
  /** Decimal string in rand (never a float). Estimate only; invoicing is a separate step. */
  estimatedAmount: money,
});
export type TreatmentItemInput = z.infer<typeof treatmentItemInputSchema>;

export const createTreatmentPlanRequestSchema = z.object({
  practiceId: uuidSchema,
  title: z.string().trim().min(2).max(120),
  items: z.array(treatmentItemInputSchema).min(1).max(50),
});
export type CreateTreatmentPlanRequest = z.infer<typeof createTreatmentPlanRequestSchema>;

export const changeItemStatusRequestSchema = z.object({
  status: itemStatusSchema,
  note: z.string().trim().max(300).nullable().optional(),
});
export type ChangeItemStatusRequest = z.infer<typeof changeItemStatusRequestSchema>;

export const treatmentItemSchema = z.object({
  id: uuidSchema,
  toothNumber: z.string().nullable(),
  description: z.string(),
  estimatedAmount: z.string().nullable(),
  status: itemStatusSchema,
  history: z.array(
    z.object({
      fromStatus: itemStatusSchema.nullable(),
      toStatus: itemStatusSchema,
      occurredAt: z.string().datetime(),
      actorUserId: uuidSchema.nullable(),
      note: z.string().nullable(),
    }),
  ),
});
export type TreatmentItem = z.infer<typeof treatmentItemSchema>;

export const treatmentPlanSchema = z.object({
  id: uuidSchema,
  patientId: uuidSchema,
  practiceId: uuidSchema,
  title: z.string(),
  createdAt: z.string().datetime(),
  items: z.array(treatmentItemSchema),
});
export type TreatmentPlan = z.infer<typeof treatmentPlanSchema>;
