/**
 * Filmer Request Service — Quota Enforcement
 *
 * Uses SELECT FOR UPDATE to prevent TOCTOU race conditions on quota checks.
 */

import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { filmerDailyCounters } from "@shared/schema";
import { FilmerRequestError } from "./types";
import { COUNTER_RETENTION_DAYS, formatDateKey } from "./constants";

type DatabaseClient = ReturnType<typeof getDb>;
export type QuotaTransaction = Pick<DatabaseClient, "select" | "insert" | "update">;

export const cleanupExpiredCounters = async (): Promise<void> => {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - COUNTER_RETENTION_DAYS);
  const cutoffDay = formatDateKey(cutoff);
  await db.delete(filmerDailyCounters).where(lt(filmerDailyCounters.day, cutoffDay));
};

export const ensureQuota = async (
  tx: QuotaTransaction,
  counterKey: string,
  day: string,
  limit: number
): Promise<void> => {
  // Use SELECT FOR UPDATE to prevent TOCTOU race conditions on quota check.
  // The row lock ensures two concurrent requests cannot both read the same count
  // and both pass the quota check.
  const [current] = await tx
    .select()
    .from(filmerDailyCounters)
    .where(and(eq(filmerDailyCounters.counterKey, counterKey), eq(filmerDailyCounters.day, day)))
    .for("update")
    .limit(1);

  if (current && current.count >= limit) {
    throw new FilmerRequestError("QUOTA_EXCEEDED", "Daily quota exceeded", 429);
  }

  if (current) {
    // Atomic increment using SQL expression
    await tx
      .update(filmerDailyCounters)
      .set({ count: sql`${filmerDailyCounters.count} + 1`, updatedAt: new Date() })
      .where(
        and(eq(filmerDailyCounters.counterKey, counterKey), eq(filmerDailyCounters.day, day))
      );
    return;
  }

  await tx.insert(filmerDailyCounters).values({
    counterKey,
    day,
    count: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
};
