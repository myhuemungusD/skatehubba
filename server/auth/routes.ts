import type { Express } from "express";
import { AuthService } from "./service.ts";
import { authenticateUser, recordRecentAuth } from "./middleware.ts";
import { authLimiter } from "../middleware/rateLimit.ts";
import { requireCsrfToken } from "../middleware/csrf.ts";
import { admin } from "../admin.ts";
import { AuditLogger, AUDIT_EVENTS, getClientIP } from "./audit.ts";
import { LockoutService } from "./lockout.ts";
import { MfaService } from "./mfa.ts";
import logger from "../logger.ts";
import { sendWelcomeEmail } from "../services/emailService.ts";
import { notifyUser } from "../services/notificationService.ts";
import {
  SESSION_COOKIE_MAX_AGE_MS,
  EMAIL_VERIFICATION_TOKEN_TTL_MS,
  REAUTH_FRESHNESS_MS,
} from "../config/constants.ts";
import { Errors } from "../utils/apiError.ts";

/**
 * Setup authentication routes for Firebase-based authentication
 *
 * Configures endpoints for:
 * - Login/Registration with Firebase ID token
 * - Current user information retrieval
 * - Logout and session management
 *
 * @param app - Express application instance
 */
export function setupAuthRoutes(app: Express) {
  // Single login/register endpoint - Firebase ID token only (with rate limiting)
  app.post("/api/auth/login", authLimiter, requireCsrfToken, async (req, res) => {
    const ipAddress = getClientIP(req);
    const userAgent = req.headers["user-agent"] || undefined;

    try {
      const authHeader = req.headers.authorization ?? "";

      if (!authHeader.startsWith("Bearer ")) {
        await AuditLogger.logLoginFailure(null, ipAddress, userAgent, "Missing Firebase ID token");
        return Errors.unauthorized(res, "AUTH_FAILED", "Authentication failed.");
      }

      const idToken = authHeader.slice("Bearer ".length).trim();

      try {
        let decoded;
        // Handle mock tokens ONLY in development mode (no Firebase configured)
        // SECURITY: Mock tokens are blocked in production
        const isMockToken =
          idToken === "mock-google-token" ||
          idToken === "mock-token";
        const isDevelopment = process.env.NODE_ENV !== "production";

        if (isMockToken && isDevelopment) {
          // Use deterministic UIDs so that subsequent logins find the existing user
          const isGoogle = idToken.includes("google");
          decoded = {
            uid: isGoogle ? "mock-google-uid-12345" : "mock-uid-12345",
            email: isGoogle ? "google@skatehubba.local" : "dev@skatehubba.local",
            name: isGoogle ? "Google Skater" : "Dev Skater",
          };
        } else if (isMockToken && !isDevelopment) {
          // Block mock tokens in production
          await AuditLogger.logLoginFailure(
            null,
            ipAddress,
            userAgent,
            "Mock token rejected in production"
          );
          return Errors.unauthorized(res, "AUTH_FAILED", "Authentication failed.");
        } else {
          // Verify Firebase ID token (without revocation check for better reliability)
          decoded = await admin.auth().verifyIdToken(idToken);
        }

        // Check for account lockout before proceeding
        const email = decoded.email || "";
        if (email) {
          const lockoutStatus = await LockoutService.checkLockout(email);
          if (lockoutStatus.isLocked && lockoutStatus.unlockAt) {
            await AuditLogger.logLoginFailure(email, ipAddress, userAgent, "Account locked");
            return Errors.rateLimited(res, LockoutService.getLockoutMessage(lockoutStatus.unlockAt), {
              code: "ACCOUNT_LOCKED",
              unlockAt: lockoutStatus.unlockAt.toISOString(),
            });
          }
        }

        const uid = decoded.uid;
        const { firstName, lastName, isRegistration: _isRegistration } = req.body;

        // Find or create user record
        let user = await AuthService.findUserByFirebaseUid(uid);

        if (!user) {
          // Create new user from Firebase token data
          const { user: newUser } = await AuthService.createUser({
            email: decoded.email || `user${uid.slice(0, 8)}@firebase.local`,
            password: "firebase-auth-user", // Placeholder
            firstName: firstName || decoded.name?.split(" ")[0] || "User",
            lastName: lastName || decoded.name?.split(" ").slice(1).join(" ") || "",
            firebaseUid: uid,
          });
          user = newUser;
        }

        // Sync Firebase email verification status to custom DB
        // If Firebase says email is verified but our DB doesn't, update it
        if (decoded.email_verified && !user.isEmailVerified) {
          await AuthService.verifyEmailByUserId(user.id);
          user = { ...user, isEmailVerified: true };
        }

        // Create session token for API access
        const { token: sessionJwt } = await AuthService.createSession(user.id);

        // Update last login
        await AuthService.updateLastLogin(user.id);

        // Clear any failed login attempts on success
        if (email) {
          await LockoutService.recordAttempt(email, ipAddress, true);
        }

        // Log successful login
        await AuditLogger.logLoginSuccess(user.id, user.email, ipAddress, userAgent, "firebase");

        // Set HttpOnly cookie (XSS-safe, auto-sent with requests)
        res.cookie("sessionToken", sessionJwt, {
          httpOnly: true, // JavaScript can't access (XSS protection)
          secure: process.env.NODE_ENV === "production", // HTTPS only in production
          sameSite: "lax", // CSRF protection
          maxAge: SESSION_COOKIE_MAX_AGE_MS,
          path: "/",
        });

        return res.status(200).json({
          user: {
            id: user.id,
            email: user.email,
            displayName: `${user.firstName} ${user.lastName}`.trim(),
            photoUrl: decoded.picture || null,
            roles: [],
            createdAt: user.createdAt,
            provider: "firebase",
          },
          strategy: "firebase",
          // NOTE: Token is in HttpOnly cookie, not returned in response for security
        });
      } catch (firebaseError) {
        logger.error("Firebase ID token verification failed", { error: String(firebaseError) });
        await AuditLogger.logLoginFailure(null, ipAddress, userAgent, "Invalid Firebase token");
        return Errors.unauthorized(res, "AUTH_FAILED", "Authentication failed.");
      }
    } catch (error) {
      logger.error("Login error", { error: String(error) });
      await AuditLogger.logLoginFailure(null, ipAddress, userAgent, "Internal server error");
      return Errors.internal(res, "AUTH_ERROR", "Authentication failed.");
    }
  });

  // Get current user endpoint
  app.get("/api/auth/me", authenticateUser, async (req, res) => {
    try {
      const user = req.currentUser!;
      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          isEmailVerified: user.isEmailVerified,
          accountTier: user.accountTier,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      logger.error("Get user error", { error: String(error) });
      Errors.internal(res, "USER_FETCH_FAILED", "Failed to get user information.");
    }
  });

  // Logout endpoint
  app.post("/api/auth/logout", authenticateUser, requireCsrfToken, async (req, res) => {
    const ipAddress = getClientIP(req);
    const userAgent = req.headers["user-agent"] || undefined;
    const user = req.currentUser!;

    try {
      // Delete session from cookie or Authorization header
      const sessionToken = req.cookies?.sessionToken;
      const authHeader = req.headers.authorization;

      if (sessionToken) {
        await AuthService.deleteSession(sessionToken);
      } else if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        await AuthService.deleteSession(token);
      }

      // Log the logout event
      await AuditLogger.logLogout(user.id, user.email, ipAddress, userAgent);

      // Clear the HttpOnly cookie
      res.clearCookie("sessionToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });

      res.json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error) {
      logger.error("Logout error", { error: String(error) });
      Errors.internal(res, "LOGOUT_FAILED", "Logout failed.");
    }
  });

  // =========================================================================
  // MFA (Multi-Factor Authentication) Routes
  // =========================================================================

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
      Errors.internal(res, "MFA_STATUS_FAILED", "Failed to check MFA status.");
    }
  });

  /**
   * Initiate MFA setup - returns secret and QR code URL
   */
  app.post("/api/auth/mfa/setup", authenticateUser, requireCsrfToken, async (req, res) => {
    try {
      const user = req.currentUser!;

      // Check if MFA is already enabled
      const isEnabled = await MfaService.isEnabled(user.id);
      if (isEnabled) {
        return Errors.badRequest(res, "MFA_ALREADY_ENABLED", "MFA is already enabled. Disable it first to set up again.");
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
      Errors.internal(res, "MFA_SETUP_FAILED", "Failed to initiate MFA setup.");
    }
  });

  /**
   * Complete MFA setup by verifying first code
   */
  app.post("/api/auth/mfa/verify-setup", authenticateUser, requireCsrfToken, async (req, res) => {
    const ipAddress = getClientIP(req);
    const userAgent = req.headers["user-agent"] || undefined;

    try {
      const user = req.currentUser!;
      const { code } = req.body;

      if (!code || typeof code !== "string" || code.length !== 6) {
        return Errors.badRequest(res, "INVALID_CODE_FORMAT", "Valid 6-digit code required.");
      }

      const success = await MfaService.verifySetup(user.id, user.email, code, ipAddress, userAgent);

      if (success) {
        res.json({
          success: true,
          message: "MFA has been enabled successfully.",
        });
      } else {
        Errors.badRequest(res, "INVALID_CODE", "Invalid verification code. Please try again.");
      }
    } catch (error) {
      logger.error("MFA verify setup error", { error: String(error) });
      Errors.internal(res, "MFA_VERIFY_SETUP_FAILED", "Failed to verify MFA setup.");
    }
  });

  /**
   * Verify MFA code during login
   */
  app.post("/api/auth/mfa/verify", authenticateUser, requireCsrfToken, async (req, res) => {
    const ipAddress = getClientIP(req);
    const userAgent = req.headers["user-agent"] || undefined;

    try {
      const user = req.currentUser!;
      const { code, isBackupCode } = req.body;

      if (!code || typeof code !== "string") {
        return Errors.badRequest(res, "MISSING_CODE", "Code is required.");
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
        Errors.unauthorized(res, "INVALID_CODE", "Invalid code. Please try again.");
      }
    } catch (error) {
      logger.error("MFA verify error", { error: String(error) });
      Errors.internal(res, "MFA_VERIFY_FAILED", "MFA verification failed.");
    }
  });

  /**
   * Disable MFA for user
   */
  app.post("/api/auth/mfa/disable", authenticateUser, requireCsrfToken, async (req, res) => {
    const ipAddress = getClientIP(req);
    const userAgent = req.headers["user-agent"] || undefined;

    try {
      const user = req.currentUser!;
      const { code } = req.body;

      // Require current MFA code to disable
      if (!code || typeof code !== "string") {
        return Errors.badRequest(res, "MISSING_CODE", "Current MFA code required to disable.");
      }

      const isValid = await MfaService.verifyCode(user.id, user.email, code, ipAddress, userAgent);

      if (!isValid) {
        return Errors.unauthorized(res, "INVALID_CODE", "Invalid MFA code.");
      }

      await MfaService.disable(user.id, user.email, ipAddress, userAgent);

      res.json({
        success: true,
        message: "MFA has been disabled.",
      });
    } catch (error) {
      logger.error("MFA disable error", { error: String(error) });
      Errors.internal(res, "MFA_DISABLE_FAILED", "Failed to disable MFA.");
    }
  });

  /**
   * Regenerate backup codes
   */
  app.post("/api/auth/mfa/backup-codes", authenticateUser, requireCsrfToken, async (req, res) => {
    const ipAddress = getClientIP(req);
    const userAgent = req.headers["user-agent"] || undefined;

    try {
      const user = req.currentUser!;
      const { code } = req.body;

      // Require current MFA code to regenerate backup codes
      if (!code || typeof code !== "string") {
        return Errors.badRequest(res, "MISSING_CODE", "Current MFA code required.");
      }

      const isValid = await MfaService.verifyCode(user.id, user.email, code, ipAddress, userAgent);

      if (!isValid) {
        return Errors.unauthorized(res, "INVALID_CODE", "Invalid MFA code.");
      }

      const backupCodes = await MfaService.regenerateBackupCodes(
        user.id,
        user.email,
        ipAddress,
        userAgent
      );

      if (!backupCodes) {
        return Errors.badRequest(res, "MFA_NOT_ENABLED", "MFA is not enabled.");
      }

      res.json({
        success: true,
        backupCodes,
        message: "New backup codes generated. Please save them securely.",
      });
    } catch (error) {
      logger.error("MFA backup codes error", { error: String(error) });
      Errors.internal(res, "BACKUP_CODES_FAILED", "Failed to regenerate backup codes.");
    }
  });

  // =========================================================================
  // Email Verification Routes
  // =========================================================================

  /**
   * Verify email address using token (sent via verification email)
   * Unauthenticated - user clicks link from email, SPA loads and POSTs token
   */
  app.post("/api/auth/verify-email", authLimiter, requireCsrfToken, async (req, res) => {
    const ipAddress = getClientIP(req);

    try {
      const { token } = req.body;

      if (!token || typeof token !== "string") {
        return Errors.badRequest(res, "TOKEN_REQUIRED", "Verification token is required.");
      }

      // Validate token format: must be 64-char hex (from generateSecureToken)
      if (token.length > 128 || !/^[a-f0-9]+$/i.test(token)) {
        return Errors.badRequest(res, "INVALID_TOKEN", "Invalid verification token format.");
      }

      const user = await AuthService.verifyEmail(token);

      if (!user) {
        return Errors.badRequest(res, "INVALID_TOKEN", "Invalid or expired verification link. Please request a new one.");
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
      Errors.internal(res, "EMAIL_VERIFY_FAILED", "Email verification failed.");
    }
  });

  /**
   * Resend verification email (authenticated users)
   */
  app.post(
    "/api/auth/resend-verification",
    authenticateUser,
    requireCsrfToken,
    authLimiter,
    async (req, res) => {
      const ipAddress = getClientIP(req);

      try {
        const user = req.currentUser!;

        if (user.isEmailVerified) {
          return Errors.badRequest(res, "ALREADY_VERIFIED", "Email is already verified.");
        }

        // Generate new verification token
        const token = AuthService.generateSecureToken();
        const expiry = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS);

        await AuthService.updateUser(user.id, {
          emailVerificationToken: token,
          emailVerificationExpires: expiry,
        });

        await AuditLogger.log({
          eventType: AUDIT_EVENTS.EMAIL_VERIFICATION_SENT,
          userId: user.id,
          email: user.email,
          ipAddress,
          success: true,
        });

        // NOTE: Email delivery is handled by Firebase's sendEmailVerification on the client side.
        // This endpoint regenerates the server-side token for audit/backup verification.

        res.json({
          success: true,
          message: "Verification email has been sent.",
        });
      } catch (error) {
        logger.error("Resend verification error", { error: String(error) });
        Errors.internal(res, "RESEND_VERIFY_FAILED", "Failed to resend verification email.");
      }
    }
  );

  // =========================================================================
  // Password Management Routes
  // =========================================================================

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
        return Errors.badRequest(res, "INVALID_PASSWORD", "Password must be at least 8 characters.");
      }

      // Check password requirements
      if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
        return Errors.badRequest(res, "WEAK_PASSWORD", "Password must contain uppercase, lowercase, and number.");
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

      res.json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      logger.error("Password change error", { error: String(error) });
      Errors.internal(res, "PASSWORD_CHANGE_FAILED", "Password change failed.");
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
        return Errors.badRequest(res, "EMAIL_REQUIRED", "Email is required.");
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
      Errors.internal(res, "FORGOT_PASSWORD_FAILED", "Failed to process request.");
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
        return Errors.badRequest(res, "RESET_TOKEN_REQUIRED", "Reset token is required.");
      }

      if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
        return Errors.badRequest(res, "INVALID_PASSWORD", "Password must be at least 8 characters.");
      }

      // Check password requirements
      if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
        return Errors.badRequest(res, "WEAK_PASSWORD", "Password must contain uppercase, lowercase, and number.");
      }

      const user = await AuthService.resetPassword(token, newPassword);

      if (!user) {
        // Generic error to prevent token enumeration
        return Errors.badRequest(res, "INVALID_TOKEN", "Invalid or expired reset link. Please request a new one.");
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
      Errors.internal(res, "PASSWORD_RESET_FAILED", "Password reset failed.");
    }
  });

  // =========================================================================
  // Re-authentication for Sensitive Operations
  // =========================================================================

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
          return Errors.badRequest(res, "MFA_REQUIRED", "MFA code required for identity verification.", { mfaEnabled: true });
        }

        const mfaValid = await MfaService.verifyCode(
          user.id,
          user.email,
          mfaCode,
          ipAddress,
          userAgent
        );

        if (!mfaValid) {
          return Errors.unauthorized(res, "INVALID_MFA", "Invalid MFA code.");
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

            // Check if token was issued recently
            const authTime = decoded.auth_time ? decoded.auth_time * 1000 : 0;
            const reauthCutoff = Date.now() - REAUTH_FRESHNESS_MS;

            if (authTime < reauthCutoff) {
              return Errors.unauthorized(res, "STALE_TOKEN", "Please sign in again to continue.");
            }
          } catch (err) {
            return Errors.unauthorized(res, "INVALID_TOKEN", "Identity verification failed.");
          }
        } else if (password) {
          // Traditional password verification
          const dbUser = await AuthService.findUserById(user.id);

          if (dbUser && dbUser.passwordHash !== "firebase-auth-user") {
            const isValid = await AuthService.verifyPassword(password, dbUser.passwordHash);

            if (!isValid) {
              return Errors.unauthorized(res, "INVALID_PASSWORD", "Invalid password.");
            }
          }
        } else {
          return Errors.badRequest(res, "PASSWORD_REQUIRED", "Password required for identity verification.");
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
        expiresIn: REAUTH_FRESHNESS_MS / 1000,
      });
    } catch (error) {
      logger.error("Identity verification error", { error: String(error) });
      Errors.internal(res, "IDENTITY_VERIFY_FAILED", "Identity verification failed.");
    }
  });
}
