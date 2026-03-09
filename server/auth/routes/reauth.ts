/**
 * Re-authentication Route for Sensitive Operations
 */

import type { Express } from "express";
import { AuthService } from "../service.ts";
import { authenticateUser, recordRecentAuth } from "../middleware.ts";
import { admin } from "../../admin.ts";
import { AuditLogger, AUDIT_EVENTS, getClientIP } from "../audit.ts";
import { MfaService } from "../mfa.ts";
import { sensitiveAuthLimiter } from "../../middleware/security.ts";
import logger from "../../logger.ts";
import { Errors } from "../../utils/apiError.ts";

// NOTE: CSRF validation is handled globally by app.use("/api", requireCsrfToken)
// in server/index.ts. Do not add per-route requireCsrfToken here.

export function setupReauthRoutes(app: Express) {
  /**
   * Verify identity for sensitive operations
   * Call this before operations that require recent authentication
   * Valid for 5 minutes after successful verification
   */
  app.post(
    "/api/auth/verify-identity",
    authenticateUser,
    sensitiveAuthLimiter,
    async (req, res) => {
      const ipAddress = getClientIP(req);
      const userAgent = req.headers["user-agent"] || undefined;

      try {
        const user = req.currentUser!;
        const { password, mfaCode } = req.body;

        // Check if MFA is enabled
        const mfaEnabled = await MfaService.isEnabled(user.id);

        if (mfaEnabled) {
          // If MFA is enabled, require MFA code
          if (!mfaCode || typeof mfaCode !== "string") {
            return Errors.badRequest(
              res,
              "MFA_REQUIRED",
              "MFA code required for identity verification",
              {
                mfaEnabled: true,
              }
            );
          }

          const mfaValid = await MfaService.verifyCode(
            user.id,
            user.email,
            mfaCode,
            ipAddress,
            userAgent
          );

          if (!mfaValid) {
            return Errors.unauthorized(res, "INVALID_MFA", "Invalid MFA code");
          }
        } else {
          // If no MFA, require password (for non-Firebase users)
          // Firebase users can use their Firebase ID token as proof
          const authHeader = req.headers.authorization;

          if (authHeader && authHeader.startsWith("Bearer ")) {
            // Firebase user - verify their token is fresh
            try {
              const token = authHeader.substring(7);
              const decoded = await admin.auth().verifyIdToken(token);

              // Check if token was issued recently (within 5 minutes)
              const authTime = decoded.auth_time ? decoded.auth_time * 1000 : 0;
              const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

              if (authTime < fiveMinutesAgo) {
                return Errors.unauthorized(res, "STALE_TOKEN", "Please sign in again to continue");
              }
            } catch {
              return Errors.unauthorized(res, "INVALID_TOKEN", "Identity verification failed");
            }
          } else if (password) {
            // Traditional password verification
            const dbUser = await AuthService.findUserById(user.id);

            if (dbUser && dbUser.passwordHash !== "firebase-auth-user") {
              const isValid = await AuthService.verifyPassword(password, dbUser.passwordHash);

              if (!isValid) {
                return Errors.unauthorized(res, "INVALID_PASSWORD", "Invalid password");
              }
            }
          } else {
            return Errors.badRequest(
              res,
              "PASSWORD_REQUIRED",
              "Password required for identity verification"
            );
          }
        }

        // Record successful re-authentication
        recordRecentAuth(user.id);

        await AuditLogger.log({
          eventType: AUDIT_EVENTS.REAUTH_SUCCESS,
          userId: user.id,
          email: user.email,
          ipAddress,
          userAgent,
          success: true,
        });

        res.json({
          success: true,
          message: "Identity verified. You can proceed with sensitive operations.",
          expiresIn: 5 * 60, // 5 minutes in seconds
        });
      } catch (error) {
        logger.error("Identity verification error", { error: String(error) });
        Errors.internal(res, "VERIFICATION_FAILED", "Identity verification failed");
      }
    }
  );
}
