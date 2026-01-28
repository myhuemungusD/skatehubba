/**
 * Hold and Create Payment Intent
 *
 * Main checkout callable function that:
 * 1. Validates cart items and shipping
 * 2. Reserves inventory using sharded counters
 * 3. Creates Stripe PaymentIntent
 * 4. Creates hold and order documents
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import Stripe from "stripe";
import { getAdminDb } from "../firebaseAdmin";
import {
  CartItem,
  ShippingAddress,
  ProductDoc,
  HoldAndCreateIntentRequest,
  HoldAndCreateIntentResponse,
  OrderItem,
} from "./types";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const HOLD_TTL_MINUTES = 10;
const MAX_SHARD_ATTEMPTS = 8;

interface ReservedStock {
  productId: string;
  shardId: string;
  qty: number;
}

/**
 * Try to reserve stock from sharded counters.
 * Attempts up to MAX_SHARD_ATTEMPTS random shards.
 */
async function tryReserveFromShards(
  productId: string,
  qty: number,
  shardCount: number,
  orderId: string
): Promise<ReservedStock[]> {
  const db = getAdminDb();
  const reserved: ReservedStock[] = [];
  let remaining = qty;

  // Try random shards to avoid hotspots
  const attemptedShards = new Set<number>();

  for (let attempt = 0; attempt < MAX_SHARD_ATTEMPTS && remaining > 0; attempt++) {
    // Pick a random shard we haven't tried
    let shardId: number;
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
        const shardSnap = await transaction.get(shardRef);
        const available = shardSnap.exists ? (shardSnap.data()?.available ?? 0) : 0;

        if (available <= 0) {
          return 0;
        }

        const toTake = Math.min(available, remaining);
        transaction.update(shardRef, {
          available: FieldValue.increment(-toTake),
        });

        return toTake;
      });

      if (taken > 0) {
        reserved.push({ productId, shardId: String(shardId), qty: taken });
        remaining -= taken;
      }
    } catch (error) {
      logger.warn("Shard reservation transaction failed", {
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
    throw new HttpsError(
      "resource-exhausted",
      `Insufficient stock for product ${productId}. Requested: ${qty}, available: ${qty - remaining}`
    );
  }

  logger.info("Stock reserved successfully", {
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
async function rollbackReservedStock(reserved: ReservedStock[]): Promise<void> {
  const db = getAdminDb();
  const batch = db.batch();

  for (const item of reserved) {
    const shardRef = db
      .collection("products")
      .doc(item.productId)
      .collection("stockShards")
      .doc(item.shardId);

    batch.update(shardRef, {
      available: FieldValue.increment(item.qty),
    });
  }

  if (reserved.length > 0) {
    await batch.commit();
    logger.info("Rolled back reserved stock", {
      items: reserved.length,
    });
  }
}

/**
 * Validate cart items and load product data.
 */
async function validateAndLoadProducts(
  items: CartItem[],
  uid: string
): Promise<Map<string, ProductDoc>> {
  const db = getAdminDb();
  const products = new Map<string, ProductDoc>();

  for (const item of items) {
    if (!item.productId || typeof item.productId !== "string") {
      throw new HttpsError("invalid-argument", "Invalid productId in cart");
    }
    if (!Number.isInteger(item.qty) || item.qty <= 0) {
      throw new HttpsError("invalid-argument", `Invalid quantity for product ${item.productId}`);
    }

    const productSnap = await db.collection("products").doc(item.productId).get();

    if (!productSnap.exists) {
      throw new HttpsError("not-found", `Product ${item.productId} not found`);
    }

    const product = productSnap.data() as ProductDoc;

    if (!product.active) {
      throw new HttpsError("failed-precondition", `Product ${item.productId} is not available`);
    }

    // Validate shards field for stock reservation
    if (!Number.isInteger(product.shards) || product.shards <= 0) {
      throw new HttpsError(
        "internal",
        `Product ${item.productId} has invalid shards configuration`
      );
    }

    // Check maxPerUser limit
    if (product.maxPerUser && item.qty > product.maxPerUser) {
      throw new HttpsError(
        "invalid-argument",
        `Maximum ${product.maxPerUser} per customer for ${product.name}`
      );
    }

    products.set(item.productId, product);
  }

  return products;
}

/**
 * Validate shipping address.
 */
function validateShippingAddress(address: ShippingAddress): void {
  if (!address || typeof address !== "object") {
    throw new HttpsError("invalid-argument", "Shipping address is required");
  }

  const required: (keyof ShippingAddress)[] = [
    "name",
    "line1",
    "city",
    "state",
    "postalCode",
    "country",
  ];

  for (const field of required) {
    if (!address[field] || typeof address[field] !== "string") {
      throw new HttpsError("invalid-argument", `Shipping address ${field} is required`);
    }
  }
}

/**
 * Calculate order totals.
 */
function calculateTotals(
  items: CartItem[],
  products: Map<string, ProductDoc>
): { subtotalCents: number; taxCents: number; shippingCents: number; totalCents: number } {
  let subtotalCents = 0;

  for (const item of items) {
    const product = products.get(item.productId)!;
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

export const holdAndCreatePaymentIntent = onCall<
  HoldAndCreateIntentRequest,
  Promise<HoldAndCreateIntentResponse>
>(
  {
    region: "us-west2",
    timeoutSeconds: 30,
    memory: "512MiB",
  },
  async (request) => {
    // Validate authentication
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be logged in to checkout");
    }

    const uid = request.auth.uid;
    const { orderId, items, shippingAddress } = request.data;

    // Validate inputs
    if (!orderId || typeof orderId !== "string") {
      throw new HttpsError("invalid-argument", "orderId is required");
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new HttpsError("invalid-argument", "Cart items are required");
    }

    validateShippingAddress(shippingAddress);

    // Validate and load products
    const products = await validateAndLoadProducts(items, uid);

    // Validate that all products have the same currency
    const currencies = new Set<string>();
    for (const product of products.values()) {
      currencies.add(product.currency);
    }
    
    if (currencies.size > 1) {
      throw new HttpsError(
        "invalid-argument",
        `Cart contains products with different currencies. All items must have the same currency.`
      );
    }

    // Get currency from first product
    const currency = products.values().next().value?.currency ?? "USD";

    // Calculate totals
    const { subtotalCents, taxCents, shippingCents, totalCents } = calculateTotals(items, products);

    // Reserve stock from shards
    const allReserved: ReservedStock[] = [];

    try {
      for (const item of items) {
        const product = products.get(item.productId)!;
        const reserved = await tryReserveFromShards(
          item.productId,
          item.qty,
          product.shards,
          orderId
        );
        allReserved.push(...reserved);
      }

      // Initialize Stripe
      if (!STRIPE_SECRET_KEY) {
        await rollbackReservedStock(allReserved);
        throw new HttpsError("internal", "Stripe not configured");
      }

      const stripe = new Stripe(STRIPE_SECRET_KEY, {
        apiVersion: "2023-10-16",
      });

      // Create PaymentIntent with idempotency key
      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount: totalCents,
          currency: currency.toLowerCase(),
          metadata: {
            orderId,
            uid,
          },
        },
        {
          idempotencyKey: `pi_${orderId}`,
        }
      );

      // Create hold and order in a transaction
      const db = getAdminDb();
      const holdRef = db.collection("holds").doc(orderId);
      const orderRef = db.collection("orders").doc(orderId);

      const now = Timestamp.now();
      const expiresAt = Timestamp.fromMillis(now.toMillis() + HOLD_TTL_MINUTES * 60 * 1000);

      await db.runTransaction(async (transaction) => {
        // Check if documents already exist (race protection)
        const [holdSnap, orderSnap] = await Promise.all([
          transaction.get(holdRef),
          transaction.get(orderRef),
        ]);

        if (holdSnap.exists || orderSnap.exists) {
          throw new HttpsError(
            "failed-precondition",
            "Order already exists. Please use a different order ID."
          );
        }

        // Build order items with pricing
        const orderItems: OrderItem[] = items.map((item) => ({
          productId: item.productId,
          qty: item.qty,
          unitPriceCents: products.get(item.productId)!.priceCents,
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

      logger.info("Hold and order created successfully", {
        orderId,
        uid,
        totalCents,
        itemCount: items.length,
      });

      return {
        orderId,
        holdStatus: "held",
        expiresAt: expiresAt.toDate().toISOString(),
        paymentIntentClientSecret: paymentIntent.client_secret!,
      };
    } catch (error) {
      // Rollback reserved stock on any failure
      await rollbackReservedStock(allReserved);
      throw error;
    }
  }
);
