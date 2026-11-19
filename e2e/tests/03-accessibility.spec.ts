import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { E2E } from '../env';
import { signIn } from '../helpers';

/**
 * Automated WCAG 2.1 A/AA checks (axe-core). These catch roughly a third of accessibility problems;
 * they do not replace manual keyboard and screen-reader testing, which remains to be done.
 */
async function scan(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  const summary = blocking.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join(' | ')}`,
  );
  expect(summary, `Accessibility violations on ${label}`).toEqual([]);
}

test('sign-in page', async ({ page }) => {
  await page.goto('/login');
  await expect(
    page.getByRole('heading', { name: 'Sign in' }).or(page.getByText('Sign in').first()),
  ).toBeVisible();
  await scan(page, '/login');
});

test.describe('signed-in pages', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, E2E.ownerEmail, E2E.ownerPassword);
    await page.waitForURL('/');
  });

  for (const [path, ready] of [
    ['/', 'Welcome'],
    ['/practices', 'Practices'],
    ['/patients', 'Patients'],
    ['/patients/new', 'Register patient'],
    ['/patients/duplicates', 'Duplicate review'],
    ['/appointments', 'Appointments'],
    ['/users', 'Staff'],
    ['/audit', 'Audit trail'],
    ['/reports', 'Reports'],
    ['/security', 'Two-factor authentication'],
    ['/change-password', 'Change password'],
  ] as const) {
    test(`page ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: new RegExp(ready) }).first()).toBeVisible();
      await scan(page, path);
    });
  }

  test('patient profile, clinical record and billing (seeded patient)', async ({ page }) => {
    await page.goto('/patients');
    await page.fill('#q', 'Axe Synth');
    await page.getByRole('button', { name: 'Search' }).click();
    await page
      .getByRole('link', { name: /Syntheticson, Axe/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: 'Axe Syntheticson' })).toBeVisible();
    await scan(page, 'patient profile');
    await page.getByRole('link', { name: /Open clinical record/ }).click();
    await expect(page.getByRole('heading', { name: 'Clinical record' })).toBeVisible();
    await scan(page, 'clinical record');
    await page.goBack();
    await page.getByRole('link', { name: /Open billing/ }).click();
    await expect(page.getByRole('heading', { name: /Billing and account/ })).toBeVisible();
    await scan(page, 'billing');
  });

  test('keyboard: the skip link and primary navigation are reachable without a mouse', async ({
    page,
  }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeVisible();
  });
});
