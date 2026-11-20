import type { AppointmentStatus } from '@dpms/contracts';

/**
 * Appointment status presentation (single source). Tones follow the semantic rules in
 * docs/27-DESIGN-SYSTEM.md: info = booked, warning = in progress / needs attention,
 * success = completed, neutral = cancelled, danger = no-show.
 */
export const APPOINTMENT_TONE: Record<
  AppointmentStatus,
  'info' | 'warning' | 'success' | 'neutral' | 'danger'
> = {
  SCHEDULED: 'info',
  CHECKED_IN: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
  NO_SHOW: 'danger',
};
/** Left accent bar colour class per status. */
export const APPOINTMENT_BAR: Record<AppointmentStatus, string> = {
  SCHEDULED: 'bg-info',
  CHECKED_IN: 'bg-warning',
  COMPLETED: 'bg-success',
  CANCELLED: 'bg-muted-foreground/40',
  NO_SHOW: 'bg-danger',
};
export const APPOINTMENT_LABEL: Record<AppointmentStatus, string> = {
  SCHEDULED: 'Scheduled',
  CHECKED_IN: 'Checked in',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No-show',
};
