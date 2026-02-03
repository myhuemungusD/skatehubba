import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";

admin.initializeApp();

const db = admin.firestore();

export const createChallenge = functions.https.onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Log in bro");
  }

  const { opponentUid, clipUrl, thumbnailUrl } = request.data;
  if (!opponentUid || !clipUrl || !thumbnailUrl) {
    throw new functions.https.HttpsError("invalid-argument", "Missing data");
  }

  const challengeRef = db.collection("challenges").doc();
  const deadline = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000));

  await challengeRef.set({
    id: challengeRef.id,
    createdBy: request.auth.uid,
    opponent: opponentUid,
    status: "pending",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    deadline,
    rules: { oneTake: true, durationSec: 15 },
    clipA: { url: clipUrl, thumbnailUrl, durationSec: 15 },
  });

  // FCM notify opponent
  const opponent = await db.doc(`users/${opponentUid}`).get();
  const token = opponent.get("fcmToken");
  if (token) {
    await admin.messaging().send({
      token,
      notification: { title: "Challenge Incoming!", body: "24h or forfeit" },
      data: { type: "challenge", id: challengeRef.id },
    });
  }

  return { success: true, challengeId: challengeRef.id };
});

const SKATE_LETTERS = ["S", "K", "A", "T", "E"] as const;

// ============================================================================
// SUBMIT TRICK - Server-side with transaction
// ============================================================================

interface SubmitTrickRequest {
  gameId: string;
  clipUrl: string;
  trickName: string | null;
  isSetTrick: boolean;
  /** Client-generated idempotency key to prevent duplicate submissions */
  idempotencyKey: string;
}

interface SubmitTrickResponse {
  success: boolean;
  moveId: string;
  /** True if this was a duplicate submission (already processed) */
  duplicate: boolean;
}

/**
 * Submit a trick (set or match) with transaction to prevent race conditions.
 * Uses idempotency key to prevent duplicate submissions from flaky connections.
 */
