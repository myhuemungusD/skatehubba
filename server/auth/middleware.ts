import type { Request, Response, NextFunction } from "express";
import { AuthService } from "./service.ts";
import type { CustomUser } from "../../packages/shared/schema.ts";
import type { AuthenticatedUser } from "../types/express.d.ts";
import { admin } from "../admin.ts";
import "../types/express.d.ts";

// Re-authentication window (5 minutes)
const REAUTH_WINDOW_MS = 5 * 60 * 1000;

// Store for recent authentications (in production, use Redis)
const recentAuths = new Map<string, number>();

/**
 * Authentication middleware to protect routes
 *
 * Verifies user authentication through:
 * 1. HttpOnly session cookie (preferred - XSS safe)
 * 2. Firebase ID token in Authorization header (fallback)
 *
 * Adds authenticated user to req.currentUser if valid
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export const authenticateUser = async (req: Request, res: Response, next: NextFunction) => {
  // Generic error message to prevent information leakage
  const GENERIC_AUTH_ERROR = "Authentication failed";

  try {
    // Option 1: Check for HttpOnly session cookie (PREFERRED - XSS safe)
    const sessionToken = req.cookies?.sessionToken;

    if (sessionToken) {
      try {
        // Verify session JWT and get user
        const user = await AuthService.validateSession(sessionToken);

        if (!user) {
          return res.status(401).json({ error: GENERIC_AUTH_ERROR });
        }

        if (!user.isActive) {
          // Don't reveal that account is deactivated specifically
          return res.status(401).json({ error: GENERIC_AUTH_ERROR });
        }

        // Attach user with roles (from Firebase custom claims if available)
        const roles: string[] = [];
        if (user.firebaseUid) {
          try {
            const firebaseUser = await admin.auth().getUser(user.firebaseUid);
            if (firebaseUser.customClaims?.admin) roles.push("admin");
          } catch {
            // Ignore Firebase errors, proceed without roles
          }
        }
        req.currentUser = { ...user, roles };
        return next();
      } catch (sessionError) {
        console.error("Session verification failed:", sessionError);
        // Fall through to try Authorization header
      }
    }

    // Option 2: Fallback to Authorization header (for backward compatibility)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: GENERIC_AUTH_ERROR });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
      // Verify Firebase ID token
      const decoded = await admin.auth().verifyIdToken(token, true);
      const user = await AuthService.findUserByFirebaseUid(decoded.uid);

      if (!user) {
        // Don't reveal that user doesn't exist
        return res.status(401).json({ error: GENERIC_AUTH_ERROR });
      }

      if (!user.isActive) {
        // Don't reveal that account is deactivated specifically
        return res.status(401).json({ error: GENERIC_AUTH_ERROR });
      }

      // Extract roles from Firebase custom claims
      const roles: string[] = [];
      if (decoded.admin) roles.push("admin");

      req.currentUser = { ...user, roles };
      next();
    } catch (firebaseError) {
      console.error("Firebase token verification failed:", firebaseError);
      return res.status(401).json({ error: GENERIC_AUTH_ERROR });
    }
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({ error: GENERIC_AUTH_ERROR });
  }
};

/**
 * Optional authentication middleware
 *
 * Attempts to authenticate user but doesn't require authentication.
 * Useful for endpoints that provide different content for authenticated vs anonymous users.
 * Sets req.currentUser if authentication succeeds, continues either way.
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export const optionalAuthentication = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      try {
        const decoded = await admin.auth().verifyIdToken(token, true);
        const user = await AuthService.findUserByFirebaseUid(decoded.uid);
        if (user && user.isActive) {
          const roles: string[] = [];
          if (decoded.admin) roles.push("admin");
          req.currentUser = { ...user, roles };
        }
      } catch {
        // Ignore authentication errors in optional mode
      }
    }
    next();
  } catch {
    // Ignore authentication errors in optional mode
    next();
  }
};

/**
 * Email verification requirement middleware
 *
 * Requires that the authenticated user has verified their email address.
 * Must be used after authenticateUser middleware.
 *
 * @param req - Express request object with currentUser
 * @param res - Express response object
 * @param next - Express next function
 */
export const requireEmailVerification = (req: Request, res: Response, next: NextFunction) => {
  if (!req.currentUser) {
    return res.status(401).json({ error: "Authentication failed" });
  }

  if (!req.currentUser.isEmailVerified) {
    return res.status(403).json({
      error: "Email verification required",
      code: "EMAIL_NOT_VERIFIED",
    });
  }

  next();
};

/**
 * Re-authentication middleware for sensitive operations
 *
 * Requires user to have authenticated within the last 5 minutes.
 * Used for high-risk operations like:
 * - Changing email address
 * - Changing password
 * - Enabling/disabling MFA
 * - Deleting account
 * - Changing payment methods
 *
 * Usage: Apply after authenticateUser middleware
 * Client must call /api/auth/verify-identity first to confirm identity
 *
 * @param req - Express request object with currentUser
 * @param res - Express response object
 * @param next - Express next function
 */
export const requireRecentAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.currentUser) {
    return res.status(401).json({ error: "Authentication failed" });
  }

  const userId = req.currentUser.id;
  const lastAuth = recentAuths.get(userId);
  const now = Date.now();

  if (!lastAuth || now - lastAuth > REAUTH_WINDOW_MS) {
    return res.status(403).json({
      error: "Please verify your identity to continue",
      code: "REAUTH_REQUIRED",
      message: "This action requires recent authentication. Please re-enter your password.",
    });
  }

  next();
};

/**
 * Record a successful re-authentication for a user
 * Call this after verifying user's password/MFA for sensitive operations
 *
 * @param userId - User ID to record re-auth for
 */
export function recordRecentAuth(userId: string): void {
  recentAuths.set(userId, Date.now());

  // Clean up old entries periodically
  if (Math.random() < 0.1) {
    const cutoff = Date.now() - REAUTH_WINDOW_MS;
    for (const [id, timestamp] of recentAuths.entries()) {
      if (timestamp < cutoff) {
        recentAuths.delete(id);
      }
    }
  }
}

/**
 * Clear re-authentication status for a user
 * Call this after sensitive operation completes or on logout
 *
 * @param userId - User ID to clear re-auth for
 */
export function clearRecentAuth(userId: string): void {
  recentAuths.delete(userId);
}

/**
 * Admin role requirement middleware
 *
 * Requires that the authenticated user has admin privileges.
 * Must be used after authenticateUser middleware.
 */
export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.currentUser) {
    return res.status(401).json({ error: "Authentication failed" });
  }

  try {
    // Check Firebase custom claims for admin role
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const decoded = await admin.auth().verifyIdToken(token);

      if (decoded.admin === true || (decoded.roles as string[])?.includes("admin")) {
        return next();
      }
    }

    // Fallback: Check database for admin flag (if implemented)
    // This is a placeholder for your admin check logic

    return res.status(403).json({
      error: "Admin access required",
      code: "ADMIN_REQUIRED",
    });
  } catch (error) {
    console.error("Admin check failed:", error);
    return res.status(403).json({
      error: "Admin access required",
      code: "ADMIN_REQUIRED",
    });
  }
};
