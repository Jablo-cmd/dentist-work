import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { E2E } from '../env';
import { signIn, signOut, toast, tomorrow } from '../helpers';

// One practice's whole day, end to end, through the real UI, API, database and object storage.
test.describe.configure({ mode: 'serial' });

const sfx = Date.now().toString().slice(-5);
const practice = `E2E Practice ${sfx}`;
const dentistEmail = `dentist${sfx}@e2e.invalid`;
const tempPassword = 'Temp-Dentist-Pass-123';
let patientUrl = '';

test('owner sets up a practice and a dentist', async ({ page }) => {
  await signIn(page, E2E.ownerEmail, E2E.ownerPassword);
  await page.waitForURL('/');
  await page.goto('/practices');
  await page.getByRole('button', { name: 'Add practice' }).click();
  await page.fill('#name', practice);
  await page.fill('#code', `E2E-${sfx}`);
  await page.getByRole('button', { name: 'Create practice' }).click();
  await toast(page, /Practice created/);

  await page.goto('/users');
  await page.getByRole('button', { name: 'Add staff member' }).click();
  await page.fill('#displayName', 'Dr Synthetic');
  await page.fill('#email', dentistEmail);
  await page.selectOption('#role', 'DENTIST');
  await page.selectOption('#practiceId', { label: practice });
  await page.fill('#temporaryPassword', tempPassword);
  await page.getByRole('button', { name: 'Create account' }).click();
  await toast(page, /User created/);
});

test('reception-style patient registration, search and medical history', async ({ page }) => {
  await signIn(page, E2E.ownerEmail, E2E.ownerPassword);
  await page.goto('/patients/new');
  await page.selectOption('#practiceId', { label: practice });
  await page.fill('#firstName', 'Playwright');
  await page.fill('#lastName', 'Syntheticson');
  await page.fill('#dateOfBirth', '1990-05-17');
  await page.fill('#mobilePhone', '082 000 0099');
  await page.getByRole('button', { name: 'Register patient' }).click();
  await page.getByRole('link', { name: 'Open patient record' }).click();
  await page.waitForURL(/\/patients\/[0-9a-f-]{36}$/);
  patientUrl = page.url();
  await expect(page.getByRole('heading', { name: 'Playwright Syntheticson' })).toBeVisible();

  await page.goto('/patients');
  await page.fill('#q', 'Playwright Synth');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('link', { name: /Syntheticson, Playwright/ }).first()).toBeVisible();

  await page.goto(patientUrl);
  await page.getByRole('tab', { name: 'Medical history and allergies' }).click();
  await page.fill('#al-sub', 'Synthetic penicillin');
  await page.selectOption('#al-sev', 'SEVERE');
  await page.getByRole('button', { name: 'Add allergy' }).click();
  await expect(page.getByText(/1 severe allerg/)).toBeVisible();
});

test('a duplicate registration is flagged for human review, not merged', async ({ page }) => {
  await signIn(page, E2E.ownerEmail, E2E.ownerPassword);
  await page.goto('/patients/new');
  await page.selectOption('#practiceId', { label: practice });
  await page.fill('#firstName', 'Playwright');
  await page.fill('#lastName', 'Syntheticson');
  await page.fill('#dateOfBirth', '1990-05-17');
  await page.getByRole('button', { name: 'Register patient' }).click();
  await expect(page.getByText(/Possible duplicate/)).toBeVisible();
  await page.goto('/patients/duplicates');
  await expect(page.getByText('Same name and date of birth')).toBeVisible();
  await page.getByRole('button', { name: 'Different people' }).first().click();
  await toast(page, /Marked as different people/);
});

