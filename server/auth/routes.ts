/**
 * Authentication Routes
 *
 * Configures all authentication-related endpoints:
 * - Login/Registration with Firebase ID token
 * - Current user information retrieval
 * - Logout and session management
 * - Multi-Factor Authentication (MFA)
 * - Email verification
 * - Password management (change, forgot, reset)
 * - Re-authentication for sensitive operations
 *
 * @param app - Express application instance
 */

import type { Express, Request, Response, NextFunction } from "express";
import { setupLoginRoutes } from "./routes/login.ts";
import { setupMfaRoutes } from "./routes/mfa.ts";
import { setupEmailVerificationRoutes } from "./routes/emailVerification.ts";
import { setupPasswordRoutes } from "./routes/password.ts";
import { setupReauthRoutes } from "./routes/reauth.ts";

/**
 * Prevent caching of auth responses by CDNs and browsers.
 * Auth endpoints return session tokens, user identity, and sensitive state —
 * none of which should ever be served from a shared or local cache.
 */
function noCacheAuth(_req: Request, res: Response, next: NextFunction): void {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  next();
}

export function setupAuthRoutes(app: Express) {
  app.use("/api/auth", noCacheAuth);

  setupLoginRoutes(app);
  setupMfaRoutes(app);
  setupEmailVerificationRoutes(app);
  setupPasswordRoutes(app);
  setupReauthRoutes(app);
}
