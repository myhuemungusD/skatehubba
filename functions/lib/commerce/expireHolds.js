"use strict";
/**
 * Expire Holds Scheduled Function
 *
 * Runs every 2 minutes to clean up expired holds.
 * Releases held inventory back to stock.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.expireHolds = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-admin/firestore");
const v2_1 = require("firebase-functions/v2");
const firebaseAdmin_1 = require("../firebaseAdmin");
const stockRelease_1 = require("./stockRelease");
const BATCH_SIZE = 100;
const MAX_PROCESSING_TIME_MS = 50 * 1000; // 50 seconds max to leave buffer before timeout
exports.expireHolds = (0, scheduler_1.onSchedule)({
    schedule: "every 2 minutes",
    region: "us-west2",
    timeoutSeconds: 60,
    memory: "512MiB",
}, async () => {
    const db = (0, firebaseAdmin_1.getAdminDb)();
    const startTime = Date.now();
    let totalExpired = 0;
    let hasMore = true;
    v2_1.logger.info("Starting hold expiration job");
    while (hasMore) {
        // Check timeout guard
        if (Date.now() - startTime > MAX_PROCESSING_TIME_MS) {
            v2_1.logger.warn("Hold expiration job timeout guard triggered", {
                processedSoFar: totalExpired,
                elapsedMs: Date.now() - startTime,
            });
            break;
        }
        // Query for expired holds
        const now = firestore_1.Timestamp.now();
        const expiredHoldsQuery = db
            .collection("holds")
            .where("status", "==", "held")
            .where("expiresAt", "<", now)
            .limit(BATCH_SIZE);
        const snapshot = await expiredHoldsQuery.get();
        if (snapshot.empty) {
            hasMore = false;
            break;
        }
        // Process each expired hold
        for (const doc of snapshot.docs) {
            // Re-check timeout within loop
            if (Date.now() - startTime > MAX_PROCESSING_TIME_MS) {
                v2_1.logger.warn("Timeout guard triggered mid-batch", {
                    processedSoFar: totalExpired,
                });
                hasMore = false;
                break;
            }
            const holdId = doc.id;
            const hold = doc.data();
            try {
                // Release stock back to shards
                const released = await (0, stockRelease_1.releaseHoldAtomic)(holdId, holdId);
                if (released) {
                    // Update hold status to expired
                    await doc.ref.update({
                        status: "expired",
                        expiredAt: firestore_1.Timestamp.now(),
                    });
                    totalExpired++;
                    v2_1.logger.info("Hold expired and released", {
                        holdId,
                        uid: hold.uid,
                        itemCount: hold.items.length,
                    });
                }
            }
            catch (error) {
                v2_1.logger.error("Failed to expire hold", { holdId, error });
                // Continue with other holds
            }
        }
        // If we got a full batch, there might be more
        hasMore = snapshot.docs.length === BATCH_SIZE;
    }
    v2_1.logger.info("Expired holds processed", {
        count: totalExpired,
        elapsedMs: Date.now() - startTime,
    });
});
//# sourceMappingURL=expireHolds.js.map