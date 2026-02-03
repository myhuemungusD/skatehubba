"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processVoteTimeouts = exports.judgeTrick = exports.submitTrick = exports.validateChallengeVideo = exports.createProfile = exports.getUserRoles = exports.manageUserRole = void 0;
const functions = __importStar(require("firebase-functions"));
const scheduler_1 = require("firebase-functions/v2/scheduler");
const admin = __importStar(require("firebase-admin"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const ffprobe_1 = __importDefault(require("@ffprobe-installer/ffprobe"));
const SKATE_LETTERS = ["S", "K", "A", "T", "E"];
/** Vote timeout duration in milliseconds (60 seconds) */
const VOTE_TIMEOUT_MS = 60 * 1000;
/** Time before deadline to send reminder notification (30 seconds) */
const VOTE_REMINDER_BEFORE_MS = 30 * 1000;
// Initialize Firebase Admin if not already done
if (!admin.apps.length) {
    admin.initializeApp();
}
fluent_ffmpeg_1.default.setFfprobePath(ffprobe_1.default.path);
// Valid roles that can be assigned
const VALID_ROLES = ["admin", "moderator", "verified_pro"];
// ============================================================================
// Profile Creation Schema
// ============================================================================
const VALID_STANCES = ["regular", "goofy"];
const VALID_EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced", "pro"];
const rateLimitStore = new Map();
const RATE_LIMIT = {
    maxRequests: 10, // Max requests per window
    windowMs: 60 * 1000, // 1 minute window
};
/**
 * Check if a user has exceeded rate limit
 */
function checkRateLimit(uid) {
    const now = Date.now();
    const entry = rateLimitStore.get(uid);
    if (!entry || now > entry.resetAt) {
        // First request or window expired - reset
        rateLimitStore.set(uid, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
        return;
    }
    if (entry.count >= RATE_LIMIT.maxRequests) {
        throw new functions.https.HttpsError("resource-exhausted", "Too many requests. Please try again later.");
    }
    entry.count++;
}
/**
 * Verify App Check token if available (soft enforcement)
 * Set to hard enforcement in production by uncommenting the throw
 */
function verifyAppCheck(context) {
    var _a;
    if (!context.app) {
        console.warn("[Security] Request without App Check token from:", (_a = context.auth) === null || _a === void 0 ? void 0 : _a.uid);
        // Uncomment for hard enforcement:
        // throw new functions.https.HttpsError('failed-precondition', 'App Check verification failed.');
    }
}
/**
 * Mask email for privacy (show first char + domain)
 * john.doe@gmail.com -> j***@gmail.com
 */
function maskEmail(email) {
    if (!email)
        return "***";
    const [local, domain] = email.split("@");
    if (!domain)
        return "***";
    return `${local[0]}***@${domain}`;
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
exports.manageUserRole = functions.https.onCall(async (data, context) => {
    // 1. SECURITY: Authentication Gate
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in to call this function.");
    }
    // 2. SECURITY: App Check verification
    verifyAppCheck(context);
    // 3. SECURITY: Rate limiting
    checkRateLimit(context.auth.uid);
    // 4. SECURITY: Authorization Gate (RBAC)
    // Check the caller's token for the 'admin' role
    const callerRoles = context.auth.token.roles || [];
    if (!callerRoles.includes("admin")) {
        throw new functions.https.HttpsError("permission-denied", "Only Admins can manage user roles.");
    }
    // 5. VALIDATION: Input Sanitization
    const { targetUid, role, action } = data;
    if (!VALID_ROLES.includes(role)) {
        throw new functions.https.HttpsError("invalid-argument", `Role must be one of: ${VALID_ROLES.join(", ")}`);
    }
    if (!targetUid || typeof targetUid !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "Invalid Target User ID.");
    }
    if (action !== "grant" && action !== "revoke") {
        throw new functions.https.HttpsError("invalid-argument", 'Action must be "grant" or "revoke".');
    }
    // 6. SAFETY: Prevent self-demotion from admin
    if (targetUid === context.auth.uid && role === "admin" && action === "revoke") {
        throw new functions.https.HttpsError("failed-precondition", "You cannot remove your own admin privileges.");
    }
    try {
        // 7. LOGIC: Fetch current claims
        const userRecord = await admin.auth().getUser(targetUid);
        const currentClaims = userRecord.customClaims || {};
        const currentRoles = currentClaims.roles || [];
        let newRoles = [...currentRoles];
        if (action === "grant") {
            // Add role if not present
            if (!newRoles.includes(role)) {
                newRoles.push(role);
            }
        }
        else {
            // Remove role
            newRoles = newRoles.filter((r) => r !== role);
        }
        // 6. EXECUTION: Write back to Auth System
        await admin.auth().setCustomUserClaims(targetUid, Object.assign(Object.assign({}, currentClaims), { roles: newRoles }));
        // 7. SYNC: Update Firestore for UI speed
        // This allows the frontend to show "Admin" badges without decoding the token
        // Use set with merge to create doc if it doesn't exist
        await admin.firestore().collection("users").doc(targetUid).set({
            roles: newRoles,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
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
    }
    catch (error) {
        console.error("Role Management Error:", error);
        const firebaseError = error;
        if (firebaseError.code === "auth/user-not-found") {
            throw new functions.https.HttpsError("not-found", "Target user not found.");
        }
        throw new functions.https.HttpsError("internal", "Failed to update user roles.");
    }
});
/**
 * getUserRoles
 *
 * Get the roles for a specific user (admin only)
 * Returns masked email for privacy protection
 */
exports.getUserRoles = functions.https.onCall(async (data, context) => {
    var _a;
    // Authentication
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");
    }
    // App Check & Rate limiting
    verifyAppCheck(context);
    checkRateLimit(context.auth.uid);
    // Authorization
    const callerRoles = context.auth.token.roles || [];
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
        const roles = ((_a = userRecord.customClaims) === null || _a === void 0 ? void 0 : _a.roles) || [];
        return {
            uid: targetUid,
            email: maskEmail(userRecord.email), // Privacy: mask email
            roles,
        };
    }
    catch (error) {
        throw new functions.https.HttpsError("not-found", "User not found.");
    }
});
// ============================================================================
// Profile Creation (Deprecated - handled by REST API)
// ============================================================================
/**
 * createProfile
 *
 * @deprecated Profile creation is now handled by the REST API.
 * This callable function exists only to provide a helpful error message.
 */
exports.createProfile = functions.https.onCall(async (_data, _context) => {
    throw new functions.https.HttpsError("failed-precondition", "Profile creation is handled by the REST API. Use POST /api/profile/create.");
});
// ============================================================================
// Video Validation (Storage Trigger)
// ============================================================================
exports.validateChallengeVideo = functions.storage.object().onFinalize(async (object) => {
    const filePath = object.name;
    if (!filePath || !filePath.startsWith("challenges/")) {
        return;
    }
    if (object.contentType && !object.contentType.startsWith("video/")) {
        return;
    }
    const bucket = admin.storage().bucket(object.bucket);
    const file = bucket.file(filePath);
    const tempFilePath = path.join(os.tmpdir(), `${path.basename(filePath)}_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    try {
        await file.download({ destination: tempFilePath });
        const duration = await new Promise((resolve, reject) => {
            fluent_ffmpeg_1.default.ffprobe(tempFilePath, (err, metadata) => {
                var _a, _b;
                if (err) {
                    reject(err);
                    return;
                }
                resolve((_b = (_a = metadata === null || metadata === void 0 ? void 0 : metadata.format) === null || _a === void 0 ? void 0 : _a.duration) !== null && _b !== void 0 ? _b : 0);
            });
        });
        if (duration < 14.5 || duration > 15.5) {
            await file.delete();
            console.warn(`[validateChallengeVideo] Deleted invalid clip ${filePath} (duration ${duration}s)`);
        }
    }
    catch (error) {
        console.error("[validateChallengeVideo] Failed to validate clip:", filePath, error);
    }
    finally {
        try {
            fs.unlinkSync(tempFilePath);
        }
        catch (_a) {
            // Ignore temp cleanup errors
        }
    }
});
/**
 * Submit a trick (set or match) with transaction to prevent race conditions.
 * Uses idempotency key to prevent duplicate submissions from flaky connections.
 * Sets voteDeadline when transitioning to judging phase for timeout handling.
 */
exports.submitTrick = functions.https.onCall(async (data, context) => {
    var _a;
    if (!((_a = context.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
        throw new functions.https.HttpsError("unauthenticated", "Not logged in");
    }
    const { gameId, clipUrl, trickName, isSetTrick, idempotencyKey } = data;
    if (!gameId || !clipUrl || !idempotencyKey) {
        throw new functions.https.HttpsError("invalid-argument", "Missing gameId, clipUrl, or idempotencyKey");
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
        const game = gameSnap.data();
        // Check idempotency - has this request already been processed?
        const processedKeys = game.processedIdempotencyKeys || [];
        if (processedKeys.includes(idempotencyKey)) {
            // Find the move that was created with this key
            const existingMove = (game.moves || []).find((m) => m.idempotencyKey === idempotencyKey);
            return {
                success: true,
                moveId: (existingMove === null || existingMove === void 0 ? void 0 : existingMove.id) || "unknown",
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
            throw new functions.https.HttpsError("failed-precondition", `Invalid phase. Expected ${expectedPhase}, got ${game.turnPhase}`);
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
        const updateData = {
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
            const voteDeadline = admin.firestore.Timestamp.fromDate(new Date(Date.now() + VOTE_TIMEOUT_MS));
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
});
/**
 * Submit a vote for whether the defender landed the trick.
 * Uses transaction to prevent race conditions when both players vote simultaneously.
 * Both attacker and defender must vote. If they disagree, defender gets
 * benefit of the doubt (result = "landed").
 */
exports.judgeTrick = functions.https.onCall(async (data, context) => {
    var _a;
    if (!((_a = context.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
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
        const game = gameSnap.data();
        // Check idempotency
        const processedKeys = game.processedIdempotencyKeys || [];
        if (idempotencyKey && processedKeys.includes(idempotencyKey)) {
            // Return the current state - vote was already recorded
            const move = (game.moves || []).find((m) => m.id === moveId);
            return {
                success: true,
                vote,
                finalResult: (move === null || move === void 0 ? void 0 : move.result) === "pending" ? null : move === null || move === void 0 ? void 0 : move.result,
                waitingForOtherVote: (move === null || move === void 0 ? void 0 : move.result) === "pending",
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
        const moveIndex = moves.findIndex((m) => m.id === moveId);
        if (moveIndex === -1) {
            throw new functions.https.HttpsError("not-found", "Move not found");
        }
        const move = Object.assign({}, moves[moveIndex]);
        // Initialize or get existing votes
        const existingVotes = move.judgmentVotes || {
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
        const newVotes = {
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
        let finalResult;
        if (newVotes.attackerVote === newVotes.defenderVote) {
            finalResult = newVotes.attackerVote;
        }
        else {
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
        let winnerId = null;
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
        const updateData = Object.assign({ moves, turnPhase: nextTurnPhase, currentTurn: nextAttacker, currentAttacker: nextAttacker, roundNumber: nextRound, currentSetMove: null, 
            // Clear vote deadline when judging completes
            voteDeadline: null, voteReminderSent: null, updatedAt: admin.firestore.FieldValue.serverTimestamp(), processedIdempotencyKeys: idempotencyKey
                ? [...processedKeys.slice(-49), idempotencyKey]
                : processedKeys }, (isPlayer1Defender ? { player1Letters: newLetters } : { player2Letters: newLetters }));
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
exports.processVoteTimeouts = (0, scheduler_1.onSchedule)("every 15 seconds", async () => {
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
        const voteDeadline = game.voteDeadline;
        if (!voteDeadline)
            continue;
        const deadlineMs = voteDeadline.toMillis();
        const nowMs = now.toMillis();
        const timeRemainingMs = deadlineMs - nowMs;
        // Check if we need to send reminder (30 seconds before deadline)
        if (!game.voteReminderSent &&
            timeRemainingMs <= VOTE_REMINDER_BEFORE_MS &&
            timeRemainingMs > 0) {
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
async function sendVoteReminderNotifications(gameId, game) {
    const db = admin.firestore();
    // Find the pending match move
    const moves = game.moves || [];
    const pendingMove = moves.find((m) => m.type === "match" && m.result === "pending");
    if (!pendingMove)
        return;
    const votes = pendingMove.judgmentVotes || {
        attackerVote: null,
        defenderVote: null,
    };
    const playersToNotify = [];
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
        }
        catch (error) {
            console.error(`[VoteReminder] Failed to send notification to ${playerId}:`, error);
        }
    }
}
/**
 * Auto-resolve a vote timeout. Defender gets benefit of the doubt (landed).
 * Handles edge case where both players fail to vote.
 */
async function autoResolveVoteTimeout(gameId, game) {
    const db = admin.firestore();
    const gameRef = db.doc(`game_sessions/${gameId}`);
    await db.runTransaction(async (transaction) => {
        // Re-read the game state to ensure we have latest data
        const freshSnap = await transaction.get(gameRef);
        if (!freshSnap.exists)
            return;
        const freshGame = freshSnap.data();
        // Double-check we're still in judging phase with expired deadline
        if (freshGame.turnPhase !== "judging")
            return;
        const voteDeadline = freshGame.voteDeadline;
        if (!voteDeadline || voteDeadline.toMillis() > Date.now())
            return;
        // Find the pending match move
        const moves = [...(freshGame.moves || [])];
        const moveIndex = moves.findIndex((m) => m.type === "match" && m.result === "pending");
        if (moveIndex === -1)
            return;
        const move = Object.assign({}, moves[moveIndex]);
        // Auto-resolve: defender gets benefit of doubt (landed)
        const finalResult = "landed";
        move.result = finalResult;
        move.judgmentVotes = Object.assign(Object.assign({}, (move.judgmentVotes || {})), { timedOut: true, autoResolved: finalResult });
        moves[moveIndex] = move;
        // Determine next state (same logic as judgeTrick)
        const defenderId = freshGame.currentAttacker === freshGame.player1Id
            ? freshGame.player2Id
            : freshGame.player1Id;
        // Since result is "landed", defender becomes attacker (roles switch)
        const nextAttacker = defenderId;
        const nextRound = freshGame.roundNumber; // Same round when landed
        const updateData = {
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
async function sendTimeoutNotifications(gameId, game) {
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
        }
        catch (error) {
            console.error(`[VoteTimeout] Failed to notify ${playerId}:`, error);
        }
    }
}
//# sourceMappingURL=index.js.map