import type { Permission, RoleAssignment, RoleKey } from '@dpms/contracts';

/**
 * Role → permission policy. Deny by default: a permission not listed here is not granted.
 * Changes to this table are security-relevant and must be reviewed and covered by tests.
 * Final role definitions are an open client decision (Q04) — see docs/15.
 */
export const ROLE_PERMISSIONS: Readonly<Record<RoleKey, readonly Permission[]>> = {
  ORGANISATION_OWNER: ['practice.read', 'practice.manage', 'audit.read'],
  PRACTICE_ADMINISTRATOR: ['practice.read'],
  DENTIST: ['practice.read'],
  RECEPTIONIST: ['practice.read'],
  BILLING_ADMINISTRATOR: ['practice.read'],
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
