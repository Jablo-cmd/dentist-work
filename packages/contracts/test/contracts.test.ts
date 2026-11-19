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

import {
  createPatientRequestSchema,
  isValidSaIdChecksum,
  normalisePhone,
  updatePatientRequestSchema,
} from '../src';

describe('patient contracts', () => {
  const base = {
    firstName: 'A',
    lastName: 'B',
    dateOfBirth: '1990-01-01',
    practiceId: '11111111-1111-4111-8111-111111111111',
  };
  it('partial updates never inject defaults (regression: sex was reset on every PATCH)', () => {
    expect(updatePatientRequestSchema.parse({ city: 'X' })).toEqual({ city: 'X' });
    expect(createPatientRequestSchema.parse(base).sex).toBe('UNSPECIFIED');
  });
  it('rejects impossible calendar dates and future dates', () => {
    expect(
      createPatientRequestSchema.safeParse({ ...base, dateOfBirth: '1990-02-31' }).success,
    ).toBe(false);
    expect(
      createPatientRequestSchema.safeParse({ ...base, dateOfBirth: '2999-01-01' }).success,
    ).toBe(false);
  });
  it('normalises phone numbers and validates SA ID checksums', () => {
    expect(normalisePhone('082 000-0001')).toBe('+27820000001');
    expect(normalisePhone('+27 82 000 0001')).toBe('+27820000001');
    expect(isValidSaIdChecksum('8001015009087')).toBe(true);
    expect(isValidSaIdChecksum('8001015009088')).toBe(false);
  });
});
