/**
 * Where a signed-in user must be taken before using the app, or null if they may stay.
 * Exactly one step is required at a time, in order: change the temporary password, then enrol a
 * second factor. (Evaluating them independently caused a redirect loop for accounts that need both.)
 */
export function requiredRedirect(
  user: { mustChangePassword: boolean; mfaEnrolmentRequired: boolean },
  pathname: string,
): string | null {
  if (user.mustChangePassword) return pathname === '/change-password' ? null : '/change-password';
  if (user.mfaEnrolmentRequired) return pathname === '/security' ? null : '/security';
  return null;
}
