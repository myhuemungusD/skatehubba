/**
 * S.K.A.T.E. Game Dispute Routes
 * Thin HTTP layer — business logic lives in gameDisputeService
 */

import { Router } from "express";
import { getDb, isDatabaseAvailable } from "../db";
import { authenticateUser } from "../auth/middleware";
import logger from "../logger";
import { sendGameNotificationToUser } from "../services/gameNotificationService";
import { disputeSchema, resolveDisputeSchema } from "./games-shared";
import { fileDispute, resolveDispute } from "../services/gameDisputeService";

const router = Router();

// ============================================================================
// POST /api/games/:id/dispute — File a dispute (max 1 per player per game)
// ============================================================================

router.post("/:id/dispute", authenticateUser, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const parsed = disputeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", issues: parsed.error.flatten() });
  }

  const currentUserId = req.currentUser!.id;
  const gameId = req.params.id;
  const { turnId } = parsed.data;

  try {
    const db = getDb();

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
    res.status(500).json({ error: "Failed to file dispute" });
  }
});

// ============================================================================
// POST /api/games/disputes/:disputeId/resolve — Resolve a dispute
// ============================================================================

router.post("/disputes/:disputeId/resolve", authenticateUser, async (req, res) => {
  if (!isDatabaseAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const parsed = resolveDisputeSchema.safeParse({
    ...req.body,
    disputeId: parseInt(req.params.disputeId, 10),
  });
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", issues: parsed.error.flatten() });
  }

  const currentUserId = req.currentUser!.id;
  const { disputeId, finalResult } = parsed.data;

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
    res.status(500).json({ error: "Failed to resolve dispute" });
  }
});

export { router as gamesDisputesRouter };
