import { apiErrorSchema, type ErrorCode, type FieldIssue } from '@dpms/contracts';
import type { ZodType } from 'zod';

/** Error thrown for any non-2xx or contract-violating API response. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: ErrorCode | 'NETWORK_ERROR' | 'CONTRACT_VIOLATION',
    readonly requestId?: string,
    readonly issues?: FieldIssue[],
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

const BASE = '/api/v1';

/**
 * Typed fetch: the response body is validated against the shared contract schema, so a
 * frontend/backend drift fails loudly instead of rendering wrong data. Cookies are first-party
 * (same-origin proxy), never readable by script (HttpOnly).
 */
export async function apiFetch<T>(
  path: string,
  schema: ZodType<T> | null,
  init: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
    body?: unknown;
    signal?: AbortSignal;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      // For FormData the browser must set the multipart boundary itself.
      headers: {
        ...(init.body === undefined || isForm ? {} : { 'Content-Type': 'application/json' }),
        ...(init.headers ?? {}),
      },
      body:
        init.body === undefined
          ? undefined
          : isForm
            ? (init.body as FormData)
            : JSON.stringify(init.body),
      signal: init.signal,
      cache: 'no-store',
    });
  } catch {
    throw new ApiRequestError(
      'Could not reach the server. Check your connection and try again.',
      0,
      'NETWORK_ERROR',
    );
  }
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(await res.json().catch(() => null));
    if (parsed.success) {
      const { code, message, requestId, issues } = parsed.data.error;
      throw new ApiRequestError(message, res.status, code, requestId, issues);
    }
    throw new ApiRequestError(
      'The server returned an unexpected error.',
      res.status,
      'INTERNAL_ERROR',
    );
  }
  if (!schema || res.status === 204) return undefined as T;
  const parsed = schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) {
    throw new ApiRequestError(
      'The server response did not match the expected format.',
      res.status,
      'CONTRACT_VIOLATION',
    );
  }
  return parsed.data;
}
