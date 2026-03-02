/**
 * S.K.A.T.E. Game Dispute Routes
 * Thin HTTP layer — business logic lives in gameDisputeService
 */

import { Router } from "express";
import { getDb } from "../db";
import { games } from "@shared/schema";
import { eq } from "drizzle-orm";
import { authenticateUser, requireAdmin } from "../auth/middleware";
import logger from "../logger";
import { sendGameNotificationToUser } from "../services/gameNotificationService";
import { Errors } from "../utils/apiError";
import { disputeSchema, resolveDisputeSchema } from "./games-shared";
import { fileDispute, resolveDispute } from "../services/gameDisputeService";

const router = Router();

// ============================================================================
// POST /api/games/:id/dispute — File a dispute (max 1 per player per game)
// ============================================================================

router.post("/:id/dispute", authenticateUser, async (req, res) => {
  const parsed = disputeSchema.safeParse(req.body);
  if (!parsed.success) {
    return Errors.validation(res, parsed.error.flatten());
  }

  const currentUserId = req.currentUser!.id;
  const gameId = req.params.id;
  const { turnId } = parsed.data;

  try {
    const db = getDb();

    // H4: Verify the user is a participant in this game before allowing dispute
    const [game] = await db
      .select({ player1Id: games.player1Id, player2Id: games.player2Id })
      .from(games)
      .where(eq(games.id, gameId))
      .limit(1);

    if (!game) {
      return Errors.notFound(res, "GAME_NOT_FOUND", "Game not found.");
    }

    if (game.player1Id !== currentUserId && game.player2Id !== currentUserId) {
      return Errors.forbidden(res, "NOT_PARTICIPANT", "Only game participants can file disputes.");
    }

    const txResult = await db.transaction(async (tx) =>
      fileDispute(tx, gameId, currentUserId, turnId)
    );

    if (!txResult.ok) {
      return res.status(txResult.status).json({ error: txResult.error });
    }

    logger.info("[Games] Dispute filed", {
      gameId,
      turnId,
      disputeId: txResult.dispute.id,
      disputedBy: currentUserId,
    });

    // Notify opponent after transaction commits
    if (txResult.opponentId) {
      await sendGameNotificationToUser(txResult.opponentId, "dispute_filed", {
        gameId,
        disputeId: txResult.dispute.id,
      });
    }

    res.status(201).json({
      dispute: txResult.dispute,
      message: "Dispute filed. Awaiting resolution.",
    });
  } catch (error) {
    logger.error("[Games] Failed to file dispute", {
      error,
      gameId,
      userId: currentUserId,
    });
    Errors.internal(res, "DISPUTE_FILE_FAILED", "Failed to file dispute.");
  }
});

// ============================================================================
// POST /api/games/disputes/:disputeId/resolve — Resolve a dispute
// ============================================================================

router.post("/disputes/:disputeId/resolve", authenticateUser, requireAdmin, async (req, res) => {
  // Validate disputeId from route param
  if (!/^\d+$/.test(req.params.disputeId)) {
    return Errors.badRequest(res, "INVALID_DISPUTE_ID", "Invalid dispute ID.");
  }
  const disputeId = parseInt(req.params.disputeId, 10);
  if (isNaN(disputeId) || disputeId <= 0) {
    return Errors.badRequest(res, "INVALID_DISPUTE_ID", "Invalid dispute ID.");
  }

  // Validate body (only finalResult)
  const parsed = resolveDisputeSchema.safeParse(req.body);
  if (!parsed.success) {
    return Errors.validation(res, parsed.error.flatten());
  }

  const currentUserId = req.currentUser!.id;
  const { finalResult } = parsed.data;

  try {
    const db = getDb();

    const txResult = await db.transaction(async (tx) =>
      resolveDispute(tx, disputeId, currentUserId, finalResult)
    );

    if (!txResult.ok) {
      return res.status(txResult.status).json({ error: txResult.error });
    }

    logger.info("[Games] Dispute resolved", {
      disputeId,
      finalResult,
      penaltyTarget: txResult.penaltyTarget,
    });

    res.json({
      dispute: txResult.dispute,
      message:
        finalResult === "landed"
          ? "Dispute upheld. BAIL overturned to LAND. Letter removed."
          : "Dispute denied. BAIL stands.",
    });
  } catch (error) {
    logger.error("[Games] Failed to resolve dispute", {
      error,
      disputeId,
      userId: currentUserId,
    });
    Errors.internal(res, "DISPUTE_RESOLVE_FAILED", "Failed to resolve dispute.");
  }
});

export { router as gamesDisputesRouter };
