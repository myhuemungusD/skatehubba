/**
 * Re-authentication Route for Sensitive Operations
 */

import type { Express } from "express";
import { AuthService } from "../service.ts";
import { authenticateUser, recordRecentAuth } from "../middleware.ts";
import { requireCsrfToken } from "../../middleware/csrf.ts";
import { admin } from "../../admin.ts";
import { AuditLogger, getClientIP } from "../audit.ts";
import { MfaService } from "../mfa.ts";
import logger from "../../logger.ts";

export function setupReauthRoutes(app: Express) {
  /**
   * Verify identity for sensitive operations
   * Call this before operations that require recent authentication
   * Valid for 5 minutes after successful verification
   */
  app.post("/api/auth/verify-identity", authenticateUser, requireCsrfToken, async (req, res) => {
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
          return res.status(400).json({
            error: "MFA code required for identity verification",
            code: "MFA_REQUIRED",
            mfaEnabled: true,
          });
        }

        const mfaValid = await MfaService.verifyCode(
          user.id,
          user.email,
          mfaCode,
          ipAddress,
          userAgent
        );

        if (!mfaValid) {
          return res.status(401).json({
            error: "Invalid MFA code",
            code: "INVALID_MFA",
          });
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
              return res.status(401).json({
                error: "Please sign in again to continue",
                code: "STALE_TOKEN",
              });
            }
          } catch (err) {
            return res.status(401).json({
              error: "Identity verification failed",
              code: "INVALID_TOKEN",
            });
          }
        } else if (password) {
          // Traditional password verification
          const dbUser = await AuthService.findUserById(user.id);

          if (dbUser && dbUser.passwordHash !== "firebase-auth-user") {
            const isValid = await AuthService.verifyPassword(password, dbUser.passwordHash);

            if (!isValid) {
              return res.status(401).json({
                error: "Invalid password",
                code: "INVALID_PASSWORD",
              });
            }
          }
        } else {
          return res.status(400).json({
            error: "Password required for identity verification",
            code: "PASSWORD_REQUIRED",
          });
        }
      }

      // Record successful re-authentication
      recordRecentAuth(user.id);

      await AuditLogger.log({
        eventType: "AUTH_REAUTH_SUCCESS" as any,
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
      res.status(500).json({ error: "Identity verification failed" });
    }
  });
}