test('clinical note lifecycle: draft, finalise, amend; chart; plan; imaging', async ({ page }) => {
  await signIn(page, E2E.ownerEmail, E2E.ownerPassword);
  await page.goto(`${patientUrl}/clinical`);
  await page.selectOption('#enc-practice', { label: practice });
  await page.getByRole('button', { name: 'Start new encounter' }).click();
  await page.locator('textarea[name=body]').first().fill('SYNTHETIC clinical note v1');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await toast(page, /Draft saved/);
  await page.locator('textarea[name=body]').first().fill('SYNTHETIC clinical note v2');
  await page.getByRole('button', { name: 'Save draft' }).click();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Finalise', exact: true }).click();
  await toast(page, /finalised/);
  // After finalising there is no editable draft box for the original note.
  await expect(page.getByRole('button', { name: 'Save draft' })).toHaveCount(0);
  await page.fill('input[name=reason]', 'Correcting tooth number');
  await page.getByRole('button', { name: 'Record amendment' }).click();
  await toast(page, /Amendment recorded/);
  await expect(page.getByText(/Version history \(3\)/)).toBeVisible();

  await page.getByRole('tab', { name: 'Dental chart' }).click();
  await page.getByRole('button', { name: /^Tooth 26/ }).click();
  await page.selectOption('#ch-cond', 'CARIES');
  await page.getByRole('button', { name: 'Add finding' }).click();
  await expect(page.getByText('Tooth 26', { exact: false }).first()).toBeVisible();

  await page.getByRole('tab', { name: 'Treatment plans' }).click();
  await page.selectOption('#tp-practice', { label: practice });
  await page.fill('#tp-title', 'E2E plan');
  await page.fill('#tp-desc', 'Restoration');
  await page.fill('#tp-amount', '1500.50');
  await page.getByRole('button', { name: 'Create plan' }).click();
  await expect(page.getByText('est. R1500.50')).toBeVisible();
  await page.getByRole('button', { name: 'accepted' }).first().click();
  await expect(page.getByText('accepted').first()).toBeVisible();

  await page.getByRole('tab', { name: 'Imaging and documents' }).click();
  await page.setInputFiles('#im-file', {
    name: 'scan.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from(`SYNTHETIC-E2E-${sfx}`),
    ]),
  });
  await page.selectOption('#im-prac', { label: practice });
  await page.getByRole('button', { name: 'Upload' }).click();
  await toast(page, /File uploaded/);
  await expect(page.getByRole('link', { name: 'View', exact: true }).first()).toBeVisible();
  // The stored file is served back through an authorised request.
  const href = await page
    .getByRole('link', { name: 'View', exact: true })
    .first()
    .getAttribute('href');
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('image/jpeg');
  expect((await res.body()).toString('latin1')).toContain(`SYNTHETIC-E2E-${sfx}`);
});

test('a non-image upload is rejected even when named .jpg', async ({ page }) => {
  await signIn(page, E2E.ownerEmail, E2E.ownerPassword);
  await page.goto(`${patientUrl}/clinical`);
  await page.getByRole('tab', { name: 'Imaging and documents' }).click();
  await page.setInputFiles('#im-file', {
    name: 'evil.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('MZ not an image at all'),
  });
  await page.selectOption('#im-prac', { label: practice });
  await page.getByRole('button', { name: 'Upload' }).click();
  await toast(page, /Unsupported file type/);
});

test('a file flagged by the malware scan is rejected and shown as quarantined, never viewable', async ({
  page,
}) => {
  await signIn(page, E2E.ownerEmail, E2E.ownerPassword);
  await page.goto(`${patientUrl}/clinical`);
  await page.getByRole('tab', { name: 'Imaging and documents' }).click();
  await page.setInputFiles('#im-file', {
    name: 'flagged.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from('FAKE-MALWARE-TEST-MARKER'),
    ]),
  });
  await page.selectOption('#im-prac', { label: practice });
  await page.getByRole('button', { name: 'Upload' }).click();
  await toast(page, /rejected by the security scan/);
  await page.reload();
  await page.getByRole('tab', { name: 'Imaging and documents' }).click();
  await expect(page.getByText('quarantined')).toBeVisible();
  // The only viewable file is the clean one uploaded earlier.
  await expect(page.getByRole('link', { name: 'View', exact: true })).toHaveCount(1);
});

