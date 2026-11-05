/**
 * Request Log
 *
 * One line per request: time, method and path. The token in an unsubscribe
 * link is replaced with `[token]`, so the log never holds a working link.
 *
 * @module api/middleware/request-log
 */

import type { Request, Response, NextFunction } from 'express';

// Case-insensitive, as Express matches routes regardless of case.
const UNSUBSCRIBE_TOKEN = /(\/api\/mail\/unsubscribe\/)[^/?#]+/gi;

/** The path with every unsubscribe token replaced. */
export function redactPath(path: string): string {
  return path.replace(UNSUBSCRIBE_TOKEN, '$1[token]');
}

export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  console.log(`${new Date().toISOString()} ${req.method} ${redactPath(req.path)}`);
  next();
}
