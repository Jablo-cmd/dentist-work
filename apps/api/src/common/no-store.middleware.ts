import type { NextFunction, Request, Response } from 'express';

/** API responses may contain sensitive data: forbid shared/browser caching by default. */
export function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
}
