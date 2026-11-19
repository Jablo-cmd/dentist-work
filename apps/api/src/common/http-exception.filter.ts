import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import type { ApiError, ErrorCode } from '@dpms/contracts';

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

interface BodyParserError {
  status: number;
  type: string;
}
function isBodyParserError(e: unknown): e is BodyParserError {
  const x = e as Partial<BodyParserError> | null;
  return (
    !!x &&
    typeof x.status === 'number' &&
    x.status >= 400 &&
    x.status < 500 &&
    typeof x.type === 'string'
  );
}

/** Domain exceptions can carry an explicit code to override the status-derived one. */
export class CodedHttpException extends HttpException {
  constructor(
    status: number,
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message, status);
  }
}

/**
 * Single place where errors become HTTP responses. Guarantees the standard envelope and that
 * internal details (stack traces, SQL, Prisma messages) are never sent to clients.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request & { id?: string }>();
    const requestId = String(req.id ?? res.getHeader('x-request-id') ?? 'unknown');

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred.';
    let issues: ApiError['error']['issues'];

    if (exception instanceof ZodError) {
      status = HttpStatus.BAD_REQUEST;
      code = 'VALIDATION_FAILED';
      message = 'The request failed validation.';
      issues = exception.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    } else if (exception instanceof ThrottlerException) {
      status = HttpStatus.TOO_MANY_REQUESTS;
      code = 'RATE_LIMITED';
      message = 'Too many requests. Please try again later.';
    } else if (exception instanceof CodedHttpException) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = STATUS_TO_CODE[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_FAILED');
      if (status === 401) message = 'Authentication required.';
      else if (status === 403) message = 'Access denied.';
      else if (status === 404) message = 'Resource not found.';
      else if (status >= 500) message = 'An unexpected error occurred.';
      // 400/409 etc.: messages are authored by this codebase for the user (e.g. "That practitioner is
      // already booked"), so they are passed through.
      else message = exception.message;
    } else if (isBodyParserError(exception)) {
      // Malformed JSON / oversized body raised by Express' body parser (not a Nest exception).
      status = exception.status;
      code = 'VALIDATION_FAILED';
      message =
        status === 413 ? 'The request body is too large.' : 'The request body could not be read.';
    }

    if (status >= 500) {
      // Log class/message only; never the request body, headers or cookies.
      const err = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error({
        requestId,
        errName: err.name,
        errMessage: err.message,
        stack: err.stack,
      });
    }

    const body: ApiError = { error: { code, message, requestId, ...(issues ? { issues } : {}) } };
    res.status(status).json(body);
  }
}
