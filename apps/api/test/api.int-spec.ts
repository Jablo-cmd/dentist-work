import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import {
  ORIGIN,
  TEST_DATABASE_URL,
  TEST_PASSWORD,
  createTestApp,
  loginAgent,
  resetAndSeed,
  type Fixtures,
} from './helpers';

describe('API (integration, real PostgreSQL)', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  let fx: Fixtures;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    fx = await resetAndSeed(prisma);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());

  describe('health', () => {
    it('liveness is public and does not depend on the database', async () => {
      const res = await http().get('/api/v1/health').expect(200);
      expect(res.body).toMatchObject({ status: 'ok', service: 'dpms-api' });
      expect(res.headers['x-request-id']).toBeTruthy();
    });
    it('readiness reports database up', async () => {
      const res = await http().get('/api/v1/health/ready').expect(200);
      expect(res.body.status).toBe('ready');
      expect(res.body.checks.database.status).toBe('up');
    });
  });

  describe('secure defaults', () => {
    it('sets security headers, no-store, and hides x-powered-by', async () => {
      const res = await http().get('/api/v1/health');
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    });
    it('only allows CORS from configured origins', async () => {
      const ok = await http()
        .options('/api/v1/auth/me')
        .set('Origin', ORIGIN)
        .set('Access-Control-Request-Method', 'GET');
      expect(ok.headers['access-control-allow-origin']).toBe(ORIGIN);
      const bad = await http()
        .options('/api/v1/auth/me')
        .set('Origin', 'https://evil.example')
        .set('Access-Control-Request-Method', 'GET');
      expect(bad.headers['access-control-allow-origin']).toBeUndefined();
    });
    it('returns the standard error envelope with a correlation id and no internals', async () => {
      const res = await http()
        .get('/api/v1/nope')
        .set('X-Request-Id', 'client-req-12345')
        .expect(404);
      expect(res.body.error).toMatchObject({ code: 'NOT_FOUND', requestId: 'client-req-12345' });
    });
    it('rejects unauthenticated access to protected routes', async () => {
      const res = await http().get('/api/v1/practices').expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });
    it('rejects state-changing requests without a trusted Origin (CSRF)', async () => {
      const noOrigin = await http()
        .post('/api/v1/auth/login')
        .send({ email: fx.users.owner.email, password: TEST_PASSWORD })
        .expect(403);
      expect(noOrigin.body.error.code).toBe('CSRF_REJECTED');
      await http()
        .post('/api/v1/auth/login')
        .set('Origin', 'https://evil.example')
        .send({ email: fx.users.owner.email, password: TEST_PASSWORD })
        .expect(403);
    });
  });

  describe('authentication', () => {
    it('logs in, sets an HttpOnly SameSite cookie, never returns secrets, and audits', async () => {
      const { agent, res } = await loginAgent(app, fx.users.owner.email);
      expect(res.status).toBe(200);
      const cookie = String(res.headers['set-cookie']);
      expect(cookie).toMatch(/dpms_session=/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|"hash"|token/i);
      const me = await agent.get('/api/v1/auth/me').expect(200);
      expect(me.body.user.email).toBe(fx.users.owner.email);
      expect(me.body.user.permissions).toContain('practice.manage');
      expect(
        await prisma.auditEvent.count({ where: { action: 'auth.login', outcome: 'SUCCESS' } }),
      ).toBe(1);
    });

    it('stores only a hash of the session token', async () => {
      const { res } = await loginAgent(app, fx.users.owner.email);
      const token = /dpms_session=([^;]+)/.exec(String(res.headers['set-cookie']))![1]!;
      const rows = await prisma.session.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.tokenHash).not.toContain(token);
    });

    it('gives identical responses for unknown user, wrong password, and inactive user', async () => {
      const bodies = [];
      for (const [email, pw] of [
        ['ghost@test.invalid', TEST_PASSWORD],
        [fx.users.owner.email, 'wrong-password-123'],
        [fx.users.inactive.email, TEST_PASSWORD],
      ] as const) {
        const { res } = await loginAgent(app, email, pw);
        expect(res.status).toBe(401);
        bodies.push(res.body.error.code + res.body.error.message);
      }
      expect(new Set(bodies).size).toBe(1);
      expect(
        await prisma.auditEvent.count({
          where: { action: 'auth.login', outcome: { not: 'SUCCESS' } },
        }),
      ).toBe(3);
    });

    it('locks the account after repeated failures, even for the correct password', async () => {
      for (let i = 0; i < 3; i++)
        await loginAgent(app, fx.users.recepA.email, 'wrong-password-123');
      const { res } = await loginAgent(app, fx.users.recepA.email);
      expect(res.status).toBe(401);
      const u = await prisma.user.findUniqueOrThrow({ where: { id: fx.users.recepA.id } });
      expect(u.lockedUntil).not.toBeNull();
    });

    it('rejects malformed login input with field issues', async () => {
      const res = await http()
        .post('/api/v1/auth/login')
        .set('Origin', ORIGIN)
        .send({ email: 'nope' })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.issues.length).toBeGreaterThan(0);
    });

    it('logout revokes the session server-side', async () => {
      const { agent, res } = await loginAgent(app, fx.users.owner.email);
      const cookie = String(res.headers['set-cookie']).split(';')[0]!;
      await agent.post('/api/v1/auth/logout').set('Origin', ORIGIN).expect(204);
      // Replaying the old cookie must fail: revocation is not just cookie deletion.
      await http().get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
    });

    it('deactivating a user invalidates existing sessions', async () => {
      const { agent } = await loginAgent(app, fx.users.recepA.email);
      await agent.get('/api/v1/auth/me').expect(200);
      await prisma.user.update({ where: { id: fx.users.recepA.id }, data: { isActive: false } });
      await agent.get('/api/v1/auth/me').expect(401);
    });

    it('expires idle sessions', async () => {
      const { agent } = await loginAgent(app, fx.users.owner.email);
      await prisma.session.updateMany({
        data: { lastSeenAt: new Date(Date.now() - 2 * 60 * 60_000) },
      });
      await agent.get('/api/v1/auth/me').expect(401);
    });

    it('rejects forged session cookies', async () => {
      await http().get('/api/v1/auth/me').set('Cookie', 'dpms_session=forged-token').expect(401);
    });
  });

  describe('authorisation and practice boundaries', () => {
    it('practice-scoped user sees only their own practice', async () => {
      const { agent } = await loginAgent(app, fx.users.recepA.email);
      const res = await agent.get('/api/v1/practices').expect(200);
      expect(res.body.data.map((p: { id: string }) => p.id)).toEqual([fx.practiceA]);
      expect(res.body.meta.total).toBe(1);
    });

    it('cross-practice read is denied as not-found and audited (no IDOR)', async () => {
      const { agent } = await loginAgent(app, fx.users.recepA.email);
      await agent.get(`/api/v1/practices/${fx.practiceA}`).expect(200);
      await agent.get(`/api/v1/practices/${fx.practiceB}`).expect(404);
      expect(
        await prisma.auditEvent.count({
          where: { action: 'access.denied', targetId: fx.practiceB },
        }),
      ).toBe(1);
    });

    it('organisation owner sees all practices', async () => {
      const { agent } = await loginAgent(app, fx.users.owner.email);
      const res = await agent.get('/api/v1/practices').expect(200);
      expect(res.body.meta.total).toBe(2);
    });

    it('a practice-scoped user cannot create practices or read the audit log', async () => {
      const { agent } = await loginAgent(app, fx.users.recepA.email);
      await agent
        .post('/api/v1/practices')
        .set('Origin', ORIGIN)
        .send({ name: 'Rogue Practice', code: 'ROGUE' })
        .expect(403);
      await agent.get('/api/v1/audit-events').expect(403);
      expect(await prisma.practice.count()).toBe(2);
      expect(
        await prisma.auditEvent.count({
          where: { action: 'access.denied', actorUserId: fx.users.recepA.id },
        }),
      ).toBe(2);
    });

    it('owner creates a practice with validation, conflict handling and an audit event', async () => {
      const { agent } = await loginAgent(app, fx.users.owner.email);
      const created = await agent
        .post('/api/v1/practices')
        .set('Origin', ORIGIN)
        .send({ name: 'Synthetic Practice C', code: 'syn-c' })
        .expect(201);
      expect(created.body).toMatchObject({
        name: 'Synthetic Practice C',
        code: 'SYN-C',
        isActive: true,
      });
      await agent
        .post('/api/v1/practices')
        .set('Origin', ORIGIN)
        .send({ name: 'Another', code: 'SYN-C' })
        .expect(409);
      await agent
        .post('/api/v1/practices')
        .set('Origin', ORIGIN)
        .send({ name: 'x', code: '!!' })
        .expect(400);
      expect(
        await prisma.auditEvent.count({
          where: { action: 'practice.create', practiceId: created.body.id },
        }),
      ).toBe(1);
    });

    it('lists audit events for owners, paginated and without metadata', async () => {
      const { agent } = await loginAgent(app, fx.users.owner.email);
      const res = await agent.get('/api/v1/audit-events?pageSize=1').expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.pageSize).toBe(1);
      expect(res.body.data[0]).not.toHaveProperty('metadata');
      await agent.get('/api/v1/audit-events?pageSize=1000').expect(400);
    });

    it('rejects non-UUID ids before touching the database', async () => {
      const { agent } = await loginAgent(app, fx.users.owner.email);
      await agent.get('/api/v1/practices/not-a-uuid').expect(400);
    });
  });

  describe('database integrity', () => {
    it('audit events are append-only at the database layer', async () => {
      await loginAgent(app, fx.users.owner.email);
      await expect(prisma.auditEvent.updateMany({ data: { action: 'tampered' } })).rejects.toThrow(
        /append-only/,
      );
      await expect(prisma.auditEvent.deleteMany({})).rejects.toThrow(/append-only/);
    });
    it('enforces lower-case emails and practice code format', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE users SET email = 'UPPER@TEST.INVALID' WHERE id = '${fx.users.owner.id}'`,
        ),
      ).rejects.toThrow();
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE practices SET code = 'bad code' WHERE id = '${fx.practiceA}'`,
        ),
      ).rejects.toThrow();
    });
    it('prevents duplicate organisation-wide role grants (partial unique index)', async () => {
      await expect(
        prisma.userRoleAssignment.create({
          data: { userId: fx.users.owner.id, role: 'ORGANISATION_OWNER', practiceId: null },
        }),
      ).rejects.toThrow();
    });
  });
});
