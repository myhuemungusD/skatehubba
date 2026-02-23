/**
 * Stripe Webhook — Event Handlers
 *
 * Business logic for each Stripe event type:
 * - payment_intent.succeeded
 * - payment_intent.payment_failed
 * - charge.dispute.created
 * - charge.refunded
 */

import { logger } from "firebase-functions/v2";
import Stripe from "stripe";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "../../firebaseAdmin";
import { releaseHoldAtomic, consumeHold, restockFromConsumedHold } from "../stockRelease";
import { OrderDoc } from "../types";
import { extractPaymentIntentId, findOrderByPaymentIntentId } from "./validation";

/**
 * Handle payment_intent.succeeded event
 *
 * Verifies amount_received matches order.totalCents and currency matches
 * before marking the order as paid. Refuses to mark paid on any mismatch.
 */
export async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  const orderId = paymentIntent.metadata.orderId;

  if (!orderId) {
    logger.error("PaymentIntent missing orderId metadata", {
      paymentIntentId: paymentIntent.id,
    });
    return;
  }

  const db = getAdminDb();
  const orderRef = db.collection("orders").doc(orderId);

  let shouldConsumeHold = false;

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

      if (order.status !== "pending") {
        logger.error("Order not in pending status, refusing to mark paid", {
          orderId,
          currentStatus: order.status,
          paymentIntentId: paymentIntent.id,
        });
        return;
      }

      // Verify the payment intent ID matches what we stored on the order
      if (order.stripePaymentIntentId !== paymentIntent.id) {
        logger.error("SECURITY: Payment intent ID mismatch", {
          orderId,
          expected: order.stripePaymentIntentId,
          received: paymentIntent.id,
        });
        throw new Error(
          `Payment intent ID mismatch: expected ${order.stripePaymentIntentId}, got ${paymentIntent.id}`
        );
      }

      // Verify the amount received matches the order total
      if (paymentIntent.amount_received !== order.totalCents) {
        logger.error("AMOUNT MISMATCH: payment does not match order total", {
          orderId,
          orderTotalCents: order.totalCents,
          amountReceived: paymentIntent.amount_received,
          paymentIntentId: paymentIntent.id,
        });
        throw new Error(
          `Amount mismatch: received ${paymentIntent.amount_received}, expected ${order.totalCents}`
        );
      }

      // Verify the currency matches
      if (paymentIntent.currency.toLowerCase() !== order.currency.toLowerCase()) {
        logger.error("CURRENCY MISMATCH: payment currency does not match order", {
          orderId,
          orderCurrency: order.currency,
          paymentCurrency: paymentIntent.currency,
          paymentIntentId: paymentIntent.id,
        });
        throw new Error(
          `Currency mismatch: received ${paymentIntent.currency}, expected ${order.currency}`
        );
      }

      transaction.update(orderRef, {
        status: "paid",
        paidAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      shouldConsumeHold = true;
    });
  } catch (error) {
    logger.error("Failed to update order status to paid", {
      orderId,
      paymentIntentId: paymentIntent.id,
      error,
    });
    throw error;
  }

  // Consume the hold (mark inventory as permanently sold) only if we actually marked paid
  if (shouldConsumeHold) {
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
      amountReceived: paymentIntent.amount_received,
      currency: paymentIntent.currency,
    });
  }
}

/**
 * Handle payment_intent.payment_failed event
 */
export async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  const orderId = paymentIntent.metadata.orderId;

  if (!orderId) {
    logger.error("PaymentIntent missing orderId metadata", {
      paymentIntentId: paymentIntent.id,
    });
    return;
  }

  const db = getAdminDb();
  const orderRef = db.collection("orders").doc(orderId);

  let shouldReleaseHold = false;

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

      shouldReleaseHold = true;
    });
  } catch (error) {
    logger.error("Failed to update order status to canceled", {
      orderId,
      paymentIntentId: paymentIntent.id,
      error,
    });
    throw error;
  }

  // Release the held inventory back to stock only if we actually canceled the order
  if (shouldReleaseHold) {
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
}

