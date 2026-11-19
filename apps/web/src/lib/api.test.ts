import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiRequestError, apiFetch } from './api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('apiFetch', () => {
  const schema = z.object({ ok: z.literal(true) });

  it('returns validated data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, { ok: true })));
    await expect(apiFetch('/x', schema)).resolves.toEqual({ ok: true });
  });

  it('maps the standard error envelope to ApiRequestError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json(403, {
          error: { code: 'FORBIDDEN', message: 'Access denied.', requestId: 'r-1234567' },
        }),
      ),
    );
    await expect(apiFetch('/x', schema)).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
      requestId: 'r-1234567',
    });
  });

  it('flags responses that violate the contract', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, { ok: false })));
    await expect(apiFetch('/x', schema)).rejects.toMatchObject({ code: 'CONTRACT_VIOLATION' });
  });

  it('reports network failures distinctly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fail')));
    const err = await apiFetch('/x', schema).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as ApiRequestError).code).toBe('NETWORK_ERROR');
  });

  it('handles non-JSON error bodies safely', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>boom</html>', { status: 502 })),
    );
    await expect(apiFetch('/x', schema)).rejects.toMatchObject({
      status: 502,
      code: 'INTERNAL_ERROR',
    });
  });
});