export const submitTrick = functions.https.onCall(async (request): Promise<SubmitTrickResponse> => {
  if (!request.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Not logged in");
  }

  const { gameId, clipUrl, trickName, isSetTrick, idempotencyKey } =
    request.data as SubmitTrickRequest;

  if (!gameId || !clipUrl || !idempotencyKey) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing gameId, clipUrl, or idempotencyKey"
    );
  }

  const userId = request.auth.uid;
  const gameRef = db.doc(`game_sessions/${gameId}`);

  // Use transaction to ensure atomic read-modify-write
  const result = await db.runTransaction(async (transaction) => {
    const gameSnap = await transaction.get(gameRef);

    if (!gameSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Game not found");
    }

    const game = gameSnap.data()!;

    // Check idempotency - has this request already been processed?
    const processedKeys: string[] = game.processedIdempotencyKeys || [];
    if (processedKeys.includes(idempotencyKey)) {
      // Find the move that was created with this key
      const existingMove = (game.moves || []).find(
        (m: { idempotencyKey?: string }) => m.idempotencyKey === idempotencyKey
      );
      return {
        success: true,
        moveId: existingMove?.id || "unknown",
        duplicate: true,
      };
    }

    // Verify caller is a participant
    if (game.player1Id !== userId && game.player2Id !== userId) {
      throw new functions.https.HttpsError("permission-denied", "Not a participant in this game");
    }

    // Verify it's this player's turn
    if (game.currentTurn !== userId) {
      throw new functions.https.HttpsError("failed-precondition", "Not your turn");
    }

    // Verify correct phase
    const expectedPhase = isSetTrick ? "attacker_recording" : "defender_recording";
    if (game.turnPhase !== expectedPhase) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `Invalid phase. Expected ${expectedPhase}, got ${game.turnPhase}`
      );
    }

    // Verify correct role
    const isAttacker = game.currentAttacker === userId;
    if (isSetTrick && !isAttacker) {
      throw new functions.https.HttpsError("permission-denied", "Only attacker can set trick");
    }
    if (!isSetTrick && isAttacker) {
      throw new functions.https.HttpsError("permission-denied", "Only defender can match trick");
    }

    // Create move
    const moveId = `move_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const move = {
      id: moveId,
      idempotencyKey,
      roundNumber: game.roundNumber,
      playerId: userId,
      type: isSetTrick ? "set" : "match",
      trickName: trickName || null,
      clipUrl,
      thumbnailUrl: null,
      durationSec: 15,
      result: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Calculate next state
    const nextPhase = isSetTrick ? "defender_recording" : "judging";
    const nextTurn = isSetTrick
      ? game.player1Id === userId
        ? game.player2Id
        : game.player1Id
      : game.currentTurn; // During judging, turn doesn't change

    // Update game state atomically
    transaction.update(gameRef, {
      moves: admin.firestore.FieldValue.arrayUnion(move),
      currentSetMove: isSetTrick ? move : game.currentSetMove,
      turnPhase: nextPhase,
      currentTurn: nextTurn,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      // Track idempotency key (keep last 50 to avoid unbounded growth)
      processedIdempotencyKeys: [...processedKeys.slice(-49), idempotencyKey],
    });

    return {
      success: true,
      moveId,
      duplicate: false,
    };
  });

  return result;
});

// ============================================================================
// JUDGE TRICK - Server-side with transaction
// ============================================================================

interface JudgeTrickRequest {
  gameId: string;
  moveId: string;
  vote: "landed" | "bailed";
  /** Client-generated idempotency key */
  idempotencyKey: string;
}

interface JudgeTrickResponse {
  success: boolean;
  vote: "landed" | "bailed";
  finalResult: "landed" | "bailed" | null;
  waitingForOtherVote: boolean;
  winnerId: string | null;
  gameCompleted: boolean;
  /** True if this was a duplicate vote (already processed) */
  duplicate: boolean;
}

interface JudgmentVotes {
  attackerVote: "landed" | "bailed" | null;
  defenderVote: "landed" | "bailed" | null;
}

/**
 * Submit a vote for whether the defender landed the trick.
 * Uses transaction to prevent race conditions when both players vote simultaneously.
 * Both attacker and defender must vote. If they disagree, defender gets
 * benefit of the doubt (result = "landed").
 */
export const judgeTrick = functions.https.onCall(async (request): Promise<JudgeTrickResponse> => {
  if (!request.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Not logged in");
  }

  const { gameId, moveId, vote, idempotencyKey } = request.data as JudgeTrickRequest;

  if (!gameId || !moveId || !vote) {
    throw new functions.https.HttpsError("invalid-argument", "Missing gameId, moveId, or vote");
  }

  if (vote !== "landed" && vote !== "bailed") {
    throw new functions.https.HttpsError("invalid-argument", "Vote must be 'landed' or 'bailed'");
  }

  const userId = request.auth.uid;
  const gameRef = db.doc(`game_sessions/${gameId}`);

  // Use transaction to ensure atomic read-modify-write
  const result = await db.runTransaction(async (transaction) => {
    const gameSnap = await transaction.get(gameRef);

    if (!gameSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Game not found");
    }

    const game = gameSnap.data()!;

    // Check idempotency
    const processedKeys: string[] = game.processedIdempotencyKeys || [];
    if (idempotencyKey && processedKeys.includes(idempotencyKey)) {
      // Return the current state - vote was already recorded
      const move = (game.moves || []).find((m: { id: string }) => m.id === moveId);
      return {
        success: true,
        vote,
        finalResult: move?.result === "pending" ? null : move?.result,
        waitingForOtherVote: move?.result === "pending",
        winnerId: game.winnerId || null,
        gameCompleted: game.status === "completed",
        duplicate: true,
      };
    }

    // Verify caller is a participant
    if (game.player1Id !== userId && game.player2Id !== userId) {
      throw new functions.https.HttpsError("permission-denied", "Not a participant in this game");
    }

    // Verify game is in judging phase
    if (game.turnPhase !== "judging") {
      throw new functions.https.HttpsError("failed-precondition", "Game is not in judging phase");
    }

    // Determine if caller is attacker or defender
    const isAttacker = game.currentAttacker === userId;
    const defenderId = game.currentAttacker === game.player1Id ? game.player2Id : game.player1Id;

    // Find the move (work with a copy)
    const moves = [...(game.moves || [])];
    const moveIndex = moves.findIndex((m: { id: string }) => m.id === moveId);
    if (moveIndex === -1) {
      throw new functions.https.HttpsError("not-found", "Move not found");
    }

    const move = { ...moves[moveIndex] };

    // Initialize or get existing votes
    const existingVotes: JudgmentVotes = move.judgmentVotes || {
      attackerVote: null,
      defenderVote: null,
    };

    // Check if user already voted (inside transaction - race-safe)
    if (isAttacker && existingVotes.attackerVote !== null) {
      throw new functions.https.HttpsError("failed-precondition", "You have already voted");
    }
    if (!isAttacker && existingVotes.defenderVote !== null) {
      throw new functions.https.HttpsError("failed-precondition", "You have already voted");
    }

    // Record the vote
    const newVotes: JudgmentVotes = {
      attackerVote: isAttacker ? vote : existingVotes.attackerVote,
      defenderVote: isAttacker ? existingVotes.defenderVote : vote,
    };

    move.judgmentVotes = newVotes;
    moves[moveIndex] = move;

    // Check if both have voted
    const bothVoted = newVotes.attackerVote !== null && newVotes.defenderVote !== null;

    if (!bothVoted) {
      // Still waiting for other vote - just update the votes
      transaction.update(gameRef, {
        moves,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        processedIdempotencyKeys: idempotencyKey
          ? [...processedKeys.slice(-49), idempotencyKey]
          : processedKeys,
      });

      return {
        success: true,
        vote,
        finalResult: null,
        waitingForOtherVote: true,
        winnerId: null,
        gameCompleted: false,
        duplicate: false,
      };
    }

    // Both have voted - determine final result
    // If they agree, use that result. If they disagree, benefit of doubt to defender
    let finalResult: "landed" | "bailed";
    if (newVotes.attackerVote === newVotes.defenderVote) {
      finalResult = newVotes.attackerVote!;
    } else {
      finalResult = "landed"; // Defender wins ties
    }

    move.result = finalResult;
    moves[moveIndex] = move;

    // Calculate game state changes
    const isPlayer1Defender = defenderId === game.player1Id;
    const currentLetters = isPlayer1Defender
      ? game.player1Letters || []
      : game.player2Letters || [];

    let newLetters = currentLetters;
    let winnerId: string | null = null;
    let gameCompleted = false;

    if (finalResult === "bailed") {
      const nextLetterIndex = currentLetters.length;
      if (nextLetterIndex < SKATE_LETTERS.length) {
        newLetters = [...currentLetters, SKATE_LETTERS[nextLetterIndex]];

        if (newLetters.length === 5) {
          winnerId = game.currentAttacker;
          gameCompleted = true;
        }
      }
    }

    // Determine next state
    const nextRound = finalResult === "landed" ? game.roundNumber : game.roundNumber + 1;
    const nextAttacker = finalResult === "landed" ? defenderId : game.currentAttacker;
    const nextTurnPhase = gameCompleted ? "round_complete" : "attacker_recording";

    const updateData: Record<string, unknown> = {
      moves,
      turnPhase: nextTurnPhase,
      currentTurn: nextAttacker,
      currentAttacker: nextAttacker,
      roundNumber: nextRound,
      currentSetMove: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      processedIdempotencyKeys: idempotencyKey
        ? [...processedKeys.slice(-49), idempotencyKey]
        : processedKeys,
      ...(isPlayer1Defender ? { player1Letters: newLetters } : { player2Letters: newLetters }),
    };

    if (gameCompleted) {
      updateData.status = "completed";
      updateData.winnerId = winnerId;
      updateData.completedAt = admin.firestore.FieldValue.serverTimestamp();
    }

    transaction.update(gameRef, updateData);

    return {
      success: true,
      vote,
      finalResult,
      waitingForOtherVote: false,
      winnerId,
      gameCompleted,
      duplicate: false,
    };
  });

  return result;
});
