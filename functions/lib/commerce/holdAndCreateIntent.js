"use strict";
/**
 * Hold and Create Payment Intent
 *
 * Main checkout callable function that:
 * 1. Validates cart items and shipping
 * 2. Reserves inventory using sharded counters
 * 3. Creates Stripe PaymentIntent
 * 4. Creates hold and order documents
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.holdAndCreatePaymentIntent = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const v2_1 = require("firebase-functions/v2");
const stripe_1 = __importDefault(require("stripe"));
const firebaseAdmin_1 = require("../firebaseAdmin");
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const HOLD_TTL_MINUTES = 10;
const MAX_SHARD_ATTEMPTS = 8;
/**
 * Try to reserve stock from sharded counters.
 * Attempts up to MAX_SHARD_ATTEMPTS random shards.
 */
async function tryReserveFromShards(productId, qty, shardCount, orderId) {
    const db = (0, firebaseAdmin_1.getAdminDb)();
    const reserved = [];
    let remaining = qty;
    // Try random shards to avoid hotspots
    const attemptedShards = new Set();
    for (let attempt = 0; attempt < MAX_SHARD_ATTEMPTS && remaining > 0; attempt++) {
        // Pick a random shard we haven't tried
        let shardId;
        do {
            shardId = Math.floor(Math.random() * shardCount);
        } while (attemptedShards.has(shardId) && attemptedShards.size < shardCount);
        if (attemptedShards.has(shardId)) {
            break; // All shards exhausted
        }
        attemptedShards.add(shardId);
        const shardRef = db
            .collection("products")
            .doc(productId)
            .collection("stockShards")
            .doc(String(shardId));
        try {
            const taken = await db.runTransaction(async (transaction) => {
                var _a, _b;
                const shardSnap = await transaction.get(shardRef);
                const available = shardSnap.exists ? ((_b = (_a = shardSnap.data()) === null || _a === void 0 ? void 0 : _a.available) !== null && _b !== void 0 ? _b : 0) : 0;
                if (available <= 0) {
                    return 0;
                }
                const toTake = Math.min(available, remaining);
                transaction.update(shardRef, {
                    available: firestore_1.FieldValue.increment(-toTake),
                });
                return toTake;
            });
            if (taken > 0) {
                reserved.push({ productId, shardId: String(shardId), qty: taken });
                remaining -= taken;
            }
        }
        catch (error) {
            v2_1.logger.warn("Shard reservation transaction failed", {
                productId,
                shardId,
                error,
            });
            // Continue to next shard
        }
    }
    if (remaining > 0) {
        // Rollback what we reserved
        await rollbackReservedStock(reserved);
        throw new https_1.HttpsError("resource-exhausted", `Insufficient stock for product ${productId}. Requested: ${qty}, available: ${qty - remaining}`);
    }
    v2_1.logger.info("Stock reserved successfully", {
        orderId,
        productId,
        qty,
        shards: reserved.map((r) => r.shardId),
    });
    return reserved;
}
/**
 * Rollback reserved stock on failure.
 */
async function rollbackReservedStock(reserved) {
    const db = (0, firebaseAdmin_1.getAdminDb)();
    const batch = db.batch();
    for (const item of reserved) {
        const shardRef = db
            .collection("products")
            .doc(item.productId)
            .collection("stockShards")
            .doc(item.shardId);
        batch.update(shardRef, {
            available: firestore_1.FieldValue.increment(item.qty),
        });
    }
    if (reserved.length > 0) {
        await batch.commit();
        v2_1.logger.info("Rolled back reserved stock", {
            items: reserved.length,
        });
    }
}
/**
 * Validate cart items and load product data.
 */
async function validateAndLoadProducts(items, uid) {
    const db = (0, firebaseAdmin_1.getAdminDb)();
    const products = new Map();
    for (const item of items) {
        if (!item.productId || typeof item.productId !== "string") {
            throw new https_1.HttpsError("invalid-argument", "Invalid productId in cart");
        }
        if (!Number.isInteger(item.qty) || item.qty <= 0) {
            throw new https_1.HttpsError("invalid-argument", `Invalid quantity for product ${item.productId}`);
        }
        const productSnap = await db.collection("products").doc(item.productId).get();
        if (!productSnap.exists) {
            throw new https_1.HttpsError("not-found", `Product ${item.productId} not found`);
        }
        const product = productSnap.data();
        if (!product.active) {
            throw new https_1.HttpsError("failed-precondition", `Product ${item.productId} is not available`);
        }
        // Check maxPerUser limit
        if (product.maxPerUser && item.qty > product.maxPerUser) {
            throw new https_1.HttpsError("invalid-argument", `Maximum ${product.maxPerUser} per customer for ${product.name}`);
        }
        products.set(item.productId, product);
    }
    return products;
}
/**
 * Validate shipping address.
 */
function validateShippingAddress(address) {
    if (!address || typeof address !== "object") {
        throw new https_1.HttpsError("invalid-argument", "Shipping address is required");
    }
    const required = [
        "name",
        "line1",
        "city",
        "state",
        "postalCode",
        "country",
    ];
    for (const field of required) {
        if (!address[field] || typeof address[field] !== "string") {
            throw new https_1.HttpsError("invalid-argument", `Shipping address ${field} is required`);
        }
    }
}
/**
 * Calculate order totals.
 */
