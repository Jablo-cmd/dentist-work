import { expect, test } from '@playwright/test';
import { E2E } from '../env';
import { signIn } from '../helpers';

const PUNCHLINE = 'Better care. Smarter practice.';
const PAGES = [
  '/',
  '/patients',
  '/appointments',
  '/reports',
  '/practices',
  '/users',
  '/audit',
  '/security',
];

test('brand: sign-in shows the product identity and the official punchline', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Nexus' })).toBeVisible();
  await expect(page.getByText('Dental Practice Management System', { exact: true })).toBeVisible();
  await expect(page.getByRole('contentinfo')).toContainText(PUNCHLINE);
});

test('sign-in page sends enquiries to info@aurisnexus.co.za', async ({ page }) => {
  await page.goto('/login');
  const link = page.getByRole('link', { name: 'info@aurisnexus.co.za' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'mailto:info@aurisnexus.co.za');
});

test.describe('enquiry form', () => {
  test('validates before sending, and falls back to the address when email is unavailable', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Send an enquiry' }).click();
    const dialog = page.getByRole('dialog', { name: 'Enquire about Nexus' });
    await expect(dialog).toBeVisible();
    // empty submit: friendly validation, nothing sent
    await dialog.getByRole('button', { name: 'Send enquiry' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Please enter your name');
    // a real-looking enquiry: this stack has no mail server configured, so the API answers 503
    await dialog.getByLabel('Your name').fill('Synthetic Visitor');
    await dialog.getByLabel('Email address').fill('visitor@example.invalid');
    await dialog.getByLabel('Message').fill('We would like to see a demonstration of the system.');
    await dialog.getByRole('button', { name: 'Send enquiry' }).click();
    const alert = dialog.getByRole('alert');
    await expect(alert).toContainText('could not be sent');
    await expect(alert.getByRole('link', { name: 'info@aurisnexus.co.za' })).toHaveAttribute(
      'href',
      'mailto:info@aurisnexus.co.za',
    );
    // Escape closes the dialog
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('the spam-trap field is not reachable by people or assistive technology', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Send an enquiry' }).click();
    // exposed to neither assistive technology (aria-hidden) nor sighted users (zero-size, off-screen)
    await expect(page.getByRole('textbox', { name: 'Website' })).toHaveCount(0);
    const trap = page.locator('input[name=website]');
    await expect(trap).toHaveAttribute('tabindex', '-1'); // not reachable with the keyboard
    const box = (await trap.boundingBox())!;
    expect(box.x + box.width).toBeLessThan(0); // positioned entirely off-screen
  });
});

test('brand: the official punchline is in the footer of every authenticated page', async ({
  page,
}) => {
  await signIn(page, E2E.ownerEmail, E2E.ownerPassword);
  for (const path of PAGES) {
    await page.goto(path);
    await expect(page.getByRole('contentinfo'), path).toContainText(PUNCHLINE);
  }
});

test('brand: the punchline is not printed on documents', async ({ page }) => {
  await signIn(page, E2E.ownerEmail, E2E.ownerPassword);
  await page.goto('/patients');
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('contentinfo')).toBeHidden();
});

test('sidebar: grouped navigation, collapse to icons and back (preference remembered)', async ({
  page,
}) => {
  await signIn(page, E2E.ownerEmail, E2E.ownerPassword);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav.getByText('Practice', { exact: true })).toBeVisible();
  await expect(nav.getByText('Management', { exact: true })).toBeVisible();
  const aside = page.locator('aside');
  const wide = (await aside.boundingBox())!.width;
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect.poll(async () => (await aside.boundingBox())!.width).toBeLessThan(wide - 100);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect.poll(async () => (await aside.boundingBox())!.width).toBeGreaterThan(200);
});

test.describe('responsive layouts', () => {
  for (const [name, size] of [
    ['mobile', { width: 390, height: 844 }],
    ['tablet', { width: 820, height: 1180 }],
    ['laptop', { width: 1366, height: 768 }],
  ] as const) {
    test(`${name}: no horizontal page scroll on main screens`, async ({ page }) => {
      await page.setViewportSize(size);
      await signIn(page, E2E.ownerEmail, E2E.ownerPassword);
      for (const path of ['/', '/patients', '/appointments', '/reports']) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        const overflow = (await page.evaluate(
          'document.documentElement.scrollWidth - document.documentElement.clientWidth',
        )) as number;
        expect(overflow, `${name} ${path}`).toBeLessThanOrEqual(0);
      }
    });
  }

  test('mobile: navigation opens as a drawer and closes after choosing a page', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, E2E.ownerEmail, E2E.ownerPassword);
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeHidden();
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Patients' })
      .click();
    await page.waitForURL('**/patients');
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeHidden();
  });

  test('tablet: the dental chart is fully usable (teeth are at least 36px touch targets)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await signIn(page, E2E.ownerEmail, E2E.ownerPassword);
    await page.goto('/patients');
    await page.fill('#q', 'Axe Synth');
    await page.getByRole('button', { name: 'Search' }).click();
    await page
      .getByRole('link', { name: /Syntheticson, Axe/ })
      .first()
      .click();
    await page.getByRole('link', { name: 'Clinical record' }).click();
    await page.getByRole('tab', { name: 'Dental chart' }).click();
    const teeth = page.getByRole('button', { name: /^Tooth \d\d/ });
    await expect(teeth).toHaveCount(32);
    for (const i of [0, 7, 8, 15, 16, 31]) {
      const box = (await teeth.nth(i).boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(36);
      expect(box.height).toBeGreaterThanOrEqual(36);
    }
  });
});
