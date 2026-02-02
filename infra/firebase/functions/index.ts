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
  result: "landed" | "bailed";
}

interface JudgeTrickResponse {
  success: boolean;
  result: "landed" | "bailed";
  winnerId: string | null;
  gameCompleted: boolean;
}

export const judgeTrick = functions.https.onCall(
  async (request): Promise<JudgeTrickResponse> => {
    if (!request.auth?.uid) {
      throw new functions.https.HttpsError("unauthenticated", "Not logged in");
    }

    const { gameId, moveId, result } = request.data as JudgeTrickRequest;

    if (!gameId || !moveId || !result) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing gameId, moveId, or result"
      );
    }

    if (result !== "landed" && result !== "bailed") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Result must be 'landed' or 'bailed'"
      );
    }

    const gameRef = admin.firestore().doc(`game_sessions/${gameId}`);
    const gameSnap = await gameRef.get();

    if (!gameSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Game not found");
    }

    const game = gameSnap.data()!;

    // Verify caller is a participant
    if (game.player1Id !== request.auth.uid && game.player2Id !== request.auth.uid) {
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

    // Only the attacker can judge (they set the trick)
    if (game.currentAttacker !== request.auth.uid) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only the attacker can judge"
      );
    }

    // Find and update the move
    const moves = game.moves || [];
    const moveIndex = moves.findIndex((m: { id: string }) => m.id === moveId);
    if (moveIndex === -1) {
      throw new functions.https.HttpsError("not-found", "Move not found");
    }

    moves[moveIndex].result = result;

    // Determine defender
    const defenderId =
      game.currentAttacker === game.player1Id
        ? game.player2Id
        : game.player1Id;

    const isPlayer1Defender = defenderId === game.player1Id;
    const currentLetters = isPlayer1Defender
      ? game.player1Letters || []
      : game.player2Letters || [];

    let newLetters = currentLetters;
    let winnerId: string | null = null;
    let gameCompleted = false;

    if (result === "bailed") {
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
      result === "landed" ? game.roundNumber : game.roundNumber + 1;

    const nextAttacker =
      result === "landed" ? defenderId : game.currentAttacker;

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
      result,
      winnerId,
      gameCompleted,
    };
  }
);
