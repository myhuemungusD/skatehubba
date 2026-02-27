/**
 * Core Authentication Routes: Login, Current User, Logout
 */

import type { Express } from "express";
import { AuthService } from "../service.ts";
import { authenticateUser } from "../middleware.ts";
import { authLimiter } from "../../middleware/rateLimit.ts";
import { admin } from "../../admin.ts";
import { AuditLogger } from "../audit.ts";
import { getClientIP } from "../audit.ts";
import { LockoutService } from "../lockout.ts";
import logger from "../../logger.ts";
import { sendVerificationEmail } from "../email.ts";

// NOTE: CSRF validation is handled globally by app.use("/api", requireCsrfToken)
// in server/index.ts. Do not add per-route requireCsrfToken here.

export function setupLoginRoutes(app: Express) {
  // Single login/register endpoint - Firebase ID token only (with rate limiting)
  app.post("/api/auth/login", authLimiter, async (req, res) => {
    const ipAddress = getClientIP(req);
    const userAgent = req.headers["user-agent"] || undefined;

    try {
      const authHeader = req.headers.authorization ?? "";

      if (!authHeader.startsWith("Bearer ")) {
        await AuditLogger.logLoginFailure(null, ipAddress, userAgent, "Missing Firebase ID token");
        return res.status(401).json({ error: "Authentication failed" });
      }

      const idToken = authHeader.slice("Bearer ".length).trim();

      try {
        let decoded;
        // Handle mock tokens ONLY in development/test mode (no Firebase configured)
        // SECURITY: Mock tokens are blocked in staging and production
        const isMockToken = idToken === "mock-google-token" || idToken === "mock-token";
        const isDevelopment =
          process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

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
          return res.status(401).json({ error: "Authentication failed" });
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
            return res.status(429).json({
              error: LockoutService.getLockoutMessage(lockoutStatus.unlockAt),
              code: "ACCOUNT_LOCKED",
              unlockAt: lockoutStatus.unlockAt.toISOString(),
            });
          }
        }

        const uid = decoded.uid;
        const { firstName, lastName, isRegistration } = req.body;

        // Find or create user record
        let user = await AuthService.findUserByFirebaseUid(uid);
        if (!user) {
          const userFirstName = firstName || decoded.name?.split(" ")[0] || "User";
          // Create new user from Firebase token data
          // Only auto-verify if the Firebase token confirms email_verified (e.g. Google OAuth)
          const { user: newUser, emailToken } = await AuthService.createUser({
            email: decoded.email || `user${uid.slice(0, 8)}@firebase.local`,
            password: "firebase-auth-user", // Placeholder
            firstName: userFirstName,
            lastName: lastName || decoded.name?.split(" ").slice(1).join(" ") || "",
            firebaseUid: uid,
            isEmailVerified: !!decoded.email_verified,
          });
          user = newUser;

          // Send branded verification email for new email/password registrations
          if (isRegistration && !decoded.email_verified && decoded.email) {
            sendVerificationEmail(decoded.email, emailToken, userFirstName).catch((err) =>
              logger.error("Failed to send verification email", { error: String(err) })
            );
          }
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
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
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
        return res.status(401).json({ error: "Authentication failed" });
      }
    } catch (error) {
      logger.error("Login error", { error: String(error) });
      await AuditLogger.logLoginFailure(null, ipAddress, userAgent, "Internal server error");
      return res.status(500).json({ error: "Authentication failed" });
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
      res.status(500).json({
        error: "Failed to get user information",
      });
    }
  });

  // Logout endpoint
  app.post("/api/auth/logout", authenticateUser, async (req, res) => {
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
      res.status(500).json({
        error: "Logout failed",
      });
    }
  });
}
