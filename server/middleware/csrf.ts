import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

const CSRF_COOKIE_NAME = "csrfToken";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const createCsrfToken = () => crypto.randomBytes(32).toString("hex");

/**
 * CSRF protection for JSON APIs using a double-submit token strategy.
 *
 * This implements the "Double Submit Cookie" pattern recommended by OWASP:
 * https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
 *
 * How it works:
 * 1. ensureCsrfToken: Sets a random token in a cookie (httpOnly=false so JS can read it)
 * 2. Client: Reads cookie and sends it back in X-CSRF-Token header
 * 3. requireCsrfToken: Validates header matches cookie on state-changing requests
 *
 * This is secure because an attacker cannot read the cookie from a different origin
 * due to the Same-Origin Policy, so they cannot include the correct header.
 */
export function ensureCsrfToken(req: Request, res: Response, next: NextFunction): void {
  if (!req.cookies?.[CSRF_COOKIE_NAME]) {
    const token = createCsrfToken();
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false, // Must be readable by client JS to send in header
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    req.cookies[CSRF_COOKIE_NAME] = token;
  }

  next();
}

/**
 * Validates CSRF token on state-changing requests.
 * Safe methods (GET, HEAD, OPTIONS) are allowed through without validation.
 */
export function requireCsrfToken(req: Request, res: Response, next: NextFunction): Response | void {
  // Skip validation for safe/idempotent methods
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Skip CSRF for bearer-token auth (header-based auth is not cookie-bound)
  const authHeader = req.header("authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.header("x-csrf-token");

  // Validate: both tokens must exist and match
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }

  return next();
}
