/**
 * Moderation Store — Profile Queries
 */

import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { moderationProfiles } from "@shared/schema";
import {
  type ModerationProfile,
  type ProVerificationStatus,
  type TrustLevel,
} from "../trustSafety";

const defaultProfile: ModerationProfile = {
  trustLevel: 0,
  reputationScore: 0,
  isBanned: false,
  banExpiresAt: null,
  proVerificationStatus: "none",
  isProVerified: false,
};

/**
 * Get a user's moderation profile
 *
 * Returns the moderation profile for a user, including trust level, reputation score,
 * ban status, and pro verification status. If no profile exists, returns default values.
 *
 * @param userId - User ID to fetch profile for
 * @returns Moderation profile with trust and safety information
 */
export const getModerationProfile = async (userId: string): Promise<ModerationProfile> => {
  const db = getDb();
  const [row] = await db
    .select()
    .from(moderationProfiles)
    .where(eq(moderationProfiles.userId, userId))
    .limit(1);

  if (!row) {
    return { ...defaultProfile };
  }

  return {
    trustLevel: (row.trustLevel ?? 0) as TrustLevel,
    reputationScore: typeof row.reputationScore === "number" ? row.reputationScore : 0,
    isBanned: Boolean(row.isBanned ?? false),
    banExpiresAt: row.banExpiresAt ?? null,
    proVerificationStatus: (row.proVerificationStatus ?? "none") as ProVerificationStatus,
    isProVerified: Boolean(row.isProVerified ?? false),
  };
};
