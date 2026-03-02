/**
 * Join Game
 *
 * Cloud Function for player 2 to accept a S.K.A.T.E. challenge.
 * Transitions the game from "waiting" to "active" and initializes
 * the first turn. Uses a Firestore transaction to prevent race conditions.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { monitoredTransaction } from "../shared/transaction";
import { checkRateLimit } from "../shared/rateLimit";

interface JoinGameRequest {
  gameId: string;
}

interface JoinGameResponse {
  success: boolean;
}

/**
 * Accept a S.K.A.T.E. challenge and start the game.
 *
 * Only the invited player (player2Id) can join. The game transitions
 * from "waiting" to "active" and the challenger (player1) gets the
 * first turn as attacker.
 */
export const joinGame = functions.https.onCall(
  async (
    data: JoinGameRequest,
    context: functions.https.CallableContext
  ): Promise<JoinGameResponse> => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError("unauthenticated", "Not logged in");
    }

    await checkRateLimit(context.auth.uid);

    const { gameId } = data;

    if (!gameId) {
      throw new functions.https.HttpsError("invalid-argument", "Missing gameId");
    }

    const userId = context.auth.uid;
    const db = admin.firestore();
    const gameRef = db.doc(`game_sessions/${gameId}`);

    await monitoredTransaction(db, "joinGame", gameId, async (transaction) => {
      const gameSnap = await transaction.get(gameRef);

      if (!gameSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Game not found");
      }

      const game = gameSnap.data()!;

      // Natural idempotency: if the game is already active and caller is player2,
      // treat as success (handles React Query retries, double-taps)
      if (game.status === "active" && game.player2Id === userId) {
        return;
      }

      if (game.status !== "waiting") {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Game is not waiting for a player"
        );
      }

      // Only the invited player can accept
      if (game.player2Id !== userId) {
        throw new functions.https.HttpsError("permission-denied", "You are not the invited player");
      }

      transaction.update(gameRef, {
        status: "active",
        currentTurn: game.player1Id,
        currentAttacker: game.player1Id,
        turnPhase: "attacker_recording",
        roundNumber: 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { success: true };
  }
);
