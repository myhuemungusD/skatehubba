/**
 * Player Connection Operations (Disconnect/Reconnect)
 */

import { getDb } from "../../db";
import { gameSessions } from "@shared/schema";
import { eq } from "drizzle-orm";
import logger from "../../logger";
import { MAX_PROCESSED_EVENTS, TURN_TIMEOUT_MS } from "./constants";
import { rowToGameState } from "./helpers";
import type { TransitionResult } from "./types";

/**
 * Handle player disconnect - pause game and start reconnection timer
 */
export async function handleDisconnect(input: {
  eventId: string;
  gameId: string;
  odv: string;
}): Promise<TransitionResult> {
  const { eventId, gameId, odv } = input;

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

      if (state.status !== "active" && state.status !== "paused") {
        return { success: true, game: state } as TransitionResult;
      }

      const playerIndex = state.players.findIndex((p) => p.odv === odv);
      if (playerIndex === -1) {
        return { success: false, error: "Player not in game" } as TransitionResult;
      }

      const now = new Date();
      const nowISO = now.toISOString();
      const updatedPlayers = state.players.map((p) =>
        p.odv === odv ? { ...p, connected: false, disconnectedAt: nowISO } : p
      );

      const [updated] = await tx
        .update(gameSessions)
        .set({
          players: updatedPlayers,
          status: state.status === "active" ? "paused" : state.status,
          pausedAt: state.status === "active" ? now : game.pausedAt,
          updatedAt: now,
          processedEventIds: [...state.processedEventIds, eventId].slice(-MAX_PROCESSED_EVENTS),
        })
        .where(eq(gameSessions.id, gameId))
        .returning();

      return { success: true, game: rowToGameState(updated) } as TransitionResult;
    });

    if (result.success && !result.alreadyProcessed) {
      logger.info("[GameState] Player disconnected", { gameId, odv });
    }

    return result;
  } catch (error) {
    logger.error("[GameState] Failed to handle disconnect", { error, gameId, odv });
    return { success: false, error: "Failed to handle disconnect" };
  }
}

/**
 * Handle player reconnect - resume game if all players connected
 */
export async function handleReconnect(input: {
  eventId: string;
  gameId: string;
  odv: string;
}): Promise<TransitionResult> {
  const { eventId, gameId, odv } = input;

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

      const playerIndex = state.players.findIndex((p) => p.odv === odv);
      if (playerIndex === -1) {
        return { success: false, error: "Player not in game" } as TransitionResult;
      }

      const updatedPlayers = state.players.map((p) =>
        p.odv === odv ? { ...p, connected: true, disconnectedAt: undefined } : p
      );

      const allConnected = updatedPlayers.every((p) => p.connected);
      const now = new Date();

      const [updated] = await tx
        .update(gameSessions)
        .set({
          players: updatedPlayers,
          status: allConnected && state.status === "paused" ? "active" : state.status,
          pausedAt: allConnected ? null : game.pausedAt,
          updatedAt: now,
          turnDeadlineAt:
            allConnected && state.status === "paused"
              ? new Date(Date.now() + TURN_TIMEOUT_MS)
              : game.turnDeadlineAt,
          processedEventIds: [...state.processedEventIds, eventId].slice(-MAX_PROCESSED_EVENTS),
        })
        .where(eq(gameSessions.id, gameId))
        .returning();

      return { success: true, game: rowToGameState(updated) } as TransitionResult;
    });

    if (result.success && !result.alreadyProcessed) {
      logger.info("[GameState] Player reconnected", { gameId, odv });
    }

    return result;
  } catch (error) {
    logger.error("[GameState] Failed to handle reconnect", { error, gameId, odv });
    return { success: false, error: "Failed to handle reconnect" };
  }
}
