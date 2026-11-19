import { Writable } from 'node:stream';
import pino from 'pino';
import { buildPinoHttpOptions } from './logging';

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _e, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
  const opts = buildPinoHttpOptions('info');
  const logger = pino(
    { level: 'info', redact: opts.redact, serializers: opts.serializers },
    stream,
  );
  return { logger, lines };
}

describe('request logging', () => {
  it('redacts credentials and strips query strings and bodies from request logs', () => {
    const { logger, lines } = capture();
    logger.info(
      {
        req: {
          id: 'abc-12345678',
          method: 'GET',
          url: '/api/v1/patients?q=Syntheticson&dateOfBirth=1990-01-01',
          headers: { cookie: 'dpms_session=TOPSECRET', authorization: 'Bearer TOPSECRET' },
          body: { password: 'hunter2' },
        },
        res: {
          statusCode: 200,
          headers: { 'set-cookie': ['dpms_session=TOPSECRET'] },
          body: { patient: 'Jane' },
        },
      },
      'request completed',
    );
    const out = lines.join('');
    expect(out).toContain('/api/v1/patients');
    for (const forbidden of [
      'TOPSECRET',
      'Syntheticson',
      '1990-01-01',
      'hunter2',
      'Jane',
      'dpms_session',
    ])
      expect(out).not.toContain(forbidden);
    expect(JSON.parse(out).res).toEqual({ statusCode: 200 });
  });

  it('does not log health probes (noise) but logs everything else', () => {
    const o = buildPinoHttpOptions('info');
    expect(o.autoLogging.ignore({ url: '/api/v1/health/ready' } as never)).toBe(true);
    expect(o.autoLogging.ignore({ url: '/api/v1/patients' } as never)).toBe(false);
  });
});
