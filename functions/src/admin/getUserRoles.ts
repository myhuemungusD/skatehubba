/**
 * getUserRoles Cloud Function
 *
 * Get the roles for a specific user (admin only).
 * Returns masked email for privacy protection.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { checkRateLimit } from "../shared/rateLimiter";
import { verifyAppCheck, maskEmail } from "../shared/security";

export const getUserRoles = functions.https.onCall(
  async (data: { targetUid: string }, context: functions.https.CallableContext) => {
    // Authentication
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");
    }

    // App Check & Rate limiting
    verifyAppCheck(context);
    await checkRateLimit(context.auth.uid);

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
