import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { safeTarget } from '@/lib/proxy-target';
import { GET } from './route';

afterEach(() => vi.unstubAllGlobals());

describe('safeTarget (proxy path hardening)', () => {
  const base = 'http://gateway.internal:8080/dpms';
  it('builds normal API URLs and preserves the query string', () => {
    expect(safeTarget(base, ['v1', 'patients'], '?q=ab&page=2')).toBe(
      'http://gateway.internal:8080/dpms/api/v1/patients?q=ab&page=2',
    );
    expect(safeTarget('http://localhost:4000', ['v1', 'health'], '')).toBe(
      'http://localhost:4000/api/v1/health',
    );
  });
  it('encodes unusual but harmless segments instead of interpreting them', () => {
    expect(safeTarget(base, ['v1', 'a b', 'c?d'], '')).toBe(
      'http://gateway.internal:8080/dpms/api/v1/a%20b/c%3Fd',
    );
  });
  it.each([
    [['..', 'admin']],
    [['v1', '..', '..', 'admin']],
    [['.', 'v1']],
    [['v1', '']],
    [['v1', 'a/b']],
    [['v1', 'a\\b']],
    [['v1', 'x\u0000y']],
  ])('refuses traversal and malformed segments %j', (segments) => {
    expect(safeTarget(base, segments, '')).toBeNull();
  });
  it('can never leave the API namespace or the upstream origin', () => {
    for (const segs of [
      ['v1', '%2e%2e', 'admin'],
      ['v1', '..%2fadmin'],
    ]) {
      const t = safeTarget(base, segs, '');
      // either refused, or still strictly inside /dpms/api/ on the same origin
      if (t) {
        const u = new URL(t);
        expect(u.origin).toBe('http://gateway.internal:8080');
        expect(u.pathname.startsWith('/dpms/api/')).toBe(true);
      }
    }
  });
});

describe('proxy handler', () => {
  const call = (segments: string[]) =>
    GET(new NextRequest(`http://localhost:3000/api/${segments.join('/')}`), {
      params: Promise.resolve({ path: segments }),
    });

  it('answers 404 and never contacts the upstream for traversal attempts', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await call(['..', 'etc', 'passwd']);
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('NOT_FOUND');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards normal requests, strips hop-by-hop headers and keeps every Set-Cookie', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'content-encoding': 'gzip',
          'transfer-encoding': 'chunked',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await call(['v1', 'health']);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-encoding')).toBeNull();
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/\/api\/v1\/health$/);
  });

  it('reports an unreachable API as 502 without leaking internals', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 10.1.2.3:4000')),
    );
    const res = await call(['v1', 'health']);
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toMatch(/ECONNREFUSED|10\.1\.2\.3/);
  });
});
