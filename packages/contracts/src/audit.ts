import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common';

export const auditEventSchema = z.object({
  id: uuidSchema,
  occurredAt: z.string().datetime(),
  actorUserId: uuidSchema.nullable(),
  practiceId: uuidSchema.nullable(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  outcome: z.enum(['SUCCESS', 'DENIED', 'FAILURE']),
  requestId: z.string().nullable(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

export const auditEventsQuerySchema = paginationQuerySchema.extend({
  action: z
    .string()
    .regex(/^[a-z]+(\.[a-z_]+)*$/)
    .max(80)
    .optional(),
});
export type AuditEventsQuery = z.infer<typeof auditEventsQuerySchema>;
