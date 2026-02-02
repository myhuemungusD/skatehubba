import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";

admin.initializeApp();

export const createChallenge = functions.https.onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Log in bro");
  }

  const { opponentUid, clipUrl, thumbnailUrl } = request.data;
  if (!opponentUid || !clipUrl || !thumbnailUrl) {
    throw new functions.https.HttpsError("invalid-argument", "Missing data");
  }

  const challengeRef = admin.firestore().collection("challenges").doc();
  const deadline = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + 24 * 60 * 60 * 1000)
  );

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
  const opponent = await admin.firestore().doc(`users/${opponentUid}`).get();
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

interface JudgeTrickRequest {
  gameId: string;
  moveId: string;
  vote: "landed" | "bailed";
}

interface JudgeTrickResponse {
  success: boolean;
  /** The voter's vote */
  vote: "landed" | "bailed";
  /** Final result if both have voted, null if waiting */
  finalResult: "landed" | "bailed" | null;
  /** Whether waiting for other player's vote */
  waitingForOtherVote: boolean;
  /** Winner ID if game completed */
  winnerId: string | null;
  /** Whether game is completed */
  gameCompleted: boolean;
}

interface JudgmentVotes {
  attackerVote: "landed" | "bailed" | null;
  defenderVote: "landed" | "bailed" | null;
}

/**
 * Submit a vote for whether the defender landed the trick.
 * Both attacker and defender must vote. If they disagree, defender gets
 * benefit of the doubt (result = "landed").
 */
export const judgeTrick = functions.https.onCall(
  async (request): Promise<JudgeTrickResponse> => {
    if (!request.auth?.uid) {
      throw new functions.https.HttpsError("unauthenticated", "Not logged in");
    }

    const { gameId, moveId, vote } = request.data as JudgeTrickRequest;

    if (!gameId || !moveId || !vote) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing gameId, moveId, or vote"
      );
    }

    if (vote !== "landed" && vote !== "bailed") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Vote must be 'landed' or 'bailed'"
      );
    }

    const gameRef = admin.firestore().doc(`game_sessions/${gameId}`);
    const gameSnap = await gameRef.get();

    if (!gameSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Game not found");
    }

    const game = gameSnap.data()!;
    const userId = request.auth.uid;

    // Verify caller is a participant
    if (game.player1Id !== userId && game.player2Id !== userId) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Not a participant in this game"
      );
    }

    // Verify game is in judging phase
    if (game.turnPhase !== "judging") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Game is not in judging phase"
      );
    }

    // Determine if caller is attacker or defender
    const isAttacker = game.currentAttacker === userId;
    const defenderId =
      game.currentAttacker === game.player1Id
        ? game.player2Id
        : game.player1Id;

    // Find the move
    const moves = [...(game.moves || [])];
    const moveIndex = moves.findIndex((m: { id: string }) => m.id === moveId);
    if (moveIndex === -1) {
      throw new functions.https.HttpsError("not-found", "Move not found");
    }

    const move = moves[moveIndex];

    // Initialize or get existing votes
    const existingVotes: JudgmentVotes = move.judgmentVotes || {
      attackerVote: null,
      defenderVote: null,
    };

    // Check if user already voted
    if (isAttacker && existingVotes.attackerVote !== null) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "You have already voted"
      );
    }
    if (!isAttacker && existingVotes.defenderVote !== null) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "You have already voted"
      );
    }

    // Record the vote
    const newVotes: JudgmentVotes = {
      attackerVote: isAttacker ? vote : existingVotes.attackerVote,
      defenderVote: isAttacker ? existingVotes.defenderVote : vote,
    };

    moves[moveIndex] = {
      ...move,
      judgmentVotes: newVotes,
    };

    // Check if both have voted
    const bothVoted = newVotes.attackerVote !== null && newVotes.defenderVote !== null;

    if (!bothVoted) {
      // Still waiting for other vote - just update the votes
      await gameRef.update({
        moves,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        vote,
        finalResult: null,
        waitingForOtherVote: true,
        winnerId: null,
        gameCompleted: false,
      };
    }

    // Both have voted - determine final result
    // If they agree, use that result. If they disagree, benefit of doubt to defender (landed)
    let finalResult: "landed" | "bailed";
    if (newVotes.attackerVote === newVotes.defenderVote) {
      finalResult = newVotes.attackerVote!;
    } else {
      // Disagreement - defender gets benefit of the doubt
      finalResult = "landed";
    }

    moves[moveIndex].result = finalResult;

    // Calculate game state changes
    const isPlayer1Defender = defenderId === game.player1Id;
    const currentLetters = isPlayer1Defender
      ? game.player1Letters || []
      : game.player2Letters || [];

    let newLetters = currentLetters;
    let winnerId: string | null = null;
    let gameCompleted = false;

    if (finalResult === "bailed") {
      // Defender gets a letter
      const nextLetterIndex = currentLetters.length;
      if (nextLetterIndex < SKATE_LETTERS.length) {
        newLetters = [...currentLetters, SKATE_LETTERS[nextLetterIndex]];

        // Game over if defender has SKATE
        if (newLetters.length === 5) {
          winnerId = game.currentAttacker;
          gameCompleted = true;
        }
      }
    }

    // Determine next state
    const nextRound =
      finalResult === "landed" ? game.roundNumber : game.roundNumber + 1;

    const nextAttacker =
      finalResult === "landed" ? defenderId : game.currentAttacker;

    const nextTurnPhase = gameCompleted ? "round_complete" : "attacker_recording";

    const updateData: Record<string, unknown> = {
      moves,
      turnPhase: nextTurnPhase,
      currentTurn: nextAttacker,
      currentAttacker: nextAttacker,
      roundNumber: nextRound,
      currentSetMove: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(isPlayer1Defender
        ? { player1Letters: newLetters }
        : { player2Letters: newLetters }),
    };

    if (gameCompleted) {
      updateData.status = "completed";
      updateData.winnerId = winnerId;
      updateData.completedAt = admin.firestore.FieldValue.serverTimestamp();
    }

    await gameRef.update(updateData);

    return {
      success: true,
      vote,
      finalResult,
      waitingForOtherVote: false,
      winnerId,
      gameCompleted,
    };
  }
);
