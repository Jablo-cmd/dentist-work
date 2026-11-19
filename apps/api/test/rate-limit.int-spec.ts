import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { ORIGIN, createTestApp } from './helpers';

describe('rate limiting (integration)', () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    app = await createTestApp({ LOGIN_RATE_LIMIT_PER_MINUTE: '3' });
  });
  afterAll(async () => app.close());

  it('throttles login attempts per client and returns the standard envelope', async () => {
    const statuses: number[] = [];
    let last: request.Response | undefined;
    for (let i = 0; i < 5; i++) {
      last = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', ORIGIN)
        .send({ email: 'x@test.invalid', password: 'whatever-123' });
      statuses.push(last.status);
    }
    expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
    expect(statuses.slice(3)).toEqual([429, 429]);
    expect(last!.body.error.code).toBe('RATE_LIMITED');
  });

  it('does not throttle health probes', async () => {
    for (let i = 0; i < 20; i++)
      await request(app.getHttpServer()).get('/api/v1/health').expect(200);
  });
});
