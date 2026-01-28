"use strict";
/**
 * Firebase Cloud Functions
 *
 * Secure serverless functions for SkateHubba.
 * Handles role management, profile creation and other privileged operations.
 *
 * Security Features:
 * - App Check enforcement for abuse prevention
 * - Rate limiting via in-memory tracking
 * - RBAC with custom claims
 * - Comprehensive audit logging
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
exports.expireHolds = exports.stripeWebhook = exports.holdAndCreatePaymentIntent = exports.expireBounties = exports.payOutClaim = exports.castVote = exports.submitClaim = exports.createBounty = exports.validateChallengeVideo = exports.createProfile = exports.getUserRoles = exports.manageUserRole = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const ffprobe_1 = __importDefault(require("@ffprobe-installer/ffprobe"));
const createBounty_1 = require("./bounties/createBounty");
Object.defineProperty(exports, "createBounty", { enumerable: true, get: function () { return createBounty_1.createBounty; } });
const submitClaim_1 = require("./bounties/submitClaim");
Object.defineProperty(exports, "submitClaim", { enumerable: true, get: function () { return submitClaim_1.submitClaim; } });
const castVote_1 = require("./bounties/castVote");
Object.defineProperty(exports, "castVote", { enumerable: true, get: function () { return castVote_1.castVote; } });
const payOutClaim_1 = require("./bounties/payOutClaim");
Object.defineProperty(exports, "payOutClaim", { enumerable: true, get: function () { return payOutClaim_1.payOutClaim; } });
const expireBounties_1 = require("./bounties/expireBounties");
Object.defineProperty(exports, "expireBounties", { enumerable: true, get: function () { return expireBounties_1.expireBounties; } });
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
// Commerce exports
var holdAndCreateIntent_1 = require("./commerce/holdAndCreateIntent");
Object.defineProperty(exports, "holdAndCreatePaymentIntent", { enumerable: true, get: function () { return holdAndCreateIntent_1.holdAndCreatePaymentIntent; } });
var stripeWebhook_1 = require("./commerce/stripeWebhook");
Object.defineProperty(exports, "stripeWebhook", { enumerable: true, get: function () { return stripeWebhook_1.stripeWebhook; } });
var expireHolds_1 = require("./commerce/expireHolds");
Object.defineProperty(exports, "expireHolds", { enumerable: true, get: function () { return expireHolds_1.expireHolds; } });
//# sourceMappingURL=index.js.map