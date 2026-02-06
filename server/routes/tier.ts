import { Router } from "express";
import { z } from "zod";
import { getDb, isDatabaseAvailable } from "../db";
import { authenticateUser } from "../auth/middleware";
import { requirePaidOrPro } from "../middleware/requirePaidOrPro";
import { customUsers } from "@shared/schema";
import { eq } from "drizzle-orm";
import logger from "../logger";

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
 * Only existing Pro or Premium users can award Pro to others.
 * This is like getting sponsored in real skating - a pro vouches for you.
 */
const awardProSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
});

router.post("/award-pro", authenticateUser, requirePaidOrPro, async (req, res) => {
  const parsed = awardProSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", issues: parsed.error.flatten() });
  }

  const { userId } = parsed.data;
  const awarder = req.currentUser!;

  if (userId === awarder.id) {
    return res.status(400).json({ error: "You can't award Pro to yourself" });
  }

  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Service unavailable" });
  }

  try {
    const db = getDb();

    // Check if target user exists and is on free tier
    const [targetUser] = await db
      .select({
        id: customUsers.id,
        accountTier: customUsers.accountTier,
        firstName: customUsers.firstName,
      })
      .from(customUsers)
      .where(eq(customUsers.id, userId))
      .limit(1);

    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    if (targetUser.accountTier !== "free") {
      return res.status(409).json({
        error: "User already has Pro or Premium status",
        currentTier: targetUser.accountTier,
      });
    }

    // Award Pro status
    await db
      .update(customUsers)
      .set({
        accountTier: "pro",
        proAwardedBy: awarder.id,
        updatedAt: new Date(),
      })
      .where(eq(customUsers.id, userId));

    logger.info("Pro status awarded", {
      awardedTo: userId,
      awardedBy: awarder.id,
    });

    return res.json({
      success: true,
      message: `Pro status awarded to ${targetUser.firstName || "user"}`,
      awardedTo: userId,
      awardedBy: awarder.id,
    });
  } catch (error) {
    logger.error("Failed to award Pro status", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Failed to award Pro status" });
  }
});

/**
 * POST /api/tier/purchase-premium - Purchase Premium for $9.99 (one-time)
 *
 * In production, this should verify a Stripe payment intent/receipt.
 * For now, it accepts a paymentIntentId that should be verified with Stripe.
 */
const purchasePremiumSchema = z.object({
  paymentIntentId: z.string().min(1, "Payment intent ID is required"),
});

router.post("/purchase-premium", authenticateUser, async (req, res) => {
  const parsed = purchasePremiumSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", issues: parsed.error.flatten() });
  }

  const user = req.currentUser!;
  const { paymentIntentId } = parsed.data;

  if (user.accountTier === "premium") {
    return res.status(409).json({
      error: "You already have Premium",
      currentTier: "premium",
    });
  }

  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Service unavailable" });
  }

  try {
    // TODO: Verify the paymentIntentId with Stripe
    // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    // const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    // if (intent.status !== 'succeeded' || intent.amount !== 999) {
    //   return res.status(402).json({ error: 'Payment not verified' });
    // }

    const db = getDb();

    await db
      .update(customUsers)
      .set({
        accountTier: "premium",
        premiumPurchasedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(customUsers.id, user.id));

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
    logger.error("Failed to process premium purchase", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Failed to process purchase" });
  }
});

export const tierRouter = router;
