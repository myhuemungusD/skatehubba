import type { Request, Response, NextFunction } from "express";
import { admin } from "../admin.ts";

/**
 * Extended Request type with Firebase UID
 *
 * Use this type when you need the raw Firebase UID without
 * loading the full user profile from the database.
 */
export interface FirebaseAuthedRequest extends Request {
  /** Firebase UID derived from verified ID token */
  firebaseUid: string;
}

/**
 * Lightweight Firebase Auth Middleware
 *
 * SECURITY: This middleware derives the UID from the Firebase ID token.
 * NEVER trust user_id sent from the client.
 *
 * Use cases:
 * - Analytics ingestion (just need UID, no profile lookup)
 * - High-throughput endpoints where full user lookup is expensive
 * - Endpoints that only need to verify "is this a real user"
 *
 * For endpoints that need the full user profile, use authenticateUser
 * from server/auth/middleware.ts instead.
 *
 * @example
 * ```ts
 * import { requireFirebaseUid, FirebaseAuthedRequest } from './middleware/firebaseUid.ts';
 *
 * router.post('/analytics/ingest', requireFirebaseUid, (req: FirebaseAuthedRequest, res) => {
 *   const uid = req.firebaseUid; // Guaranteed to be valid
 *   // ...
 * });
 * ```
 */
export async function requireFirebaseUid(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.header("Authorization") || "";
    const match = header.match(/^Bearer (.+)$/);

    if (!match) {
      res.status(401).json({ error: "missing_bearer_token" });
      return;
    }

    const token = match[1];

    // Verify token and extract UID
    // Second param `true` checks if token was revoked
    const decoded = await admin.auth().verifyIdToken(token, true);

    // Attach UID to request
    (req as FirebaseAuthedRequest).firebaseUid = decoded.uid;

    next();
  } catch (error) {
    // Don't leak error details to client
    console.error("[FirebaseAuth] Token verification failed:", error);
    res.status(401).json({ error: "invalid_token" });
  }
}

/**
 * Optional Firebase Auth Middleware
 *
 * Like requireFirebaseUid but doesn't reject unauthenticated requests.
 * Sets firebaseUid if valid token present, otherwise leaves undefined.
 *
 * Use for endpoints that work with or without auth (e.g., public feeds
 * that show personalized content when logged in).
 */
export async function optionalFirebaseUid(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.header("Authorization") || "";
    const match = header.match(/^Bearer (.+)$/);

    if (match) {
      const token = match[1];
      const decoded = await admin.auth().verifyIdToken(token, true);
      (req as FirebaseAuthedRequest).firebaseUid = decoded.uid;
    }
  } catch {
    // Silently ignore invalid tokens for optional auth
  }

  next();
}
