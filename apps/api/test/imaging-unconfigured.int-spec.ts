import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { ORIGIN, TEST_DATABASE_URL, createTestApp, loginAgent, resetAndSeed } from './helpers';

describe('imaging without object storage configured (integration)', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  beforeAll(async () => {
    for (const k of [
      'STORAGE_ENDPOINT',
      'STORAGE_REGION',
      'STORAGE_BUCKET',
      'STORAGE_ACCESS_KEY_ID',
      'STORAGE_SECRET_ACCESS_KEY',
      'STORAGE_FORCE_PATH_STYLE',
    ])
      delete process.env[k];
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('refuses uploads honestly (503) instead of pretending to store files, and reports not_configured', async () => {
    const fx = await resetAndSeed(prisma);
    const patient = await prisma.patient.create({
      data: {
        organisationId: fx.orgId,
        registeringPracticeId: fx.practiceA,
        firstName: 'No',
        lastName: 'Storage',
        dateOfBirth: new Date('1980-01-01'),
        practices: { create: { practiceId: fx.practiceA } },
      },
    });
    const { agent } = await loginAgent(app, fx.users.dentistA.email);
    const res = await agent
      .post(`/api/v1/patients/${patient.id}/imaging`)
      .set('Origin', ORIGIN)
      .field('practiceId', fx.practiceA)
      .field('modality', 'PHOTO')
      .attach('file', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), {
        filename: 'a.jpg',
        contentType: 'image/jpeg',
      });
    expect(res.status).toBe(503);
    expect(await prisma.imagingAsset.count()).toBe(0);
    const ready = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(ready.body.status).toBe('ready'); // not configured is informational, not a failure
    expect(ready.body.checks.storage.status).toBe('not_configured');
  });
});
