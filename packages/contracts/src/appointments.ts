import { z } from 'zod';
import { uuidSchema } from './common';

export const APPOINTMENT_STATUSES = [
  'SCHEDULED',
  'CHECKED_IN',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;
export const appointmentStatusSchema = z.enum(APPOINTMENT_STATUSES);
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

const instant = z.string().datetime({ offset: true });
const duration = z.number().int().min(5).max(480);

export const createAppointmentRequestSchema = z.object({
  practiceId: uuidSchema,
  patientId: uuidSchema,
  practitionerUserId: uuidSchema,
  startsAt: instant,
  durationMinutes: duration,
  /** Administrative reason only (e.g. "Check-up"). Clinical detail belongs in the clinical record. */
  reason: z.string().trim().max(200).nullable().optional(),
});
export type CreateAppointmentRequest = z.infer<typeof createAppointmentRequestSchema>;

export const rescheduleAppointmentRequestSchema = z.object({
  startsAt: instant,
  durationMinutes: duration.optional(),
  practitionerUserId: uuidSchema.optional(),
});
export type RescheduleAppointmentRequest = z.infer<typeof rescheduleAppointmentRequestSchema>;

export const cancelAppointmentRequestSchema = z.object({
  reason: z.string().trim().min(2).max(200),
});
export type CancelAppointmentRequest = z.infer<typeof cancelAppointmentRequestSchema>;

export const appointmentTransitionRequestSchema = z.object({
  status: z.enum(['CHECKED_IN', 'COMPLETED', 'NO_SHOW']),
});
export type AppointmentTransitionRequest = z.infer<typeof appointmentTransitionRequestSchema>;

export const MAX_CALENDAR_RANGE_DAYS = 35;
export const appointmentsQuerySchema = z
  .object({
    from: instant,
    to: instant,
    practiceId: uuidSchema.optional(),
    practitionerUserId: uuidSchema.optional(),
  })
  .refine((v) => new Date(v.to) > new Date(v.from), 'to must be after from')
  .refine(
    (v) =>
      new Date(v.to).getTime() - new Date(v.from).getTime() <= MAX_CALENDAR_RANGE_DAYS * 86_400_000,
    `Range may not exceed ${MAX_CALENDAR_RANGE_DAYS} days`,
  );
export type AppointmentsQuery = z.infer<typeof appointmentsQuerySchema>;

export const appointmentSchema = z.object({
  id: uuidSchema,
  practiceId: uuidSchema,
  patientId: uuidSchema,
  /** null when the caller may not read patient names. */
  patientName: z.string().nullable(),
  practitionerUserId: uuidSchema,
  practitionerName: z.string(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  status: appointmentStatusSchema,
  reason: z.string().nullable(),
  cancelReason: z.string().nullable(),
});
export type Appointment = z.infer<typeof appointmentSchema>;

export const practitionerSchema = z.object({ id: uuidSchema, displayName: z.string() });
export type Practitioner = z.infer<typeof practitionerSchema>;
export const practitionersQuerySchema = z.object({ practiceId: uuidSchema });

export const appointmentEventSchema = z.object({
  id: uuidSchema,
  type: z.enum(['CREATED', 'RESCHEDULED', 'CANCELLED', 'CHECKED_IN', 'COMPLETED', 'NO_SHOW']),
  occurredAt: z.string().datetime(),
  actorUserId: uuidSchema.nullable(),
  fromStartsAt: z.string().datetime().nullable(),
  toStartsAt: z.string().datetime().nullable(),
  reason: z.string().nullable(),
});
export type AppointmentEvent = z.infer<typeof appointmentEventSchema>;
