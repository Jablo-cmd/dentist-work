import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { ORIGIN, TEST_DATABASE_URL, TEST_PASSWORD, createTestApp, resetAndSeed } from './helpers';

describe('session cookie hardening (integration)', () => {
  const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  afterAll(async () => prisma.$disconnect());

  const login = async (app: NestExpressApplication, email: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .send({ email, password: TEST_PASSWORD });

  it('uses the __Host- prefix with Secure, HttpOnly, SameSite=Lax, Path=/ and no Domain when secure cookies are on', async () => {
    const app = await createTestApp({ COOKIE_SECURE: 'true' });
    const fx = await resetAndSeed(prisma);
    const res = await login(app, fx.users.owner.email).then((r) => r);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/^__Host-dpms_session=[A-Za-z0-9_-]{40,}/);
    expect(cookie).toMatch(/;\s*Path=\//);
    expect(cookie).toMatch(/;\s*Secure/);
    expect(cookie).toMatch(/;\s*HttpOnly/);
    expect(cookie).toMatch(/;\s*SameSite=Lax/);
    expect(cookie).not.toMatch(/Domain=/i); // required for the __Host- prefix: host-only
    await app.close();
  });

  it('issues a fresh token on every sign-in (no session fixation) and clears the cookie on sign-out', async () => {
    const app = await createTestApp({ COOKIE_SECURE: 'false' });
    const fx = await resetAndSeed(prisma);
    const token = (r: request.Response) =>
      /dpms_session=([^;]+)/.exec(String(r.headers['set-cookie']))![1]!;
    const [a, b] = [await login(app, fx.users.owner.email), await login(app, fx.users.owner.email)];
    expect(token(a)).not.toBe(token(b));
    const out = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', ORIGIN)
      .set('Cookie', `dpms_session=${token(a)}`);
    expect(out.status).toBe(204);
    expect(String(out.headers['set-cookie'])).toMatch(/dpms_session=;/); // cleared
    // an attacker-chosen cookie value is never adopted as a session
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', 'dpms_session=attacker-chosen-value')
      .expect(401);
    await app.close();
  });
});
