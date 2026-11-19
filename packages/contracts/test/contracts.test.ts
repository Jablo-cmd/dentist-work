import { describe, expect, it } from 'vitest';
import {
  apiErrorSchema,
  loginRequestSchema,
  paginationQuerySchema,
  MAX_PAGE_SIZE,
  readinessSchema,
} from '../src';

describe('contracts', () => {
  it('normalises login email and rejects malformed input', () => {
    expect(loginRequestSchema.parse({ email: '  USER@Example.COM ', password: 'x' }).email).toBe(
      'user@example.com',
    );
    expect(loginRequestSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false);
    expect(loginRequestSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
    expect(
      loginRequestSchema.safeParse({ email: 'a@b.co', password: 'x'.repeat(257) }).success,
    ).toBe(false);
  });

  it('applies pagination defaults and bounds', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 25 });
    expect(paginationQuerySchema.parse({ page: '2', pageSize: '10' })).toEqual({
      page: 2,
      pageSize: 10,
    });
    expect(paginationQuerySchema.safeParse({ pageSize: MAX_PAGE_SIZE + 1 }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });

  it('validates the standard error envelope', () => {
    expect(
      apiErrorSchema.safeParse({ error: { code: 'FORBIDDEN', message: 'no', requestId: 'r1' } })
        .success,
    ).toBe(true);
    expect(
      apiErrorSchema.safeParse({ error: { code: 'MADE_UP', message: 'no', requestId: 'r1' } })
        .success,
    ).toBe(false);
  });

  it('validates readiness shape', () => {
    expect(
      readinessSchema.safeParse({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        checks: { database: { status: 'down', latencyMs: null } },
      }).success,
    ).toBe(true);
  });
});
