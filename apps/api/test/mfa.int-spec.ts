import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { base32Decode, stepFor, totpAt } from '../src/auth/totp';
import {
  ORIGIN,
  TEST_DATABASE_URL,
  TEST_PASSWORD,
  createTestApp,
  loginAgent,
  resetAndSeed,
  type Fixtures,
} from './helpers';

type Agent = ReturnType<typeof request.agent>;
const codeAt = (secretB32: string, offsetSteps = 0) =>
  totpAt(base32Decode(secretB32), stepFor(Date.now()) + offsetSteps);

describe('multi-factor authentication (integration)', () => {
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
  const post = (a: Agent | ReturnType<typeof http>, url: string, body?: object) =>
    (a as Agent).post(url).set('Origin', ORIGIN).send(body);

  /** Enrols a user and returns the secret and recovery codes. */
  async function enrol(email: string) {
    const { agent } = await loginAgent(app, email);
    const start = (await post(agent, '/api/v1/auth/mfa/enrol').expect(200)).body;
    const confirm = (
      await post(agent, '/api/v1/auth/mfa/confirm', { code: codeAt(start.secret) }).expect(200)
    ).body;
    return {
      secret: start.secret as string,
      recoveryCodes: confirm.recoveryCodes as string[],
      agent,
    };
  }
  const passwordStep = (email: string) =>
    http()
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .send({ email, password: TEST_PASSWORD });
  const verify = (challenge: string, body: object) =>
    http()
      .post('/api/v1/auth/mfa/verify')
      .set('Origin', ORIGIN)
      .send({ challenge, ...body });

  describe('enrolment', () => {
    it('requires proof of possession, stores the secret encrypted, and returns recovery codes once', async () => {
      const { agent } = await loginAgent(app, fx.users.recepA.email);
      const start = (await post(agent, '/api/v1/auth/mfa/enrol').expect(200)).body;
      expect(start.otpauthUri).toMatch(
        /^otpauth:\/\/totp\/.+secret=[A-Z2-7]+&issuer=Nexus%20Dental%20Practice%20Management%20System/,
      );
      expect((await agent.get('/api/v1/auth/me')).body.user.mfaEnabled).toBe(false); // not enabled until confirmed
      await post(agent, '/api/v1/auth/mfa/confirm', { code: '000000' }).expect(401);
      await post(agent, '/api/v1/auth/mfa/confirm', { code: 'abc' }).expect(400);
      const confirm = await post(agent, '/api/v1/auth/mfa/confirm', {
        code: codeAt(start.secret),
      }).expect(200);
      expect(confirm.body.recoveryCodes).toHaveLength(10);
      expect((await agent.get('/api/v1/auth/me')).body.user.mfaEnabled).toBe(true);
      const row = await prisma.userMfa.findUniqueOrThrow({ where: { userId: fx.users.recepA.id } });
      expect(row.secretEnc).not.toContain(start.secret);
      expect(
        Buffer.from(row.secretEnc, 'base64').includes(Buffer.from(base32Decode(start.secret))),
      ).toBe(false);
      const codes = await prisma.mfaRecoveryCode.findMany({
        where: { userId: fx.users.recepA.id },
      });
      expect(JSON.stringify(codes)).not.toContain(confirm.body.recoveryCodes[0]); // only hashes stored
      await post(agent, '/api/v1/auth/mfa/enrol').expect(409); // already enabled
    });
  });

  describe('two-step sign-in', () => {
    it('does not start a session after the password step when a second factor is enrolled', async () => {
      await enrol(fx.users.recepA.email);
      const r = await passwordStep(fx.users.recepA.email).expect(200);
      expect(r.body).toMatchObject({ mfaRequired: true });
      expect(r.body.challenge).toEqual(expect.any(String));
      expect(r.headers['set-cookie']).toBeUndefined();
      expect(JSON.stringify(r.body)).not.toMatch(/user|email/);
      await http().get('/api/v1/auth/me').expect(401);
    });

    it('completes with a valid code (current or adjacent step) and sets the session cookie', async () => {
      const { secret } = await enrol(fx.users.recepA.email);
      const ch = (await passwordStep(fx.users.recepA.email)).body.challenge;
      const ok = await verify(ch, { code: codeAt(secret, 1) }).expect(200);
      expect(String(ok.headers['set-cookie'])).toMatch(/HttpOnly/i);
      expect(ok.body.user).toMatchObject({ email: fx.users.recepA.email, mfaEnabled: true });
      expect(
        await prisma.auditEvent.count({ where: { action: 'auth.login', outcome: 'SUCCESS' } }),
      ).toBeGreaterThanOrEqual(1);
    });

    it('rejects a code that is replayed, even with a fresh challenge', async () => {
      const { secret } = await enrol(fx.users.recepA.email);
      const code = codeAt(secret, 1);
      await verify((await passwordStep(fx.users.recepA.email)).body.challenge, { code }).expect(
        200,
      );
      const second = await verify((await passwordStep(fx.users.recepA.email)).body.challenge, {
        code,
      }).expect(401);
      expect(second.body.error.code).toBe('MFA_INVALID');
      await verify((await passwordStep(fx.users.recepA.email)).body.challenge, {
        code: codeAt(secret, 0),
      }).expect(401); // older step than last used
    });

    it('limits guessing: wrong codes burn the challenge and lock the account', async () => {
      const { secret } = await enrol(fx.users.recepA.email);
      const ch = (await passwordStep(fx.users.recepA.email)).body.challenge;
      for (let i = 0; i < 3; i++) await verify(ch, { code: '000000' }).expect(401);
      await verify(ch, { code: codeAt(secret, 1) }).expect(401); // correct code, but the account is now locked
      await passwordStep(fx.users.recepA.email).expect(401);
      expect(
        await prisma.auditEvent.count({ where: { action: 'auth.mfa_verify', outcome: 'FAILURE' } }),
      ).toBe(3);
    });

    it('treats a challenge as single-use even under concurrent submissions', async () => {
      const { secret } = await enrol(fx.users.recepA.email);
      const ch = (await passwordStep(fx.users.recepA.email)).body.challenge;
      const code = codeAt(secret, 1);
      const results = await Promise.all([1, 2, 3].map(() => verify(ch, { code })));
      expect(results.map((r) => r.status).sort()).toEqual([200, 401, 401]);
    });

    it('rejects expired, unknown and malformed challenges', async () => {
      const { secret } = await enrol(fx.users.recepA.email);
      const ch = (await passwordStep(fx.users.recepA.email)).body.challenge;
      await prisma.mfaChallenge.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      await verify(ch, { code: codeAt(secret, 1) }).expect(401);
      await verify('x'.repeat(43), { code: '123456' }).expect(401);
      await verify('short', { code: '123456' }).expect(400);
      await verify(ch, {}).expect(400);
      await verify(ch, { code: '123456', recoveryCode: 'aaaa-aaaa-aaaa-aaaa' }).expect(400);
    });

    it('accepts each recovery code exactly once', async () => {
      const { recoveryCodes } = await enrol(fx.users.recepA.email);
      const first = await verify((await passwordStep(fx.users.recepA.email)).body.challenge, {
        recoveryCode: recoveryCodes[0],
      }).expect(200);
      expect(first.body.user.email).toBe(fx.users.recepA.email);
      await verify((await passwordStep(fx.users.recepA.email)).body.challenge, {
        recoveryCode: recoveryCodes[0],
      }).expect(401);
      await verify((await passwordStep(fx.users.recepA.email)).body.challenge, {
        recoveryCode: recoveryCodes[1]!.toUpperCase(),
      }).expect(200); // case-insensitive
      expect(await prisma.auditEvent.count({ where: { action: 'auth.mfa_recovery_used' } })).toBe(
        2,
      );
    });

    it('does not reveal whether MFA is enrolled to someone with the wrong password', async () => {
      await enrol(fx.users.recepA.email);
      const wrong = await http()
        .post('/api/v1/auth/login')
        .set('Origin', ORIGIN)
        .send({ email: fx.users.recepA.email, password: 'wrong-password-123' })
        .expect(401);
      expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('disabling and administrative reset', () => {
    it('needs both the password and a current code to disable, and revokes other sessions', async () => {
      const { secret, agent } = await enrol(fx.users.recepA.email);
      const other = await verify((await passwordStep(fx.users.recepA.email)).body.challenge, {
        code: codeAt(secret, 1),
      }); // second device
      const otherCookie = String(other.headers['set-cookie']).split(';')[0]!;
      await post(agent, '/api/v1/auth/mfa/disable', {
        password: 'wrong-password-123',
        code: codeAt(secret, 1),
      }).expect(401);
      await post(agent, '/api/v1/auth/mfa/disable', {
        password: TEST_PASSWORD,
        code: '000000',
      }).expect(401);
      await post(agent, '/api/v1/auth/mfa/disable', {
        password: TEST_PASSWORD,
        code: codeAt(secret, 1),
      }).expect(204);
      await http().get('/api/v1/auth/me').set('Cookie', otherCookie).expect(401);
      expect((await passwordStep(fx.users.recepA.email)).body.user).toBeDefined(); // plain sign-in again
      expect(await prisma.mfaRecoveryCode.count({ where: { userId: fx.users.recepA.id } })).toBe(0);
    });

    it('lets an authorised administrator reset a lost device, with the usual authority limits', async () => {
      await enrol(fx.users.recepA.email);
      await enrol(fx.users.recepB.email);
      const adminA = (await loginAgent(app, fx.users.adminA.email)).agent;
      await post(adminA, `/api/v1/users/${fx.users.recepB.id}/mfa-reset`).expect(404); // other practice
      await post(adminA, `/api/v1/users/${fx.users.adminA.id}/mfa-reset`).expect(409); // self
      await post(adminA, `/api/v1/users/${fx.users.recepA.id}/mfa-reset`).expect(204);
      expect((await passwordStep(fx.users.recepA.email)).body.user).toBeDefined();
      expect((await passwordStep(fx.users.recepB.email)).body.mfaRequired).toBe(true); // untouched
      const recep = (await loginAgent(app, fx.users.recepA.email)).agent;
      await post(recep, `/api/v1/users/${fx.users.recepB.id}/mfa-reset`).expect(403);
      expect(await prisma.auditEvent.count({ where: { action: 'user.mfa_reset' } })).toBe(1);
      const list = await adminA.get('/api/v1/users').expect(200);
      expect(
        list.body.data.find((u: { id: string }) => u.id === fx.users.recepA.id).mfaEnabled,
      ).toBe(false);
    });
  });
});
