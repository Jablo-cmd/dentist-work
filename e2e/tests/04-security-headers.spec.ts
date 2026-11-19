import { expect, test } from '@playwright/test';
import { E2E } from '../env';

test('web pages carry hardening headers', async ({ request }) => {
  const h = (await request.get('/login')).headers();
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['referrer-policy']).toBe('no-referrer');
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['content-security-policy']).toContain("object-src 'none'");
  expect(h['cross-origin-resource-policy']).toBe('same-origin');
  expect(h['x-powered-by']).toBeUndefined();
});

test('API responses are uncacheable and locked down', async ({ request }) => {
  const r = await request.get(`${E2E.apiUrl}/api/v1/health`);
  expect(r.headers()['cache-control']).toBe('no-store');
  expect(r.headers()['content-security-policy']).toContain("default-src 'none'");
  expect(r.headers()['x-powered-by']).toBeUndefined();
});

test('unauthenticated visitors are sent to sign-in and cannot read API data', async ({
  page,
  request,
}) => {
  await page.goto('/patients');
  await page.waitForURL('**/login');
  expect((await request.get('/api/v1/patients?q=anything')).status()).toBe(401);
});

test('cross-site state-changing requests are refused (CSRF origin check)', async ({ request }) => {
  const r = await request.post(`${E2E.apiUrl}/api/v1/auth/login`, {
    headers: { Origin: 'https://evil.example' },
    data: { email: E2E.ownerEmail, password: E2E.ownerPassword },
  });
  expect(r.status()).toBe(403);
  expect((await r.json()).error.code).toBe('CSRF_REJECTED');
});
