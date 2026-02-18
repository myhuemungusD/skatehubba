/**
 * Remote S.K.A.T.E. API Routes
 *
 * Server-trusted endpoint for resolving rounds.
 * Uses Firebase Admin SDK for atomic Firestore transactions.
 *
 * POST /api/remote-skate/:gameId/rounds/:roundId/resolve
 */

import { Router } from "express";
import { z } from "zod";
import { admin } from "../admin";
import logger from "../logger";
import type { Request, Response } from "express";

const router = Router();
const SKATE_LETTERS = "SKATE";
const MAX_LETTERS = 5;

// Validation schemas
const resolveSchema = z.object({
  result: z.enum(["landed", "missed"]),
});

const confirmSchema = z.object({
  result: z.enum(["landed", "missed"]),
});

/**
 * Authenticate via Firebase ID token in Authorization header.
 * Returns the decoded UID or sends 401.
 */
async function verifyFirebaseAuth(req: Request, res: Response): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }

  try {
    const token = authHeader.substring(7);
    const decoded = await admin.auth().verifyIdToken(token, true);
    return decoded.uid;
  } catch (error) {
    logger.error("[RemoteSkate] Token verification failed", { error: String(error) });
    res.status(401).json({ error: "Invalid authentication token" });
    return null;
  }
}

/**
 * POST /:gameId/rounds/:roundId/resolve
 *
 * Submit a round result claim. Only offense can call this.
 * This does NOT finalize the round — it transitions the round to
 * "awaiting_confirmation" so the defense player must confirm or dispute.
 */
