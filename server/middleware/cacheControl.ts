import type { Request, Response, NextFunction } from "express";

/**
 * Prevent caching of sensitive responses by CDNs and browsers.
 * Use on auth endpoints, profile `/me`, or any route that returns
 * session tokens, user identity, or other private state.
 */
export function noCache(_req: Request, res: Response, next: NextFunction): void {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  next();
}
