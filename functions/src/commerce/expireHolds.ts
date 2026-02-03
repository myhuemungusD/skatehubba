/**
 * Expire Holds Scheduled Function
 *
 * Runs every 2 minutes to clean up expired holds.
 * Releases held inventory back to stock.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { getAdminDb } from "../firebaseAdmin";
import { releaseHoldAtomic } from "./stockRelease";
import { HoldDoc } from "./types";

const BATCH_SIZE = 100;
const MAX_PROCESSING_TIME_MS = 50 * 1000; // 50 seconds max to leave buffer before timeout

export const expireHolds = onSchedule(
  {
    schedule: "every 2 minutes",
    region: "us-west2",
    timeoutSeconds: 60,
    memory: "512MiB",
  },
  async () => {
    const db = getAdminDb();
    const startTime = Date.now();
    let totalExpired = 0;
    let hasMore = true;

    logger.info("Starting hold expiration job");

    while (hasMore) {
      // Check timeout guard
      if (Date.now() - startTime > MAX_PROCESSING_TIME_MS) {
        logger.warn("Hold expiration job timeout guard triggered", {
          processedSoFar: totalExpired,
          elapsedMs: Date.now() - startTime,
        });
        break;
      }

      // Query for expired holds
      const now = Timestamp.now();
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
          logger.warn("Timeout guard triggered mid-batch", {
            processedSoFar: totalExpired,
          });
          hasMore = false;
          break;
        }

        const holdId = doc.id;
        const hold = doc.data() as HoldDoc;

        try {
          // Release stock back to shards
          const released = await releaseHoldAtomic(holdId, holdId);

          if (released) {
            // Update hold status to expired
            await doc.ref.update({
              status: "expired",
              expiredAt: Timestamp.now(),
            });

            totalExpired++;
            logger.info("Hold expired and released", {
              holdId,
              uid: hold.uid,
              itemCount: hold.items.length,
            });
          }
        } catch (error) {
          logger.error("Failed to expire hold", { holdId, error });
          // Continue with other holds
        }
      }

      // If we got a full batch, there might be more
      hasMore = snapshot.docs.length === BATCH_SIZE;
    }

    logger.info("Expired holds processed", {
      count: totalExpired,
      elapsedMs: Date.now() - startTime,
    });
  }
);
