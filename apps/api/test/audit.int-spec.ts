import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import {
  TEST_DATABASE_URL,
  createTestApp,
  loginAgent,
  resetAndSeed,
  type Fixtures,
} from './helpers';

describe('audit log API (integration)', () => {
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

  it('filters by action prefix, outcome, actor and date, and names the actor', async () => {
    await loginAgent(app, fx.users.recepA.email, 'wrong-password-123'); // auth.login FAILURE (actor known)
    await loginAgent(app, fx.users.recepA.email); // auth.login SUCCESS
    const { agent } = await loginAgent(app, fx.users.owner.email);
    const all = (await agent.get('/api/v1/audit-events?pageSize=100').expect(200)).body;
    expect(all.meta.total).toBeGreaterThanOrEqual(3);
    const auth = (await agent.get('/api/v1/audit-events?action=auth').expect(200)).body;
    expect(auth.data.every((e: { action: string }) => e.action.startsWith('auth'))).toBe(true);
    const failed = (await agent.get('/api/v1/audit-events?outcome=FAILURE').expect(200)).body;
    expect(failed.data).toHaveLength(1);
    expect(failed.data[0]).toMatchObject({
      action: 'auth.login',
      actorUserId: fx.users.recepA.id,
      actorName: 'recep-a',
    });
    const byActor = (
      await agent.get(`/api/v1/audit-events?actorUserId=${fx.users.owner.id}`).expect(200)
    ).body;
    expect(
      byActor.data.every((e: { actorUserId: string }) => e.actorUserId === fx.users.owner.id),
    ).toBe(true);
    const today = new Date().toISOString().slice(0, 10);
    expect(
      (await agent.get(`/api/v1/audit-events?from=${today}&to=${today}`).expect(200)).body.meta
        .total,
    ).toBe(all.meta.total);
    expect(
      (await agent.get('/api/v1/audit-events?to=2000-01-01').expect(200)).body.meta.total,
    ).toBe(0);
    await agent.get('/api/v1/audit-events?from=2026-03-01&to=2026-01-01').expect(400);
    await agent.get('/api/v1/audit-events?from=2020-01-01&to=2026-01-01').expect(400);
    await agent.get('/api/v1/audit-events?outcome=NOPE').expect(400);
  });

  it('supports underscore action names and never exposes metadata or other organisations', async () => {
    const other = await prisma.organisation.create({ data: { name: 'Other Org' } });
    await prisma.auditEvent.create({
      data: {
        action: 'dental_chart.add',
        outcome: 'SUCCESS',
        organisationId: other.id,
        metadata: { secret: 'x' },
      },
    });
    await prisma.auditEvent.create({
      data: {
        action: 'dental_chart.add',
        outcome: 'SUCCESS',
        organisationId: fx.orgId,
        metadata: { condition: 'CARIES' },
      },
    });
    const { agent } = await loginAgent(app, fx.users.owner.email);
    const r = (await agent.get('/api/v1/audit-events?action=dental_chart').expect(200)).body;
    expect(r.meta.total).toBe(1);
    expect(JSON.stringify(r)).not.toMatch(/CARIES|secret|metadata/);
  });

  it('is closed to non-owners', async () => {
    const { agent } = await loginAgent(app, fx.users.adminA.email);
    await agent.get('/api/v1/audit-events').expect(403);
  });
});
