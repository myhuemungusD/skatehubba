/**
 * Email Verification Routes
 */

import type { Express } from "express";
import { AuthService } from "../service.ts";
import { authenticateUser } from "../middleware.ts";
import { authLimiter } from "../../middleware/rateLimit.ts";
import { AuditLogger, AUDIT_EVENTS, getClientIP } from "../audit.ts";
import logger from "../../logger.ts";
import { sendWelcomeEmail } from "../../services/emailService.ts";
import { notifyUser } from "../../services/notificationService.ts";
import { sendVerificationEmail } from "../email.ts";

// NOTE: CSRF validation is handled globally by app.use("/api", requireCsrfToken)
// in server/index.ts. Do not add per-route requireCsrfToken here.

export function setupEmailVerificationRoutes(app: Express) {
  /**
   * Verify email address using token (sent via verification email)
   * Unauthenticated - user clicks link from email, SPA loads and POSTs token
   */
  app.post("/api/auth/verify-email", authLimiter, async (req, res) => {
    const ipAddress = getClientIP(req);

    try {
      const { token } = req.body;

      if (!token || typeof token !== "string") {
        return res.status(400).json({ error: "Verification token is required" });
      }

      // Validate token format: must be 64-char hex (from generateSecureToken)
      if (token.length > 128 || !/^[a-f0-9]+$/i.test(token)) {
        return res.status(400).json({
          error: "Invalid verification token format.",
          code: "INVALID_TOKEN",
        });
      }

      const user = await AuthService.verifyEmail(token);

      if (!user) {
        return res.status(400).json({
          error: "Invalid or expired verification link. Please request a new one.",
          code: "INVALID_TOKEN",
        });
      }

      await AuditLogger.log({
        eventType: AUDIT_EVENTS.EMAIL_VERIFIED,
        userId: user.id,
        email: user.email,
        ipAddress,
        success: true,
      });

      // Send welcome email + in-app notification (non-blocking)
      const name = user.firstName || "Skater";
      sendWelcomeEmail(user.email, name).catch((err) =>
        logger.error("Failed to send welcome email", { error: String(err) })
      );
      notifyUser({
        userId: user.id,
        type: "welcome",
        title: "Welcome to SkateHubba",
        body: "Your account is verified. Start exploring spots and challenging skaters.",
      }).catch((err) =>
        logger.error("Failed to send welcome notification", { error: String(err) })
      );

      res.json({
        success: true,
        message: "Email verified successfully! You can now sign in.",
      });
    } catch (error) {
      logger.error("Email verification error", { error: String(error) });
      res.status(500).json({ error: "Email verification failed" });
    }
  });

  /**
   * Resend verification email (authenticated users)
   */
  app.post(
    "/api/auth/resend-verification",
    authenticateUser,
    authLimiter,
    async (req, res) => {
      const ipAddress = getClientIP(req);

      try {
        const user = req.currentUser!;

        if (user.isEmailVerified) {
          return res.status(400).json({
            error: "Email is already verified",
            code: "ALREADY_VERIFIED",
          });
        }

        // Generate new verification token
        const token = AuthService.generateSecureToken();
        const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        await AuthService.updateUser(user.id, {
          emailVerificationToken: token,
          emailVerificationExpires: expiry,
        });

        // Send branded verification email via Resend
        const name = user.firstName || "Skater";
        await sendVerificationEmail(user.email, token, name);

        await AuditLogger.log({
          eventType: AUDIT_EVENTS.EMAIL_VERIFICATION_SENT,
          userId: user.id,
          email: user.email,
          ipAddress,
          success: true,
        });

        res.json({
          success: true,
          message: "Verification email has been sent.",
        });
      } catch (error) {
        logger.error("Resend verification error", { error: String(error) });
        res.status(500).json({ error: "Failed to resend verification email" });
      }
    }
  );
}
