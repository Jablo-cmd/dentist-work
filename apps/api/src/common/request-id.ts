import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const SAFE_ID = /^[A-Za-z0-9-]{8,64}$/;

/** Accepts a caller-supplied correlation id only if it is a safe token; otherwise generates one. */
export function resolveRequestId(incoming: string | string[] | undefined): string {
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  return candidate && SAFE_ID.test(candidate) ? candidate : randomUUID();
}

export function genReqId(req: IncomingMessage, res: ServerResponse): string {
  const id = resolveRequestId(req.headers['x-request-id']);
  res.setHeader('x-request-id', id);
  return id;
}
