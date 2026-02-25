/**
 * Setter Bail
 *
 * Cloud Function for when the offensive player (setter) bails their own trick.
 * The setter receives a letter and roles swap. If the setter reaches S.K.A.T.E.,
 * the game ends.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { monitoredTransaction } from "../shared/transaction";
import { SKATE_LETTERS } from "./constants";

interface SetterBailRequest {
  gameId: string;
  /** Client-generated idempotency key */
  idempotencyKey: string;
}

interface SetterBailResponse {
  success: boolean;
  gameOver: boolean;
  winnerId: string | null;
  message: string;
  /** True if this was a duplicate request (already processed) */
  duplicate: boolean;
}

/**
 * The setter bails their own trick — they receive a letter and roles swap.
 * If the setter reaches S.K.A.T.E., the game ends and the defender wins.
 */
export const setterBail = functions.https.onCall(
  async (
    data: SetterBailRequest,
    context: functions.https.CallableContext
  ): Promise<SetterBailResponse> => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError("unauthenticated", "Not logged in");
    }

    const { gameId, idempotencyKey } = data;

    if (!gameId) {
      throw new functions.https.HttpsError("invalid-argument", "Missing gameId");
    }

    const userId = context.auth.uid;
    const db = admin.firestore();
    const gameRef = db.doc(`game_sessions/${gameId}`);

    const result = await monitoredTransaction(db, "setterBail", gameId, async (transaction) => {
      const gameSnap = await transaction.get(gameRef);

      if (!gameSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Game not found");
      }

      const game = gameSnap.data()!;

      // Idempotency check
      const processedKeys: string[] = game.processedIdempotencyKeys || [];
      if (idempotencyKey && processedKeys.includes(idempotencyKey)) {
        return {
          success: true,
          gameOver: game.status === "completed",
          winnerId: game.winnerId || null,
          message: "Already processed",
          duplicate: true,
        };
      }

      // Verify game is active
      if (game.status !== "active") {
        throw new functions.https.HttpsError("failed-precondition", "Game is not active");
      }

      // Verify caller is the attacker (setter)
      if (game.currentAttacker !== userId) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "Only the setter can declare a bail"
        );
      }

      // Verify game is in attacker_recording phase
      if (game.turnPhase !== "attacker_recording") {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Can only bail during set trick phase"
        );
      }

      // Determine which player is the setter
      const isPlayer1Setter = game.player1Id === userId;
      const currentLetters: string[] = isPlayer1Setter
        ? game.player1Letters || []
        : game.player2Letters || [];

      // Add next letter
      const nextLetterIndex = currentLetters.length;
      if (nextLetterIndex >= SKATE_LETTERS.length) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Player already has S.K.A.T.E."
        );
      }

      const newLetters = [...currentLetters, SKATE_LETTERS[nextLetterIndex]];
      const isGameOver = newLetters.length === 5;

      // Determine winner (the other player)
      const winnerId = isGameOver ? (isPlayer1Setter ? game.player2Id : game.player1Id) : null;

      // Swap roles: defender becomes attacker
      const newAttacker = isPlayer1Setter ? game.player2Id : game.player1Id;

      const updateData: Record<string, unknown> = {
        ...(isPlayer1Setter ? { player1Letters: newLetters } : { player2Letters: newLetters }),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        processedIdempotencyKeys: idempotencyKey
          ? [...processedKeys.slice(-49), idempotencyKey]
          : processedKeys,
      };

      if (isGameOver) {
        updateData.status = "completed";
        updateData.winnerId = winnerId;
        updateData.completedAt = admin.firestore.FieldValue.serverTimestamp();
        updateData.turnPhase = "round_complete";
      } else {
        // Swap roles
        updateData.currentAttacker = newAttacker;
        updateData.currentTurn = newAttacker;
        updateData.turnPhase = "attacker_recording";
        updateData.roundNumber = (game.roundNumber || 1) + 1;
        updateData.currentSetMove = null;
      }

      transaction.update(gameRef, updateData);

      return {
        success: true,
        gameOver: isGameOver,
        winnerId,
        message: isGameOver
          ? "You bailed your own trick. Game over."
          : "You bailed your own trick. Letter earned. Roles swap.",
        duplicate: false,
      };
    });

    return result;
  }
);