test('appointment: book, see conflict protection, check in', async ({ page }) => {
  await signIn(page, E2E.ownerEmail, E2E.ownerPassword);
  await page.goto('/appointments');
  await page.selectOption('#f-practice', { label: practice });
  const book = async () => {
    await page.getByRole('button', { name: 'Book appointment' }).click();
    await page.fill('#b-patient', 'Syntheticson');
    await page
      .getByRole('button', { name: /Syntheticson, Playwright/ })
      .first()
      .click();
    await page.fill('#b-date', tomorrow());
    await page.fill('#b-time', '09:00');
    await page.getByRole('button', { name: 'Book', exact: true }).click();
  };
  await book();
  await toast(page, /Appointment booked/);
  await page.fill('input[aria-label=Date]', tomorrow());
  await expect(page.getByText(/09:00–09:30/)).toBeVisible();
  // The same slot cannot be double-booked (practitioner and patient are both protected).
  await book();
  await expect(
    page.getByRole('alert').filter({ hasText: /already (has an appointment|booked)/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Check in' }).click();
  await toast(page, /checked in/);
});

test('billing: invoice, payment, reversal; reports reflect it', async ({ page }) => {
  await signIn(page, E2E.ownerEmail, E2E.ownerPassword);
  await page.goto(`${patientUrl}/billing`);
  await page.selectOption('#inv-practice', { label: practice });
  await page.fill('#l-d-0', 'E2E consultation');
  await page.fill('#l-p-0', '450.00');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await toast(page, /Draft invoice created/);
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Post invoice' }).click();
  await toast(page, /Invoice posted/);
  await expect(page.getByText(/INV-\d{6}/).first()).toBeVisible();
  await page.selectOption('#pay-practice', { label: practice });
  await page.fill('#pay-amount', '450.00');
  await page.selectOption('#pay-inv', { index: 1 });
  await page.getByRole('button', { name: 'Record payment' }).click();
  await toast(page, /Payment recorded/);
  await expect(page.getByText('Settled')).toBeVisible();
  page.once('dialog', (d) => void d.accept('Card chargeback received'));
  await page.getByRole('button', { name: 'Reverse' }).click();
  await toast(page, /Payment reversed/);
  await expect(page.getByText('Patient owes')).toBeVisible();

  // Printable documents: statement balance matches the account, invoice shows its lines; both accessible.
  await page.goto(`${patientUrl}/statement`);
  await expect(page.getByTestId('statement-balance')).toContainText(/Amount due: R\s450[,.]00/);
  await expect(page.getByText('Reversed — not counted')).toBeVisible();
  const axe = (label: string) =>
    new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
      .then((r) =>
        expect(
          r.violations
            .filter((v) => v.impact === 'serious' || v.impact === 'critical')
            .map((v) => v.id),
          label,
        ).toEqual([]),
      );
  await axe('statement');
  await page.goto(`${patientUrl}/billing`);
  await page
    .getByRole('link', { name: /View \/ print invoice/ })
    .first()
    .click();
  await expect(page.getByRole('article', { name: /Invoice INV-\d{6}/ })).toContainText(
    'E2E consultation',
  );
  await expect(page.getByRole('button', { name: 'Print / save as PDF' })).toBeVisible();
  await axe('invoice document');

  await page.goto('/reports');
  await expect(page.getByText('Financial summary')).toBeVisible();
  await expect(page.getByText(/R\s450[,.]00/).first()).toBeVisible();
});

test('audit trail shows the activity above, without clinical content', async ({ page }) => {
  await signIn(page, E2E.ownerEmail, E2E.ownerPassword);
  await page.goto('/audit');
  await expect(page.getByRole('table', { name: 'Audit events' })).toBeVisible();
  await page.selectOption('#a-area', 'clinical_record');
  await expect(page.getByText('clinical_record.finalise').first()).toBeVisible();
  await page.selectOption('#a-area', 'payment');
  await expect(page.getByText('payment.record').first()).toBeVisible();
  await page.selectOption('#a-area', 'imaging');
  await expect(page.getByText('imaging.scan').first()).toBeVisible(); // scan verdicts are audited
  await expect(page.locator('body')).not.toContainText('SYNTHETIC clinical note');
});

test('a new dentist must change the temporary password, then sees a role-limited UI', async ({
  page,
}) => {
  await signIn(page, dentistEmail, tempPassword);
  await page.waitForURL('**/change-password');
  await page.fill('#currentPassword', tempPassword);
  await page.fill('#newPassword', 'Dentist-New-Passw0rd-77');
  await page.fill('#confirm', 'Dentist-New-Passw0rd-77');
  await page.getByRole('button', { name: 'Change password' }).click();
  await page.waitForURL('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav.getByRole('link', { name: 'Appointments' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Staff' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Audit trail' })).toHaveCount(0);
  await page.goto(`${patientUrl}/billing`);
  await expect(page.getByText('Not available')).toBeVisible();
  await signOut(page);
});
