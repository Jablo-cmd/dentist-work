import type { AppRequest } from '../auth/auth.types';

export interface Ctx {
  requestId: string;
  ip?: string;
}
export const ctxOf = (req: AppRequest): Ctx => ({ requestId: req.id, ip: req.ip });
