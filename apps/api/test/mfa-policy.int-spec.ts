import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AuditService } from '../src/audit/audit.service';
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

describe('MFA enforcement policy (integration)', () => {
  const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  let fx: Fixtures;
  afterAll(async () => prisma.$disconnect());

  describe('MFA_REQUIRED_ROLES=DENTIST', () => {
    let app: NestExpressApplication;
    beforeAll(async () => {
      app = await createTestApp({ MFA_REQUIRED_ROLES: 'DENTIST' });
      fx = await resetAndSeed(prisma);
    });
    afterAll(async () => app.close());

    it('restricts a required role to enrolment until a second factor is set up', async () => {
      const { agent, res } = await loginAgent(app, fx.users.dentistA.email);
      expect(res.body.user).toMatchObject({ mfaEnabled: false, mfaEnrolmentRequired: true });
      const blocked = await agent.get(`/api/v1/practices`).expect(403);
      expect(blocked.body.error.code).toBe('MFA_ENROLMENT_REQUIRED');
      await agent.get('/api/v1/auth/me').expect(200);
      const start = (await agent.post('/api/v1/auth/mfa/enrol').set('Origin', ORIGIN).expect(200))
        .body;
      await agent
        .post('/api/v1/auth/mfa/confirm')
        .set('Origin', ORIGIN)
        .send({ code: totpAt(base32Decode(start.secret), stepFor(Date.now())) })
        .expect(200);
      await agent.get('/api/v1/practices').expect(200);
      expect((await agent.get('/api/v1/auth/me')).body.user).toMatchObject({
        mfaEnabled: true,
        mfaEnrolmentRequired: false,
      });
    });

    it('does not affect roles outside the policy', async () => {
      const { agent, res } = await loginAgent(app, fx.users.recepA.email);
      expect(res.body.user.mfaEnrolmentRequired).toBe(false);
      await agent.get('/api/v1/practices').expect(200);
    });
  });

  describe('hardening of an enforced policy', () => {
    let app: NestExpressApplication;
    beforeAll(async () => {
      app = await createTestApp({ MFA_REQUIRED_ROLES: 'DENTIST' });
    });
    beforeEach(async () => {
      fx = await resetAndSeed(prisma);
    });
    afterAll(async () => app.close());

    const enrol = async (email: string) => {
      const { agent } = await loginAgent(app, email);
      const start = (await agent.post('/api/v1/auth/mfa/enrol').set('Origin', ORIGIN).expect(200))
        .body;
      const confirm = (
        await agent
          .post('/api/v1/auth/mfa/confirm')
          .set('Origin', ORIGIN)
          .send({ code: totpAt(base32Decode(start.secret), stepFor(Date.now())) })
          .expect(200)
      ).body;
      return {
        agent,
        secret: start.secret as string,
        recoveryCodes: confirm.recoveryCodes as string[],
      };
    };
    const signIn = (email: string) =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', ORIGIN)
        .send({ email, password: TEST_PASSWORD });

    it('applies immediately to an existing session when a user is given a required role', async () => {
      const { agent } = await loginAgent(app, fx.users.recepA.email);
      await agent.get('/api/v1/practices').expect(200);
      await prisma.userRoleAssignment.create({
        data: { userId: fx.users.recepA.id, role: 'DENTIST', practiceId: fx.practiceA },
      });
      const blocked = await agent.get('/api/v1/practices').expect(403);
      expect(blocked.body.error.code).toBe('MFA_ENROLMENT_REQUIRED');
      await agent.get('/api/v1/auth/me').expect(200);
    });

    it('applies immediately to existing sessions when the policy covers a role that had no second factor', async () => {
      const { agent } = await loginAgent(app, fx.users.dentistA.email);
      expect((await agent.get('/api/v1/auth/me')).body.user.mfaEnrolmentRequired).toBe(true);
      for (const url of [
        '/api/v1/patients?q=ab',
        '/api/v1/appointments?from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z',
        '/api/v1/practices',
        '/api/v1/audit-events',
      ]) {
        const r = await agent.get(url);
        expect([403]).toContain(r.status);
        expect(r.body.error.code).toBe('MFA_ENROLMENT_REQUIRED');
      }
      await agent.post('/api/v1/patients').set('Origin', ORIGIN).send({}).expect(403);
    });

    it('does not allow a user whose role requires MFA to switch it off', async () => {
      const { agent, secret } = await enrol(fx.users.dentistA.email);
      const r = await agent
        .post('/api/v1/auth/mfa/disable')
        .set('Origin', ORIGIN)
        .send({
          password: TEST_PASSWORD,
          code: totpAt(base32Decode(secret), stepFor(Date.now()) + 1),
        });
      expect(r.status).toBe(409);
      expect((await agent.get('/api/v1/auth/me')).body.user.mfaEnabled).toBe(true);
      expect(
        await prisma.auditEvent.count({ where: { action: 'mfa.disable', outcome: 'DENIED' } }),
      ).toBe(1);
    });

    it('puts a user back into enrolment-only mode after an administrator resets their device', async () => {
      await enrol(fx.users.dentistA.email);
      const owner = (await loginAgent(app, fx.users.owner.email)).agent;
      // the owner is not subject to the DENTIST policy in this test app, so can act normally
      await owner
        .post(`/api/v1/users/${fx.users.dentistA.id}/mfa-reset`)
        .set('Origin', ORIGIN)
        .expect(204);
      const { agent, res } = await loginAgent(app, fx.users.dentistA.email);
      expect(res.body.user).toMatchObject({ mfaEnabled: false, mfaEnrolmentRequired: true });
      await agent.get('/api/v1/practices').expect(403);
    });

    it('revokes sessions opened with the password alone once the account becomes MFA-protected', async () => {
      const early = (await loginAgent(app, fx.users.dentistA.email)).agent; // password-only session (e.g. an attacker\'s)
      const { agent } = await enrol(fx.users.dentistA.email);
      await early.get('/api/v1/auth/me').expect(401);
      await agent.get('/api/v1/auth/me').expect(200); // the session that enrolled stays valid
    });

    it('spends a recovery code and records it in one transaction, with the remaining count', async () => {
      const { recoveryCodes } = await enrol(fx.users.dentistA.email);
      const ch = (await signIn(fx.users.dentistA.email)).body.challenge;
      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/verify')
        .set('Origin', ORIGIN)
        .send({ challenge: ch, recoveryCode: recoveryCodes[0] })
        .expect(200);
      const ev = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'auth.mfa_recovery_used' },
      });
      expect(ev).toMatchObject({ outcome: 'SUCCESS', actorUserId: fx.users.dentistA.id });
      expect(ev.metadata).toEqual({ remaining: 9 });
      expect(JSON.stringify(ev)).not.toContain(recoveryCodes[0]!);
    });

    it('fails closed: if the audit record cannot be written the recovery code is NOT consumed and no session starts', async () => {
      const { recoveryCodes } = await enrol(fx.users.dentistA.email);
      const audit = app.get(AuditService);
      const original = audit.record.bind(audit);
      const spy = jest
        .spyOn(audit, 'record')
        .mockImplementation((e, tx) =>
          e.action === 'auth.mfa_recovery_used'
            ? Promise.reject(new Error('audit unavailable'))
            : original(e, tx),
        );
      const ch = (await signIn(fx.users.dentistA.email)).body.challenge;
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/verify')
        .set('Origin', ORIGIN)
        .send({ challenge: ch, recoveryCode: recoveryCodes[0] });
      spy.mockRestore();
      expect(res.status).toBe(500);
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toMatch(/audit unavailable/); // internal detail not exposed
      expect(
        await prisma.mfaRecoveryCode.count({
          where: { userId: fx.users.dentistA.id, usedAt: null },
        }),
      ).toBe(10);
    });

    it('treats every guessable second-factor path equally: wrong recovery codes count toward lockout', async () => {
      await enrol(fx.users.dentistA.email);
      const ch = (await signIn(fx.users.dentistA.email)).body.challenge;
      for (let i = 0; i < 3; i++)
        await request(app.getHttpServer())
          .post('/api/v1/auth/mfa/verify')
          .set('Origin', ORIGIN)
          .send({ challenge: ch, recoveryCode: 'aaaa-aaaa-aaaa-aaaa' })
          .expect(401);
      await signIn(fx.users.dentistA.email).expect(401); // locked
    });
  });

  describe('without an encryption key', () => {
    let app: NestExpressApplication;
    beforeAll(async () => {
      app = await createTestApp({ MFA_ENCRYPTION_KEY: undefined, MFA_REQUIRED_ROLES: '' });
      fx = await resetAndSeed(prisma);
    });
    afterAll(async () => app.close());

    it('refuses to enrol rather than storing a secret unprotected', async () => {
      const { agent } = await loginAgent(app, fx.users.recepA.email);
      const r = await agent.post('/api/v1/auth/mfa/enrol').set('Origin', ORIGIN);
      expect(r.status).toBe(503);
      expect(await prisma.userMfa.count()).toBe(0);
    });
  });
});