function calculateTotals(items, products) {
    let subtotalCents = 0;
    for (const item of items) {
        const product = products.get(item.productId);
        subtotalCents += product.priceCents * item.qty;
    }
    // Simple tax calculation (can be made more sophisticated)
    const taxCents = Math.round(subtotalCents * 0.0875); // 8.75% tax
    const shippingCents = subtotalCents >= 10000 ? 0 : 999; // Free shipping over $100
    return {
        subtotalCents,
        taxCents,
        shippingCents,
        totalCents: subtotalCents + taxCents + shippingCents,
    };
}
exports.holdAndCreatePaymentIntent = (0, https_1.onCall)({
    region: "us-west2",
    timeoutSeconds: 30,
    memory: "512MiB",
}, async (request) => {
    var _a, _b;
    // Validate authentication
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be logged in to checkout");
    }
    const uid = request.auth.uid;
    const { orderId, items, shippingAddress } = request.data;
    // Validate inputs
    if (!orderId || typeof orderId !== "string") {
        throw new https_1.HttpsError("invalid-argument", "orderId is required");
    }
    if (!Array.isArray(items) || items.length === 0) {
        throw new https_1.HttpsError("invalid-argument", "Cart items are required");
    }
    validateShippingAddress(shippingAddress);
    // Validate and load products
    const products = await validateAndLoadProducts(items, uid);
    // Validate that all products have the same currency
    const currencies = new Set();
    for (const product of products.values()) {
        currencies.add(product.currency);
    }
    if (currencies.size > 1) {
        throw new https_1.HttpsError("invalid-argument", `Cart contains products with different currencies. All items must have the same currency.`);
    }
    // Get currency from first product
    const currency = (_b = (_a = products.values().next().value) === null || _a === void 0 ? void 0 : _a.currency) !== null && _b !== void 0 ? _b : "USD";
    // Calculate totals
    const { subtotalCents, taxCents, shippingCents, totalCents } = calculateTotals(items, products);
    // Reserve stock from shards
    const allReserved = [];
    try {
        for (const item of items) {
            const product = products.get(item.productId);
            const reserved = await tryReserveFromShards(item.productId, item.qty, product.shards, orderId);
            allReserved.push(...reserved);
        }
        // Initialize Stripe
        if (!STRIPE_SECRET_KEY) {
            await rollbackReservedStock(allReserved);
            throw new https_1.HttpsError("internal", "Stripe not configured");
        }
        const stripe = new stripe_1.default(STRIPE_SECRET_KEY, {
            apiVersion: "2023-10-16",
        });
        // Create PaymentIntent with idempotency key
        const paymentIntent = await stripe.paymentIntents.create({
            amount: totalCents,
            currency: currency.toLowerCase(),
            metadata: {
                orderId,
                uid,
            },
        }, {
            idempotencyKey: `pi_${orderId}`,
        });
        // Create hold and order in a transaction
        const db = (0, firebaseAdmin_1.getAdminDb)();
        const holdRef = db.collection("holds").doc(orderId);
        const orderRef = db.collection("orders").doc(orderId);
        const now = firestore_1.Timestamp.now();
        const expiresAt = firestore_1.Timestamp.fromMillis(now.toMillis() + HOLD_TTL_MINUTES * 60 * 1000);
        await db.runTransaction(async (transaction) => {
            // Check if documents already exist (race protection)
            const [holdSnap, orderSnap] = await Promise.all([
                transaction.get(holdRef),
                transaction.get(orderRef),
            ]);
            if (holdSnap.exists || orderSnap.exists) {
                throw new https_1.HttpsError("failed-precondition", "Order already exists. Please use a different order ID.");
            }
            // Build order items with pricing
            const orderItems = items.map((item) => ({
                productId: item.productId,
                qty: item.qty,
                unitPriceCents: products.get(item.productId).priceCents,
            }));
            // Create hold document
            transaction.set(holdRef, {
                uid,
                status: "held",
                items: items.map((i) => ({ productId: i.productId, qty: i.qty })),
                expiresAt,
                createdAt: now,
            });
            // Create order document (do NOT store client secret)
            transaction.set(orderRef, {
                uid,
                status: "pending",
                items: orderItems,
                subtotalCents,
                taxCents,
                shippingCents,
                totalCents,
                currency,
                stripePaymentIntentId: paymentIntent.id,
                shippingAddress,
                createdAt: now,
                updatedAt: now,
            });
        });
        v2_1.logger.info("Hold and order created successfully", {
            orderId,
            uid,
            totalCents,
            itemCount: items.length,
        });
        return {
            orderId,
            holdStatus: "held",
            expiresAt: expiresAt.toDate().toISOString(),
            paymentIntentClientSecret: paymentIntent.client_secret,
        };
    }
    catch (error) {
        // Rollback reserved stock on any failure
        await rollbackReservedStock(allReserved);
        throw error;
    }
});
//# sourceMappingURL=holdAndCreateIntent.js.map