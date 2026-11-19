import { mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
// s3rver is an S3-compatible HTTP server used ONLY in tests so the real AWS-SDK adapter is exercised.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const S3rver = require('s3rver');
import { startFakeClamd, type FakeClamd } from './support/fake-clamd';
import {
  ORIGIN,
  TEST_DATABASE_URL,
  createTestApp,
  loginAgent,
  resetAndSeed,
  type Fixtures,
} from './helpers';

type Agent = ReturnType<typeof request.agent>;
const PORT = 4569;
const BUCKET = 'dpms-test-private';
// Minimal valid file signatures padded with synthetic bytes (no real images are used).
const jpeg = (seed: string) =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`SYNTHETIC-JPEG-${seed}`)]);
const png = () =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('SYNTHETIC-PNG'),
  ]);

describe('imaging (integration, real S3 adapter against an S3-compatible server)', () => {
  let app: NestExpressApplication;
  let s3: { run(): Promise<void>; close(): Promise<void> };
  let dir: string;
  const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  let clam: FakeClamd;
  let fx: Fixtures;
  let patient: string;
  let dentistB: { id: string; email: string };

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'dpms-s3-'));
    s3 = new S3rver({
      port: PORT,
      address: '127.0.0.1',
      silent: true,
      directory: dir,
      configureBuckets: [{ name: BUCKET }],
    });
    await s3.run();
    clam = await startFakeClamd(0);
    app = await createTestApp({
      SCANNER_HOST: '127.0.0.1',
      SCANNER_PORT: String(clam.port),
      STORAGE_ENDPOINT: `http://127.0.0.1:${PORT}`,
      STORAGE_REGION: 'af-south-1',
      STORAGE_BUCKET: BUCKET,
      STORAGE_ACCESS_KEY_ID: 'S3RVER',
      STORAGE_SECRET_ACCESS_KEY: 'S3RVER',
      STORAGE_FORCE_PATH_STYLE: 'true',
      IMAGING_MAX_BYTES: '200000',
    });
  });
  beforeEach(async () => {
    fx = await resetAndSeed(prisma);
    patient = (
      await prisma.patient.create({
        data: {
          organisationId: fx.orgId,
          registeringPracticeId: fx.practiceA,
          firstName: 'Img',
          lastName: 'Syntheticson',
          dateOfBirth: new Date('1980-02-02'),
          practices: { create: { practiceId: fx.practiceA } },
        },
      })
    ).id;
    const hash = (await prisma.user.findUniqueOrThrow({ where: { id: fx.users.dentistA.id } }))
      .passwordHash;
    dentistB = await prisma.user.create({
      data: {
        organisationId: fx.orgId,
        email: 'dentist-b@test.invalid',
        displayName: 'Dentist B',
        passwordHash: hash,
        roleAssignments: { create: { role: 'DENTIST', practiceId: fx.practiceB } },
      },
      select: { id: true, email: true },
    });
  });
  afterAll(async () => {
    await app.close();
    await s3.close();
    await clam.close();
    rmSync(dir, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  const as = async (email: string) => (await loginAgent(app, email)).agent;
  const upload = (
    a: Agent,
    file: Buffer,
    over: { filename?: string; type?: string; fields?: Record<string, string> } = {},
  ) => {
    const r = a
      .post(`/api/v1/patients/${patient}/imaging`)
      .set('Origin', ORIGIN)
      .field('practiceId', fx.practiceA)
      .field('modality', 'XRAY_INTRAORAL');
    for (const [k, v] of Object.entries(over.fields ?? {})) r.field(k, v);
    return r.attach('file', file, {
      filename: over.filename ?? 'scan.jpg',
      contentType: over.type ?? 'image/jpeg',
    });
  };

  it('stores the file privately, records verified metadata, and serves it back byte-for-byte', async () => {
    const d = await as(fx.users.dentistA.email);
    const bytes = jpeg('A');
    const res = await upload(d, bytes).expect(201);
    expect(res.body).toMatchObject({
      mimeType: 'image/jpeg',
      sizeBytes: bytes.length,
      scanStatus: 'CLEAN',
      available: true,
      uploadedByUserId: fx.users.dentistA.id,
      source: 'manual_upload',
    });
    expect(res.body.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    const row = await prisma.imagingAsset.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.objectKey).toMatch(/^imaging\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/); // opaque key, no patient data
    expect(row.objectKey).not.toMatch(/Img|Synthetic|scan/i);
    const file = await d
      .get(`/api/v1/imaging/${res.body.id}/file`)
      .buffer(true)
      .parse((r, cb) => {
        const c: Buffer[] = [];
        r.on('data', (x: Buffer) => c.push(x));
        r.on('end', () => cb(null, Buffer.concat(c)));
      })
      .expect(200);
    expect(Buffer.compare(file.body as Buffer, bytes)).toBe(0);
    expect(file.headers['content-type']).toBe('image/jpeg');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(file.headers['cache-control']).toBe('no-store');
    expect(
      await prisma.auditEvent.count({
        where: { action: { in: ['imaging.upload', 'imaging.download'] } },
      }),
    ).toBe(2);
  });

  it('identifies files by content, not by declared type or filename', async () => {
    const d = await as(fx.users.dentistA.email);
    await upload(d, Buffer.from('MZ\x90\x00 not an image'), { filename: 'virus.jpg' }).expect(415);
    await upload(d, Buffer.from('<html><script>alert(1)</script></html>'), {
      filename: 'x.png',
      type: 'image/png',
    }).expect(415);
    await upload(d, png(), { type: 'image/jpeg' }).expect(415); // declared jpeg, actually png
    const ok = await upload(d, png(), {
      filename: '../../evil<name>.png',
      type: 'image/png',
    }).expect(201);
    expect(ok.body.originalFilename).toBe('evilname.png');
    expect(await prisma.imagingAsset.count()).toBe(1);
  });

  it('enforces size limits and rejects empty or missing files', async () => {
    const d = await as(fx.users.dentistA.email);
    await upload(d, Buffer.concat([jpeg('big'), Buffer.alloc(250_000)])).expect(413);
    await d
      .post(`/api/v1/patients/${patient}/imaging`)
      .set('Origin', ORIGIN)
      .field('practiceId', fx.practiceA)
      .field('modality', 'PHOTO')
      .expect(400);
    await upload(d, jpeg('x'), { fields: { modality: 'NOPE' } }).expect(400);
  });

  it('detects duplicate uploads for the same patient', async () => {
    const d = await as(fx.users.dentistA.email);
    await upload(d, jpeg('dup')).expect(201);
    await upload(d, jpeg('dup'), { filename: 'renamed.jpg' }).expect(409);
    expect(await prisma.imagingAsset.count()).toBe(1);
  });

  it('keeps reception, billing and admins out; other practices see nothing', async () => {
    const d = await as(fx.users.dentistA.email);
    const asset = (await upload(d, jpeg('priv')).expect(201)).body;
    for (const email of [fx.users.recepA.email, fx.users.billingA.email, fx.users.adminA.email]) {
      const a = await as(email);
      await a.get(`/api/v1/imaging/${asset.id}`).expect(403);
      await a.get(`/api/v1/imaging/${asset.id}/file`).expect(403);
      await a.get(`/api/v1/patients/${patient}/imaging`).expect(403);
      await upload(a, jpeg('nope')).expect(403);
    }
    const b = await as(dentistB.email);
    await b.get(`/api/v1/imaging/${asset.id}`).expect(404);
    await b.get(`/api/v1/imaging/${asset.id}/file`).expect(404);
    await b.get(`/api/v1/patients/${patient}/imaging`).expect(404);
    await upload(b, jpeg('b')).expect(404);
    expect(
      await prisma.auditEvent.count({ where: { action: 'access.denied', targetId: asset.id } }),
    ).toBeGreaterThanOrEqual(2);
  });

  it('re-checks permission on every download (revocation takes effect immediately)', async () => {
    const d = await as(fx.users.dentistA.email);
    const asset = (await upload(d, jpeg('revoke')).expect(201)).body;
    await d.get(`/api/v1/imaging/${asset.id}/file`).expect(200);
    await prisma.userRoleAssignment.deleteMany({ where: { userId: fx.users.dentistA.id } });
    await d.get(`/api/v1/imaging/${asset.id}/file`).expect(403);
  });

  it("lists a patient's assets and requires a valid encounter link", async () => {
    const d = await as(fx.users.dentistA.email);
    await upload(d, jpeg('1')).expect(201);
    await upload(d, jpeg('2'), {
      fields: { encounterId: '00000000-0000-4000-8000-000000000000' },
    }).expect(400);
    const list = await d.get(`/api/v1/patients/${patient}/imaging`).expect(200);
    expect(list.body).toHaveLength(1);
  });

  it('makes asset metadata immutable at the database layer', async () => {
    const d = await as(fx.users.dentistA.email);
    await upload(d, jpeg('imm')).expect(201);
    await expect(
      prisma.imagingAsset.updateMany({ data: { sha256: 'a'.repeat(64) } }),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.imagingAsset.deleteMany({})).rejects.toThrow(/append-only/);
  });

  it('reports storage as up in readiness', async () => {
    const r = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(r.body.checks.storage.status).toBe('up');
  });
});
