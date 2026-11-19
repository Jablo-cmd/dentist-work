import { expect, test } from '@playwright/test';
import { E2E } from '../env';
import { signIn, signOut, toast, totpNow } from '../helpers';

test.describe.configure({ mode: 'serial' });
let recoveryCodes: string[] = [];
let secret = '';

test('enrol an authenticator app and save recovery codes', async ({ page }) => {
  await signIn(page, E2E.mfaEmail, E2E.mfaPassword);
  await page.waitForURL('/');
  await page.goto('/security');
  await page.getByRole('button', { name: 'Set up authenticator' }).click();
  await expect(page.getByAltText('QR code for your authenticator app')).toBeVisible();
  secret = (await page.getByLabel('Manual entry key').innerText()).trim();
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  await page.fill('#mfa-code', '000000');
  await page.getByRole('button', { name: 'Confirm and turn on' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /not accepted/ })).toBeVisible();
  await page.fill('#mfa-code', totpNow(secret));
  await page.getByRole('button', { name: 'Confirm and turn on' }).click();
  await toast(page, /Two-factor authentication is now on/);
  recoveryCodes = await page
    .getByRole('list', { name: 'Recovery codes' })
    .getByRole('listitem')
    .allInnerTexts();
  expect(recoveryCodes).toHaveLength(10);
  await page.getByRole('button', { name: 'I have saved them' }).click();
  await signOut(page);
});

test('sign-in now needs the second factor; wrong codes are refused', async ({ page }) => {
  await signIn(page, E2E.mfaEmail, E2E.mfaPassword, { wait: false });
  await expect(page.getByLabel('Authenticator code')).toBeVisible();
  await expect(page).toHaveURL(/\/login/); // no session yet
  await page.fill('#code', '000000');
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /not accepted/ })).toBeVisible();
  await page.fill('#code', totpNow(secret, 1));
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await page.waitForURL('/');
  await signOut(page);
});

test('a recovery code works once', async ({ page }) => {
  const code = recoveryCodes[0]!;
  await signIn(page, E2E.mfaEmail, E2E.mfaPassword, { wait: false });
  await page.getByRole('button', { name: 'Use a recovery code' }).click();
  await page.fill('#code', code);
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await page.waitForURL('/');
  await signOut(page);

  await signIn(page, E2E.mfaEmail, E2E.mfaPassword, { wait: false });
  await page.getByRole('button', { name: 'Use a recovery code' }).click();
  await page.fill('#code', code);
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /not accepted/ })).toBeVisible();
});
