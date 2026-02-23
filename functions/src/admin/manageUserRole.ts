/**
 * manageUserRole Cloud Function
 *
 * Protected Callable Function for role management.
 * Only Admins can call this function to promote/demote users.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { checkRateLimit } from "../shared/rateLimiter";
import { verifyAppCheck } from "../shared/security";

const VALID_ROLES = ["admin", "moderator", "verified_pro"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

interface ManageRolePayload {
  targetUid: string;
  role: ValidRole;
  action: "grant" | "revoke";
}

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
    await checkRateLimit(context.auth.uid);

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

      functions.logger.log(
        `Role ${action}: ${role} for ${userRecord.email} by ${context.auth.token.email}`
      );

      return {
        success: true,
        message: `User ${userRecord.email} is now: [${newRoles.join(", ") || "no roles"}]`,
        roles: newRoles,
      };
    } catch (error: unknown) {
      functions.logger.error("Role Management Error:", error);

      const firebaseError = error as { code?: string };
      if (firebaseError.code === "auth/user-not-found") {
        throw new functions.https.HttpsError("not-found", "Target user not found.");
      }

      throw new functions.https.HttpsError("internal", "Failed to update user roles.");
    }
  }
);
