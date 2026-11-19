import { ApiRequestError } from './api';

/** Turns an API failure into a user-facing sentence, including field issues when present. */
export function describeError(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.issues?.length)
      return err.issues.map((i) => `${i.path ? i.path + ': ' : ''}${i.message}`).join('; ');
    return err.message;
  }
  return 'An unexpected error occurred.';
}
