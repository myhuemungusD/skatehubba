/**
 * Game State Helper Functions
 */

import crypto from "node:crypto";
import { gameSessions } from "@shared/schema";
import { SKATE } from "./constants";
import type { GamePlayer, GameState } from "./types";

export function getNextLetter(currentLetters: string): string {
  const nextIndex = currentLetters.length;
  return nextIndex < SKATE.length ? currentLetters + SKATE[nextIndex] : currentLetters;
}

export function isEliminated(letters: string): boolean {
  return letters === SKATE;
}

/**
 * Generate a deterministic event ID for idempotency.
 */
export function generateEventId(
  type: string,
  odv: string,
  gameId: string,
  sequenceKey?: string
): string {
  if (sequenceKey) {
    return `${type}-${gameId}-${odv}-${sequenceKey}`;
  }
  // For backward compatibility, generate a unique ID (caller should cache and reuse on retries)
  return `${type}-${gameId}-${odv}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

/** Convert a DB row to GameState */
export function rowToGameState(row: typeof gameSessions.$inferSelect): GameState {
  return {
    id: row.id,
    spotId: row.spotId,
    creatorId: row.creatorId,
    players: row.players as GamePlayer[],
    maxPlayers: row.maxPlayers,
    currentTurnIndex: row.currentTurnIndex,
    currentAction: row.currentAction as "set" | "attempt",
    currentTrick: row.currentTrick ?? undefined,
    setterId: row.setterId ?? undefined,
    status: row.status as GameState["status"],
    winnerId: row.winnerId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    turnDeadlineAt: row.turnDeadlineAt?.toISOString(),
    pausedAt: row.pausedAt?.toISOString(),
    processedEventIds: row.processedEventIds as string[],
  };
}
