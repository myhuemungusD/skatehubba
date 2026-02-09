import { Router, type Request, type Response } from "express";
import type Stripe from "stripe";
import { getDb, isDatabaseAvailable } from "../db";
import { customUsers } from "@shared/schema";
import { eq } from "drizzle-orm";
import logger from "../logger";

const router = Router();

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
    logger.error("Error processing webhook event", {
      eventId: event.id,
      type: event.type,
      error: error instanceof Error ? error.message : String(error),
    });
    // Return 200 even on processing errors to prevent Stripe retries for
    // application-level failures. Infrastructure failures (DB down) will
    // naturally retry via Stripe's retry policy.
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

  // Guard against double-processing or downgrading an already-premium user
  const [user] = await db
    .select({ accountTier: customUsers.accountTier })
    .from(customUsers)
    .where(eq(customUsers.id, userId))
    .limit(1);

  if (!user) {
    logger.error("User not found for premium upgrade", { userId, sessionId: session.id });
    return;
  }

  if (user.accountTier === "premium") {
    logger.info("User already premium, skipping upgrade", { userId });
    return;
  }

  await db
    .update(customUsers)
    .set({
      accountTier: "premium",
      premiumPurchasedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(customUsers.id, userId));

  logger.info("User upgraded to Premium via Stripe Checkout", {
    userId,
    sessionId: session.id,
  });
}

export const stripeWebhookRouter = router;
