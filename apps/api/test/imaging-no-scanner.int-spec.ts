import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const S3rver = require('s3rver');
import { ImagingScanService } from '../src/imaging/imaging-scan.service';
import { ORIGIN, TEST_DATABASE_URL, createTestApp, loginAgent, resetAndSeed } from './helpers';

describe('imaging with NO malware scanner configured (integration)', () => {
  let app: NestExpressApplication;
  let s3: { run(): Promise<void>; close(): Promise<void> };
  let dir: string;
  const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'dpms-s3none-'));
    s3 = new S3rver({
      port: 4574,
      address: '127.0.0.1',
      silent: true,
      directory: dir,
      configureBuckets: [{ name: 'dpms-none' }],
    });
    await s3.run();
    app = await createTestApp({
      STORAGE_ENDPOINT: 'http://127.0.0.1:4574',
      STORAGE_REGION: 'af-south-1',
      STORAGE_BUCKET: 'dpms-none',
      STORAGE_ACCESS_KEY_ID: 'S3RVER',
      STORAGE_SECRET_ACCESS_KEY: 'S3RVER',
      STORAGE_FORCE_PATH_STYLE: 'true',
      SCANNER_HOST: undefined,
    });
  });
  afterAll(async () => {
    await app.close();
    await s3.close();
    rmSync(dir, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  it('accepts uploads but keeps every file quarantined and unavailable — it never pretends to scan', async () => {
    const fx = await resetAndSeed(prisma);
    const patient = await prisma.patient.create({
      data: {
        organisationId: fx.orgId,
        registeringPracticeId: fx.practiceA,
        firstName: 'No',
        lastName: 'Scanner',
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
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ scanStatus: 'PENDING', available: false });
    expect((await agent.get(`/api/v1/imaging/${res.body.id}/file`)).status).toBe(409);
    expect(
      (await agent.post(`/api/v1/imaging/${res.body.id}/rescan`).set('Origin', ORIGIN)).status,
    ).toBe(503);
    expect((await app.get(ImagingScanService).rescanPending()).scanned).toBe(0);
    const row = await prisma.imagingAsset.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row).toMatchObject({ scanStatus: 'PENDING', scanAttempts: 0, scannedAt: null });
    const ready = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(ready.body.checks.scanner.status).toBe('not_configured');
  });
});
