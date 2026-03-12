import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { customUsers, games } from "@shared/schema";
import { eq, and, or } from "drizzle-orm";
import { getDb } from "../db";
import { authenticateUser } from "../auth/middleware";
import { quickMatchLimiter } from "../middleware/security";
import { validateBody } from "../middleware/validation";
import { sendQuickMatchNotification } from "../services/notificationService";
import logger from "../logger";

const router = Router();

const quickMatchSchema = z.object({
  gameId: z.string().max(128).optional(),
});

// POST /api/matchmaking/quick-match — find a random opponent and notify them
router.post(
  "/quick-match",
  authenticateUser,
  quickMatchLimiter,
  validateBody(quickMatchSchema),
  async (req, res) => {
    const currentUserId = req.currentUser?.id;
    const currentUserName = req.currentUser?.firstName || "Skater";

    if (!currentUserId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Accept optional gameId so the notification can link directly to the game
    const { gameId } = req.body as z.infer<typeof quickMatchSchema>;

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

      // Exclude opponents who already have a pending challenge from/to the current user
      const pendingGames = await database
        .select({ player1Id: games.player1Id, player2Id: games.player2Id })
        .from(games)
        .where(
          and(
            eq(games.status, "pending"),
            or(eq(games.player1Id, currentUserId), eq(games.player2Id, currentUserId))
          )
        );

      const pendingOpponentIds = new Set(
        pendingGames
          .map((g) => (g.player1Id === currentUserId ? g.player2Id : g.player1Id))
          .filter((id): id is string => id !== null)
      );

      // Filter out current user, users without push tokens, and users with pending challenges
      const eligibleOpponents = availableOpponents.filter(
        (u) => u.id !== currentUserId && u.pushToken && !pendingOpponentIds.has(u.id)
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

      const challengeId = gameId || `qm-${Date.now()}-${currentUserId}-${opponent.id}`;

      // Send push notification to opponent
      if (opponent.pushToken) {
        await sendQuickMatchNotification(opponent.pushToken, currentUserName, challengeId);
      }

      logger.info("[Quick Match] Match found and notified", {
        requesterId: currentUserId,
        opponentId: opponent.id,
        challengeId,
        gameId: gameId || null,
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
  }
);

export const matchmakingRouter = router;
