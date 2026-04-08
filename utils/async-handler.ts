/**
 * Express async error handler wrapper.
 * Eliminates the repeated try/catch/next pattern in route handlers.
 *
 * Uses Record<string, string> for params instead of Express 5's ParamsDictionary
 * (which includes string[] for wildcard params we don't use).
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';

type FlatParams = Record<string, string>;

/**
 * Wraps an async Express route handler so that unhandled promise rejections
 * are automatically forwarded to Express error middleware via `next(err)`.
 *
 * @param fn - Async route handler function
 * @returns A synchronous Express {@link RequestHandler} that catches rejections
 */
export const asyncHandler = (fn: (req: Request<FlatParams>, res: Response, next: NextFunction) => Promise<any>): RequestHandler =>
    (req, res, next) => Promise.resolve(fn(req as Request<FlatParams>, res, next)).catch(next);
