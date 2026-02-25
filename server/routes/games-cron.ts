/**
 * S.K.A.T.E. Game Background/Cron Functions
 * Handles auto-forfeit and deadline warnings
 */

import { getDb, DatabaseUnavailableError } from "../db";
import { games } from "@shared/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import logger from "../logger";
import { sendGameNotificationToUser } from "../services/gameNotificationService";
import {
  deadlineWarningsSent,
  DEADLINE_WARNING_COOLDOWN_MS,
  TURN_DEADLINE_MS,
  GAME_HARD_CAP_MS,
} from "./games-shared";

// ============================================================================
// Auto-forfeit expired games (called by cron)
// ============================================================================

export async function forfeitExpiredGames(): Promise<{ forfeited: number }> {
  try {
    const db = getDb();
    const now = new Date();

    const expiredGames = await db
      .select()
      .from(games)
      .where(and(eq(games.status, "active"), lt(games.deadlineAt!, now)));

    let forfeitedCount = 0;

    for (const game of expiredGames) {
      try {
        const result = await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT id FROM games WHERE id = ${game.id} FOR UPDATE`);
          const [fresh] = await tx.select().from(games).where(eq(games.id, game.id)).limit(1);

          // Re-check inside lock — game may have been resolved concurrently
          if (!fresh || fresh.status !== "active") return null;
          if (!fresh.deadlineAt || new Date(fresh.deadlineAt) >= now) return null;

          const loserId = fresh.currentTurn;
          const winnerId = loserId === fresh.player1Id ? fresh.player2Id : fresh.player1Id;

          await tx
            .update(games)
            .set({ status: "forfeited", winnerId, completedAt: now, updatedAt: now })
            .where(eq(games.id, game.id));

          return { loserId, winnerId, player1Id: fresh.player1Id, player2Id: fresh.player2Id };
        });

        if (!result) continue;

        for (const playerId of [result.player1Id, result.player2Id]) {
          if (!playerId) continue;
          await sendGameNotificationToUser(playerId, "game_forfeited_timeout", {
            gameId: game.id,
            loserId: result.loserId || undefined,
            winnerId: result.winnerId || undefined,
          });
        }

        logger.info("[Games] Game forfeited due to timeout", {
          gameId: game.id,
          loserId: result.loserId,
          winnerId: result.winnerId,
        });

        forfeitedCount++;
      } catch (err) {
        logger.error("[Games] Failed to forfeit expired game", { error: err, gameId: game.id });
      }
    }

    return { forfeited: forfeitedCount };
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) throw error;
    logger.error("[Games] Failed to forfeit expired games", { error });
    return { forfeited: 0 };
  }
}

// ============================================================================
// Deadline warning check (called by cron — notifies players with ≤1 hour left)
// ============================================================================

export async function notifyDeadlineWarnings(): Promise<{
  notified: number;
}> {
  try {
    const db = getDb();
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    // Find active games where deadline is within 1 hour
    const urgentGames = await db
      .select()
      .from(games)
      .where(and(eq(games.status, "active"), lt(games.deadlineAt!, oneHourFromNow)));

    let notifiedCount = 0;

    for (const game of urgentGames) {
      if (!game.currentTurn || !game.deadlineAt) continue;
      // Only notify if deadline is in the future (not already expired)
      if (new Date(game.deadlineAt) <= now) continue;

      // Dedup: skip if we already warned this game within the cooldown period
      const lastWarning = deadlineWarningsSent.get(game.id);
      if (lastWarning && now.getTime() - lastWarning < DEADLINE_WARNING_COOLDOWN_MS) {
        continue;
      }

      await sendGameNotificationToUser(game.currentTurn, "deadline_warning", {
        gameId: game.id,
        minutesRemaining: Math.round((new Date(game.deadlineAt).getTime() - now.getTime()) / 60000),
      });
      deadlineWarningsSent.set(game.id, now.getTime());
      notifiedCount++;
    }

    // Clean up old entries from the dedup map
    for (const [gameId, timestamp] of deadlineWarningsSent) {
      if (now.getTime() - timestamp > TURN_DEADLINE_MS) {
        deadlineWarningsSent.delete(gameId);
      }
    }

    return { notified: notifiedCount };
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) throw error;
    logger.error("[Games] Failed to send deadline warnings", { error });
    return { notified: 0 };
  }
}

// ============================================================================
// 7-day hard cap — game must complete within 7 days total
// Closest-to-losing takes the loss. Prevents games from dragging on forever.
// ============================================================================

export async function forfeitStalledGames(): Promise<{ forfeited: number }> {
  try {
    const db = getDb();
    const now = new Date();
    const hardCapCutoff = new Date(now.getTime() - GAME_HARD_CAP_MS);

    // Find active games created more than 7 days ago
    const stalledGames = await db
      .select()
      .from(games)
      .where(and(eq(games.status, "active"), lt(games.createdAt!, hardCapCutoff)));

    let forfeitedCount = 0;

    for (const game of stalledGames) {
      if (!game.player1Id || !game.player2Id) continue;

      try {
        const result = await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT id FROM games WHERE id = ${game.id} FOR UPDATE`);
          const [fresh] = await tx.select().from(games).where(eq(games.id, game.id)).limit(1);

          // Re-check inside lock — game may have been resolved concurrently
          if (!fresh || fresh.status !== "active") return null;
          if (!fresh.player1Id || !fresh.player2Id) return null;

          const p1Count = (fresh.player1Letters || "").length;
          const p2Count = (fresh.player2Letters || "").length;

          let loserId: string;
          if (p1Count > p2Count) {
            loserId = fresh.player1Id;
          } else if (p2Count > p1Count) {
            loserId = fresh.player2Id;
          } else {
            loserId = fresh.currentTurn || fresh.player1Id;
          }
          const winnerId = loserId === fresh.player1Id ? fresh.player2Id : fresh.player1Id;

          await tx
            .update(games)
            .set({ status: "forfeited", winnerId, completedAt: now, updatedAt: now })
            .where(eq(games.id, game.id));

          return { loserId, winnerId, player1Id: fresh.player1Id, player2Id: fresh.player2Id };
        });

        if (!result) continue;

        for (const playerId of [result.player1Id, result.player2Id]) {
          if (!playerId) continue;
          await sendGameNotificationToUser(playerId, "game_forfeited_timeout", {
            gameId: game.id,
            loserId: result.loserId || undefined,
            winnerId: result.winnerId || undefined,
          });
        }

        logger.info("[Games] Game forfeited due to 7-day hard cap", {
          gameId: game.id,
          loserId: result.loserId,
          winnerId: result.winnerId,
          p1Letters: game.player1Letters,
          p2Letters: game.player2Letters,
        });

        forfeitedCount++;
      } catch (err) {
        logger.error("[Games] Failed to forfeit stalled game", { error: err, gameId: game.id });
      }
    }

    return { forfeited: forfeitedCount };
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) throw error;
    logger.error("[Games] Failed to forfeit stalled games", { error });
    return { forfeited: 0 };
  }
}
