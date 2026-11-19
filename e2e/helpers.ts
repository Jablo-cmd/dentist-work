import { expect, type Page } from '@playwright/test';
import { totpAt, base32Decode, stepFor } from '../apps/api/src/auth/totp';

/**
 * Signs in through the real form. By default waits until the app has left the sign-in page, so the
 * session cookie exists before the test navigates. Pass `wait: false` when the next screen is
 * the second-factor step (which is still on /login).
 */
export async function signIn(
  page: Page,
  email: string,
  password: string,
  opts: { wait?: boolean } = {},
): Promise<void> {
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  if (opts.wait ?? true) await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/login');
}

/** Waits for a success/info toast (the app's single feedback channel). */
export const toast = (page: Page, text: RegExp) =>
  expect(page.getByRole('status').getByText(text).first()).toBeVisible();

/** Authenticator-app equivalent: the current TOTP code for a base32 secret. */
export const totpNow = (secretB32: string, offsetSteps = 0): string =>
  totpAt(base32Decode(secretB32), stepFor(Date.now()) + offsetSteps);

export const tomorrow = (): string => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
