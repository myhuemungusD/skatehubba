/**
 * Vote Timeout Handling
 *
 * Scheduled function that runs every 15 seconds to:
 * 1. Send reminder notifications at 30 seconds before deadline
 * 2. Auto-resolve votes when deadline expires (defender wins)
 *
 * This handles the edge case where both players fail to vote.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import type { DocumentData } from "firebase-admin/firestore";
import { monitoredTransaction } from "../shared/transaction";
import { VOTE_REMINDER_BEFORE_MS } from "./constants";
import type { JudgmentVotes } from "./judgeTrick";

/** Firestore game session document data */
type GameDocument = DocumentData;

/**
 * Scheduled function that runs every 15 seconds to:
 * 1. Send reminder notifications at 30 seconds before deadline
 * 2. Auto-resolve votes when deadline expires (defender wins)
 */
export const processVoteTimeouts = onSchedule("every 15 seconds", async () => {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();

  // Query for games in judging phase with vote deadline
  const gamesInJudging = await db
    .collection("game_sessions")
    .where("turnPhase", "==", "judging")
    .where("voteDeadline", "!=", null)
    .get();

  for (const gameDoc of gamesInJudging.docs) {
    const game = gameDoc.data();
    const voteDeadline = game.voteDeadline as admin.firestore.Timestamp;

    if (!voteDeadline) continue;

    const deadlineMs = voteDeadline.toMillis();
    const nowMs = now.toMillis();
    const timeRemainingMs = deadlineMs - nowMs;

    // Check if we need to send reminder (30 seconds before deadline)
    if (
      !game.voteReminderSent &&
      timeRemainingMs <= VOTE_REMINDER_BEFORE_MS &&
      timeRemainingMs > 0
    ) {
      await sendVoteReminderNotifications(gameDoc.id, game);
      await gameDoc.ref.update({ voteReminderSent: true });
    }

    // Check if deadline has passed - auto-resolve
    if (timeRemainingMs <= 0) {
      await autoResolveVoteTimeout(gameDoc.id, game);
    }
  }
});

/**
 * Send push notifications to players who haven't voted yet
 */
async function sendVoteReminderNotifications(gameId: string, game: GameDocument): Promise<void> {
  const db = admin.firestore();

  // Find the pending match move
  const moves = game.moves || [];
  const pendingMove = moves.find(
    (m: { type: string; result: string }) => m.type === "match" && m.result === "pending"
  );

  if (!pendingMove) return;

  const votes: JudgmentVotes = pendingMove.judgmentVotes || {
    attackerVote: null,
    defenderVote: null,
  };

  const playersToNotify: string[] = [];

  // Check who hasn't voted
  if (votes.attackerVote === null) {
    playersToNotify.push(game.currentAttacker);
  }

  const defenderId = game.currentAttacker === game.player1Id ? game.player2Id : game.player1Id;
  if (votes.defenderVote === null) {
    playersToNotify.push(defenderId);
  }

  // Send notifications
  for (const playerId of playersToNotify) {
    try {
      const userDoc = await db.doc(`users/${playerId}`).get();
      const fcmToken = userDoc.get("fcmToken");

      if (fcmToken) {
        await admin.messaging().send({
          token: fcmToken,
          notification: {
            title: "Vote Required!",
            body: "30 seconds left to judge the trick. Tap to vote!",
          },
          data: {
            type: "vote_reminder",
            gameId,
          },
          android: {
            priority: "high",
          },
          apns: {
            payload: {
              aps: {
                sound: "default",
                badge: 1,
              },
            },
          },
        });
        logger.log(`[VoteReminder] Sent notification to ${playerId} for game ${gameId}`);
      }
    } catch (error) {
      logger.error(`[VoteReminder] Failed to send notification to ${playerId}:`, error);
    }
  }
}

/**
 * Auto-resolve a vote timeout. Defender gets benefit of the doubt (landed).
 * Handles edge case where both players fail to vote.
 */
async function autoResolveVoteTimeout(gameId: string, game: GameDocument): Promise<void> {
  const db = admin.firestore();
  const gameRef = db.doc(`game_sessions/${gameId}`);

  await monitoredTransaction(db, "autoResolveVoteTimeout", gameId, async (transaction) => {
    // Re-read the game state to ensure we have latest data
    const freshSnap = await transaction.get(gameRef);
    if (!freshSnap.exists) return;

    const freshGame = freshSnap.data()!;

    // Double-check we're still in judging phase with expired deadline
    if (freshGame.turnPhase !== "judging") return;

    const voteDeadline = freshGame.voteDeadline as admin.firestore.Timestamp | null;
    if (!voteDeadline || voteDeadline.toMillis() > Date.now()) return;

    // Find the pending match move
    const moves = [...(freshGame.moves || [])];
    const moveIndex = moves.findIndex(
      (m: { type: string; result: string }) => m.type === "match" && m.result === "pending"
    );

    if (moveIndex === -1) return;

    const move = { ...moves[moveIndex] };

    // Auto-resolve: defender gets benefit of doubt (landed)
    const finalResult = "landed";
    move.result = finalResult;
    move.judgmentVotes = {
      ...(move.judgmentVotes || {}),
      timedOut: true,
      autoResolved: finalResult,
    };
    moves[moveIndex] = move;

    // Determine next state (same logic as judgeTrick)
    const defenderId =
      freshGame.currentAttacker === freshGame.player1Id ? freshGame.player2Id : freshGame.player1Id;

    // Since result is "landed", defender becomes attacker (roles switch)
    const nextAttacker = defenderId;
    const nextRound = freshGame.roundNumber; // Same round when landed

    const updateData: Record<string, unknown> = {
      moves,
      turnPhase: "attacker_recording",
      currentTurn: nextAttacker,
      currentAttacker: nextAttacker,
      roundNumber: nextRound,
      currentSetMove: null,
      voteDeadline: null,
      voteReminderSent: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      voteTimeoutOccurred: true,
    };

    transaction.update(gameRef, updateData);

    logger.log(`[VoteTimeout] Auto-resolved game ${gameId}: defender wins by timeout`);
  });

  // Send notifications about timeout resolution
  await sendTimeoutNotifications(gameId, game);
}

/**
 * Notify both players that the vote timed out
 */
async function sendTimeoutNotifications(gameId: string, game: GameDocument): Promise<void> {
  const db = admin.firestore();
  const playerIds = [game.player1Id, game.player2Id];

  for (const playerId of playerIds) {
    try {
      const userDoc = await db.doc(`users/${playerId}`).get();
      const fcmToken = userDoc.get("fcmToken");

      if (fcmToken) {
        await admin.messaging().send({
          token: fcmToken,
          notification: {
            title: "Vote Timed Out",
            body: "Trick counted as landed. Roles have switched!",
          },
          data: {
            type: "vote_timeout",
            gameId,
          },
        });
      }
    } catch (error) {
      logger.error(`[VoteTimeout] Failed to notify ${playerId}:`, error);
    }
  }
}
