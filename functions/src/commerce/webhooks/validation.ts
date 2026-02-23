/**
 * Stripe Webhook — Validation Helpers
 *
 * Helper functions for locating and validating orders from Stripe event data.
 */

import { logger } from "firebase-functions/v2";
import Stripe from "stripe";
import { DocumentReference } from "firebase-admin/firestore";
import { getAdminDb } from "../../firebaseAdmin";
import { OrderDoc } from "../types";

/**
 * Extract a payment intent ID string from Stripe's polymorphic field.
 * Stripe may return a string ID or an expanded PaymentIntent object.
 */
export function extractPaymentIntentId(
  pi: string | Stripe.PaymentIntent | null | undefined
): string | null {
  if (!pi) return null;
  if (typeof pi === "string") return pi;
  return pi.id;
}

/**
 * Look up an order by its Stripe payment intent ID.
 * Returns the order ref and data, or null if not found.
 */
export async function findOrderByPaymentIntentId(
  paymentIntentId: string
): Promise<{ ref: DocumentReference; data: OrderDoc } | null> {
  const db = getAdminDb();
  const ordersSnap = await db
    .collection("orders")
    .where("stripePaymentIntentId", "==", paymentIntentId)
    .limit(1)
    .get();

  if (ordersSnap.empty) return null;

  const doc = ordersSnap.docs[0];
  return { ref: doc.ref, data: doc.data() as OrderDoc };
}
