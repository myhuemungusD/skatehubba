/**
 * Game State Queries and Cleanup
 */

import { getDb } from "../../db";
import { gameSessions } from "@shared/schema";
import { eq } from "drizzle-orm";
import logger from "../../logger";
import { rowToGameState } from "./helpers";
import type { GameState } from "./types";

/**
 * Get current game state
 */
export async function getGameState(gameId: string): Promise<GameState | null> {
  try {
    const db = getDb();
    const [row] = await db.select().from(gameSessions).where(eq(gameSessions.id, gameId));
    if (!row) {
      return null;
    }
    return rowToGameState(row);
  } catch (error) {
    logger.error("[GameState] Failed to get game state", { error, gameId });
    return null;
  }
}

/**
 * Delete a game (cleanup)
 */
export async function deleteGame(gameId: string): Promise<boolean> {
  try {
    const db = getDb();
    await db.delete(gameSessions).where(eq(gameSessions.id, gameId));
    logger.info("[GameState] Game deleted", { gameId });
    return true;
  } catch (error) {
    logger.error("[GameState] Failed to delete game", { error, gameId });
    return false;
  }
}
