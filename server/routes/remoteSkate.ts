/**
 * Remote S.K.A.T.E. API Routes
 *
 * Server-trusted endpoints for remote SKATE game management.
 * Uses Firebase Admin SDK for atomic Firestore transactions.
 *
 * POST /api/remote-skate/find-or-create  — matchmaking
 * POST /api/remote-skate/:gameId/join     — join a waiting game
 * POST /api/remote-skate/:gameId/cancel   — cancel a waiting game
 * POST /api/remote-skate/:gameId/rounds/:roundId/set-complete   — mark set done
 * POST /api/remote-skate/:gameId/rounds/:roundId/reply-complete — mark reply done
 * POST /api/remote-skate/:gameId/rounds/:roundId/resolve  — offense claims
 * POST /api/remote-skate/:gameId/rounds/:roundId/confirm  — defense confirms
 */

import { Router } from "express";
import { z } from "zod";
import { admin } from "../admin";
import type { Transaction } from "firebase-admin/firestore";
import logger from "../logger";
import type { Request, Response } from "express";
import { remoteSkateLimiter } from "../middleware/security";
import { sendGameNotificationToUser } from "../services/gameNotificationService";

const router = Router();

// Apply rate limiting to all remote-skate write endpoints
router.use(remoteSkateLimiter);
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
  "Game is not waiting for players": {
    status: 400,
    code: "INVALID_STATE",
    message: "This game is no longer available.",
  },
  "Game is full": {
    status: 400,
    code: "INVALID_STATE",
    message: "This game already has two players.",
  },
  "Cannot join your own game": {
    status: 400,
    code: "INVALID_STATE",
    message: "You cannot join your own game.",
  },
  "Only offense can submit a round result": {
    status: 403,
    code: "ACCESS_DENIED",
    message: "You do not have permission to perform this action.",
  },
  "Only defense can confirm a round result": {
    status: 403,
    code: "ACCESS_DENIED",
    message: "You do not have permission to perform this action.",
  },
  "Only defense can submit a reply": {
    status: 403,
    code: "ACCESS_DENIED",
    message: "You do not have permission to perform this action.",
  },
  "Round is not in a resolvable state": {
    status: 400,
    code: "INVALID_STATE",
    message: "This action cannot be performed right now.",
  },
  "Round is not awaiting a reply": {
    status: 400,
    code: "INVALID_STATE",
    message: "This action cannot be performed right now.",
  },
  "Round is not awaiting confirmation": {
    status: 400,
    code: "INVALID_STATE",
    message: "This action cannot be performed right now.",
  },
  "Both videos must be uploaded before resolving": {
    status: 400,
    code: "INVALID_STATE",
    message: "This action cannot be performed right now.",
  },
  "Only the game creator can cancel": {
    status: 403,
    code: "ACCESS_DENIED",
    message: "You do not have permission to cancel this game.",
  },
};

// Validation schema
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

// =============================================================================
// POST /find-or-create
//
// Server-side matchmaking: find a joinable waiting game or create a new one.
// Uses Admin SDK to bypass Firestore read rules (clients can't query other
// users' waiting games because only participants can read game docs).
// =============================================================================

