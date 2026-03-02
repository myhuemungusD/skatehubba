/**
 * Abandon Game
 *
 * Cloud Function for forfeiting an active S.K.A.T.E. battle.
 * The opponent is declared winner server-side to prevent malicious
 * clients from self-assigning wins. Clears vote deadline state to
 * prevent the processVoteTimeouts scheduler from acting on abandoned games.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { monitoredTransaction } from "../shared/transaction";
import { checkRateLimit } from "../shared/rateLimit";

interface AbandonGameRequest {
  gameId: string;
}

interface AbandonGameResponse {
  success: boolean;
}

/**
 * Forfeit an active game. The caller loses and their opponent wins.
 *
 * Winner is computed server-side — the client cannot influence who wins,
 * addressing the game integrity risk noted in the mobile code.
 */
export const abandonGame = functions.https.onCall(
  async (
    data: AbandonGameRequest,
    context: functions.https.CallableContext
  ): Promise<AbandonGameResponse> => {
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

    await monitoredTransaction(db, "abandonGame", gameId, async (transaction) => {
      const gameSnap = await transaction.get(gameRef);

      if (!gameSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Game not found");
      }

      const game = gameSnap.data()!;

      // Natural idempotency: if the game is already abandoned or completed
      // and caller is a participant, treat as success (handles reconnect
      // timeout effect firing multiple times, React Query retries)
      if (
        (game.status === "abandoned" || game.status === "completed") &&
        (game.player1Id === userId || game.player2Id === userId)
      ) {
        return;
      }

      if (game.status !== "active") {
        throw new functions.https.HttpsError("failed-precondition", "Game is not active");
      }

      // Only participants can forfeit
      if (game.player1Id !== userId && game.player2Id !== userId) {
        throw new functions.https.HttpsError("permission-denied", "Not a participant in this game");
      }

      // Winner is the opponent (server-side determination)
      const winnerId = game.player1Id === userId ? game.player2Id : game.player1Id;

      transaction.update(gameRef, {
        status: "abandoned",
        winnerId,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        // Clear vote state so processVoteTimeouts ignores this game
        voteDeadline: null,
        voteReminderSent: null,
      });
    });

    return { success: true };
  }
);
