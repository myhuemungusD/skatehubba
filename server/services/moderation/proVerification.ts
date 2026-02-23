/**
 * Moderation Store — Pro Verification Workflow
 *
 * Updates a user's professional skater verification status with evidence and notes.
 */

import { getDb } from "../../db";
import { moderationProfiles } from "@shared/schema";
import { logModAction } from "./actions";
import type { ProVerificationInput } from "./types";

/**
 * Set pro verification status for a user
 *
 * Updates a user's professional skater verification status with evidence and notes.
 * Automatically logs the corresponding moderation action (verify_pro or revoke_pro).
 *
 * @param input - Verification details including status, evidence, and notes
 * @returns Logged moderation action
 */
export const setProVerificationStatus = async (input: ProVerificationInput) => {
  const db = getDb();
  const now = new Date();

  await db
    .insert(moderationProfiles)
    .values({
      userId: input.userId,
      proVerificationStatus: input.status,
      isProVerified: input.status === "verified",
      proVerificationEvidence: input.evidence,
      proVerificationNotes: input.notes,
      updatedAt: now,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: moderationProfiles.userId,
      set: {
        proVerificationStatus: input.status,
        isProVerified: input.status === "verified",
        proVerificationEvidence: input.evidence,
        proVerificationNotes: input.notes,
        updatedAt: now,
      },
    });

  return logModAction({
    adminId: input.adminId,
    targetUserId: input.userId,
    actionType: input.status === "verified" ? "verify_pro" : "revoke_pro",
    reasonCode: "pro_verification",
    notes: input.notes,
    reversible: true,
    expiresAt: null,
    relatedReportId: null,
  });
};
