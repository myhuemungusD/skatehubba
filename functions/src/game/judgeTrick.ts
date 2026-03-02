/**
 * Judge Trick
 *
 * Cloud Function for submitting a vote on whether a trick was landed.
 * Both players must vote; if they disagree, defender gets benefit of the doubt.
 * Uses Firestore transactions to prevent race conditions on simultaneous votes.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { monitoredTransaction } from "../shared/transaction";
import { checkRateLimit } from "../shared/rateLimit";
import { SKATE_LETTERS } from "./constants";
import type { JudgmentVotes } from "./constants";

// Re-export for consumers that import JudgmentVotes from this file
export type { JudgmentVotes };

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

/**
 * Submit a vote for whether the defender landed the trick.
 * Uses transaction to prevent race conditions when both players vote simultaneously.
 * Both attacker and defender must vote. If they disagree, defender gets
 * benefit of the doubt (result = "landed").
 */
export const judgeTrick = functions.https.onCall(
  async (
    data: JudgeTrickRequest,
    context: functions.https.CallableContext
  ): Promise<JudgeTrickResponse> => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError("unauthenticated", "Not logged in");
    }

    await checkRateLimit(context.auth.uid);

    const { gameId, moveId, vote, idempotencyKey } = data;

    if (!gameId || !moveId || !vote || !idempotencyKey) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing gameId, moveId, vote, or idempotencyKey"
      );
    }

    if (vote !== "landed" && vote !== "bailed") {
      throw new functions.https.HttpsError("invalid-argument", "Vote must be 'landed' or 'bailed'");
    }

    const userId = context.auth.uid;
    const db = admin.firestore();
    const gameRef = db.doc(`game_sessions/${gameId}`);

    // Use monitored transaction to ensure atomic read-modify-write
    // and track retry rates for production observability
    const result = await monitoredTransaction(db, "judgeTrick", gameId, async (transaction) => {
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
        // Clear vote deadline when judging completes
        voteDeadline: null,
        voteReminderSent: null,
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
  }
);
