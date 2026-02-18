import { Router, type Request, type Response } from "express";
import type Stripe from "stripe";
import { getDb, isDatabaseAvailable } from "../db";
import { customUsers, consumedPaymentIntents } from "@shared/schema";
import { eq } from "drizzle-orm";
import logger from "../logger";
import { sendPaymentReceiptEmail } from "../services/emailService";
import { notifyUser } from "../services/notificationService";
import { getRedisClient } from "../redis";

const router = Router();

// ============================================================================
// Stripe event deduplication — prevents TOCTOU race on webhook retries
// ============================================================================

const DEDUP_TTL_SECONDS = 60 * 60 * 24; // 24 hours
const processedEventsMemory = new Map<string, number>();

/**
 * Check if a Stripe event ID has already been processed.
 * Uses Redis when available, falls back to in-memory Map.
 * Returns true if the event was already seen (i.e. is a duplicate).
 */
async function isDuplicateEvent(eventId: string): Promise<boolean> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const key = `stripe_event:${eventId}`;
      const result = await redis.set(key, "1", "EX", DEDUP_TTL_SECONDS, "NX");
      // NX returns "OK" if the key was set (first time), null if it already existed
      return result !== "OK";
    } catch {
      // Redis failure — fall through to memory store
    }
  }

  // In-memory fallback
  const now = Date.now();
  // Prune expired entries periodically (every 1000 checks)
  if (processedEventsMemory.size > 1000) {
    for (const [key, ts] of processedEventsMemory) {
      if (now - ts > DEDUP_TTL_SECONDS * 1000) processedEventsMemory.delete(key);
    }
  }

  if (processedEventsMemory.has(eventId)) {
    return true;
  }
  processedEventsMemory.set(eventId, now);
  return false;
}

/**
 * POST /webhooks/stripe - Stripe webhook handler
 *
 * Handles:
 *   - checkout.session.completed  → upgrades user to Premium on successful payment
 *   - customer.subscription.updated → logs subscription state changes (future use)
 *   - customer.subscription.deleted → logs subscription cancellations (future use)
 *
 * Requires raw body (registered via express.raw() in server/index.ts).
 * Bypasses CSRF and auth — verified via Stripe webhook signature.
 */
router.post("/", async (req: Request, res: Response) => {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey || !webhookSecret) {
    logger.error("Stripe webhook secrets not configured (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET)");
    return res.status(500).send("Stripe not configured");
  }

  const StripeConstructor = await import("stripe").then((m) => m.default);
  const stripe = new StripeConstructor(stripeSecretKey);

  const sig = req.headers["stripe-signature"];
  if (!sig) {
    logger.warn("Webhook request missing stripe-signature header");
    return res.status(400).send("Missing stripe-signature header");
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    logger.error("Webhook signature verification failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return res.status(400).send("Webhook signature verification failed");
  }

  // Deduplicate: reject events already processed to prevent TOCTOU races
  if (await isDuplicateEvent(event.id)) {
    logger.info("Duplicate Stripe event ignored", { eventId: event.id, type: event.type });
    return res.status(200).send("OK");
  }

  logger.info("Processing Stripe webhook", {
    eventId: event.id,
    type: event.type,
  });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        logger.info("Subscription updated (no-op for now)", {
          subscriptionId: subscription.id,
          status: subscription.status,
        });
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        logger.info("Subscription deleted (no-op for now)", {
          subscriptionId: subscription.id,
        });
        break;
      }

      default:
        logger.info("Unhandled Stripe event type", { type: event.type });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Error processing webhook event", {
      eventId: event.id,
      type: event.type,
      error: errorMessage,
    });
    // Return 500 for infrastructure/DB errors so Stripe retries.
    // The idempotency guard in handleCheckoutCompleted prevents double-processing.
    return res.status(500).send("Processing error");
  }

  return res.status(200).send("OK");
});

/**
 * Handle checkout.session.completed
 *
 * Validates the session metadata matches a premium_upgrade, verifies payment
 * status and amount, then promotes the user to premium tier.
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.metadata?.userId;
  const type = session.metadata?.type;

  if (!userId || type !== "premium_upgrade") {
    logger.info("Ignoring checkout session — not a premium upgrade", {
      sessionId: session.id,
      metadataType: type,
    });
    return;
  }

  if (session.payment_status !== "paid") {
    logger.warn("Checkout session not yet paid", {
      sessionId: session.id,
      paymentStatus: session.payment_status,
    });
    return;
  }

  if (session.amount_total !== 999) {
    logger.error("Checkout session amount mismatch", {
      sessionId: session.id,
      expected: 999,
      received: session.amount_total,
    });
    return;
  }

  if (!isDatabaseAvailable()) {
    // Throw so the error propagates and Stripe will retry the webhook
    throw new Error("Database unavailable — cannot process premium upgrade");
  }

  const db = getDb();

  // Use transaction with deduplication to prevent race conditions
  const paymentKey = `stripe_checkout_${session.id}`;
  const now = new Date();

  await db.transaction(async (tx) => {
    // Check if this session was already processed (idempotency)
    const [existing] = await tx
      .select({ id: consumedPaymentIntents.id })
      .from(consumedPaymentIntents)
      .where(eq(consumedPaymentIntents.paymentIntentId, paymentKey))
      .limit(1)
      .for("update");

    if (existing) {
      logger.info("Webhook session already processed, skipping", { sessionId: session.id, userId });
      return;
    }

    // Check user exists and isn't already premium
    const [user] = await tx
      .select({ accountTier: customUsers.accountTier })
      .from(customUsers)
      .where(eq(customUsers.id, userId))
      .limit(1)
      .for("update");

    if (!user) {
      logger.error("User not found for premium upgrade", { userId, sessionId: session.id });
      return;
    }

    if (user.accountTier === "premium") {
      logger.info("User already premium, skipping upgrade", { userId });
      return;
    }

    // Record the consumed event and upgrade atomically
    await tx.insert(consumedPaymentIntents).values({
      paymentIntentId: paymentKey,
      userId,
    });

    await tx
      .update(customUsers)
      .set({
        accountTier: "premium",
        premiumPurchasedAt: now,
        updatedAt: now,
      })
      .where(eq(customUsers.id, userId));
  });

  logger.info("User upgraded to Premium via Stripe Checkout", {
    userId,
    sessionId: session.id,
  });

  // Send payment receipt email and in-app notification (non-blocking)
  const [userInfo] = await db
    .select({ email: customUsers.email, firstName: customUsers.firstName })
    .from(customUsers)
    .where(eq(customUsers.id, userId))
    .limit(1);

  if (userInfo?.email) {
    const name = userInfo.firstName || "Skater";

    sendPaymentReceiptEmail(userInfo.email, name, {
      amount: "$9.99",
      tier: "Premium",
      date: now.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      transactionId: session.id,
    }).catch((err) =>
      logger.error("Failed to send payment receipt email", { error: String(err) })
    );

    notifyUser({
      userId,
      type: "payment_receipt",
      title: "Premium Activated",
      body: "Your Premium upgrade is confirmed. All features unlocked.",
      data: { sessionId: session.id },
    }).catch((err) =>
      logger.error("Failed to send premium notification", { error: String(err) })
    );
  }
}

export const stripeWebhookRouter = router;