router.post("/find-or-create", async (req: Request, res: Response) => {
  const uid = await verifyFirebaseAuth(req, res);
  if (!uid) return;

  try {
    const firestore = admin.firestore();

    // Look for waiting games that aren't ours
    const waitingGamesSnap = await firestore
      .collection("games")
      .where("status", "==", "waiting")
      .limit(10)
      .get();

    for (const gameDoc of waitingGamesSnap.docs) {
      const data = gameDoc.data();
      if (data.playerAUid !== uid && !data.playerBUid) {
        // Atomically join this game
        const gameId = gameDoc.id;
        const roundId = await joinGameTransaction(firestore, gameId, uid);

        logger.info("[RemoteSkate] Quick match: joined existing game", { gameId, uid });

        // Notify the game creator that someone joined
        sendGameNotificationToUser(data.playerAUid, "your_turn", {
          gameId,
        }).catch((err: unknown) =>
          logger.warn("[RemoteSkate] Notification failed", { error: String(err) })
        );

        return res.json({ success: true, gameId, matched: true, roundId });
      }
    }

    // Check if we already have a waiting game
    const myWaitingSnap = await firestore
      .collection("games")
      .where("status", "==", "waiting")
      .where("playerAUid", "==", uid)
      .limit(1)
      .get();

    if (!myWaitingSnap.empty) {
      const existingId = myWaitingSnap.docs[0].id;
      logger.info("[RemoteSkate] Rejoining own waiting game", { gameId: existingId });
      return res.json({ success: true, gameId: existingId, matched: false });
    }

    // Create a new game
    const gameRef = firestore.collection("games").doc();
    const gameId = gameRef.id;

    await gameRef.set({
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: uid,
      playerAUid: uid,
      playerBUid: null,
      letters: { [uid]: "" },
      status: "waiting",
      currentTurnUid: uid,
      lastMoveAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info("[RemoteSkate] Quick match: created new game", { gameId });
    res.json({ success: true, gameId, matched: false });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Matchmaking failed";
    logger.error("[RemoteSkate] find-or-create failed", { error: msg, uid });
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Matchmaking failed." });
  }
});

// =============================================================================
// POST /:gameId/join
//
// Atomically join a waiting game as Player B.
// Creates the first round in the same transaction.
// =============================================================================

async function joinGameTransaction(
  firestore: FirebaseFirestore.Firestore,
  gameId: string,
  uid: string
): Promise<string> {
  return firestore.runTransaction(async (transaction: Transaction) => {
    const gameRef = firestore.collection("games").doc(gameId);
    const gameSnap = await transaction.get(gameRef);

    if (!gameSnap.exists) {
      throw new Error("Game not found");
    }

    const game = gameSnap.data()!;

    if (game.playerAUid === uid) {
      throw new Error("Cannot join your own game");
    }

    if (game.playerBUid) {
      throw new Error("Game is full");
    }

    if (game.status !== "waiting") {
      throw new Error("Game is not waiting for players");
    }

    // Create first round
    const roundRef = gameRef.collection("rounds").doc();

    transaction.update(gameRef, {
      playerBUid: uid,
      [`letters.${uid}`]: "",
      status: "active",
      currentTurnUid: game.playerAUid,
      lastMoveAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    transaction.set(roundRef, {
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      offenseUid: game.playerAUid,
      defenseUid: uid,
      status: "awaiting_set",
      setVideoId: null,
      replyVideoId: null,
      result: null,
      offenseClaim: null,
      defenseClaim: null,
    });

    return roundRef.id;
  });
}

router.post("/:gameId/join", async (req: Request, res: Response) => {
  const uid = await verifyFirebaseAuth(req, res);
  if (!uid) return;

  const { gameId } = req.params;

  try {
    const firestore = admin.firestore();
    const roundId = await joinGameTransaction(firestore, gameId, uid);

    logger.info("[RemoteSkate] Game joined via API", { gameId, playerB: uid });

    // Notify player A
    const gameSnap = await firestore.collection("games").doc(gameId).get();
    if (gameSnap.exists) {
      const game = gameSnap.data()!;
      sendGameNotificationToUser(game.playerAUid, "your_turn", {
        gameId,
      }).catch((err: unknown) =>
        logger.warn("[RemoteSkate] Notification failed", { error: String(err) })
      );
    }

    res.json({ success: true, gameId, roundId });
  } catch (error) {
    const internalMessage = error instanceof Error ? error.message : "Failed to join game";
    logger.error("[RemoteSkate] Join failed", { error: internalMessage, gameId, uid });

    const mapped = error instanceof Error ? ERROR_MAP[error.message] : undefined;
    if (mapped) {
      return res.status(mapped.status).json({ error: mapped.code, message: mapped.message });
    }

    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to join game." });
  }
});

// =============================================================================
// POST /:gameId/cancel
//
// Cancel a waiting game. Sets status to "cancelled" instead of deleting
// (Firestore rules block delete on games).
// =============================================================================

router.post("/:gameId/cancel", async (req: Request, res: Response) => {
  const uid = await verifyFirebaseAuth(req, res);
  if (!uid) return;

  const { gameId } = req.params;

  try {
    const firestore = admin.firestore();

    await firestore.runTransaction(async (transaction: Transaction) => {
      const gameRef = firestore.collection("games").doc(gameId);
      const gameSnap = await transaction.get(gameRef);

      if (!gameSnap.exists) {
        throw new Error("Game not found");
      }

      const game = gameSnap.data()!;

      if (game.playerAUid !== uid) {
        throw new Error("Only the game creator can cancel");
      }

      if (game.status !== "waiting") {
        // Already active/cancelled/complete — no-op
        return;
      }

      transaction.update(gameRef, {
        status: "cancelled",
        lastMoveAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    logger.info("[RemoteSkate] Waiting game cancelled", { gameId, uid });
    res.json({ success: true });
  } catch (error) {
    const internalMessage = error instanceof Error ? error.message : "Failed to cancel game";
    logger.error("[RemoteSkate] Cancel failed", { error: internalMessage, gameId, uid });

    const mapped = error instanceof Error ? ERROR_MAP[error.message] : undefined;
    if (mapped) {
      return res.status(mapped.status).json({ error: mapped.code, message: mapped.message });
    }

    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to cancel game." });
  }
});

// =============================================================================
// POST /:gameId/rounds/:roundId/set-complete
//
// Atomically transition round to awaiting_reply and update game turn
// after set video upload completes.
// =============================================================================

router.post("/:gameId/rounds/:roundId/set-complete", async (req: Request, res: Response) => {
  const uid = await verifyFirebaseAuth(req, res);
  if (!uid) return;

  const { gameId, roundId } = req.params;

  try {
    const firestore = admin.firestore();

    await firestore.runTransaction(async (transaction: Transaction) => {
      const gameRef = firestore.collection("games").doc(gameId);
      const gameSnap = await transaction.get(gameRef);

      if (!gameSnap.exists) throw new Error("Game not found");
      const game = gameSnap.data()!;

      if (game.playerAUid !== uid && game.playerBUid !== uid) {
        throw new Error("You don't have access to this game");
      }

      if (game.status !== "active") throw new Error("Game is not active");

      const roundRef = gameRef.collection("rounds").doc(roundId);
      const roundSnap = await transaction.get(roundRef);

      if (!roundSnap.exists) throw new Error("Round not found");
      const round = roundSnap.data()!;

      if (round.offenseUid !== uid) {
        throw new Error("Only offense can submit a round result");
      }

      if (round.status !== "awaiting_set") {
        throw new Error("Round is not in a resolvable state");
      }

      transaction.update(roundRef, { status: "awaiting_reply" });
      transaction.update(gameRef, {
        currentTurnUid: round.defenseUid,
        lastMoveAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    logger.info("[RemoteSkate] Set complete", { gameId, roundId, uid });

    // Notify defense it's their turn (best-effort)
    const gameSnapAfter = await admin.firestore().collection("games").doc(gameId).get();
    if (gameSnapAfter.exists) {
      const game = gameSnapAfter.data()!;
      const defenseUid = game.playerAUid === uid ? game.playerBUid : game.playerAUid;
      if (defenseUid) {
        sendGameNotificationToUser(defenseUid, "your_turn", { gameId }).catch((err: unknown) =>
          logger.warn("[RemoteSkate] Notification failed", { error: String(err) })
        );
      }
    }

    res.json({ success: true });
  } catch (error) {
    const internalMessage = error instanceof Error ? error.message : "Failed to mark set complete";
    logger.error("[RemoteSkate] set-complete failed", {
      error: internalMessage,
      gameId,
      roundId,
      uid,
    });

    const mapped = error instanceof Error ? ERROR_MAP[error.message] : undefined;
    if (mapped) {
      return res.status(mapped.status).json({ error: mapped.code, message: mapped.message });
    }

    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to mark set complete." });
  }
});

// =============================================================================
// POST /:gameId/rounds/:roundId/reply-complete
//
// Atomically update game turn back to offense after reply video upload.
// =============================================================================

router.post("/:gameId/rounds/:roundId/reply-complete", async (req: Request, res: Response) => {
  const uid = await verifyFirebaseAuth(req, res);
  if (!uid) return;

  const { gameId, roundId } = req.params;

  try {
    const firestore = admin.firestore();

    await firestore.runTransaction(async (transaction: Transaction) => {
      const gameRef = firestore.collection("games").doc(gameId);
      const gameSnap = await transaction.get(gameRef);

      if (!gameSnap.exists) throw new Error("Game not found");
      const game = gameSnap.data()!;

      if (game.playerAUid !== uid && game.playerBUid !== uid) {
        throw new Error("You don't have access to this game");
      }

      if (game.status !== "active") throw new Error("Game is not active");

      const roundRef = gameRef.collection("rounds").doc(roundId);
      const roundSnap = await transaction.get(roundRef);

      if (!roundSnap.exists) throw new Error("Round not found");
      const round = roundSnap.data()!;

      if (round.defenseUid !== uid) {
        throw new Error("Only defense can submit a reply");
      }

      if (round.status !== "awaiting_reply") {
        throw new Error("Round is not awaiting a reply");
      }

      transaction.update(gameRef, {
        currentTurnUid: round.offenseUid,
        lastMoveAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    logger.info("[RemoteSkate] Reply complete", { gameId, roundId, uid });

    // Notify offense it's their turn to judge (best-effort)
    const gameSnapAfter = await admin.firestore().collection("games").doc(gameId).get();
    if (gameSnapAfter.exists) {
      const game = gameSnapAfter.data()!;
      const offenseUid = game.playerAUid === uid ? game.playerBUid : game.playerAUid;
      if (offenseUid) {
        sendGameNotificationToUser(offenseUid, "your_turn", { gameId }).catch((err: unknown) =>
          logger.warn("[RemoteSkate] Notification failed", { error: String(err) })
        );
      }
    }

    res.json({ success: true });
  } catch (error) {
    const internalMessage =
      error instanceof Error ? error.message : "Failed to mark reply complete";
    logger.error("[RemoteSkate] reply-complete failed", {
      error: internalMessage,
      gameId,
      roundId,
      uid,
    });

    const mapped = error instanceof Error ? ERROR_MAP[error.message] : undefined;
    if (mapped) {
      return res.status(mapped.status).json({ error: mapped.code, message: mapped.message });
    }

    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to mark reply complete." });
  }
});

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

    await firestore.runTransaction(async (transaction: Transaction) => {
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
        throw new Error("Round is not in a resolvable state");
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

    // Notify defense to confirm (best-effort)
    const gameSnap2 = await admin.firestore().collection("games").doc(gameId).get();
    if (gameSnap2.exists) {
      const gameData = gameSnap2.data()!;
      const defenseUid = gameData.playerAUid === uid ? gameData.playerBUid : gameData.playerAUid;
      if (defenseUid) {
        sendGameNotificationToUser(defenseUid, "your_turn", { gameId }).catch((err: unknown) =>
          logger.warn("[RemoteSkate] Notification failed", { error: String(err) })
        );
      }
    }

    res.json({ success: true, status: "awaiting_confirmation", offenseClaim: result });
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

    const txResult = await firestore.runTransaction(async (transaction: Transaction) => {
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
