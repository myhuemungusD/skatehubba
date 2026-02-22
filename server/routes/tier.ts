import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db";
import { authenticateUser } from "../auth/middleware";
import { requirePaidOrPro } from "../middleware/requirePaidOrPro";
import { customUsers, consumedPaymentIntents } from "@shared/schema";
import { eq, count } from "drizzle-orm";
import logger from "../logger";
import { validateOrigin } from "../config/server";
import { Errors, sendError } from "../utils/apiError";
import { proAwardLimiter } from "../middleware/security";

const router = Router();

/**
 * GET /api/tier - Get current user's account tier info
 */
router.get("/", authenticateUser, async (req, res) => {
  const user = req.currentUser!;
  return res.json({
    tier: user.accountTier,
    proAwardedBy: user.proAwardedBy,
    premiumPurchasedAt: user.premiumPurchasedAt,
  });
});

/**
 * POST /api/tier/award-pro - Award Pro status to another user
 * Only Premium (paid) users can award Pro to others.
 * This is like getting sponsored in real skating - a pro vouches for you.
 * Pro users who were themselves awarded cannot propagate the chain.
 */
const awardProSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
});

router.post("/award-pro", authenticateUser, requirePaidOrPro, proAwardLimiter, async (req, res) => {
  const parsed = awardProSchema.safeParse(req.body);
  if (!parsed.success) {
    return Errors.validation(res, parsed.error.flatten());
  }

  const { userId } = parsed.data;
  const awarder = req.currentUser!;

  // Only premium (paid) users can award pro status.
  // Pro users who were themselves awarded cannot propagate the chain.
  if (awarder.accountTier !== "premium") {
    return Errors.forbidden(res, "PREMIUM_REQUIRED", "Only Premium members can award Pro status.");
  }

  if (userId === awarder.id) {
    return Errors.badRequest(res, "SELF_AWARD", "You can't award Pro to yourself.");
  }

  try {
    const db = getDb();

    // Use a transaction to atomically check cap and award
    const result = await db.transaction(async (tx) => {
      // Cap the number of pro awards a single premium user can give
      const MAX_PRO_AWARDS = 5;
      const [awardCount] = await tx
        .select({ value: count() })
        .from(customUsers)
        .where(eq(customUsers.proAwardedBy, awarder.id));

      if ((awardCount?.value ?? 0) >= MAX_PRO_AWARDS) {
        return {
          error: "AWARD_LIMIT_REACHED",
          message: `You have already awarded Pro status to ${MAX_PRO_AWARDS} users.`,
        };
      }

      // Check if target user exists and is on free tier
      const [targetUser] = await tx
        .select({
          id: customUsers.id,
          accountTier: customUsers.accountTier,
          firstName: customUsers.firstName,
        })
        .from(customUsers)
        .where(eq(customUsers.id, userId))
        .limit(1);

      if (!targetUser) {
        return { error: "USER_NOT_FOUND", message: "User not found." };
      }

      if (targetUser.accountTier !== "free") {
        return {
          error: "ALREADY_UPGRADED",
          message: "User already has Pro or Premium status.",
        };
      }

      // Award Pro status
      await tx
        .update(customUsers)
        .set({
          accountTier: "pro",
          proAwardedBy: awarder.id,
          updatedAt: new Date(),
        })
        .where(eq(customUsers.id, userId));

      return { success: true, targetUser };
    });

    if ("error" in result) {
      if (result.error === "AWARD_LIMIT_REACHED") {
        return Errors.conflict(res, result.error, result.message);
      }
      if (result.error === "USER_NOT_FOUND") {
        return Errors.notFound(res, result.error, result.message);
      }
      if (result.error === "ALREADY_UPGRADED") {
        return Errors.conflict(res, result.error, result.message);
      }
    }

    // Type guard: result must have targetUser if no error
    if (!result.targetUser) {
      return Errors.internal(res, "PRO_AWARD_FAILED", "Failed to award Pro status.");
    }

    logger.info("Pro status awarded", {
      awardedTo: userId,
      awardedBy: awarder.id,
    });

    return res.json({
      success: true,
      message: `Pro status awarded to ${result.targetUser.firstName || "user"}`,
      awardedTo: userId,
      awardedBy: awarder.id,
    });
  } catch (error) {
    logger.error("Failed to award Pro status", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Errors.internal(res, "PRO_AWARD_FAILED", "Failed to award Pro status.");
  }
});

/**
 * POST /api/tier/create-checkout-session - Create Stripe Checkout Session for Premium upgrade
 *
 * Returns a Stripe Checkout URL that the client redirects to.
 * Uses idempotency keys to prevent duplicate sessions.
 */
const createCheckoutSchema = z.object({
  idempotencyKey: z.string().min(1).max(255),
});

router.post("/create-checkout-session", authenticateUser, async (req, res) => {
  const parsed = createCheckoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return Errors.validation(res, parsed.error.flatten());
  }

  const user = req.currentUser!;
  const { idempotencyKey } = parsed.data;

  if (user.accountTier === "premium") {
    return Errors.conflict(res, "ALREADY_PREMIUM", "You already have Premium.", {
      currentTier: "premium",
    });
  }

  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      logger.error("STRIPE_SECRET_KEY not configured");
      return Errors.internal(res, "PAYMENT_NOT_CONFIGURED", "Payment service not available.");
    }

    const Stripe = await import("stripe").then((m) => m.default);
    const stripe = new Stripe(stripeSecretKey);

    let rawOrigin = req.headers.origin;
    if (!rawOrigin && req.headers.referer) {
      try {
        const refUrl = new URL(req.headers.referer);
        rawOrigin = refUrl.origin;
      } catch {
        // malformed referer — ignore
      }
    }
    const origin = validateOrigin(rawOrigin);

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "SkateHubba Premium",
                description:
                  "All features unlocked for life — S.K.A.T.E. games, spots, clips, and more",
              },
              unit_amount: 999,
            },
            quantity: 1,
          },
        ],
        metadata: {
          userId: user.id,
          type: "premium_upgrade",
        },
        success_url: `${origin}?upgrade=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}?upgrade=cancelled`,
        customer_email: user.email,
      },
      {
        idempotencyKey: `checkout_${user.id}_${idempotencyKey}`,
      }
    );

    logger.info("Stripe Checkout session created", {
      userId: user.id,
      sessionId: session.id,
    });

    return res.json({ url: session.url });
  } catch (error) {
    logger.error("Failed to create checkout session", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Errors.internal(res, "CHECKOUT_FAILED", "Failed to create checkout session.");
  }
});

