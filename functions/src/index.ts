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

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

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
 * Set to hard enforcement in production by uncommenting the throw
 */
function verifyAppCheck(context: functions.https.CallableContext): void {
  if (!context.app) {
    console.warn("[Security] Request without App Check token from:", context.auth?.uid);
    // Uncomment for hard enforcement:
    // throw new functions.https.HttpsError('failed-precondition', 'App Check verification failed.');
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
