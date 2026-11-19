import { PERMISSIONS, type Permission, type RoleAssignment, type RoleKey } from '@dpms/contracts';

/**
 * Role → permission policy. Deny by default: a permission not listed here is not granted.
 * Changes to this table are security-relevant and must be reviewed and covered by tests.
 * Final role definitions are an open client decision (Q04) — see docs/15.
 */
export const ROLE_PERMISSIONS: Readonly<Record<RoleKey, readonly Permission[]>> = {
  // Owner: everything. Clinical/financial rights are included because the owner is accountable
  // for the organisation; narrow if the client decides otherwise (Q04).
  ORGANISATION_OWNER: [...PERMISSIONS],
  PRACTICE_ADMINISTRATOR: [
    'practice.read',
    'user.read',
    'user.manage',
    'patient.create',
    'patient.read',
    'patient.update',
    'appointment.read',
    'appointment.manage',
    'billing.read',
    'financial_report.read',
  ],
  DENTIST: [
    'practice.read',
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
  ],
  // Reception: minimum necessary — no medical history, clinical notes, imaging or billing.
  RECEPTIONIST: [
    'practice.read',
    'patient.create',
    'patient.read',
    'patient.update',
    'appointment.read',
    'appointment.manage',
  ],
  BILLING_ADMINISTRATOR: [
    'practice.read',
    'patient.read',
    'billing.read',
    'billing.manage',
    'payment.record',
    'financial_report.read',
  ],
};

export function permissionsFor(assignments: readonly RoleAssignment[]): Permission[] {
  const set = new Set<Permission>();
  for (const a of assignments) for (const p of ROLE_PERMISSIONS[a.role]) set.add(p);
  return [...set].sort();
}

export interface PermissionCheck {
  /** When set, the permission must be granted for this specific practice (org-wide grants count). */
  practiceId?: string;
  /** When true, only an organisation-wide assignment satisfies the check. */
  orgWide?: boolean;
}

/** Pure authorisation decision over a user's role assignments. */
export function hasPermission(
  assignments: readonly RoleAssignment[],
  permission: Permission,
  check: PermissionCheck = {},
): boolean {
  return assignments.some((a) => {
    if (!ROLE_PERMISSIONS[a.role].includes(permission)) return false;
    if (a.practiceId === null) return true; // organisation-wide grant
    if (check.orgWide) return false;
    return check.practiceId === undefined || a.practiceId === check.practiceId;
  });
}

export interface PracticeScope {
  orgWide: boolean;
  practiceIds: string[];
}

/** Which practices a user may exercise `permission` in. */
export function practiceScope(
  assignments: readonly RoleAssignment[],
  permission: Permission,
): PracticeScope {
  const ids = new Set<string>();
  let orgWide = false;
  for (const a of assignments) {
    if (!ROLE_PERMISSIONS[a.role].includes(permission)) continue;
    if (a.practiceId === null) orgWide = true;
    else ids.add(a.practiceId);
  }
  return { orgWide, practiceIds: [...ids] };
}
