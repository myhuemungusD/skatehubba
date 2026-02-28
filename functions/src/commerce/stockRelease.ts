/**
 * Stock Release Utilities
 *
 * Atomic stock release operations for inventory management.
 * Handles releasing held inventory back to sharded counters.
 */

import { Timestamp, WriteBatch, FieldValue, DocumentReference } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { getAdminDb } from "../firebaseAdmin";
import { HoldDoc } from "./types";

const MAX_BATCH_OPS = 499;

/**
 * Deterministic hash function to spread operations across shards.
 * Returns a number between 0 and shardCount-1.
 */
export function hashToShard(orderId: string, itemIndex: number, shardCount: number): number {
  // Simple string hash using djb2 algorithm
  let hash = 5381;
  const str = `${orderId}:${itemIndex}`;

  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }

  return Math.abs(hash) % shardCount;
}

interface BatchOp {
  ref: DocumentReference;
  increment: number;
}

/**
 * Release held inventory atomically.
 * Uses a transaction to claim the hold (held → released) before touching shards,
 * preventing the TOCTOU race where two concurrent processes could both read
 * "held" and double-release stock.
 *
 * @param orderId - The order/hold ID
 * @param seed - Seed for shard distribution (typically orderId)
 * @returns true if release was successful, false if hold not found or already released
 */
export async function releaseHoldAtomic(orderId: string, seed: string): Promise<boolean> {
  const db = getAdminDb();
  const holdRef = db.collection("holds").doc(orderId);
  const now = Timestamp.now();

  // Step 1: Atomically claim the hold (held → released) inside a transaction.
  // This prevents two concurrent processes from both passing the status check.
  let holdItems: HoldDoc["items"];

  try {
    holdItems = await db.runTransaction(async (transaction) => {
      const holdSnap = await transaction.get(holdRef);

      if (!holdSnap.exists) {
        throw new HoldNotFoundError(orderId);
      }

      const hold = holdSnap.data() as HoldDoc;

      if (hold.status !== "held") {
        throw new HoldAlreadyReleasedError(orderId, hold.status);
      }

      transaction.update(holdRef, {
        status: "released",
        releasedAt: now,
      });

      return hold.items;
    });
  } catch (error) {
    if (error instanceof HoldNotFoundError) {
      logger.warn("Hold not found for release", { orderId });
      return false;
    }
    if (error instanceof HoldAlreadyReleasedError) {
      logger.info("Hold not in held status, skipping release", {
        orderId,
        currentStatus: error.currentStatus,
      });
      return false;
    }
    throw error;
  }

  // Step 2: Return stock to shards. The hold is already marked "released",
  // so even if this step fails, no other process can double-release.
  await returnStockToShards(db, holdItems, seed, orderId);

  logger.info("Hold released successfully", {
    orderId,
    itemCount: holdItems.length,
  });

  return true;
}

/**
 * Restock inventory from a consumed hold (used after refund/dispute).
 * Uses a transaction to claim the hold (consumed → released) before touching shards,
 * preventing the TOCTOU race where concurrent refund webhooks could double-restock.
 *
 * @param orderId - The order/hold ID
 * @returns true if restock was successful
 */
export async function restockFromConsumedHold(orderId: string): Promise<boolean> {
  const db = getAdminDb();
  const holdRef = db.collection("holds").doc(orderId);
  const now = Timestamp.now();

  // Step 1: Atomically claim the hold (consumed → released) inside a transaction.
  let holdItems: HoldDoc["items"];

  try {
    holdItems = await db.runTransaction(async (transaction) => {
      const holdSnap = await transaction.get(holdRef);

      if (!holdSnap.exists) {
        throw new HoldNotFoundError(orderId);
      }

      const hold = holdSnap.data() as HoldDoc;

      if (hold.status !== "consumed") {
        throw new HoldAlreadyReleasedError(orderId, hold.status);
      }

      transaction.update(holdRef, {
        status: "released",
        releasedAt: now,
      });

      return hold.items;
    });
  } catch (error) {
    if (error instanceof HoldNotFoundError) {
      logger.warn("Hold not found for restock", { orderId });
      return false;
    }
    if (error instanceof HoldAlreadyReleasedError) {
      logger.warn("Hold not in consumed status for restock", {
        orderId,
        currentStatus: error.currentStatus,
      });
      return false;
    }
    throw error;
  }

  // Step 2: Return stock to shards.
  await returnStockToShards(db, holdItems, orderId, orderId);

  logger.info("Stock restocked from consumed hold", {
    orderId,
    itemCount: holdItems.length,
  });

  return true;
}

// ── Internal helpers ────────────────────────────────────────────────

class HoldNotFoundError extends Error {
  constructor(orderId: string) {
    super(`Hold not found: ${orderId}`);
  }
}

class HoldAlreadyReleasedError extends Error {
  currentStatus: string;
  constructor(orderId: string, currentStatus: string) {
    super(`Hold ${orderId} has status ${currentStatus}`);
    this.currentStatus = currentStatus;
  }
}

/**
 * Shared logic for returning stock to sharded counters.
 * Called AFTER the hold status has been transactionally claimed.
 */
async function returnStockToShards(
  db: FirebaseFirestore.Firestore,
  items: HoldDoc["items"],
  seed: string,
  orderId: string
): Promise<void> {
  const ops: BatchOp[] = [];
  const productShardCounts = new Map<string, number>();

  for (const item of items) {
    if (!productShardCounts.has(item.productId)) {
      const productSnap = await db.collection("products").doc(item.productId).get();
      const shards = productSnap.exists ? (productSnap.data()?.shards ?? 20) : 20;
      productShardCounts.set(item.productId, shards);
    }
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const shardCount = productShardCounts.get(item.productId) ?? 20;
    const shardId = hashToShard(seed, i, shardCount);

    const shardRef = db
      .collection("products")
      .doc(item.productId)
      .collection("stockShards")
      .doc(String(shardId));

    ops.push({ ref: shardRef, increment: item.qty });
  }

  // Chunk operations to stay under 500-operation batch limit
  const chunks: BatchOp[][] = [];
  for (let i = 0; i < ops.length; i += MAX_BATCH_OPS) {
    chunks.push(ops.slice(i, i + MAX_BATCH_OPS));
  }

  for (const chunk of chunks) {
    const batch: WriteBatch = db.batch();
    for (const op of chunk) {
      batch.set(op.ref, { available: FieldValue.increment(op.increment) }, { merge: true });
    }
    await batch.commit();
  }

  if (ops.length > 0) {
    logger.info("Shard stock returned", { orderId, shardOps: ops.length });
  }
}

/**
 * Mark a hold as consumed (payment successful).
 * Uses a transaction to ensure atomic status update.
 *
 * @param orderId - The order/hold ID
 * @returns true if consumed successfully, false otherwise
 */
export async function consumeHold(orderId: string): Promise<boolean> {
  const db = getAdminDb();
  const holdRef = db.collection("holds").doc(orderId);

  try {
    await db.runTransaction(async (transaction) => {
      const holdSnap = await transaction.get(holdRef);

      if (!holdSnap.exists) {
        throw new Error("Hold not found");
      }

      const hold = holdSnap.data() as HoldDoc;

      if (hold.status !== "held") {
        throw new Error(`Cannot consume hold with status: ${hold.status}`);
      }

      transaction.update(holdRef, {
        status: "consumed",
        consumedAt: Timestamp.now(),
      });
    });

    logger.info("Hold consumed successfully", { orderId });
    return true;
  } catch (error) {
    logger.error("Failed to consume hold", { orderId, error });
    return false;
  }
}
