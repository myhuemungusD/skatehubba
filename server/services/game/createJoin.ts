/**
 * Game Creation and Joining Operations
 */

import { getDb } from "../../db";
import { gameSessions } from "@shared/schema";
import { eq } from "drizzle-orm";
import logger from "../../logger";
import { logServerEvent } from "../analyticsService";
import { MAX_PROCESSED_EVENTS, TURN_TIMEOUT_MS } from "./constants";
import { rowToGameState } from "./helpers";
import type { TransitionResult } from "./types";

/**
 * Create a new game with atomic PostgreSQL write
 */
export async function createGame(input: {
  eventId: string;
  spotId: string;
  creatorId: string;
  maxPlayers?: number;
}): Promise<TransitionResult> {
  const { eventId, spotId, creatorId, maxPlayers = 4 } = input;

  try {
    const db = getDb();
    const now = new Date();

    const [row] = await db
      .insert(gameSessions)
      .values({
        spotId,
        creatorId,
        players: [{ odv: creatorId, letters: "", connected: true }],
        maxPlayers: Math.min(maxPlayers, 8),
        currentTurnIndex: 0,
        currentAction: "set",
        status: "waiting",
        processedEventIds: [eventId],
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const gameState = rowToGameState(row);

    await logServerEvent(creatorId, "game_created", {
      game_id: gameState.id,
      spot_id: spotId,
    });

    logger.info("[GameState] Game created", { gameId: gameState.id, creatorId, spotId });

    return { success: true, game: gameState };
  } catch (error) {
    logger.error("[GameState] Failed to create game", { error, creatorId, spotId });
    return { success: false, error: "Failed to create game" };
  }
}

/**
 * Join an existing game with transactional update and row-level locking
 */
export async function joinGame(input: {
  eventId: string;
  gameId: string;
  odv: string;
}): Promise<TransitionResult> {
  const { eventId, gameId, odv } = input;

  try {
    const db = getDb();

    const result = await db.transaction(async (tx) => {
      // Lock the row for update to prevent concurrent joins
      const [game] = await tx
        .select()
        .from(gameSessions)
        .where(eq(gameSessions.id, gameId))
        .for("update");

      if (!game) {
        return { success: false, error: "Game not found" } as TransitionResult;
      }

      const state = rowToGameState(game);

      // Check idempotency
      if (state.processedEventIds.includes(eventId)) {
        return { success: true, game: state, alreadyProcessed: true } as TransitionResult;
      }

      if (state.status !== "waiting") {
        return { success: false, error: "Game has already started" } as TransitionResult;
      }

      if (state.players.length >= state.maxPlayers) {
        return { success: false, error: "Game is full" } as TransitionResult;
      }

      if (state.players.some((p) => p.odv === odv)) {
        return { success: false, error: "Already in game" } as TransitionResult;
      }

      const updatedPlayers = [...state.players, { odv, letters: "", connected: true }];
      const now = new Date();
      const shouldStartGame = updatedPlayers.length >= 2;
      const processedEventIds = [...state.processedEventIds, eventId].slice(-MAX_PROCESSED_EVENTS);

      const [updated] = await tx
        .update(gameSessions)
        .set({
          players: updatedPlayers,
          updatedAt: now,
          processedEventIds,
          ...(shouldStartGame && {
            status: "active",
            turnDeadlineAt: new Date(Date.now() + TURN_TIMEOUT_MS),
          }),
        })
        .where(eq(gameSessions.id, gameId))
        .returning();

      return { success: true, game: rowToGameState(updated) } as TransitionResult;
    });

    if (result.success && !result.alreadyProcessed) {
      await logServerEvent(odv, "game_joined", { game_id: gameId });
      logger.info("[GameState] Player joined game", { gameId, odv });
    }

    return result;
  } catch (error) {
    logger.error("[GameState] Failed to join game", { error, gameId, odv });
    return { success: false, error: "Failed to join game" };
  }
}
