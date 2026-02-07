/**
 * Firebase Cloud Functions
 *
 * Secure serverless functions for SkateHubba.
 * Handles role management, profile creation, and S.K.A.T.E. game logic.
 *
 * Security Features:
 * - App Check enforcement for abuse prevention
 * - Rate limiting via in-memory tracking
 * - RBAC with custom claims
 * - Comprehensive audit logging
 * - Firestore transactions for race condition prevention
 */

import * as functions from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
// Bounties feature archived - see archive/functions-src/bounties/

const SKATE_LETTERS = ["S", "K", "A", "T", "E"] as const;

/** Vote timeout duration in milliseconds (60 seconds) */
const VOTE_TIMEOUT_MS = 60 * 1000;
/** Time before deadline to send reminder notification (30 seconds) */
const VOTE_REMINDER_BEFORE_MS = 30 * 1000;

// Initialize Firebase Admin if not already done
if (!admin.apps.length) {
  admin.initializeApp();
}

ffmpeg.setFfprobePath(ffprobeInstaller.path);

// Valid roles that can be assigned
const VALID_ROLES = ["admin", "moderator", "verified_pro"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

// ============================================================================
// Profile Creation Schema
// ============================================================================

const VALID_STANCES = ["regular", "goofy"] as const;
const VALID_EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced", "pro"] as const;

interface ProfileCreatePayload {
  username?: string;
  stance?: (typeof VALID_STANCES)[number] | null;
  experienceLevel?: (typeof VALID_EXPERIENCE_LEVELS)[number] | null;
  favoriteTricks?: string[];
  bio?: string | null;
  crewName?: string | null;
  avatarBase64?: string;
  skip?: boolean;
}

// ============================================================================
// Rate Limiting (In-Memory for single instance, use Redis for multi-instance)
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const RATE_LIMIT = {
  maxRequests: 10, // Max requests per window
  windowMs: 60 * 1000, // 1 minute window
};

/**
 * Check if a user has exceeded rate limit
 */
function checkRateLimit(uid: string): void {
  const now = Date.now();
  const entry = rateLimitStore.get(uid);

  if (!entry || now > entry.resetAt) {
    // First request or window expired - reset
    rateLimitStore.set(uid, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return;
  }

  if (entry.count >= RATE_LIMIT.maxRequests) {
    throw new functions.https.HttpsError(
      "resource-exhausted",
      "Too many requests. Please try again later."
    );
  }

  entry.count++;
}

/**
 * Verify App Check token if available (soft enforcement)
 */
function verifyAppCheck(context: functions.https.CallableContext): void {
  if (!context.app) {
    console.warn("[Security] Request without App Check token from:", context.auth?.uid);
  }
}

/**
 * Mask email for privacy (show first char + domain)
 * john.doe@gmail.com -> j***@gmail.com
 */
function maskEmail(email: string | undefined): string {
  if (!email) return "***";
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local[0]}***@${domain}`;
}

interface ManageRolePayload {
  targetUid: string;
  role: ValidRole;
  action: "grant" | "revoke";
}

/**
 * manageUserRole
 *
 * Protected Callable Function for role management.
 * Only Admins can call this function to promote/demote users.
 *
 * Payload: {
 *   targetUid: string,
 *   role: 'admin' | 'moderator' | 'verified_pro',
 *   action: 'grant' | 'revoke'
 * }
 */
export const manageUserRole = functions.https.onCall(
  async (data: ManageRolePayload, context: functions.https.CallableContext) => {
    // 1. SECURITY: Authentication Gate
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "You must be logged in to call this function."
      );
    }

    // 2. SECURITY: App Check verification
    verifyAppCheck(context);

    // 3. SECURITY: Rate limiting
    checkRateLimit(context.auth.uid);

    // 4. SECURITY: Authorization Gate (RBAC)
    // Check the caller's token for the 'admin' role
    const callerRoles = (context.auth.token.roles as string[]) || [];
    if (!callerRoles.includes("admin")) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only Admins can manage user roles."
      );
    }

    // 5. VALIDATION: Input Sanitization
    const { targetUid, role, action } = data;

    if (!VALID_ROLES.includes(role as ValidRole)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `Role must be one of: ${VALID_ROLES.join(", ")}`
      );
    }

    if (!targetUid || typeof targetUid !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "Invalid Target User ID.");
    }

    if (action !== "grant" && action !== "revoke") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        'Action must be "grant" or "revoke".'
      );
    }

    // 6. SAFETY: Prevent self-demotion from admin
    if (targetUid === context.auth.uid && role === "admin" && action === "revoke") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "You cannot remove your own admin privileges."
      );
    }

    try {
      // 7. LOGIC: Fetch current claims
      const userRecord = await admin.auth().getUser(targetUid);
      const currentClaims = userRecord.customClaims || {};
      const currentRoles: string[] = (currentClaims.roles as string[]) || [];

      let newRoles = [...currentRoles];

      if (action === "grant") {
        // Add role if not present
        if (!newRoles.includes(role)) {
          newRoles.push(role);
        }
      } else {
        // Remove role
        newRoles = newRoles.filter((r) => r !== role);
      }

      // 6. EXECUTION: Write back to Auth System
      await admin.auth().setCustomUserClaims(targetUid, {
        ...currentClaims,
        roles: newRoles,
      });

      // 7. SYNC: Update Firestore for UI speed
      // This allows the frontend to show "Admin" badges without decoding the token
      // Use set with merge to create doc if it doesn't exist
      await admin.firestore().collection("users").doc(targetUid).set(
        {
          roles: newRoles,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // 8. AUDIT: Log the action
      await admin.firestore().collection("audit_logs").add({
        action: "role_change",
        targetUid,
        targetEmail: userRecord.email,
        role,
        changeType: action,
        performedBy: context.auth.uid,
        performedByEmail: context.auth.token.email,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`Role ${action}: ${role} for ${userRecord.email} by ${context.auth.token.email}`);

      return {
        success: true,
        message: `User ${userRecord.email} is now: [${newRoles.join(", ") || "no roles"}]`,
        roles: newRoles,
      };
    } catch (error: unknown) {
      console.error("Role Management Error:", error);

      const firebaseError = error as { code?: string };
      if (firebaseError.code === "auth/user-not-found") {
        throw new functions.https.HttpsError("not-found", "Target user not found.");
      }

      throw new functions.https.HttpsError("internal", "Failed to update user roles.");
    }
  }
);

/**
 * getUserRoles
 *
 * Get the roles for a specific user (admin only)
 * Returns masked email for privacy protection
 */
export const getUserRoles = functions.https.onCall(
  async (data: { targetUid: string }, context: functions.https.CallableContext) => {
    // Authentication
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");
    }

    // App Check & Rate limiting
    verifyAppCheck(context);
    checkRateLimit(context.auth.uid);

    // Authorization
    const callerRoles = (context.auth.token.roles as string[]) || [];
    if (!callerRoles.includes("admin")) {
      throw new functions.https.HttpsError("permission-denied", "Only Admins can view user roles.");
    }

    // Validation
    const { targetUid } = data;
    if (!targetUid || typeof targetUid !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "Target UID required.");
    }

    try {
      const userRecord = await admin.auth().getUser(targetUid);
      const roles = (userRecord.customClaims?.roles as string[]) || [];

      return {
        uid: targetUid,
        email: maskEmail(userRecord.email), // Privacy: mask email
        roles,
      };
    } catch (error: unknown) {
      throw new functions.https.HttpsError("not-found", "User not found.");
    }
  }
);

// ============================================================================
// Profile Creation (Deprecated - handled by REST API)
// ============================================================================

/**
 * createProfile
 *
 * @deprecated Profile creation is now handled by the REST API.
 * This callable function exists only to provide a helpful error message.
 */
export const createProfile = functions.https.onCall(
  async (_data: ProfileCreatePayload, _context: functions.https.CallableContext) => {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Profile creation is handled by the REST API. Use POST /api/profile/create."
    );
  }
);

// ============================================================================
// Video Validation (Storage Trigger)
// ============================================================================

export const validateChallengeVideo = functions.storage.object().onFinalize(async (object) => {
  const filePath = object.name;
  if (!filePath || !filePath.startsWith("challenges/")) {
    return;
  }

  if (object.contentType && !object.contentType.startsWith("video/")) {
    return;
  }

  const bucket = admin.storage().bucket(object.bucket);
  const file = bucket.file(filePath);
  const tempFilePath = path.join(
    os.tmpdir(),
    `${path.basename(filePath)}_${Date.now()}_${Math.random().toString(36).slice(2)}`
  );

  try {
    await file.download({ destination: tempFilePath });

    const duration = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(
        tempFilePath,
        (err: Error | null, metadata: { format?: { duration?: number } }) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(metadata?.format?.duration ?? 0);
        }
      );
    });

    if (duration < 14.5 || duration > 15.5) {
      await file.delete();
      console.warn(
        `[validateChallengeVideo] Deleted invalid clip ${filePath} (duration ${duration}s)`
      );
    }
  } catch (error) {
    console.error("[validateChallengeVideo] Failed to validate clip:", filePath, error);
  } finally {
    try {
      fs.unlinkSync(tempFilePath);
    } catch {
      // Ignore temp cleanup errors
    }
  }
});

// ============================================================================
// S.K.A.T.E. BATTLE GAME FUNCTIONS
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

    const { gameId, clipUrl, trickName, isSetTrick, idempotencyKey } = data;

    if (!gameId || !clipUrl || !idempotencyKey) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing gameId, clipUrl, or idempotencyKey"
      );
    }

    const userId = context.auth.uid;
    const db = admin.firestore();
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
export const judgeTrick = functions.https.onCall(
  async (
    data: JudgeTrickRequest,
    context: functions.https.CallableContext
  ): Promise<JudgeTrickResponse> => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError("unauthenticated", "Not logged in");
    }

    const { gameId, moveId, vote, idempotencyKey } = data;

    if (!gameId || !moveId || !vote) {
      throw new functions.https.HttpsError("invalid-argument", "Missing gameId, moveId, or vote");
    }

    if (vote !== "landed" && vote !== "bailed") {
      throw new functions.https.HttpsError("invalid-argument", "Vote must be 'landed' or 'bailed'");
    }

    const userId = context.auth.uid;
    const db = admin.firestore();
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

// ============================================================================
// VOTE TIMEOUT - Scheduled function to handle expired votes
// ============================================================================

/**
 * Scheduled function that runs every 15 seconds to:
 * 1. Send reminder notifications at 30 seconds before deadline
 * 2. Auto-resolve votes when deadline expires (defender wins)
 *
 * This handles the edge case where both players fail to vote.
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
async function sendVoteReminderNotifications(
  gameId: string,
  game: FirebaseFirestore.DocumentData
): Promise<void> {
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
        console.log(`[VoteReminder] Sent notification to ${playerId} for game ${gameId}`);
      }
    } catch (error) {
      console.error(`[VoteReminder] Failed to send notification to ${playerId}:`, error);
    }
  }
}

/**
 * Auto-resolve a vote timeout. Defender gets benefit of the doubt (landed).
 * Handles edge case where both players fail to vote.
 */
async function autoResolveVoteTimeout(
  gameId: string,
  game: FirebaseFirestore.DocumentData
): Promise<void> {
  const db = admin.firestore();
  const gameRef = db.doc(`game_sessions/${gameId}`);

  await db.runTransaction(async (transaction) => {
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

    console.log(`[VoteTimeout] Auto-resolved game ${gameId}: defender wins by timeout`);
  });

  // Send notifications about timeout resolution
  await sendTimeoutNotifications(gameId, game);
}

/**
 * Notify both players that the vote timed out
 */
async function sendTimeoutNotifications(
  gameId: string,
  game: FirebaseFirestore.DocumentData
): Promise<void> {
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
      console.error(`[VoteTimeout] Failed to notify ${playerId}:`, error);
    }
  }
}

// Commerce exports
export { holdAndCreatePaymentIntent } from "./commerce/holdAndCreateIntent";
export { stripeWebhook } from "./commerce/stripeWebhook";
export { expireHolds } from "./commerce/expireHolds";
