/**
 * Filmer Request Service — Trust & Eligibility Validation
 */

import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { customUsers, userProfiles } from "@shared/schema";
import { FilmerRequestError } from "./types";
import { TRUST_LEVEL_REQUIRED } from "./constants";

export const ensureTrust = (trustLevel: number): void => {
  if (trustLevel < TRUST_LEVEL_REQUIRED) {
    throw new FilmerRequestError("INSUFFICIENT_TRUST", "Insufficient trust level", 403);
  }
};

export const ensureFilmerEligible = async (filmerUid: string): Promise<void> => {
  const db = getDb();
  const [filmer] = await db
    .select({
      isActive: customUsers.isActive,
    })
    .from(customUsers)
    .where(eq(customUsers.id, filmerUid))
    .limit(1);

  if (!filmer) {
    throw new FilmerRequestError("FILMER_NOT_FOUND", "Filmer not found", 404);
  }

  if (!filmer.isActive) {
    throw new FilmerRequestError("FILMER_INACTIVE", "Filmer is not active", 403);
  }

  const [profile] = await db
    .select({ roles: userProfiles.roles, filmerVerified: userProfiles.filmerVerified })
    .from(userProfiles)
    .where(eq(userProfiles.id, filmerUid))
    .limit(1);

  const isEligible = Boolean(profile?.filmerVerified) || Boolean(profile?.roles?.filmer);

  if (!isEligible) {
    throw new FilmerRequestError("FILMER_NOT_ELIGIBLE", "Filmer is not eligible for requests", 403);
  }
};
