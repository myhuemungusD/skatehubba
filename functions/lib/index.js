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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProfile = exports.getUserRoles = exports.manageUserRole = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
// Initialize Firebase Admin if not already done
if (!admin.apps.length) {
    admin.initializeApp();
}
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
// Profile Creation
// ============================================================================
function generateRandomUsername() {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let result = "skater";
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
function validateUsername(username) {
    return /^[a-z0-9]{3,20}$/.test(username);
}
/**
 * createProfile
 *
 * Callable function for profile creation.
 * Creates a Firestore profile document for authenticated users.
 *
 * Payload: {
 *   username?: string,
 *   stance?: 'regular' | 'goofy',
 *   experienceLevel?: 'beginner' | 'intermediate' | 'advanced' | 'pro',
 *   favoriteTricks?: string[],
 *   bio?: string,
 *   crewName?: string,
 *   avatarBase64?: string,
 *   skip?: boolean
 * }
 */
exports.createProfile = functions.https.onCall(async (data, context) => {
    var _a;
    // Authentication required
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be logged in to create a profile.");
    }
    // Rate limiting
    checkRateLimit(context.auth.uid);
    const uid = context.auth.uid;
    const firestore = admin.firestore();
    const profileRef = firestore.collection("profiles").doc(uid);
    // Check if profile already exists
    const existingProfile = await profileRef.get();
    if (existingProfile.exists) {
        return { profile: existingProfile.data(), existed: true };
    }
    const shouldSkip = data.skip === true;
    let username = ((_a = data.username) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || "";
    // Generate username if skipping or no username provided
    if (shouldSkip || !username) {
        for (let attempt = 0; attempt < 10; attempt++) {
            const candidate = generateRandomUsername();
            const usernameQuery = await firestore
                .collection("profiles")
                .where("username", "==", candidate)
                .limit(1)
                .get();
            if (usernameQuery.empty) {
                username = candidate;
                break;
            }
        }
        if (!username) {
            throw new functions.https.HttpsError("internal", "Could not generate unique username.");
        }
    }
    // Validate username
    if (!validateUsername(username)) {
        throw new functions.https.HttpsError("invalid-argument", "Invalid username format.");
    }
    // Check if username is taken
    const usernameQuery = await firestore
        .collection("profiles")
        .where("username", "==", username)
        .limit(1)
        .get();
    if (!usernameQuery.empty) {
        throw new functions.https.HttpsError("already-exists", "Username is already taken.");
    }
    // Handle avatar upload if provided
    let avatarUrl = null;
    if (data.avatarBase64 && !shouldSkip) {
        try {
            const match = data.avatarBase64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
            if (match) {
                const contentType = match[1];
                const base64Data = match[2];
                const buffer = Buffer.from(base64Data, "base64");
                // Validate size (5MB max)
                if (buffer.byteLength > 5 * 1024 * 1024) {
                    throw new functions.https.HttpsError("invalid-argument", "Avatar too large (max 5MB).");
                }
                // Upload to Firebase Storage
                const bucket = admin.storage().bucket();
                const filePath = `profiles/${uid}/avatar`;
                const file = bucket.file(filePath);
                await file.save(buffer, {
                    resumable: false,
                    metadata: {
                        contentType,
                        cacheControl: "public, max-age=31536000",
                    },
                });
                const encodedPath = encodeURIComponent(filePath);
                avatarUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media`;
            }
        }
        catch (error) {
            console.error("[createProfile] Avatar upload failed:", error);
            // Don't fail profile creation if avatar upload fails
        }
    }
    // Create profile document
    const profileData = {
        uid,
        username,
        stance: data.stance || null,
        experienceLevel: data.experienceLevel || null,
        favoriteTricks: data.favoriteTricks || [],
        bio: data.bio || null,
        spotsVisited: 0,
        crewName: data.crewName || null,
        credibilityScore: 0,
        avatarUrl,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await profileRef.set(profileData);
    console.log(`[createProfile] Created profile for user ${uid} with username ${username}`);
    return {
        profile: Object.assign(Object.assign({}, profileData), { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
        existed: false,
    };
});
//# sourceMappingURL=index.js.map