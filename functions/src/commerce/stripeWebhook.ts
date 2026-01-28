/**
 * Stripe Webhook Handler
 *
 * Handles Stripe webhook events for payment processing.
 * Uses Express for raw body parsing required by Stripe signature verification.
 */

import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import express, { Request, Response } from "express";
import Stripe from "stripe";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "../firebaseAdmin";
import { markEventProcessedOrSkip } from "./webhookDedupe";
import { releaseHoldAtomic, consumeHold } from "./stockRelease";
import { OrderDoc } from "./types";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

const app = express();

// CRITICAL: Use raw body for Stripe signature verification
app.use("/stripe", express.raw({ type: "application/json" }));

/**
 * Handle payment_intent.succeeded event
 */
async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  const orderId = paymentIntent.metadata.orderId;

  if (!orderId) {
    logger.error("PaymentIntent missing orderId metadata", {
      paymentIntentId: paymentIntent.id,
    });
    return;
  }

  const db = getAdminDb();
  const orderRef = db.collection("orders").doc(orderId);

  try {
    await db.runTransaction(async (transaction) => {
      const orderSnap = await transaction.get(orderRef);

      if (!orderSnap.exists) {
        logger.error("Order not found for successful payment", { orderId });
        return;
      }

      const order = orderSnap.data() as OrderDoc;

      if (order.status === "paid") {
        logger.info("Order already marked as paid", { orderId });
        return;
      }

      transaction.update(orderRef, {
        status: "paid",
        paidAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });
  } catch (error) {
    logger.error("Failed to update order status to paid", {
      orderId,
      paymentIntentId: paymentIntent.id,
      error,
    });
    throw error;
  }

  // Consume the hold (mark inventory as permanently sold)
  try {
    await consumeHold(orderId);
  } catch (error) {
    logger.error("Failed to consume hold after payment succeeded", {
      orderId,
      paymentIntentId: paymentIntent.id,
      error,
    });
    throw error;
  }

  logger.info("Payment succeeded, order updated", {
    orderId,
    paymentIntentId: paymentIntent.id,
    amount: paymentIntent.amount,
  });
}

/**
 * Handle payment_intent.payment_failed event
 */
async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  const orderId = paymentIntent.metadata.orderId;

  if (!orderId) {
    logger.error("PaymentIntent missing orderId metadata", {
      paymentIntentId: paymentIntent.id,
    });
    return;
  }

  const db = getAdminDb();
  const orderRef = db.collection("orders").doc(orderId);

  try {
    await db.runTransaction(async (transaction) => {
      const orderSnap = await transaction.get(orderRef);

      if (!orderSnap.exists) {
        logger.error("Order not found for failed payment", { orderId });
        return;
      }

      const order = orderSnap.data() as OrderDoc;

      if (order.status !== "pending") {
        logger.info("Order not in pending status, skipping cancel", {
          orderId,
          currentStatus: order.status,
        });
        return;
      }

      transaction.update(orderRef, {
        status: "canceled",
        canceledAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });
  } catch (error) {
    logger.error("Failed to update order status to canceled", {
      orderId,
      paymentIntentId: paymentIntent.id,
      error,
    });
    throw error;
  }

  // Release the held inventory back to stock
  try {
    await releaseHoldAtomic(orderId, orderId);
  } catch (error) {
    logger.error("Failed to release hold after payment failed", {
      orderId,
      paymentIntentId: paymentIntent.id,
      error,
    });
    throw error;
  }

  logger.info("Payment failed, order canceled and stock released", {
    orderId,
    paymentIntentId: paymentIntent.id,
    failureMessage: paymentIntent.last_payment_error?.message,
  });
}

/**
 * Main webhook endpoint
 */
app.post("/stripe", async (req: Request, res: Response) => {
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    logger.error("Stripe configuration missing");
    res.status(500).send("Stripe not configured");
    return;
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: "2023-10-16",
  });

  const sig = req.headers["stripe-signature"];

  if (!sig) {
    logger.warn("Missing Stripe signature header");
    res.status(400).send("Missing signature");
    return;
  }

  let event: Stripe.Event;

  try {
    // req.body is a Buffer when using express.raw()
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const error = err as Error;
    logger.error("Webhook signature verification failed", { error: error.message });
    res.status(400).send(`Webhook Error: ${error.message}`);
    return;
  }

  // Deduplicate events
  const shouldProcess = await markEventProcessedOrSkip(event.id);
  if (!shouldProcess) {
    logger.info("Duplicate event skipped", { eventId: event.id });
    res.status(200).send("Duplicate event");
    return;
  }

  logger.info("Processing webhook event", {
    eventId: event.id,
    type: event.type,
  });

  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      case "payment_intent.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;

      default:
        logger.info("Unhandled event type", { type: event.type });
    }
  } catch (error) {
    // Log the error but still return 200 (OK) to prevent Stripe retries.
    // The event is already marked as processed, so retries won't help recover.
    // Application-level errors should be handled via monitoring/alerting, not webhook retries.
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error("Error processing webhook event", {
      eventId: event.id,
      type: event.type,
      error: errorMsg,
    });
    // Still return 200 to acknowledge receipt - Stripe should not retry this event
    res.status(200).send("OK");
    return;
  }

  res.status(200).send("OK");
});

// Export the Express app as a Firebase Function
// CRITICAL: invoker: "public" allows Stripe to call this endpoint without authentication
export const stripeWebhook = onRequest(
  {
    region: "us-west2",
    invoker: "public",
  },
  app
);
