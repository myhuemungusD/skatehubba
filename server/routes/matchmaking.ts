import { Router } from "express";
import crypto from "node:crypto";
import { customUsers } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { authenticateUser } from "../auth/middleware";
import { quickMatchLimiter } from "../middleware/security";
import { sendQuickMatchNotification } from "../services/notificationService";
import logger from "../logger";

const router = Router();

// POST /api/matchmaking/quick-match — find a random opponent
router.post("/quick-match", authenticateUser, quickMatchLimiter, async (req, res) => {
  const currentUserId = req.currentUser?.id;
  const currentUserName = req.currentUser?.firstName || "Skater";

  if (!currentUserId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const database = getDb();

    // Find an available opponent (exclude current user, select random user with push token)
    const availableOpponents = await database
      .select({
        id: customUsers.id,
        firstName: customUsers.firstName,
        pushToken: customUsers.pushToken,
      })
      .from(customUsers)
      .where(eq(customUsers.isActive, true))
      .limit(50);

    // Filter out current user and users without push tokens
    const eligibleOpponents = availableOpponents.filter(
      (u) => u.id !== currentUserId && u.pushToken
    );

    if (eligibleOpponents.length === 0) {
      return res.status(404).json({
        error: "No opponents available",
        message: "No users found for quick match. Try again later.",
      });
    }

    // Select random opponent using unbiased cryptographically secure random
    // Use rejection sampling to avoid modulo bias
    const maxRange = Math.floor(0xffffffff / eligibleOpponents.length) * eligibleOpponents.length;
    let randomValue: number;
    do {
      const randomBytes = crypto.randomBytes(4);
      randomValue = randomBytes.readUInt32BE(0);
    } while (randomValue >= maxRange);

    const randomIndex = randomValue % eligibleOpponents.length;
    const opponent = eligibleOpponents[randomIndex];

    // In production, you would create a challenge record here
    // For now, we'll create a temporary challenge ID
    const challengeId = `qm-${Date.now()}-${currentUserId}-${opponent.id}`;

    // Send push notification to opponent
    if (opponent.pushToken) {
      await sendQuickMatchNotification(opponent.pushToken, currentUserName, challengeId);
    }

    logger.info("[Quick Match] Match found", {
      requesterId: currentUserId,
      opponentId: opponent.id,
      challengeId,
    });

    res.json({
      success: true,
      match: {
        opponentId: opponent.id,
        opponentName: opponent.firstName || "Skater",
        challengeId,
      },
    });
  } catch (error) {
    logger.error("[Quick Match] Failed to find match", { error, userId: currentUserId });
    res.status(500).json({ error: "Failed to find match" });
  }
});

export const matchmakingRouter = router;
