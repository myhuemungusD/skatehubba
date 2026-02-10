/**
 * Game Forfeit Operations
 */

import { getDb } from "../../db";
import { gameSessions } from "@shared/schema";
import { eq } from "drizzle-orm";
import logger from "../../logger";
import { logServerEvent } from "../analyticsService";
import { MAX_PROCESSED_EVENTS } from "./constants";
import { isEliminated, rowToGameState } from "./helpers";
import type { TransitionResult } from "./types";

/**
 * Forfeit a game (voluntary or due to timeout)
 */
export async function forfeitGame(input: {
  eventId: string;
  gameId: string;
  odv: string;
  reason: "voluntary" | "disconnect_timeout" | "turn_timeout";
}): Promise<TransitionResult> {
  const { eventId, gameId, odv, reason } = input;

  try {
    const db = getDb();

    const result = await db.transaction(async (tx) => {
      const [game] = await tx
        .select()
        .from(gameSessions)
        .where(eq(gameSessions.id, gameId))
        .for("update");

      if (!game) {
        return { success: false, error: "Game not found" } as TransitionResult;
      }

      const state = rowToGameState(game);

      if (state.processedEventIds.includes(eventId)) {
        return { success: true, game: state, alreadyProcessed: true } as TransitionResult;
      }

      if (state.status === "completed") {
        return { success: false, error: "Game already completed" } as TransitionResult;
      }

      const playerIndex = state.players.findIndex((p) => p.odv === odv);
      if (playerIndex === -1) {
        return { success: false, error: "Player not in game" } as TransitionResult;
      }

      const activePlayers = state.players.filter((p) => p.odv !== odv && !isEliminated(p.letters));
      const winnerId = activePlayers[0]?.odv;

      const now = new Date();
      const [updated] = await tx
        .update(gameSessions)
        .set({
          status: "completed",
          winnerId: winnerId ?? null,
          updatedAt: now,
          turnDeadlineAt: null,
          processedEventIds: [...state.processedEventIds, eventId].slice(-MAX_PROCESSED_EVENTS),
        })
        .where(eq(gameSessions.id, gameId))
        .returning();

      return { success: true, game: rowToGameState(updated) } as TransitionResult;
    });

    if (result.success && !result.alreadyProcessed) {
      await logServerEvent(odv, "game_forfeited", {
        game_id: gameId,
        reason,
        winner_id: result.game?.winnerId,
      });
      logger.info("[GameState] Game forfeited", { gameId, odv, reason });
    }

    return result;
  } catch (error) {
    logger.error("[GameState] Failed to forfeit game", { error, gameId, odv });
    return { success: false, error: "Failed to forfeit game" };
  }
}
