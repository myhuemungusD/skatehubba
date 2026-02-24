/**
 * Firestore-based Rate Limiting
 *
 * Replaces the previous in-memory Map implementation which was ineffective
 * across Cloud Function cold starts and multiple instances. This implementation
 * uses Firestore transactions to enforce rate limits reliably across all instances.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { getAdminDb } from "../firebaseAdmin";

const RATE_LIMIT = {
  maxRequests: 10, // Max requests per window
  windowMs: 60 * 1000, // 1 minute window
};

/**
 * Check if a user has exceeded the rate limit using Firestore-backed counters.
 * This works correctly across multiple Cloud Function instances and cold starts,
 * unlike the previous in-memory Map approach.
 *
 * @throws HttpsError with code "resource-exhausted" if limit exceeded
 */
export async function checkRateLimit(uid: string): Promise<void> {
  const db = getAdminDb();
  const rateLimitRef = db.doc(`rate_limits/${uid}`);
  const now = Date.now();

  await db.runTransaction(async (tx) => {
    const doc = await tx.get(rateLimitRef);

    if (!doc.exists) {
      tx.set(rateLimitRef, {
        count: 1,
        resetAt: admin.firestore.Timestamp.fromMillis(now + RATE_LIMIT.windowMs),
      });
      return;
    }

    const data = doc.data()!;
    const resetAt = data.resetAt as admin.firestore.Timestamp;

    if (now > resetAt.toMillis()) {
      // Window expired — reset counter
      tx.update(rateLimitRef, {
        count: 1,
        resetAt: admin.firestore.Timestamp.fromMillis(now + RATE_LIMIT.windowMs),
      });
      return;
    }

    if ((data.count as number) >= RATE_LIMIT.maxRequests) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many requests. Please try again later."
      );
    }

    tx.update(rateLimitRef, {
      count: admin.firestore.FieldValue.increment(1),
    });
  });
}
