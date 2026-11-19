import type { RoleAssignment } from '@dpms/contracts';
import { hasPermission, permissionsFor, practiceScope, ROLE_PERMISSIONS } from './permissions';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const owner: RoleAssignment[] = [{ role: 'ORGANISATION_OWNER', practiceId: null }];
const recepA: RoleAssignment[] = [{ role: 'RECEPTIONIST', practiceId: A }];

describe('permission policy', () => {
  it('grants nothing without assignments (deny by default)', () => {
    expect(hasPermission([], 'practice.read')).toBe(false);
    expect(permissionsFor([])).toEqual([]);
  });

  it('owner has org-wide management and audit access', () => {
    expect(hasPermission(owner, 'practice.manage', { orgWide: true })).toBe(true);
    expect(hasPermission(owner, 'audit.read', { orgWide: true })).toBe(true);
    expect(hasPermission(owner, 'practice.read', { practiceId: B })).toBe(true);
  });

  it('practice-scoped roles apply only to their practice', () => {
    expect(hasPermission(recepA, 'practice.read', { practiceId: A })).toBe(true);
    expect(hasPermission(recepA, 'practice.read', { practiceId: B })).toBe(false);
    expect(hasPermission(recepA, 'practice.read')).toBe(true); // "somewhere"
  });

  it('a practice-scoped grant never satisfies an org-wide requirement', () => {
    const adminA: RoleAssignment[] = [{ role: 'PRACTICE_ADMINISTRATOR', practiceId: A }];
    expect(hasPermission(adminA, 'practice.read', { orgWide: true })).toBe(false);
  });

  it('non-owner roles cannot manage practices or read audit', () => {
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      if (role === 'ORGANISATION_OWNER') continue;
      expect(perms).not.toContain('practice.manage');
      expect(perms).not.toContain('audit.read');
    }
  });

  it('computes practice scope', () => {
    expect(practiceScope(owner, 'practice.read')).toEqual({ orgWide: true, practiceIds: [] });
    expect(practiceScope(recepA, 'practice.read')).toEqual({ orgWide: false, practiceIds: [A] });
    expect(practiceScope(recepA, 'audit.read')).toEqual({ orgWide: false, practiceIds: [] });
  });
});
