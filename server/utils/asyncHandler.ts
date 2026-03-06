import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Wraps an async Express route handler so that rejected promises are forwarded
 * to Express's error handler via `next(err)`.
 *
 * Express 4 does NOT automatically catch rejected promises from async handlers,
 * which means an uncaught `await` rejection silently drops the request (no
 * response is ever sent, causing the client to time out or Vercel to return 502).
 *
 * This wrapper ensures that any error thrown inside an async handler reaches the
 * global error handler, which returns a structured 500 JSON response.
 *
 * @example
 * ```ts
 * router.post("/create", asyncHandler(async (req, res) => {
 *   // If this throws, Express will catch it and forward to the error handler
 *   const result = await db.insert(...);
 *   res.json(result);
 * }));
 * ```
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    // Return the promise so callers (including tests) can await it.
    // Express ignores return values from middleware, but returning the promise
    // is safe and avoids floating promises in unit tests.
    return Promise.resolve(fn(req, res, next)).catch(next) as unknown as void;
  };
}
