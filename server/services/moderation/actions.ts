/**
 * Moderation Store — Action Logging & Application
 */

import { getDb } from "../../db";
import { moderationProfiles, modActions } from "@shared/schema";
import type { ModActionInput } from "./types";

/**
 * Log a moderation action to the audit trail
 *
 * Creates a permanent record of a moderation action for compliance and auditing.
 *
 * @param input - Action details
 * @returns Logged action record
 */
export const logModAction = async (input: ModActionInput) => {
  const db = getDb();
  const [action] = await db
    .insert(modActions)
    .values({
      adminId: input.adminId,
      targetUserId: input.targetUserId,
      actionType: input.actionType,
      reasonCode: input.reasonCode,
      notes: input.notes,
      reversible: input.reversible,
      expiresAt: input.expiresAt,
      relatedReportId: input.relatedReportId,
    })
    .returning();

  return action;
};

/**
 * Apply a moderation action to a user
 *
 * Updates the user's moderation profile based on the action type and logs the action.
 *
 * Action Effects:
 * - `temp_ban`: Sets isBanned=true with expiration date
 * - `perm_ban`: Sets isBanned=true with no expiration
 * - `verify_pro`: Sets proVerificationStatus='verified' and isProVerified=true
 * - `revoke_pro`: Sets proVerificationStatus='rejected' and isProVerified=false
 * - Other actions: Logged but don't directly modify profile
 *
 * @param input - Action details
 * @returns Logged action record with applied updates
 */
export const applyModerationAction = async (input: ModActionInput) => {
  const db = getDb();
  const now = new Date();

  const updates: Record<string, unknown> = {
    updatedAt: now,
  };

  if (input.actionType === "temp_ban") {
    updates.isBanned = true;
    updates.banExpiresAt = input.expiresAt;
  }

  if (input.actionType === "perm_ban") {
    updates.isBanned = true;
    updates.banExpiresAt = null;
  }

  if (input.actionType === "verify_pro") {
    updates.proVerificationStatus = "verified";
    updates.isProVerified = true;
  }

  if (input.actionType === "revoke_pro") {
    updates.proVerificationStatus = "rejected";
    updates.isProVerified = false;
  }

  // Upsert the moderation profile
  await db
    .insert(moderationProfiles)
    .values({
      userId: input.targetUserId,
      ...updates,
      createdAt: now,
    } as typeof moderationProfiles.$inferInsert)
    .onConflictDoUpdate({
      target: moderationProfiles.userId,
      set: updates as Partial<typeof moderationProfiles.$inferInsert>,
    });

  const log = await logModAction(input);
  return { ...log, updates };
};
