/**
 * Password Management Routes: Change, Forgot, Reset
 */

import type { Express } from "express";
import { AuthService } from "../service.ts";
import { authenticateUser, requireRecentAuth } from "../middleware.ts";
import { authLimiter } from "../../middleware/rateLimit.ts";
import { sensitiveAuthLimiter } from "../../middleware/security.ts";
import { AuditLogger, getClientIP } from "../audit.ts";
import logger from "../../logger.ts";
import { sendPasswordResetEmail as sendBrandedResetEmail } from "../email.ts";
import { Errors } from "../../utils/apiError.ts";

// NOTE: CSRF validation is handled globally by app.use("/api", requireCsrfToken)
// in server/index.ts. Do not add per-route requireCsrfToken here — it would run
// the check twice (wasteful and misleading about where CSRF is enforced).

export function setupPasswordRoutes(app: Express) {
  /**
   * Change password (authenticated users)
   * Invalidates all other sessions for security
   */
  app.post(
    "/api/auth/change-password",
    authenticateUser,
    requireRecentAuth,
    sensitiveAuthLimiter,
    async (req, res) => {
      const ipAddress = getClientIP(req);
      const userAgent = req.headers["user-agent"] || undefined;
      const sessionToken = req.cookies?.sessionToken;

      try {
        const user = req.currentUser!;
        const { currentPassword, newPassword } = req.body;

        // Validate input (bcrypt truncates at 72 bytes — reject longer passwords)
        if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
          return Errors.badRequest(
            res,
            "INVALID_PASSWORD",
            "Password must be at least 8 characters"
          );
        }
        if (newPassword.length > 72) {
          return Errors.badRequest(
            res,
            "INVALID_PASSWORD",
            "Password must be at most 72 characters"
          );
        }

        // Check password requirements
        if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
          return Errors.badRequest(
            res,
            "WEAK_PASSWORD",
            "Password must contain uppercase, lowercase, and number"
          );
        }

        const result = await AuthService.changePassword(
          user.id,
          currentPassword || "",
          newPassword,
          sessionToken
        );

        if (!result.success) {
          return Errors.badRequest(res, "PASSWORD_CHANGE_FAILED", result.message);
        }

        // Log the password change
        await AuditLogger.logPasswordChanged(user.id, user.email, ipAddress, userAgent);

        // Refresh the session cookie with the new token
        if (result.sessionToken) {
          res.cookie("sessionToken", result.sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
            path: "/",
          });
        }

        res.json({
          success: true,
          message: result.message,
        });
      } catch (error) {
        logger.error("Password change error", { error: String(error) });
        return Errors.internal(res, "PASSWORD_CHANGE_FAILED", "Password change failed");
      }
    }
  );

  /**
   * Request password reset (unauthenticated)
   */
  app.post("/api/auth/forgot-password", authLimiter, async (req, res) => {
    const ipAddress = getClientIP(req);

    try {
      const { email } = req.body;

      if (!email || typeof email !== "string") {
        return Errors.badRequest(res, "MISSING_EMAIL", "Email is required");
      }

      // Generate reset token (returns null if user not found, but we don't reveal this)
      const resetToken = await AuthService.generatePasswordResetToken(email);

      // Log the request (internally track if user exists)
      await AuditLogger.logPasswordResetRequested(email, ipAddress, !!resetToken);

      // Send branded password reset email if user exists
      if (resetToken) {
        const user = await AuthService.findUserByEmail(email);
        const name = user?.firstName || "Skater";
        sendBrandedResetEmail(email, resetToken, name).catch((err) =>
          logger.error("Failed to send password reset email", { error: String(err) })
        );
      }

      // Always return success to prevent email enumeration
      res.json({
        success: true,
        message: "If an account with that email exists, you will receive a password reset link.",
      });
    } catch (error) {
      logger.error("Forgot password error", { error: String(error) });
      return Errors.internal(res, "FORGOT_PASSWORD_FAILED", "Failed to process request");
    }
  });

  /**
   * Reset password with token (unauthenticated)
   */
  app.post("/api/auth/reset-password", authLimiter, async (req, res) => {
    const ipAddress = getClientIP(req);

    try {
      const { token, newPassword } = req.body;

      if (!token || typeof token !== "string") {
        return Errors.badRequest(res, "MISSING_TOKEN", "Reset token is required");
      }

      if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
        return Errors.badRequest(res, "INVALID_PASSWORD", "Password must be at least 8 characters");
      }
      if (newPassword.length > 72) {
        return Errors.badRequest(res, "INVALID_PASSWORD", "Password must be at most 72 characters");
      }

      // Check password requirements
      if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
        return Errors.badRequest(
          res,
          "WEAK_PASSWORD",
          "Password must contain uppercase, lowercase, and number"
        );
      }

      const user = await AuthService.resetPassword(token, newPassword);

      if (!user) {
        // Generic error to prevent token enumeration
        return Errors.badRequest(
          res,
          "INVALID_TOKEN",
          "Invalid or expired reset link. Please request a new one."
        );
      }

      // Log the password reset
      await AuditLogger.logPasswordChanged(user.id, user.email, ipAddress);
      await AuditLogger.logSessionsInvalidated(user.id, user.email, ipAddress, "password_reset");

      res.json({
        success: true,
        message: "Password has been reset successfully. All sessions have been logged out.",
      });
    } catch (error) {
      logger.error("Reset password error", { error: String(error) });
      return Errors.internal(res, "PASSWORD_RESET_FAILED", "Password reset failed");
    }
  });
}
