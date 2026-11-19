import { ArgumentsHost, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ZodError, z } from 'zod';
import { AllExceptionsFilter } from './http-exception.filter';

function run(exception: unknown) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status, getHeader: () => undefined }),
      getRequest: () => ({ id: 'req-1234567' }),
    }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return { status: status.mock.calls[0][0], body: json.mock.calls[0][0] };
}

describe('AllExceptionsFilter', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterAll(() => jest.restoreAllMocks());

  it('maps zod errors to VALIDATION_FAILED with field issues', () => {
    const parsed = z.object({ a: z.string() }).safeParse({});
    if (parsed.success) throw new Error('expected failure');
    const err: ZodError = parsed.error;
    const { status, body } = run(err);
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.issues[0].path).toBe('a');
    expect(body.error.requestId).toBe('req-1234567');
  });
  it('maps 403/404/429 to stable generic messages', () => {
    expect(run(new ForbiddenException('internal detail')).body.error).toMatchObject({
      code: 'FORBIDDEN',
      message: 'Access denied.',
    });
    expect(run(new NotFoundException('Practice 123 missing')).body.error.message).toBe(
      'Resource not found.',
    );
    expect(run(new ThrottlerException()).status).toBe(429);
  });
  it('hides internals of unexpected errors', () => {
    const { status, body } = run(new Error('SELECT * FROM users failed: password=hunter2'));
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });
});
