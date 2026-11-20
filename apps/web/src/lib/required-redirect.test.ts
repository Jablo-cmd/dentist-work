import { describe, expect, it } from 'vitest';
import { requiredRedirect } from './required-redirect';

const flags = (mustChangePassword: boolean, mfaEnrolmentRequired: boolean) => ({
  mustChangePassword,
  mfaEnrolmentRequired,
});

describe('requiredRedirect', () => {
  it('lets a fully set-up user go anywhere', () => {
    expect(requiredRedirect(flags(false, false), '/patients')).toBeNull();
  });
  it('sends a user with a temporary password to change it, and lets them stay there', () => {
    expect(requiredRedirect(flags(true, false), '/')).toBe('/change-password');
    expect(requiredRedirect(flags(true, false), '/change-password')).toBeNull();
  });
  it('sends a user who must enrol MFA to security, and lets them stay there', () => {
    expect(requiredRedirect(flags(false, true), '/')).toBe('/security');
    expect(requiredRedirect(flags(false, true), '/security')).toBeNull();
  });
  it('REGRESSION: an account needing both never ping-pongs between the two pages', () => {
    const both = flags(true, true);
    expect(requiredRedirect(both, '/')).toBe('/change-password');
    // already on the password page: stay (the old code redirected to /security here, then back again)
    expect(requiredRedirect(both, '/change-password')).toBeNull();
    // arriving on /security first is sent to the password step, which then stays put
    expect(requiredRedirect(both, '/security')).toBe('/change-password');
  });
  it('after the password is changed, the MFA step comes next', () => {
    expect(requiredRedirect(flags(false, true), '/change-password')).toBe('/security');
  });
});
