/**
 * Password Management Routes: Change, Forgot, Reset
 */

import type { Express } from "express";
import { AuthService } from "../service.ts";
import { authenticateUser } from "../middleware.ts";
import { authLimiter } from "../../middleware/rateLimit.ts";
import { requireCsrfToken } from "../../middleware/csrf.ts";
import { AuditLogger, getClientIP } from "../audit.ts";
import logger from "../../logger.ts";

export function setupPasswordRoutes(app: Express) {
  /**
   * Change password (authenticated users)
   * Invalidates all other sessions for security
   */
  app.post("/api/auth/change-password", authenticateUser, requireCsrfToken, async (req, res) => {
    const ipAddress = getClientIP(req);
    const userAgent = req.headers["user-agent"] || undefined;
    const sessionToken = req.cookies?.sessionToken;

    try {
      const user = req.currentUser!;
      const { currentPassword, newPassword } = req.body;

      // Validate input
      if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
        return res.status(400).json({
          error: "Password must be at least 8 characters",
          code: "INVALID_PASSWORD",
        });
      }

      // Check password requirements
      if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
        return res.status(400).json({
          error: "Password must contain uppercase, lowercase, and number",
          code: "WEAK_PASSWORD",
        });
      }

      const result = await AuthService.changePassword(
        user.id,
        currentPassword || "",
        newPassword,
        sessionToken
      );

      if (!result.success) {
        return res.status(400).json({
          error: result.message,
          code: "PASSWORD_CHANGE_FAILED",
        });
      }

      // Log the password change
      await AuditLogger.logPasswordChanged(user.id, user.email, ipAddress, userAgent);

      res.json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      logger.error("Password change error", { error: String(error) });
      res.status(500).json({ error: "Password change failed" });
    }
  });

  /**
   * Request password reset (unauthenticated)
   */
  app.post("/api/auth/forgot-password", authLimiter, requireCsrfToken, async (req, res) => {
    const ipAddress = getClientIP(req);

    try {
      const { email } = req.body;

      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Email is required" });
      }

      // Generate reset token (returns null if user not found, but we don't reveal this)
      const resetToken = await AuthService.generatePasswordResetToken(email);

      // Log the request (internally track if user exists)
      await AuditLogger.logPasswordResetRequested(email, ipAddress, !!resetToken);
      // NOTE: Email delivery is handled by Firebase's sendPasswordResetEmail on the client side.
      // This server endpoint generates and logs the reset token for audit purposes.

      // Always return success to prevent email enumeration
      res.json({
        success: true,
        message: "If an account with that email exists, you will receive a password reset link.",
      });
    } catch (error) {
      logger.error("Forgot password error", { error: String(error) });
      res.status(500).json({ error: "Failed to process request" });
    }
  });

  /**
   * Reset password with token (unauthenticated)
   */
  app.post("/api/auth/reset-password", authLimiter, requireCsrfToken, async (req, res) => {
    const ipAddress = getClientIP(req);

    try {
      const { token, newPassword } = req.body;

      if (!token || typeof token !== "string") {
        return res.status(400).json({ error: "Reset token is required" });
      }

      if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
        return res.status(400).json({
          error: "Password must be at least 8 characters",
          code: "INVALID_PASSWORD",
        });
      }

      // Check password requirements
      if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
        return res.status(400).json({
          error: "Password must contain uppercase, lowercase, and number",
          code: "WEAK_PASSWORD",
        });
      }

      const user = await AuthService.resetPassword(token, newPassword);

      if (!user) {
        // Generic error to prevent token enumeration
        return res.status(400).json({
          error: "Invalid or expired reset link. Please request a new one.",
          code: "INVALID_TOKEN",
        });
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
      res.status(500).json({ error: "Password reset failed" });
    }
  });
}
