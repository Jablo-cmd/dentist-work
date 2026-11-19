import { z } from 'zod';

/** Fixed role set from docs/03-ROLES-AND-WORKFLOWS.md. Final roles are client decision Q04. */
export const ROLE_KEYS = [
  'ORGANISATION_OWNER',
  'PRACTICE_ADMINISTRATOR',
  'DENTIST',
  'RECEPTIONIST',
  'BILLING_ADMINISTRATOR',
] as const;
export const roleKeySchema = z.enum(ROLE_KEYS);
export type RoleKey = (typeof ROLE_KEYS)[number];

/**
 * Permission vocabulary. Only permissions for implemented capabilities are granted by the
 * API today; the rest of the proposed set (docs/03) is added with the feature that uses it.
 */
export const PERMISSIONS = [
  'practice.read',
  'practice.manage',
  'user.read',
  'user.manage',
  'audit.read',
  'patient.create',
  'patient.read',
  'patient.update',
  'medical_history.read',
  'medical_history.update',
  'appointment.read',
  'appointment.manage',
  'clinical_record.read',
  'clinical_record.create',
  'clinical_record.finalise',
  'clinical_record.amend',
  'imaging.upload',
  'imaging.view',
  'billing.read',
  'billing.manage',
  'payment.record',
  'financial_report.read',
] as const;
export const permissionSchema = z.enum(PERMISSIONS);
export type Permission = (typeof PERMISSIONS)[number];
