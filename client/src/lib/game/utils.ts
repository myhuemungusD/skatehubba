/**
 * GameService — Helper Utilities
 */

import { LETTERS, MAX_LETTERS } from "./constants";
import type { GameDocument, GameState, PlayerData } from "./types";

/** Convert letter count to string representation */
export function getLettersString(count: number): string {
  return LETTERS.slice(0, Math.min(count, MAX_LETTERS)).join("");
}

/** Check if game is over based on letters */
export function isGameOver(state: GameState): boolean {
  return (
    state.status === "COMPLETED" ||
    state.p1Letters >= MAX_LETTERS ||
    state.p2Letters >= MAX_LETTERS
  );
}

/** Get opponent data from game */
export function getOpponentData(game: GameDocument, userId: string): PlayerData | null {
  const opponentId = game.players.find((p) => p !== userId);
  return opponentId ? game.playerData[opponentId] : null;
}
