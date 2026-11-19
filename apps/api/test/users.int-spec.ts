import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { SessionPurgeService } from '../src/auth/session-purge.service';
import {
  ORIGIN,
  TEST_DATABASE_URL,
  TEST_PASSWORD,
  createTestApp,
  loginAgent,
  resetAndSeed,
  type Fixtures,
} from './helpers';

const NEW_PW = 'Another-Synthetic-Pass-77';

describe('user management (integration)', () => {
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
  const post = (a: ReturnType<typeof request.agent>, url: string, body?: object) =>
    a.post(url).set('Origin', ORIGIN).send(body);

  it('owner creates a user with a forced password change, audited, without leaking secrets', async () => {
    const { agent } = await loginAgent(app, fx.users.owner.email);
    const res = await post(agent, '/api/v1/users', {
      email: 'New.Dentist@test.invalid',
      displayName: 'New Dentist',
      temporaryPassword: 'Temporary-Synthetic-1234',
      assignments: [{ role: 'DENTIST', practiceId: fx.practiceA }],
    }).expect(201);
    expect(res.body.email).toBe('new.dentist@test.invalid');
    expect(res.body.mustChangePassword).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/hash|Temporary/i);
    expect(await prisma.auditEvent.count({ where: { action: 'user.create' } })).toBe(1);
    const dup = await post(agent, '/api/v1/users', {
      email: 'new.dentist@test.invalid',
      displayName: 'Dup',
      temporaryPassword: 'Temporary-Synthetic-1234',
      assignments: [{ role: 'DENTIST', practiceId: fx.practiceA }],
    });
    expect(dup.status).toBe(409);
  });

  it('forced password change blocks everything except change-password/me/logout', async () => {
    const { agent: owner } = await loginAgent(app, fx.users.owner.email);
    await post(owner, '/api/v1/users', {
      email: 'fresh@test.invalid',
      displayName: 'Fresh User',
      temporaryPassword: 'Temporary-Synthetic-1234',
      assignments: [{ role: 'RECEPTIONIST', practiceId: fx.practiceA }],
    }).expect(201);
    const { agent, res } = await loginAgent(app, 'fresh@test.invalid', 'Temporary-Synthetic-1234');
    expect(res.status).toBe(200);
    expect(res.body.user.mustChangePassword).toBe(true);
    const blocked = await agent.get('/api/v1/practices').expect(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    await agent.get('/api/v1/auth/me').expect(200);
    // wrong current password, weak/related new password, then success
    await post(agent, '/api/v1/auth/change-password', {
      currentPassword: 'nope-nope-nope',
      newPassword: NEW_PW,
    }).expect(400);
    await post(agent, '/api/v1/auth/change-password', {
      currentPassword: 'Temporary-Synthetic-1234',
      newPassword: 'short',
    }).expect(400);
    await post(agent, '/api/v1/auth/change-password', {
      currentPassword: 'Temporary-Synthetic-1234',
      newPassword: 'fresh-fresh-fresh-1',
    }).expect(400);
    await post(agent, '/api/v1/auth/change-password', {
      currentPassword: 'Temporary-Synthetic-1234',
      newPassword: NEW_PW,
    }).expect(204);
    await agent.get('/api/v1/practices').expect(200);
    expect(
      (await loginAgent(app, 'fresh@test.invalid', 'Temporary-Synthetic-1234')).res.status,
    ).toBe(401);
    expect((await loginAgent(app, 'fresh@test.invalid', NEW_PW)).res.status).toBe(200);
  });

  it('changing password revokes other sessions but keeps the current one', async () => {
    const a = await loginAgent(app, fx.users.recepA.email);
    const b = await loginAgent(app, fx.users.recepA.email);
    await post(a.agent, '/api/v1/auth/change-password', {
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PW,
    }).expect(204);
    await a.agent.get('/api/v1/auth/me').expect(200);
    await b.agent.get('/api/v1/auth/me').expect(401);
  });

  describe('privilege-escalation boundaries', () => {
    it('practice admin can create staff only inside their own practice', async () => {
      const { agent } = await loginAgent(app, fx.users.adminA.email);
      const mk = (role: string, practiceId: string | null) =>
        post(agent, '/api/v1/users', {
          email: `${role.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@test.invalid`,
          displayName: 'Staff Member',
          temporaryPassword: 'Temporary-Synthetic-1234',
          assignments: [{ role, practiceId }],
        });
      expect((await mk('RECEPTIONIST', fx.practiceA)).status).toBe(201);
      expect((await mk('RECEPTIONIST', fx.practiceB)).status).toBe(403); // other practice
      expect((await mk('PRACTICE_ADMINISTRATOR', fx.practiceA)).status).toBe(403); // equal privilege
      expect((await mk('ORGANISATION_OWNER', null)).status).toBe(403); // org-wide
    });

    it('practice admin cannot see or administer users outside their practice', async () => {
      const { agent } = await loginAgent(app, fx.users.adminA.email);
      const list = await agent.get('/api/v1/users').expect(200);
      const ids = list.body.data.map((u: { id: string }) => u.id);
      expect(ids).toContain(fx.users.recepA.id);
      expect(ids).not.toContain(fx.users.recepB.id);
      expect(ids).not.toContain(fx.users.owner.id);
      await agent
        .patch(`/api/v1/users/${fx.users.recepB.id}`)
        .set('Origin', ORIGIN)
        .send({ isActive: false })
        .expect(404);
      await agent
        .patch(`/api/v1/users/${fx.users.owner.id}`)
        .set('Origin', ORIGIN)
        .send({ isActive: false })
        .expect(404);
      await post(agent, `/api/v1/users/${fx.users.recepB.id}/reset-password`, {
        temporaryPassword: 'Temporary-Synthetic-1234',
      }).expect(404);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: fx.users.recepB.id } })).isActive,
      ).toBe(true);
    });

    it('a receptionist cannot use user management at all', async () => {
      const { agent } = await loginAgent(app, fx.users.recepA.email);
      await agent.get('/api/v1/users').expect(403);
      await post(agent, '/api/v1/users', {
        email: 'x@test.invalid',
        displayName: 'X Y',
        temporaryPassword: 'Temporary-Synthetic-1234',
        assignments: [{ role: 'RECEPTIONIST', practiceId: fx.practiceA }],
      }).expect(403);
    });

    it('cannot grant roles in a practice from another organisation (practice not found)', async () => {
      const other = await prisma.organisation.create({ data: { name: 'Other Org' } });
      const foreign = await prisma.practice.create({
        data: { organisationId: other.id, name: 'Foreign', code: 'FOR-1' },
      });
      const { agent } = await loginAgent(app, fx.users.owner.email);
      await post(agent, '/api/v1/users', {
        email: 'x@test.invalid',
        displayName: 'X Y',
        temporaryPassword: 'Temporary-Synthetic-1234',
        assignments: [{ role: 'DENTIST', practiceId: foreign.id }],
      }).expect(404);
    });
  });

  describe('lifecycle', () => {
    it('deactivation revokes sessions immediately; last owner and self are protected', async () => {
      const victim = await loginAgent(app, fx.users.recepA.email);
      const { agent } = await loginAgent(app, fx.users.owner.email);
      await agent
        .patch(`/api/v1/users/${fx.users.recepA.id}`)
        .set('Origin', ORIGIN)
        .send({ isActive: false })
        .expect(200);
      await victim.agent.get('/api/v1/auth/me').expect(401);
      await agent
        .patch(`/api/v1/users/${fx.users.owner.id}`)
        .set('Origin', ORIGIN)
        .send({ isActive: false })
        .expect(409);
      const owner = await prisma.user.findUniqueOrThrow({
        where: { id: fx.users.owner.id },
        include: { roleAssignments: true },
      });
      await agent
        .delete(`/api/v1/users/${fx.users.owner.id}/assignments/${owner.roleAssignments[0]!.id}`)
        .set('Origin', ORIGIN)
        .expect(409);
    });

    it('role changes take effect immediately and are audited', async () => {
      const victim = await loginAgent(app, fx.users.recepA.email);
      await victim.agent.get('/api/v1/practices').expect(200);
      const { agent } = await loginAgent(app, fx.users.owner.email);
      const u = await prisma.user.findUniqueOrThrow({
        where: { id: fx.users.recepA.id },
        include: { roleAssignments: true },
      });
      await agent
        .delete(`/api/v1/users/${u.id}/assignments/${u.roleAssignments[0]!.id}`)
        .set('Origin', ORIGIN)
        .expect(200);
      await victim.agent.get('/api/v1/auth/me').expect(200); // still signed in...
      await victim.agent.get('/api/v1/practices').expect(403); // ...but no longer authorised
      await post(agent, `/api/v1/users/${u.id}/assignments`, {
        role: 'DENTIST',
        practiceId: fx.practiceB,
      }).expect(201);
      await post(agent, `/api/v1/users/${u.id}/assignments`, {
        role: 'DENTIST',
        practiceId: fx.practiceB,
      }).expect(409);
      expect(
        await prisma.auditEvent.count({
          where: { action: { in: ['user.role_grant', 'user.role_revoke'] } },
        }),
      ).toBe(2);
    });

    it('admin password reset forces change, unlocks, and revokes sessions', async () => {
      for (let i = 0; i < 3; i++)
        await loginAgent(app, fx.users.recepA.email, 'wrong-password-123');
      expect((await loginAgent(app, fx.users.recepA.email)).res.status).toBe(401); // locked
      const { agent } = await loginAgent(app, fx.users.owner.email);
      await post(agent, `/api/v1/users/${fx.users.recepA.id}/reset-password`, {
        temporaryPassword: 'Reset-Synthetic-Pass-9',
      }).expect(204);
      const r = await loginAgent(app, fx.users.recepA.email, 'Reset-Synthetic-Pass-9');
      expect(r.res.status).toBe(200);
      expect(r.res.body.user.mustChangePassword).toBe(true);
      await post(agent, `/api/v1/users/${fx.users.owner.id}/reset-password`, {
        temporaryPassword: 'Reset-Synthetic-Pass-9',
      }).expect(409);
    });
  });

  describe('practice update and session purge', () => {
    it('owner can rename/deactivate practices; others cannot', async () => {
      const { agent } = await loginAgent(app, fx.users.owner.email);
      const r = await agent
        .patch(`/api/v1/practices/${fx.practiceA}`)
        .set('Origin', ORIGIN)
        .send({ name: 'Synthetic Practice A2', isActive: false })
        .expect(200);
      expect(r.body).toMatchObject({ name: 'Synthetic Practice A2', isActive: false });
      await agent
        .patch(`/api/v1/practices/${fx.practiceA}`)
        .set('Origin', ORIGIN)
        .send({})
        .expect(400);
      const { agent: a } = await loginAgent(app, fx.users.adminA.email);
      await a
        .patch(`/api/v1/practices/${fx.practiceA}`)
        .set('Origin', ORIGIN)
        .send({ name: 'Hijack' })
        .expect(403);
    });

    it('purges long-expired sessions only', async () => {
      await loginAgent(app, fx.users.owner.email);
      await loginAgent(app, fx.users.recepA.email);
      const old = new Date(Date.now() - 10 * 24 * 3600_000);
      const first = await prisma.session.findFirstOrThrow();
      await prisma.session.update({ where: { id: first.id }, data: { expiresAt: old } });
      expect(await app.get(SessionPurgeService).purge()).toBe(1);
      expect(await prisma.session.count()).toBe(1);
    });
  });
});