router.post("/:gameId/rounds/:roundId/resolve", async (req: Request, res: Response) => {
  const uid = await verifyFirebaseAuth(req, res);
  if (!uid) return;

  const parsed = resolveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", issues: parsed.error.flatten() });
  }

  const { gameId, roundId } = req.params;
  const { result } = parsed.data;

  try {
    const firestore = admin.firestore();

    await firestore.runTransaction(async (transaction) => {
      const gameRef = firestore.collection("games").doc(gameId);
      const gameSnap = await transaction.get(gameRef);

      if (!gameSnap.exists) {
        throw new Error("Game not found");
      }

      const game = gameSnap.data()!;

      if (game.playerAUid !== uid && game.playerBUid !== uid) {
        throw new Error("You don't have access to this game");
      }

      if (game.status !== "active") {
        throw new Error("Game is not active");
      }

      const roundRef = gameRef.collection("rounds").doc(roundId);
      const roundSnap = await transaction.get(roundRef);

      if (!roundSnap.exists) {
        throw new Error("Round not found");
      }

      const round = roundSnap.data()!;

      if (round.offenseUid !== uid) {
        throw new Error("Only offense can submit a round result");
      }

      if (round.status !== "awaiting_reply") {
        throw new Error("Round is not ready for resolution");
      }

      if (!round.setVideoId || !round.replyVideoId) {
        throw new Error("Both videos must be uploaded before resolving");
      }

      // Transition to awaiting_confirmation — defense must confirm
      transaction.update(roundRef, {
        status: "awaiting_confirmation",
        offenseClaim: result,
      });

      logger.info("[RemoteSkate] Offense submitted claim, awaiting defense confirmation", {
        gameId,
        roundId,
        offenseClaim: result,
        offenseUid: uid,
      });
    });

    res.json({ success: true, status: "awaiting_confirmation", offenseClaim: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resolve round";
    logger.error("[RemoteSkate] Resolve failed", { error: message, gameId, roundId, uid });

    if (message.includes("not found")) {
      return res.status(404).json({ error: message });
    }
    if (message.includes("access") || message.includes("Only offense")) {
      return res.status(403).json({ error: message });
    }
    if (
      message.includes("not active") ||
      message.includes("not ready") ||
      message.includes("Both videos")
    ) {
      return res.status(400).json({ error: message });
    }

    res.status(500).json({ error: "Failed to resolve round" });
  }
});

/**
 * POST /:gameId/rounds/:roundId/confirm
 *
 * Defense confirms (or disputes) the offense's round result claim.
 * If the defense agrees, the round is finalized and SKATE letters are applied.
 * If the defense disagrees, the round is flagged as "disputed" for manual review.
 */
router.post("/:gameId/rounds/:roundId/confirm", async (req: Request, res: Response) => {
  const uid = await verifyFirebaseAuth(req, res);
  if (!uid) return;

  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", issues: parsed.error.flatten() });
  }

  const { gameId, roundId } = req.params;
  const { result: defenseVerdict } = parsed.data;

  try {
    const firestore = admin.firestore();

    const txResult = await firestore.runTransaction(async (transaction) => {
      const gameRef = firestore.collection("games").doc(gameId);
      const gameSnap = await transaction.get(gameRef);

      if (!gameSnap.exists) {
        throw new Error("Game not found");
      }

      const game = gameSnap.data()!;

      if (game.playerAUid !== uid && game.playerBUid !== uid) {
        throw new Error("You don't have access to this game");
      }

      if (game.status !== "active") {
        throw new Error("Game is not active");
      }

      const roundRef = gameRef.collection("rounds").doc(roundId);
      const roundSnap = await transaction.get(roundRef);

      if (!roundSnap.exists) {
        throw new Error("Round not found");
      }

      const round = roundSnap.data()!;

      // Only defense can confirm
      if (round.defenseUid !== uid) {
        throw new Error("Only defense can confirm a round result");
      }

      if (round.status !== "awaiting_confirmation") {
        throw new Error("Round is not awaiting confirmation");
      }

      const offenseClaim = round.offenseClaim as string;

      // If defense disagrees with offense claim, flag as disputed
      if (defenseVerdict !== offenseClaim) {
        transaction.update(roundRef, {
          status: "disputed",
          defenseClaim: defenseVerdict,
        });

        logger.info("[RemoteSkate] Round disputed", {
          gameId,
          roundId,
          offenseClaim,
          defenseClaim: defenseVerdict,
        });

        return { disputed: true };
      }

      // Both players agree — finalize the round
      const agreedResult = offenseClaim;
      const offenseUid = round.offenseUid;
      const defenseUid = round.defenseUid;

      const letters = { ...game.letters } as Record<string, string>;
      let nextOffenseUid: string;
      let nextDefenseUid: string;

      if (agreedResult === "missed") {
        const currentDefenseLetters = letters[defenseUid] || "";
        const nextLetterIndex = currentDefenseLetters.length;
        if (nextLetterIndex < MAX_LETTERS) {
          letters[defenseUid] = currentDefenseLetters + SKATE_LETTERS[nextLetterIndex];
        }
        nextOffenseUid = offenseUid;
        nextDefenseUid = defenseUid;
      } else {
        nextOffenseUid = defenseUid;
        nextDefenseUid = offenseUid;
      }

      transaction.update(roundRef, {
        status: "resolved",
        result: agreedResult,
        defenseClaim: defenseVerdict,
      });

      const defenseLetterCount = (letters[defenseUid] || "").length;
      const isGameOver = defenseLetterCount >= MAX_LETTERS;

      if (isGameOver) {
        transaction.update(gameRef, {
          letters,
          status: "complete",
          lastMoveAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        logger.info("[RemoteSkate] Game complete", {
          gameId,
          winnerUid: offenseUid,
          loserUid: defenseUid,
          letters,
        });
      } else {
        const nextRoundRef = gameRef.collection("rounds").doc();

        transaction.update(gameRef, {
          letters,
          currentTurnUid: nextOffenseUid,
          lastMoveAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        transaction.set(nextRoundRef, {
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          offenseUid: nextOffenseUid,
          defenseUid: nextDefenseUid,
          status: "awaiting_set",
          setVideoId: null,
          replyVideoId: null,
          result: null,
          offenseClaim: null,
          defenseClaim: null,
        });

        logger.info("[RemoteSkate] Round resolved by consensus, next round created", {
          gameId,
          roundId,
          result: agreedResult,
          nextOffenseUid,
          nextDefenseUid,
          letters,
        });
      }

      return { disputed: false, result: agreedResult };
    });

    res.json({ success: true, ...txResult });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to confirm round";
    logger.error("[RemoteSkate] Confirm failed", { error: message, gameId, roundId, uid });

    if (message.includes("not found")) {
      return res.status(404).json({ error: message });
    }
    if (message.includes("access") || message.includes("Only defense")) {
      return res.status(403).json({ error: message });
    }
    if (
      message.includes("not active") ||
      message.includes("not awaiting") ||
      message.includes("Both videos")
    ) {
      return res.status(400).json({ error: message });
    }

    res.status(500).json({ error: "Failed to confirm round" });
  }
});

export { router as remoteSkateRouter };
