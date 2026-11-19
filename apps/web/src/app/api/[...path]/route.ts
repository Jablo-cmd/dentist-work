import type { NextRequest } from 'next/server';
import { safeTarget } from '@/lib/proxy-target';

/**
 * Same-origin proxy to the API (ADR-0002 #5). Implemented as a route handler rather than a
 * `rewrites()` entry because rewrites are frozen at build time; this reads API_INTERNAL_URL on
 * every request, so one build can be deployed to any environment.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);
// fetch() transparently decompresses, so the original encoding headers must not be forwarded back.
const STRIP_RESPONSE = new Set([...HOP_BY_HOP, 'content-encoding']);

async function proxy(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const base = (process.env.API_INTERNAL_URL ?? 'http://localhost:4000').replace(/\/$/, '');
  const { path } = await ctx.params;
  const target = safeTarget(base, path, req.nextUrl.search);
  if (!target) {
    return Response.json(
      { error: { code: 'NOT_FOUND', message: 'Resource not found.', requestId: 'proxy' } },
      { status: 404 },
    );
  }

  const headers = new Headers();
  req.headers.forEach((v, k) => {
    if (!HOP_BY_HOP.has(k.toLowerCase())) headers.set(k, v);
  });
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      // Required by Node's fetch when streaming a request body.
      ...(hasBody ? { duplex: 'half' } : {}),
      redirect: 'manual',
      cache: 'no-store',
    } as RequestInit);
  } catch {
    return Response.json(
      {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'The service is temporarily unavailable.',
          requestId: 'proxy',
        },
      },
      { status: 502 },
    );
  }

  const out = new Headers();
  upstream.headers.forEach((v, k) => {
    if (!STRIP_RESPONSE.has(k.toLowerCase()) && k.toLowerCase() !== 'set-cookie') out.append(k, v);
  });
  for (const c of upstream.headers.getSetCookie()) out.append('set-cookie', c);
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
  proxy as OPTIONS,
};
