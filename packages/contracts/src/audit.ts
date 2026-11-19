import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common';

export const auditEventSchema = z.object({
  id: uuidSchema,
  occurredAt: z.string().datetime(),
  actorUserId: uuidSchema.nullable(),
  actorName: z.string().nullable(),
  practiceId: uuidSchema.nullable(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  outcome: z.enum(['SUCCESS', 'DENIED', 'FAILURE']),
  requestId: z.string().nullable(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

export const auditEventsQuerySchema = paginationQuerySchema
  .extend({
    action: z
      .string()
      .regex(/^[a-z_]+(\.[a-z_]+)*\.?$/)
      .max(80)
      .optional(),
    outcome: z.enum(['SUCCESS', 'DENIED', 'FAILURE']).optional(),
    actorUserId: uuidSchema.optional(),
    /** Inclusive day range in UTC; max 92 days when both are given. */
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .refine(
    (v) =>
      !v.from ||
      !v.to ||
      (v.to >= v.from && (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 <= 92),
    'Date range must be ordered and at most 92 days',
  );
export type AuditEventsQuery = z.infer<typeof auditEventsQuerySchema>;
