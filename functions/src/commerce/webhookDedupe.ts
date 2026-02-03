/**
 * Webhook Event Deduplication
 *
 * Prevents duplicate webhook processing using Firestore transactions.
 * Events are tracked with a 7-day TTL for cleanup.
 */

import { Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { getAdminDb } from "../firebaseAdmin";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Check if an event has been processed, mark it if not.
 * Returns true if event should be processed (is new).
 * Returns false if event is a duplicate or on error (safe default).
 */
export async function markEventProcessedOrSkip(eventId: string): Promise<boolean> {
  const db = getAdminDb();
  const eventRef = db.collection("processedEvents").doc(eventId);

  try {
    const shouldProcess = await db.runTransaction(async (transaction) => {
      const eventDoc = await transaction.get(eventRef);

      if (eventDoc.exists) {
        logger.info("Duplicate webhook event skipped", { eventId });
        return false;
      }

      const now = Timestamp.now();
      const expiresAt = Timestamp.fromMillis(now.toMillis() + SEVEN_DAYS_MS);

      transaction.set(eventRef, {
        createdAt: now,
        expiresAt: expiresAt,
      });

      return true;
    });

    return shouldProcess;
  } catch (error) {
    logger.error("Error in webhook deduplication", { eventId, error });
    // Safe default: skip processing on error to prevent duplicate side effects
    return false;
  }
}
