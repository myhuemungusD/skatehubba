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

/** Maps internal error messages to sanitized client-facing responses. */
const ERROR_MAP: Record<string, { status: number; code: string; message: string }> = {
  "Game not found": { status: 404, code: "GAME_NOT_FOUND", message: "Game not found." },
  "Round not found": { status: 404, code: "ROUND_NOT_FOUND", message: "Round not found." },
  "You don't have access to this game": {
    status: 403,
    code: "ACCESS_DENIED",
    message: "You do not have access to this resource.",
  },
  "Game is not active": {
    status: 400,
    code: "INVALID_STATE",
    message: "This action cannot be performed right now.",
  },
  "Only offense can resolve a round": {
    status: 403,
    code: "ACCESS_DENIED",
    message: "You do not have permission to perform this action.",
  },
  "Round is not ready for resolution": {
    status: 400,
    code: "INVALID_STATE",
    message: "This action cannot be performed right now.",
  },
  "Both videos must be uploaded before resolving": {
    status: 400,
    code: "INVALID_STATE",
    message: "This action cannot be performed right now.",
  },
};

// Validation schema
const resolveSchema = z.object({
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
 * Resolve a round result. Only offense can call this.
 * Performs atomic transaction:
 *   1. Validate caller is offense and round has both videos
 *   2. Update round: status="resolved", set result
 *   3. Apply Core SKATE Rule to game letters
 *   4. Create next round or complete game
 */
router.post("/:gameId/rounds/:roundId/resolve", async (req: Request, res: Response) => {
  // Auth
  const uid = await verifyFirebaseAuth(req, res);
  if (!uid) return;

  // Validate body
  const parsed = resolveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", issues: parsed.error.flatten() });
  }

  const { gameId, roundId } = req.params;
  const { result } = parsed.data;

  try {
    const firestore = admin.firestore();

    await firestore.runTransaction(async (transaction) => {
      // 1. Read game doc
      const gameRef = firestore.collection("games").doc(gameId);
      const gameSnap = await transaction.get(gameRef);

      if (!gameSnap.exists) {
        throw new Error("Game not found");
      }

      const game = gameSnap.data()!;

      // Verify caller is a participant
      if (game.playerAUid !== uid && game.playerBUid !== uid) {
        throw new Error("You don't have access to this game");
      }

      // Verify game is active
      if (game.status !== "active") {
        throw new Error("Game is not active");
      }

      // 2. Read round doc
      const roundRef = gameRef.collection("rounds").doc(roundId);
      const roundSnap = await transaction.get(roundRef);

      if (!roundSnap.exists) {
        throw new Error("Round not found");
      }

      const round = roundSnap.data()!;

      // Verify caller is offense
      if (round.offenseUid !== uid) {
        throw new Error("Only offense can resolve a round");
      }

      // Verify round has both videos and is in awaiting_reply status
      if (round.status !== "awaiting_reply") {
        throw new Error("Round is not ready for resolution");
      }

      if (!round.setVideoId || !round.replyVideoId) {
        throw new Error("Both videos must be uploaded before resolving");
      }

      const offenseUid = round.offenseUid;
      const defenseUid = round.defenseUid;

      // 3. Apply Core SKATE Rule
      const letters = { ...game.letters } as Record<string, string>;
      let nextOffenseUid: string;
      let nextDefenseUid: string;

      if (result === "missed") {
        // Defense missed: defense gets next letter, offense stays offense
        const currentDefenseLetters = letters[defenseUid] || "";
        const nextLetterIndex = currentDefenseLetters.length;
        if (nextLetterIndex < MAX_LETTERS) {
          letters[defenseUid] = currentDefenseLetters + SKATE_LETTERS[nextLetterIndex];
        }
        nextOffenseUid = offenseUid;
        nextDefenseUid = defenseUid;
      } else {
        // Defense landed: no letter, roles swap
        nextOffenseUid = defenseUid;
        nextDefenseUid = offenseUid;
      }

      // 4. Update round as resolved
      transaction.update(roundRef, {
        status: "resolved",
        result,
      });

      // 5. Check if game is over (any player has SKATE = 5 letters)
      const defenseLetterCount = (letters[defenseUid] || "").length;
      const isGameOver = defenseLetterCount >= MAX_LETTERS;

      if (isGameOver) {
        // Game complete
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
        // Game continues: create next round
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
        });

        logger.info("[RemoteSkate] Round resolved, next round created", {
          gameId,
          roundId,
          result,
          nextRoundId: nextRoundRef.id,
          nextOffenseUid,
          nextDefenseUid,
          letters,
        });
      }
    });

    res.json({ success: true, result });
  } catch (error) {
    const internalMessage = error instanceof Error ? error.message : "Failed to resolve round";
    logger.error("[RemoteSkate] Resolve failed", { error: internalMessage, gameId, roundId, uid });

    // Map known internal errors to sanitized client-facing responses
    const mapped = error instanceof Error ? ERROR_MAP[error.message] : undefined;
    if (mapped) {
      return res.status(mapped.status).json({ error: mapped.code, message: mapped.message });
    }

    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to resolve round." });
  }
});

export { router as remoteSkateRouter };
