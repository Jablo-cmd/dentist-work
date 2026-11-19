import type { IncomingMessage } from 'node:http';
import { genReqId } from './request-id';

/**
 * pino-http options shared by the app and its tests. Guarantees (tested in logging.spec.ts):
 * credentials are redacted, request/response BODIES are never logged, and query strings (which can carry
 * identifiers or search terms) are stripped from logged URLs.
 */
export function buildPinoHttpOptions(level: string) {
  return {
    level,
    genReqId,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      censor: '[redacted]',
    },
    serializers: {
      req: (req: { id: string; method: string; url: string }) => ({
        id: req.id,
        method: req.method,
        url: req.url.split('?')[0],
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
    autoLogging: { ignore: (req: IncomingMessage) => (req.url ?? '').startsWith('/api/v1/health') },
  };
}
