"use strict";
/**
 * Stock Release Utilities
 *
 * Atomic stock release operations for inventory management.
 * Handles releasing held inventory back to sharded counters.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashToShard = hashToShard;
exports.releaseHoldAtomic = releaseHoldAtomic;
exports.consumeHold = consumeHold;
const firestore_1 = require("firebase-admin/firestore");
const v2_1 = require("firebase-functions/v2");
const firebaseAdmin_1 = require("../firebaseAdmin");
const MAX_BATCH_OPS = 499;
/**
 * Deterministic hash function to spread operations across shards.
 * Returns a number between 0 and shardCount-1.
 */
function hashToShard(orderId, itemIndex, shardCount) {
    // Simple string hash using djb2 algorithm
    let hash = 5381;
    const str = `${orderId}:${itemIndex}`;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return Math.abs(hash) % shardCount;
}
/**
 * Release held inventory atomically.
 * Returns stock to sharded counters and updates hold status.
 *
 * @param orderId - The order/hold ID
 * @param seed - Seed for shard distribution (typically orderId)
 * @returns true if release was successful, false if hold not found or already released
 */
async function releaseHoldAtomic(orderId, seed) {
    var _a, _b, _c;
    const db = (0, firebaseAdmin_1.getAdminDb)();
    const holdRef = db.collection("holds").doc(orderId);
    const holdSnap = await holdRef.get();
    if (!holdSnap.exists) {
        v2_1.logger.warn("Hold not found for release", { orderId });
        return false;
    }
    const hold = holdSnap.data();
    if (hold.status !== "held") {
        v2_1.logger.info("Hold not in held status, skipping release", {
            orderId,
            currentStatus: hold.status,
        });
        return false;
    }
    const ops = [];
    // Get product shard counts
    const productShardCounts = new Map();
    for (const item of hold.items) {
        if (!productShardCounts.has(item.productId)) {
            const productSnap = await db.collection("products").doc(item.productId).get();
            const shards = productSnap.exists ? ((_b = (_a = productSnap.data()) === null || _a === void 0 ? void 0 : _a.shards) !== null && _b !== void 0 ? _b : 20) : 20;
            productShardCounts.set(item.productId, shards);
        }
    }
    // Build increment operations
    for (let i = 0; i < hold.items.length; i++) {
        const item = hold.items[i];
        const shardCount = (_c = productShardCounts.get(item.productId)) !== null && _c !== void 0 ? _c : 20;
        const shardId = hashToShard(seed, i, shardCount);
        const shardRef = db
            .collection("products")
            .doc(item.productId)
            .collection("stockShards")
            .doc(String(shardId));
        ops.push({ ref: shardRef, increment: item.qty });
    }
    // Chunk operations if needed to stay under 500 limit
    const chunks = [];
    for (let i = 0; i < ops.length; i += MAX_BATCH_OPS - 1) {
        // Reserve 1 for hold update
        chunks.push(ops.slice(i, i + MAX_BATCH_OPS - 1));
    }
    // Execute batches
    const now = firestore_1.Timestamp.now();
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        const batch = db.batch();
        // Add all shard increments
        for (const op of chunk) {
            batch.set(op.ref, { available: firestore_1.FieldValue.increment(op.increment) }, { merge: true });
        }
        // Include hold status update in the last batch
        if (chunkIndex === chunks.length - 1) {
            batch.update(holdRef, {
                status: "released",
                releasedAt: now,
            });
        }
        await batch.commit();
    }
    // Handle edge case where there are no items
    if (chunks.length === 0) {
        await holdRef.update({
            status: "released",
            releasedAt: now,
        });
    }
    v2_1.logger.info("Hold released successfully", {
        orderId,
        itemCount: hold.items.length,
        batchCount: chunks.length || 1,
    });
    return true;
}
/**
 * Mark a hold as consumed (payment successful).
 * Uses a transaction to ensure atomic status update.
 *
 * @param orderId - The order/hold ID
 * @returns true if consumed successfully, false otherwise
 */
async function consumeHold(orderId) {
    const db = (0, firebaseAdmin_1.getAdminDb)();
    const holdRef = db.collection("holds").doc(orderId);
    try {
        await db.runTransaction(async (transaction) => {
            const holdSnap = await transaction.get(holdRef);
            if (!holdSnap.exists) {
                throw new Error("Hold not found");
            }
            const hold = holdSnap.data();
            if (hold.status !== "held") {
                throw new Error(`Cannot consume hold with status: ${hold.status}`);
            }
            transaction.update(holdRef, {
                status: "consumed",
                consumedAt: firestore_1.Timestamp.now(),
            });
        });
        v2_1.logger.info("Hold consumed successfully", { orderId });
        return true;
    }
    catch (error) {
        v2_1.logger.error("Failed to consume hold", { orderId, error });
        return false;
    }
}
//# sourceMappingURL=stockRelease.js.map