/**
 * POST /api/tier/purchase-premium - Purchase Premium for $9.99 (one-time)
 *
 * Verifies the Stripe payment intent before granting premium status.
 * Only succeeds if payment has been completed and amount matches exactly $9.99.
 */
const purchasePremiumSchema = z.object({
  paymentIntentId: z.string().min(1, "Payment intent ID is required"),
});

router.post("/purchase-premium", authenticateUser, async (req, res) => {
  const parsed = purchasePremiumSchema.safeParse(req.body);
  if (!parsed.success) {
    return Errors.validation(res, parsed.error.flatten());
  }

  const user = req.currentUser!;
  const { paymentIntentId } = parsed.data;

  if (user.accountTier === "premium") {
    return Errors.conflict(res, "ALREADY_PREMIUM", "You already have Premium.", {
      currentTier: "premium",
    });
  }

  try {
    // Verify the paymentIntentId with Stripe before granting premium access
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      logger.error("STRIPE_SECRET_KEY not configured");
      return Errors.internal(res, "PAYMENT_NOT_CONFIGURED", "Payment verification not available.");
    }

    // Dynamic import for stripe to avoid hard dependency
    const Stripe = await import("stripe").then((m) => m.default);
    const stripe = new Stripe(stripeSecretKey);

    try {
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

      // Verify payment succeeded and amount is correct ($9.99 = 999 cents)
      if (intent.status !== "succeeded") {
        return sendError(res, 402, "PAYMENT_NOT_COMPLETED", "Payment not completed.", {
          status: intent.status,
        });
      }

      if (intent.amount !== 999) {
        logger.error("Payment intent amount mismatch", {
          userId: user.id,
          expected: 999,
          received: intent.amount,
          paymentIntentId,
        });
        return sendError(res, 402, "PAYMENT_AMOUNT_INVALID", "Payment amount invalid.");
      }

      // Verify payment intent belongs to current user
      if (intent.metadata?.userId !== user.id) {
        logger.warn("Payment intent user mismatch", {
          userId: user.id,
          intentUserId: intent.metadata?.userId,
          paymentIntentId,
        });
        return sendError(
          res,
          403,
          "PAYMENT_INTENT_FORBIDDEN",
          "This payment intent does not belong to you."
        );
      }
    } catch (stripeError) {
      logger.error("Stripe payment verification failed", {
        userId: user.id,
        paymentIntentId,
        error: stripeError instanceof Error ? stripeError.message : String(stripeError),
      });
      return sendError(res, 402, "PAYMENT_VERIFICATION_FAILED", "Payment verification failed.");
    }

    const db = getDb();

    // Atomically check and record the consumed payment intent, then upgrade the user
    // This prevents race conditions by doing the check within the transaction
    await db.transaction(async (tx) => {
      // Check if this payment intent has already been consumed
      const [existing] = await tx
        .select({ id: consumedPaymentIntents.id })
        .from(consumedPaymentIntents)
        .where(eq(consumedPaymentIntents.paymentIntentId, paymentIntentId))
        .limit(1)
        .for("update");

      if (existing) {
        logger.warn("Payment intent already consumed", {
          userId: user.id,
          paymentIntentId,
        });
        throw new Error("PAYMENT_ALREADY_USED");
      }

      await tx.insert(consumedPaymentIntents).values({
        paymentIntentId,
        userId: user.id,
      });

      await tx
        .update(customUsers)
        .set({
          accountTier: "premium",
          premiumPurchasedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(customUsers.id, user.id));
    });

    logger.info("Premium purchased", {
      userId: user.id,
      paymentIntentId,
    });

    return res.json({
      success: true,
      message: "Welcome to Premium! All features are now unlocked for life.",
      tier: "premium",
    });
  } catch (error) {
    // Handle specific error for payment already used
    if (error instanceof Error && error.message === "PAYMENT_ALREADY_USED") {
      return sendError(
        res,
        409,
        "PAYMENT_ALREADY_USED",
        "This payment has already been applied to an account."
      );
    }

    logger.error("Failed to process premium purchase", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Errors.internal(res, "PURCHASE_FAILED", "Failed to process purchase.");
  }
});

export const tierRouter = router;
