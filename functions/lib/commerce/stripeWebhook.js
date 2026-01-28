"use strict";
/**
 * Stripe Webhook Handler
 *
 * Handles Stripe webhook events for payment processing.
 * Uses Express for raw body parsing required by Stripe signature verification.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripeWebhook = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const express_1 = __importDefault(require("express"));
const stripe_1 = __importDefault(require("stripe"));
const firestore_1 = require("firebase-admin/firestore");
const firebaseAdmin_1 = require("../firebaseAdmin");
const webhookDedupe_1 = require("./webhookDedupe");
const stockRelease_1 = require("./stockRelease");
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const app = (0, express_1.default)();
// CRITICAL: Use raw body for Stripe signature verification
app.use("/stripe", express_1.default.raw({ type: "application/json" }));
/**
 * Handle payment_intent.succeeded event
 */
async function handlePaymentSucceeded(paymentIntent) {
    const orderId = paymentIntent.metadata.orderId;
    if (!orderId) {
        v2_1.logger.error("PaymentIntent missing orderId metadata", {
            paymentIntentId: paymentIntent.id,
        });
        return;
    }
    const db = (0, firebaseAdmin_1.getAdminDb)();
    const orderRef = db.collection("orders").doc(orderId);
    await db.runTransaction(async (transaction) => {
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists) {
            v2_1.logger.error("Order not found for successful payment", { orderId });
            return;
        }
        const order = orderSnap.data();
        if (order.status === "paid") {
            v2_1.logger.info("Order already marked as paid", { orderId });
            return;
        }
        transaction.update(orderRef, {
            status: "paid",
            paidAt: firestore_1.Timestamp.now(),
            updatedAt: firestore_1.Timestamp.now(),
        });
    });
    // Consume the hold (mark inventory as permanently sold)
    await (0, stockRelease_1.consumeHold)(orderId);
    v2_1.logger.info("Payment succeeded, order updated", {
        orderId,
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
    });
}
/**
 * Handle payment_intent.payment_failed event
 */
async function handlePaymentFailed(paymentIntent) {
    var _a;
    const orderId = paymentIntent.metadata.orderId;
    if (!orderId) {
        v2_1.logger.error("PaymentIntent missing orderId metadata", {
            paymentIntentId: paymentIntent.id,
        });
        return;
    }
    const db = (0, firebaseAdmin_1.getAdminDb)();
    const orderRef = db.collection("orders").doc(orderId);
    await db.runTransaction(async (transaction) => {
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists) {
            v2_1.logger.error("Order not found for failed payment", { orderId });
            return;
        }
        const order = orderSnap.data();
        if (order.status !== "pending") {
            v2_1.logger.info("Order not in pending status, skipping cancel", {
                orderId,
                currentStatus: order.status,
            });
            return;
        }
        transaction.update(orderRef, {
            status: "canceled",
            canceledAt: firestore_1.Timestamp.now(),
            updatedAt: firestore_1.Timestamp.now(),
        });
    });
    // Release the held inventory back to stock
    await (0, stockRelease_1.releaseHoldAtomic)(orderId, orderId);
    v2_1.logger.info("Payment failed, order canceled and stock released", {
        orderId,
        paymentIntentId: paymentIntent.id,
        failureMessage: (_a = paymentIntent.last_payment_error) === null || _a === void 0 ? void 0 : _a.message,
    });
}
/**
 * Main webhook endpoint
 */
app.post("/stripe", async (req, res) => {
    if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
        v2_1.logger.error("Stripe configuration missing");
        res.status(500).send("Stripe not configured");
        return;
    }
    const stripe = new stripe_1.default(STRIPE_SECRET_KEY, {
        apiVersion: "2023-10-16",
    });
    const sig = req.headers["stripe-signature"];
    if (!sig) {
        v2_1.logger.warn("Missing Stripe signature header");
        res.status(400).send("Missing signature");
        return;
    }
    let event;
    try {
        // req.body is a Buffer when using express.raw()
        event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    }
    catch (err) {
        const error = err;
        v2_1.logger.error("Webhook signature verification failed", { error: error.message });
        res.status(400).send(`Webhook Error: ${error.message}`);
        return;
    }
    // Deduplicate events
    const shouldProcess = await (0, webhookDedupe_1.markEventProcessedOrSkip)(event.id);
    if (!shouldProcess) {
        v2_1.logger.info("Duplicate event skipped", { eventId: event.id });
        res.status(200).send("Duplicate event");
        return;
    }
    v2_1.logger.info("Processing webhook event", {
        eventId: event.id,
        type: event.type,
    });
    try {
        switch (event.type) {
            case "payment_intent.succeeded":
                await handlePaymentSucceeded(event.data.object);
                break;
            case "payment_intent.payment_failed":
                await handlePaymentFailed(event.data.object);
                break;
            default:
                v2_1.logger.info("Unhandled event type", { type: event.type });
        }
    }
    catch (error) {
        // Log the error but still return 200 (OK) to prevent Stripe retries.
        // The event is already marked as processed, so retries won't help recover.
        // Application-level errors should be handled via monitoring/alerting, not webhook retries.
        const errorMsg = error instanceof Error ? error.message : String(error);
        v2_1.logger.error("Error processing webhook event", {
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
exports.stripeWebhook = (0, https_1.onRequest)({
    region: "us-west2",
    invoker: "public",
}, app);
//# sourceMappingURL=stripeWebhook.js.map