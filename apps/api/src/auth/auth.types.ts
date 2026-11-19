import type { Request } from 'express';
import type { CurrentUser } from '@dpms/contracts';

/** The authenticated caller, resolved server-side from the session on every request. */
export interface Principal extends CurrentUser {
  sessionId: string;
}

export interface AppRequest extends Request {
  id: string;
  principal?: Principal;
}
