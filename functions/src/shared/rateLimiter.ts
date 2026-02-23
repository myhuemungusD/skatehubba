/**
 * Firestore-based Rate Limiting
 *
 * Uses Firestore documents to track request counts per user, ensuring
 * rate limits work correctly across Cloud Function instances.
 * Each instance shares rate limit state via Firestore, unlike in-memory
 * Maps which reset on every cold start.
 *
 * Cleanup: Documents include an `expiresAt` timestamp. Configure a
 * Firestore TTL policy on the `rateLimits` collection with field
 * `expiresAt` to auto-delete expired entries:
 *   gcloud firestore fields ttls update expiresAt \
 *     --collection-group=rateLimits --project=<project-id>
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const RATE_LIMIT = {
  maxRequests: 10, // Max requests per window
  windowMs: 60 * 1000, // 1 minute window
};

/**
 * Check if a user has exceeded rate limit.
 * Uses a Firestore transaction to atomically read and update the counter.
 */
export async function checkRateLimit(uid: string): Promise<void> {
  const db = admin.firestore();
  const ref = db.collection("rateLimits").doc(uid);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const windowEnd = now + RATE_LIMIT.windowMs;
    // Firestore TTL auto-deletes documents after this timestamp.
    // Set to 2x the window to allow for clock skew.
    const expiresAt = admin.firestore.Timestamp.fromMillis(now + RATE_LIMIT.windowMs * 2);

    if (!snap.exists) {
      tx.set(ref, { count: 1, resetAt: windowEnd, expiresAt });
      return;
    }

    const data = snap.data()!;

    if (now > data.resetAt) {
      tx.set(ref, { count: 1, resetAt: windowEnd, expiresAt });
      return;
    }

    if (data.count >= RATE_LIMIT.maxRequests) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many requests. Please try again later."
      );
    }

    tx.update(ref, { count: data.count + 1 });
  });
}
