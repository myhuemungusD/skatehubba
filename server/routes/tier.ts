import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db";
import { authenticateUser } from "../auth/middleware";
import { requirePaidOrPro } from "../middleware/requirePaidOrPro";
import { customUsers } from "@shared/schema";
import { eq, count } from "drizzle-orm";
import logger from "../logger";
import { Errors } from "../utils/apiError";
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
 * Only existing Pro users can award Pro to others.
 * This is like getting sponsored in real skating - a pro vouches for you.
 * Chain propagation is allowed: any Pro can award Pro to free users.
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

  // Only existing Pro (or legacy Premium) users can award Pro status.
  if (awarder.accountTier !== "pro" && awarder.accountTier !== "premium") {
    return Errors.forbidden(res, "PRO_REQUIRED", "Only Pro skaters can award Pro status.");
  }

  if (userId === awarder.id) {
    return Errors.badRequest(res, "SELF_AWARD", "You can't award Pro to yourself.");
  }

  try {
    const db = getDb();

    // Use a transaction to atomically check cap and award
    const result = await db.transaction(async (tx) => {
      // Cap the number of pro awards a single user can give
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

// =============================================================================
// DISABLED: Stripe payment endpoints (Premium tier removed — Pro is peer-awarded only)
// Kept for potential future use. To re-enable, remove the early-return guards.
// =============================================================================

/**
 * POST /api/tier/create-checkout-session — DISABLED
 * Premium payment has been removed. Pro status is awarded by existing Pro skaters only.
 */
router.post("/create-checkout-session", authenticateUser, (_req, res) => {
  return res.status(410).json({
    error: "PAYMENTS_DISABLED",
    message: "In-app purchases are not available. Pro status is awarded by existing Pro skaters.",
  });
});

/**
 * POST /api/tier/purchase-premium — DISABLED
 * Premium payment has been removed. Pro status is awarded by existing Pro skaters only.
 */
router.post("/purchase-premium", authenticateUser, (_req, res) => {
  return res.status(410).json({
    error: "PAYMENTS_DISABLED",
    message: "In-app purchases are not available. Pro status is awarded by existing Pro skaters.",
  });
});

export const tierRouter = router;
