import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { ENQUIRY_MAILER, type EnquiryMailer } from '../src/enquiries/enquiry-mailer';
import { ORIGIN, TEST_DATABASE_URL, createTestApp, resetAndSeed } from './helpers';

class FakeMailer implements EnquiryMailer {
  configured = true;
  fail = false;
  sent: { enquiry: Record<string, unknown>; requestId: string }[] = [];
  async send(enquiry: Record<string, unknown>, meta: { requestId: string }): Promise<void> {
    if (this.fail) throw new Error('535 auth failed for secret-user:secret-pass');
    this.sent.push({ enquiry, requestId: meta.requestId });
  }
}

const good = {
  name: 'Thandi Mokoena',
  email: 'Thandi@Example.invalid',
  organisation: 'Synthetic Dental',
  message: 'We run three practices and would like to see a demonstration.',
};

describe('enquiries (integration)', () => {
  const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  const mailer = new FakeMailer();
  let app: NestExpressApplication;
  beforeAll(async () => {
    app = await createTestApp({}, [{ token: ENQUIRY_MAILER, value: mailer }]);
  });
  beforeEach(async () => {
    await resetAndSeed(prisma);
    mailer.sent = [];
    mailer.fail = false;
    mailer.configured = true;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });
  const post = (body: object, origin: string | null = ORIGIN) => {
    const r = request(app.getHttpServer()).post('/api/v1/enquiries');
    if (origin) r.set('Origin', origin);
    return r.send(body);
  };

  it('accepts a public enquiry without a session and hands the cleaned content to the mailer', async () => {
    const res = await post(good).expect(202);
    expect(res.body).toEqual({ received: true });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.enquiry).toEqual({
      name: 'Thandi Mokoena',
      email: 'thandi@example.invalid', // normalised
      organisation: 'Synthetic Dental',
      message: good.message,
    });
  });

  it('cannot be used to choose recipients: extra fields such as to/cc/bcc/from are discarded', async () => {
    await post({
      ...good,
      to: 'victim@example.invalid',
      cc: 'x@example.invalid',
      bcc: 'y@example.invalid',
      from: 'ceo@example.invalid',
    }).expect(202);
    const sent = mailer.sent[0]!.enquiry;
    for (const k of ['to', 'cc', 'bcc', 'from', 'subject', 'replyTo'])
      expect(sent).not.toHaveProperty(k);
  });

  it.each([
    ['a too-short message', { message: 'hi' }],
    ['an invalid email address', { email: 'not-an-email' }],
    [
      'a name containing a line break (header injection)',
      { name: 'Eve\r\nBcc: victim@example.invalid' },
    ],
    ['an over-long message', { message: 'x'.repeat(2001) }],
    ['a missing name', { name: '' }],
    ['control characters in the message', { message: 'hello\u0000 there, this is long enough' }],
  ])('rejects %s and sends nothing', async (_label, bad) => {
    await post({ ...good, ...bad }).expect(400);
    expect(mailer.sent).toHaveLength(0);
  });

  it('silently drops honeypot submissions (bots see success, nothing is sent) and audits the drop', async () => {
    await post({ ...good, website: 'http://spam.invalid' }).expect(202);
    expect(mailer.sent).toHaveLength(0);
    const ev = await prisma.auditEvent.findFirstOrThrow({ where: { action: 'enquiry.dropped' } });
    expect(ev.outcome).toBe('DENIED');
    expect(ev.metadata).toEqual({ reason: 'honeypot' });
  });

  it('reports "unavailable" with a pointer to the address when email is not configured', async () => {
    mailer.configured = false;
    const res = await post(good).expect(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(res.body.error.message).toMatch(/email the address shown/i);
    expect(mailer.sent).toHaveLength(0);
  });

  it('fails closed when delivery fails: generic message, no provider details, failure audited', async () => {
    mailer.fail = true;
    const res = await post(good).expect(503);
    expect(JSON.stringify(res.body)).not.toMatch(/secret-user|secret-pass|535/);
    const ev = await prisma.auditEvent.findFirstOrThrow({ where: { action: 'enquiry.submit' } });
    expect(ev.outcome).toBe('FAILURE');
  });

  it('keeps visitor content out of the audit trail', async () => {
    await post(good).expect(202);
    const all = JSON.stringify(
      await prisma.auditEvent.findMany({ where: { action: { startsWith: 'enquiry' } } }),
    );
    expect(all).not.toMatch(/Thandi|example\.invalid|demonstration|Synthetic Dental/i);
    expect(all).toContain('enquiry.submit');
  });

  it('refuses cross-site posts (origin check applies to this public endpoint too)', async () => {
    await post(good, 'https://evil.invalid').expect(403);
    expect(mailer.sent).toHaveLength(0);
  });

  describe('rate limit', () => {
    let limited: NestExpressApplication;
    beforeAll(async () => {
      limited = await createTestApp({ ENQUIRY_RATE_LIMIT_PER_HOUR: '2' }, [
        { token: ENQUIRY_MAILER, value: mailer },
      ]);
    });
    afterAll(async () => limited.close());
    it('allows only a small hourly budget per client, then answers 429', async () => {
      const send = () =>
        request(limited.getHttpServer()).post('/api/v1/enquiries').set('Origin', ORIGIN).send(good);
      await send().expect(202);
      await send().expect(202);
      const third = await send();
      expect(third.status).toBe(429);
      expect(third.body.error.code).toBe('RATE_LIMITED');
      expect(mailer.sent).toHaveLength(2);
    });
  });
});
