import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import { base32Decode, stepFor, totpAt } from '../src/auth/totp';
import {
  ORIGIN,
  TEST_DATABASE_URL,
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
