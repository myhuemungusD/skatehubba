/**
 * Submit Trick
 *
 * Cloud Function for submitting a trick (set or match) in a S.K.A.T.E. battle.
 * Uses Firestore transactions to prevent race conditions and idempotency keys
 * to deduplicate submissions from flaky network connections.
 */

import * as crypto from "crypto";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { monitoredTransaction } from "../shared/transaction";
import { VOTE_TIMEOUT_MS } from "./constants";

interface SubmitTrickRequest {
  gameId: string;
  clipUrl: string;
  /** Firebase Storage path for signed-URL resolution (preferred over clipUrl) */
  storagePath?: string;
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
 * Sets voteDeadline when transitioning to judging phase for timeout handling.
 */
export const submitTrick = functions.https.onCall(
  async (
    data: SubmitTrickRequest,
    context: functions.https.CallableContext
  ): Promise<SubmitTrickResponse> => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError("unauthenticated", "Not logged in");
    }

    const { gameId, clipUrl, storagePath, trickName, isSetTrick, idempotencyKey } = data;

    if (!gameId || (!clipUrl && !storagePath) || !idempotencyKey) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing gameId, clipUrl/storagePath, or idempotencyKey"
      );
    }

    // Validate storagePath format when provided
    if (storagePath) {
      const STORAGE_PATH_RE =
        /^videos\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/round_[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.\w+$/;
      if (
        !STORAGE_PATH_RE.test(storagePath) ||
        storagePath.includes("..") ||
        storagePath.includes("\0")
      ) {
        throw new functions.https.HttpsError("invalid-argument", "Invalid storagePath format");
      }
    }

    const userId = context.auth.uid;
    const db = admin.firestore();
    const gameRef = db.doc(`game_sessions/${gameId}`);

    // Use monitored transaction to ensure atomic read-modify-write
    // and track retry rates for production observability
    const result = await monitoredTransaction(db, "submitTrick", gameId, async (transaction) => {
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
      const moveId = `move_${userId}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const move = {
        id: moveId,
        idempotencyKey,
        roundNumber: game.roundNumber,
        playerId: userId,
        type: isSetTrick ? "set" : "match",
        trickName: trickName || null,
        clipUrl: clipUrl || "",
        storagePath: storagePath || null,
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

      // Build update data
      const updateData: Record<string, unknown> = {
        moves: admin.firestore.FieldValue.arrayUnion(move),
        currentSetMove: isSetTrick ? move : game.currentSetMove,
        turnPhase: nextPhase,
        currentTurn: nextTurn,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        // Track idempotency key (keep last 50 to avoid unbounded growth)
        processedIdempotencyKeys: [...processedKeys.slice(-49), idempotencyKey],
      };

      // Set vote deadline when entering judging phase (60 seconds from now)
      if (nextPhase === "judging") {
        const voteDeadline = admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + VOTE_TIMEOUT_MS)
        );
        updateData.voteDeadline = voteDeadline;
        updateData.voteReminderSent = false;
      }

      // Update game state atomically
      transaction.update(gameRef, updateData);

      return {
        success: true,
        moveId,
        duplicate: false,
      };
    });

    return result;
  }
);