/**
 * Handle charge.dispute.created event
 *
 * Marks the order as "disputed" so the business can investigate.
 * Does not automatically restock - disputes may be resolved in the seller's favor.
 */
export async function handleChargeDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
  const paymentIntentId = extractPaymentIntentId(dispute.payment_intent);

  if (!paymentIntentId) {
    logger.error("Dispute missing payment_intent", {
      disputeId: dispute.id,
    });
    return;
  }

  const result = await findOrderByPaymentIntentId(paymentIntentId);

  if (!result) {
    logger.error("Order not found for dispute", {
      disputeId: dispute.id,
      paymentIntentId,
    });
    return;
  }

  const { ref: orderRef, data: order } = result;
  const orderId = orderRef.id;

  if (order.status === "disputed") {
    logger.info("Order already marked as disputed", { orderId });
    return;
  }

  // Only dispute orders that were paid or fulfilled
  if (order.status !== "paid" && order.status !== "fulfilled") {
    logger.error("Dispute received for order in unexpected status", {
      orderId,
      currentStatus: order.status,
      disputeId: dispute.id,
    });
    return;
  }

  try {
    await orderRef.update({
      status: "disputed",
      disputedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    logger.error("Failed to update order status to disputed", {
      orderId,
      disputeId: dispute.id,
      error,
    });
    throw error;
  }

  logger.error("DISPUTE CREATED: order marked as disputed, manual review required", {
    orderId,
    disputeId: dispute.id,
    paymentIntentId,
    reason: dispute.reason,
    amount: dispute.amount,
    currency: dispute.currency,
  });
}

/**
 * Handle charge.refunded event
 *
 * Marks fully-refunded orders as "refunded" and restocks inventory.
 * Partial refunds are logged but do not change order status (requires manual review).
 */
export async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  const paymentIntentId = extractPaymentIntentId(charge.payment_intent);

  if (!paymentIntentId) {
    logger.error("Refunded charge missing payment_intent", {
      chargeId: charge.id,
    });
    return;
  }

  const result = await findOrderByPaymentIntentId(paymentIntentId);

  if (!result) {
    logger.error("Order not found for refund", {
      chargeId: charge.id,
      paymentIntentId,
    });
    return;
  }

  const { ref: orderRef, data: order } = result;
  const orderId = orderRef.id;

  // Only handle full refunds automatically. Partial refunds need manual review.
  if (!charge.refunded) {
    logger.warn("Partial refund received, requires manual review", {
      orderId,
      chargeId: charge.id,
      amountRefunded: charge.amount_refunded,
      totalAmount: charge.amount,
    });
    return;
  }

  if (order.status === "refunded") {
    logger.info("Order already marked as refunded", { orderId });
    return;
  }

  // Only refund orders that are in a payable/paid state
  if (order.status !== "paid" && order.status !== "fulfilled" && order.status !== "disputed") {
    logger.error("Refund received for order in unexpected status", {
      orderId,
      currentStatus: order.status,
      chargeId: charge.id,
    });
    return;
  }

  try {
    await orderRef.update({
      status: "refunded",
      refundedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    logger.error("Failed to update order status to refunded", {
      orderId,
      chargeId: charge.id,
      error,
    });
    throw error;
  }

  // Restock inventory from the consumed hold
  try {
    await restockFromConsumedHold(orderId);
  } catch (error) {
    logger.error("Failed to restock after refund (manual restock required)", {
      orderId,
      chargeId: charge.id,
      error,
    });
    // Don't rethrow - the order is already marked refunded, restock failure
    // should be handled via monitoring, not by failing the webhook
  }

  logger.info("Charge fully refunded, order updated and stock restocked", {
    orderId,
    chargeId: charge.id,
    paymentIntentId,
    amountRefunded: charge.amount_refunded,
  });
}
