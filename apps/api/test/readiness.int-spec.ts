import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('readiness when the database is down (integration)', () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => app.close());

  it('stays live but reports not_ready (503) without leaking details', async () => {
    const prisma = app.get(PrismaService);
    const spy = jest
      .spyOn(prisma, '$queryRaw')
      .mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432 password=secret'));
    const ready = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);
    expect(ready.body).toMatchObject({
      status: 'not_ready',
      checks: { database: { status: 'down', latencyMs: null } },
    });
    expect(JSON.stringify(ready.body)).not.toMatch(/ECONNREFUSED|secret|10\.0\.0\.5/);
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    spy.mockRestore();
  });
});
