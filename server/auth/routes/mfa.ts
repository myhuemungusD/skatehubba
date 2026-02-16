/**
 * Multi-Factor Authentication (MFA) Routes
 */

import type { Express } from "express";
import { authenticateUser } from "../middleware.ts";
import { getClientIP } from "../audit.ts";
import { MfaService } from "../mfa.ts";
import logger from "../../logger.ts";

// NOTE: CSRF validation is handled globally by app.use("/api", requireCsrfToken)
// in server/index.ts. Do not add per-route requireCsrfToken here.

export function setupMfaRoutes(app: Express) {
  /**
   * Check if user has MFA enabled
   */
  app.get("/api/auth/mfa/status", authenticateUser, async (req, res) => {
    try {
      const user = req.currentUser!;
      const enabled = await MfaService.isEnabled(user.id);

      res.json({
        enabled,
        userId: user.id,
      });
    } catch (error) {
      logger.error("MFA status error", { error: String(error) });
      res.status(500).json({ error: "Failed to check MFA status" });
    }
  });

  /**
   * Initiate MFA setup - returns secret and QR code URL
   */
  app.post("/api/auth/mfa/setup", authenticateUser, async (req, res) => {
    try {
      const user = req.currentUser!;

      // Check if MFA is already enabled
      const isEnabled = await MfaService.isEnabled(user.id);
      if (isEnabled) {
        return res.status(400).json({
          error: "MFA is already enabled. Disable it first to set up again.",
          code: "MFA_ALREADY_ENABLED",
        });
      }

      const setup = await MfaService.initiateSetup(user.id, user.email);

      res.json({
        secret: setup.secret,
        qrCodeUrl: setup.qrCodeUrl,
        backupCodes: setup.backupCodes,
        message: "Scan the QR code with your authenticator app, then verify with a code.",
      });
    } catch (error) {
      logger.error("MFA setup error", { error: String(error) });
      res.status(500).json({ error: "Failed to initiate MFA setup" });
    }
  });

  /**
   * Complete MFA setup by verifying first code
   */
  app.post("/api/auth/mfa/verify-setup", authenticateUser, async (req, res) => {
    const ipAddress = getClientIP(req);
    const userAgent = req.headers["user-agent"] || undefined;

    try {
      const user = req.currentUser!;
      const { code } = req.body;

      if (!code || typeof code !== "string" || code.length !== 6) {
        return res.status(400).json({
          error: "Valid 6-digit code required",
          code: "INVALID_CODE_FORMAT",
        });
      }

      const success = await MfaService.verifySetup(user.id, user.email, code, ipAddress, userAgent);

      if (success) {
        res.json({
          success: true,
          message: "MFA has been enabled successfully.",
        });
      } else {
        res.status(400).json({
          error: "Invalid verification code. Please try again.",
          code: "INVALID_CODE",
        });
      }
    } catch (error) {
      logger.error("MFA verify setup error", { error: String(error) });
      res.status(500).json({ error: "Failed to verify MFA setup" });
    }
  });

  /**
   * Verify MFA code during login
   */
  app.post("/api/auth/mfa/verify", authenticateUser, async (req, res) => {
    const ipAddress = getClientIP(req);
    const userAgent = req.headers["user-agent"] || undefined;

    try {
      const user = req.currentUser!;
      const { code, isBackupCode } = req.body;

      if (!code || typeof code !== "string") {
        return res.status(400).json({
          error: "Code is required",
          code: "MISSING_CODE",
        });
      }

      let success: boolean;

      if (isBackupCode) {
        success = await MfaService.verifyBackupCode(
          user.id,
          user.email,
          code,
          ipAddress,
          userAgent
        );
      } else {
        success = await MfaService.verifyCode(user.id, user.email, code, ipAddress, userAgent);
      }

      if (success) {
        res.json({
          success: true,
          message: "MFA verification successful.",
        });
      } else {
        res.status(401).json({
          error: "Invalid code. Please try again.",
          code: "INVALID_CODE",
        });
      }
    } catch (error) {
      logger.error("MFA verify error", { error: String(error) });
      res.status(500).json({ error: "MFA verification failed" });
    }
  });

  /**
   * Disable MFA for user
   */
  app.post("/api/auth/mfa/disable", authenticateUser, async (req, res) => {
    const ipAddress = getClientIP(req);
    const userAgent = req.headers["user-agent"] || undefined;

    try {
      const user = req.currentUser!;
      const { code } = req.body;

      // Require current MFA code to disable
      if (!code || typeof code !== "string") {
        return res.status(400).json({
          error: "Current MFA code required to disable",
          code: "MISSING_CODE",
        });
      }

      const isValid = await MfaService.verifyCode(user.id, user.email, code, ipAddress, userAgent);

      if (!isValid) {
        return res.status(401).json({
          error: "Invalid MFA code",
          code: "INVALID_CODE",
        });
      }

      await MfaService.disable(user.id, user.email, ipAddress, userAgent);

      res.json({
        success: true,
        message: "MFA has been disabled.",
      });
    } catch (error) {
      logger.error("MFA disable error", { error: String(error) });
      res.status(500).json({ error: "Failed to disable MFA" });
    }
  });

  /**
   * Regenerate backup codes
   */
  app.post("/api/auth/mfa/backup-codes", authenticateUser, async (req, res) => {
    const ipAddress = getClientIP(req);
    const userAgent = req.headers["user-agent"] || undefined;

    try {
      const user = req.currentUser!;
      const { code } = req.body;

      // Require current MFA code to regenerate backup codes
      if (!code || typeof code !== "string") {
        return res.status(400).json({
          error: "Current MFA code required",
          code: "MISSING_CODE",
        });
      }

      const isValid = await MfaService.verifyCode(user.id, user.email, code, ipAddress, userAgent);

      if (!isValid) {
        return res.status(401).json({
          error: "Invalid MFA code",
          code: "INVALID_CODE",
        });
      }

      const backupCodes = await MfaService.regenerateBackupCodes(
        user.id,
        user.email,
        ipAddress,
        userAgent
      );

      if (!backupCodes) {
        return res.status(400).json({
          error: "MFA is not enabled",
          code: "MFA_NOT_ENABLED",
        });
      }

      res.json({
        success: true,
        backupCodes,
        message: "New backup codes generated. Please save them securely.",
      });
    } catch (error) {
      logger.error("MFA backup codes error", { error: String(error) });
      res.status(500).json({ error: "Failed to regenerate backup codes" });
    }
  });
}
