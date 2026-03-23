import type { Request, Response, NextFunction } from "express";
import { admin } from "../admin";
import { AuthService } from "./service";
import { DatabaseUnavailableError } from "../db";
import "../types/express.d";
import logger from "../logger";

// Fail-fast: prevent dev bypass from ever being active in production
if (process.env.NODE_ENV === "production" && process.env.DEV_ADMIN_BYPASS === "true") {
  throw new Error("FATAL: DEV_ADMIN_BYPASS must never be enabled in production");
}

/**
 * Core auth middleware — Firebase ID token verification only.
 * No session cookies, no Redis, no MFA. Just verify the Bearer token,
 * look up the user in PostgreSQL, and attach to req.currentUser.
 */
export const authenticateUser = async (req: Request, res: Response, next: NextFunction) => {
  const GENERIC_AUTH_ERROR = "Authentication failed";

  try {
    // Dev-only admin bypass for e2e testing
    if (
      (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") &&
      process.env.DEV_ADMIN_BYPASS === "true" &&
      req.headers["x-dev-admin"] === "true"
    ) {
      req.currentUser = {
        id: "dev-admin-000",
        firebaseUid: "dev-admin-uid",
        email: "admin@skatehubba.local",
        passwordHash: "",
        firstName: "Dev",
        lastName: "Admin",
        isActive: true,
        isEmailVerified: true,
        trustLevel: 100,
        roles: ["admin"],
        lastLoginAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: GENERIC_AUTH_ERROR });
    }

    const token = authHeader.substring(7);
    const decoded = await admin.auth().verifyIdToken(token, true);
    const user = await AuthService.findUserByFirebaseUid(decoded.uid);

    if (!user || !user.isActive) {
      return res.status(401).json({ error: GENERIC_AUTH_ERROR });
    }

    const roles: string[] = [];
    if (decoded.admin) roles.push("admin");

    req.currentUser = { ...user, roles };
    next();
  } catch (error) {
    // Database down → 503 not 401
    if (error instanceof DatabaseUnavailableError) {
      return res.status(503).json({ error: "DATABASE_UNAVAILABLE", message: "Service temporarily unavailable." });
    }
    logger.error("Authentication error", { error: String(error) });
    res.status(401).json({ error: GENERIC_AUTH_ERROR });
  }
};

/**
 * Optional auth — same as authenticateUser but doesn't reject unauthenticated requests.
 */
export const optionalAuthentication = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const decoded = await admin.auth().verifyIdToken(token, true);
      const user = await AuthService.findUserByFirebaseUid(decoded.uid);
      if (user && user.isActive) {
        const roles: string[] = [];
        if (decoded.admin) roles.push("admin");
        req.currentUser = { ...user, roles };
      }
    }
    next();
  } catch {
    next();
  }
};
