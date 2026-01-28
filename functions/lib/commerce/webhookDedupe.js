"use strict";
/**
 * Webhook Event Deduplication
 *
 * Prevents duplicate webhook processing using Firestore transactions.
 * Events are tracked with a 7-day TTL for cleanup.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.markEventProcessedOrSkip = markEventProcessedOrSkip;
const firestore_1 = require("firebase-admin/firestore");
const v2_1 = require("firebase-functions/v2");
const firebaseAdmin_1 = require("../firebaseAdmin");
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Check if an event has been processed, mark it if not.
 * Returns true if event should be processed (is new).
 * Returns false if event is a duplicate or on error (safe default).
 */
async function markEventProcessedOrSkip(eventId) {
    const db = (0, firebaseAdmin_1.getAdminDb)();
    const eventRef = db.collection("processedEvents").doc(eventId);
    try {
        const shouldProcess = await db.runTransaction(async (transaction) => {
            const eventDoc = await transaction.get(eventRef);
            if (eventDoc.exists) {
                v2_1.logger.info("Duplicate webhook event skipped", { eventId });
                return false;
            }
            const now = firestore_1.Timestamp.now();
            const expiresAt = firestore_1.Timestamp.fromMillis(now.toMillis() + SEVEN_DAYS_MS);
            transaction.set(eventRef, {
                createdAt: now,
                expiresAt: expiresAt,
            });
            return true;
        });
        return shouldProcess;
    }
    catch (error) {
        v2_1.logger.error("Error in webhook deduplication", { eventId, error });
        // Safe default: skip processing on error to prevent duplicate side effects
        return false;
    }
}
//# sourceMappingURL=webhookDedupe.js.map