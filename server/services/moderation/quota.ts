/**
 * Moderation Store — Quota Enforcement
 *
 * Atomically increments daily quota counters with SELECT FOR UPDATE locking
 * to prevent race conditions where concurrent requests could both exceed the limit.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { moderationQuotas } from "@shared/schema";
import { type ModerationAction, type TrustLevel, TRUST_QUOTAS } from "../trustSafety";
import { QuotaExceededError } from "./types";

const getDateKey = (date = new Date()): string => date.toISOString().slice(0, 10);

/**
 * Consume one quota unit for a moderation action
 *
 * Atomically increments the user's daily quota counter for the specified action.
 * Uses SELECT FOR UPDATE row locking to prevent race conditions where concurrent
 * requests could both read the same count and exceed the quota.
 *
 * @param userId - User ID consuming the quota
 * @param action - Moderation action being performed ('report', 'vote', 'post', etc.)
 * @param trustLevel - User's current trust level (0-3)
 * @returns Current count and limit for this action
 * @throws {QuotaExceededError} If user has exceeded their daily quota
 */
export const consumeQuota = async (
  userId: string,
  action: ModerationAction,
  trustLevel: TrustLevel
): Promise<{ count: number; limit: number }> => {
  const limit = TRUST_QUOTAS[trustLevel][action];
  const dateKey = getDateKey();
  const docId = `${userId}_${action}_${dateKey}`;
  const db = getDb();

  // Use a transaction with SELECT FOR UPDATE to prevent race conditions
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(moderationQuotas)
      .where(eq(moderationQuotas.id, docId))
      .for("update");

    const count = existing ? existing.count : 0;

    if (count >= limit) {
      throw new QuotaExceededError();
    }

    const nextCount = count + 1;
    const now = new Date();

    if (existing) {
      await tx
        .update(moderationQuotas)
        .set({ count: nextCount, updatedAt: now })
        .where(eq(moderationQuotas.id, docId));
    } else {
      await tx.insert(moderationQuotas).values({
        id: docId,
        userId,
        action,
        dateKey,
        count: nextCount,
        limit,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { count: nextCount, limit };
  });

  return result;
};
