import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
// s3rver: S3-compatible HTTP server, test-only (the real AWS-SDK adapter is exercised against it).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const S3rver = require('s3rver');
import { AuditService } from '../src/audit/audit.service';
import { ImagingScanService } from '../src/imaging/imaging-scan.service';
import { OBJECT_STORAGE, type ObjectStorage } from '../src/storage/object-storage';
import { MALWARE_MARKER, startFakeClamd, type FakeClamd } from './support/fake-clamd';
import {
  ORIGIN,
  TEST_DATABASE_URL,
  createTestApp,
  loginAgent,
  resetAndSeed,
  type Fixtures,
} from './helpers';

type Agent = ReturnType<typeof request.agent>;
const S3_PORT = 4572;
const BUCKET = 'dpms-scan-test';
const jpeg = (tag: string, extra = '') =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`SYNTHETIC-${tag}-${extra}`)]);

describe('malware-scanning lifecycle (integration) — fail closed', () => {
  let app: NestExpressApplication;
  let s3: { run(): Promise<void>; close(): Promise<void> };
  let clam: FakeClamd;
  let dir: string;
  const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  let fx: Fixtures;
  let patient: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'dpms-s3scan-'));
    s3 = new S3rver({
      port: S3_PORT,
      address: '127.0.0.1',
      silent: true,
      directory: dir,
      configureBuckets: [{ name: BUCKET }],
    });
    await s3.run();
    clam = await startFakeClamd(0);
    app = await createTestApp({
      STORAGE_ENDPOINT: `http://127.0.0.1:${S3_PORT}`,
      STORAGE_REGION: 'af-south-1',
      STORAGE_BUCKET: BUCKET,
      STORAGE_ACCESS_KEY_ID: 'S3RVER',
      STORAGE_SECRET_ACCESS_KEY: 'S3RVER',
      STORAGE_FORCE_PATH_STYLE: 'true',
      SCANNER_HOST: '127.0.0.1',
      SCANNER_PORT: String(clam.port),
      SCANNER_TIMEOUT_MS: '1000',
      SCANNER_MAX_ATTEMPTS: '3',
    });
  });
  beforeEach(async () => {
    clam.state.mode = 'ok';
    fx = await resetAndSeed(prisma);
    patient = (
      await prisma.patient.create({
        data: {
          organisationId: fx.orgId,
          registeringPracticeId: fx.practiceA,
          firstName: 'Scan',
          lastName: 'Syntheticson',
          dateOfBirth: new Date('1980-02-02'),
          practices: { create: { practiceId: fx.practiceA } },
        },
      })
    ).id;
  });
  afterAll(async () => {
    await app.close();
    await s3.close();
    await clam.close();
    rmSync(dir, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  const as = async (email: string) => (await loginAgent(app, email)).agent;
  const upload = (a: Agent, file: Buffer) =>
    a
      .post(`/api/v1/patients/${patient}/imaging`)
      .set('Origin', ORIGIN)
      .field('practiceId', fx.practiceA)
      .field('modality', 'PHOTO')
      .attach('file', file, { filename: 'scan.jpg', contentType: 'image/jpeg' });
  const download = (a: Agent, id: string) =>
    a
      .get(`/api/v1/imaging/${id}/file`)
      .buffer(true)
      .parse((r, cb) => {
        const c: Buffer[] = [];
        r.on('data', (x: Buffer) => c.push(x));
        r.on('end', () => cb(null, Buffer.concat(c)));
      });
  const storage = () => app.get<ObjectStorage>(OBJECT_STORAGE);
  const objectExists = async (key: string) =>
    storage()
      .get(key)
      .then(
        () => true,
        () => false,
      );

  describe('clean files', () => {
    it('quarantines on arrival, becomes available only after a clean verdict, and records evidence', async () => {
      const d = await as(fx.users.dentistA.email);
      const res = await upload(d, jpeg('clean')).expect(201);
      expect(res.body).toMatchObject({ scanStatus: 'CLEAN', available: true });
      const row = await prisma.imagingAsset.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row).toMatchObject({ scanStatus: 'CLEAN', scanEngine: 'clamd', scanAttempts: 1 });
      expect(row.scannedAt).not.toBeNull();
      expect(row.sha256).toMatch(/^[0-9a-f]{64}$/); // hash retained for integrity verification
      const ev = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'imaging.scan', targetId: row.id },
      });
      expect(ev).toMatchObject({ outcome: 'SUCCESS', actorUserId: fx.users.dentistA.id });
      expect(ev.metadata).toMatchObject({ verdict: 'clean', engine: 'clamd', sha256: row.sha256 });
      await download(d, row.id).expect(200);
    });
  });

  describe('infected files', () => {
    it('are rejected, quarantined as a record with their hash, and their bytes are deleted', async () => {
      const d = await as(fx.users.dentistA.email);
      const res = await upload(d, jpeg('bad', MALWARE_MARKER));
      expect(res.status).toBe(422);
      expect(JSON.stringify(res.body)).not.toMatch(/Fake\.Test|signature|clamd|FOUND/i); // scanner detail not exposed
      const row = await prisma.imagingAsset.findFirstOrThrow({ where: { patientId: patient } });
      expect(row.scanStatus).toBe('INFECTED');
      expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(await objectExists(row.objectKey)).toBe(false);
      const ev = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'imaging.scan', targetId: row.id },
      });
      expect(ev).toMatchObject({ outcome: 'DENIED' });
      expect(ev.metadata).toMatchObject({
        verdict: 'infected',
        signature: 'Fake.Test.Signature',
        sha256: row.sha256,
      });
      // not downloadable, listed as unavailable, and re-uploading the same file is refused too
      const dl = await download(d, row.id);
      expect(dl.status).toBe(409);
      const list = (await d.get(`/api/v1/patients/${patient}/imaging`).expect(200)).body;
      expect(list[0]).toMatchObject({ scanStatus: 'INFECTED', available: false });
      expect((await upload(d, jpeg('bad', MALWARE_MARKER))).status).toBe(422);
    });

    it('can never be re-labelled clean, by the API or directly in the database', async () => {
      const d = await as(fx.users.dentistA.email);
      await upload(d, jpeg('bad2', MALWARE_MARKER)).expect(422);
      const row = await prisma.imagingAsset.findFirstOrThrow({ where: { patientId: patient } });
      await d.post(`/api/v1/imaging/${row.id}/rescan`).set('Origin', ORIGIN).expect(409);
      await expect(
        prisma.imagingAsset.update({
          where: { id: row.id },
          data: { scanStatus: 'CLEAN', scannedAt: new Date() },
        }),
      ).rejects.toThrow(/final scan verdict/);
    });
  });

  describe('scanner problems (fail closed)', () => {
    it('keeps files inaccessible while the scanner is down, then releases them only after a clean re-scan', async () => {
      const d = await as(fx.users.dentistA.email);
      const port = clam.port;
      await clam.close();
      const res = await upload(d, jpeg('down')).expect(201);
      expect(res.body).toMatchObject({ scanStatus: 'SCAN_FAILED', available: false });
      const dl = await download(d, res.body.id);
      expect(dl.status).toBe(409);
      expect(dl.body.toString()).not.toMatch(/clamd|ECONN|socket/i); // no scanner internals in the response
      expect(
        await prisma.auditEvent.count({
          where: { action: 'imaging.download', outcome: 'DENIED', targetId: res.body.id },
        }),
      ).toBe(1);
      expect(
        await prisma.auditEvent.count({
          where: { action: 'imaging.scan', outcome: 'FAILURE', targetId: res.body.id },
        }),
      ).toBe(1);
      // scanner returns on the same address: the retry job releases the file
      clam = await startFakeClamd(port);
      expect((await app.get(ImagingScanService).rescanPending()).scanned).toBe(1);
      expect(
        (await prisma.imagingAsset.findUniqueOrThrow({ where: { id: res.body.id } })).scanStatus,
      ).toBe('CLEAN');
      await download(d, res.body.id).expect(200);
    });

    it('treats a timeout, an ERROR reply and a garbage reply as "not clean"', async () => {
      const d = await as(fx.users.dentistA.email);
      for (const [mode, tag] of [
        ['slow', 't'],
        ['error', 'e'],
        ['garbage', 'g'],
      ] as const) {
        clam.state.mode = mode;
        const res = await upload(d, jpeg(tag)).expect(201);
        expect(res.body).toMatchObject({ scanStatus: 'SCAN_FAILED', available: false });
        expect((await download(d, res.body.id)).status).toBe(409);
      }
      expect((await prisma.imagingAsset.findMany()).every((r) => r.scanStatus !== 'CLEAN')).toBe(
        true,
      );
    });

    it('lets staff trigger a re-scan once the scanner recovers; reception and other practices cannot', async () => {
      const d = await as(fx.users.dentistA.email);
      clam.state.mode = 'error';
      const res = await upload(d, jpeg('rescan')).expect(201);
      clam.state.mode = 'ok';
      await (
        await as(fx.users.recepA.email)
      )
        .post(`/api/v1/imaging/${res.body.id}/rescan`)
        .set('Origin', ORIGIN)
        .expect(403);
      const hash = (await prisma.user.findUniqueOrThrow({ where: { id: fx.users.dentistA.id } }))
        .passwordHash;
      const other = await prisma.user.create({
        data: {
          organisationId: fx.orgId,
          email: 'dentist-b@test.invalid',
          displayName: 'B',
          passwordHash: hash,
          roleAssignments: { create: { role: 'DENTIST', practiceId: fx.practiceB } },
        },
      });
      await (
        await as(other.email)
      )
        .post(`/api/v1/imaging/${res.body.id}/rescan`)
        .set('Origin', ORIGIN)
        .expect(404);
      const ok = await d
        .post(`/api/v1/imaging/${res.body.id}/rescan`)
        .set('Origin', ORIGIN)
        .expect(200);
      expect(ok.body).toMatchObject({ scanStatus: 'CLEAN', available: true });
      await d.post(`/api/v1/imaging/${res.body.id}/rescan`).set('Origin', ORIGIN).expect(409); // already final
    });

    it('stops retrying after the configured number of failed attempts', async () => {
      const d = await as(fx.users.dentistA.email);
      clam.state.mode = 'error';
      const res = await upload(d, jpeg('cap')).expect(201); // attempt 1
      const svc = app.get(ImagingScanService);
      await svc.rescanPending(); // attempt 2
      await svc.rescanPending(); // attempt 3 (max)
      expect(
        (await prisma.imagingAsset.findUniqueOrThrow({ where: { id: res.body.id } })).scanAttempts,
      ).toBe(3);
      expect((await svc.rescanPending()).scanned).toBe(0); // capped: left for an operator, still quarantined
    });

    it('never certifies a file whose stored bytes cannot be read back', async () => {
      const d = await as(fx.users.dentistA.email);
      clam.state.mode = 'error';
      const res = await upload(d, jpeg('lost')).expect(201);
      const row = await prisma.imagingAsset.findUniqueOrThrow({ where: { id: res.body.id } });
      await storage().remove(row.objectKey); // object disappears from storage
      clam.state.mode = 'ok';
      await app.get(ImagingScanService).rescanPending();
      expect(
        (await prisma.imagingAsset.findUniqueOrThrow({ where: { id: row.id } })).scanStatus,
      ).toBe('SCAN_FAILED');
    });

    it('keeps the file quarantined if the verdict cannot be audited (no status change without evidence)', async () => {
      const d = await as(fx.users.dentistA.email);
      const audit = app.get(AuditService);
      const original = audit.record.bind(audit);
      const spy = jest
        .spyOn(audit, 'record')
        .mockImplementation((e, tx) =>
          e.action === 'imaging.scan'
            ? Promise.reject(new Error('audit unavailable'))
            : original(e, tx),
        );
      const res = await upload(d, jpeg('noaudit')).expect(201);
      spy.mockRestore();
      expect(res.body).toMatchObject({ scanStatus: 'PENDING', available: false });
      expect((await download(d, res.body.id)).status).toBe(409);
    });
  });

  describe('database guarantees', () => {
    it('refuses CLEAN without evidence, editing asset metadata, and deletion', async () => {
      const d = await as(fx.users.dentistA.email);
      clam.state.mode = 'error';
      const res = await upload(d, jpeg('db')).expect(201);
      await expect(
        prisma.imagingAsset.update({ where: { id: res.body.id }, data: { scanStatus: 'CLEAN' } }),
      ).rejects.toThrow(); // CHECK: verdict needs scannedAt
      await expect(
        prisma.imagingAsset.update({
          where: { id: res.body.id },
          data: { sha256: 'b'.repeat(64) },
        }),
      ).rejects.toThrow(/append-only/);
      await expect(prisma.imagingAsset.deleteMany({})).rejects.toThrow(/append-only/);
    });
  });

  describe('readiness', () => {
    it('reports the scanner as up and, when it is down, stays ready but says so', async () => {
      expect(
        (await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200)).body.checks
          .scanner.status,
      ).toBe('up');
      const port = clam.port;
      await clam.close();
      const r = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
      expect(r.body.checks.scanner.status).toBe('down');
      clam = await startFakeClamd(port);
    });
  });
});
