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

import type { Express } from "express";
import { setupLoginRoutes } from "./routes/login.ts";
import { setupMfaRoutes } from "./routes/mfa.ts";
import { setupEmailVerificationRoutes } from "./routes/emailVerification.ts";
import { setupPasswordRoutes } from "./routes/password.ts";
import { setupReauthRoutes } from "./routes/reauth.ts";

export function setupAuthRoutes(app: Express) {
  setupLoginRoutes(app);
  setupMfaRoutes(app);
  setupEmailVerificationRoutes(app);
  setupPasswordRoutes(app);
  setupReauthRoutes(app);
}
