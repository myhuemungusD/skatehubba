/**
 * Trick Submission and Pass Operations
 */

import { getDb } from "../../db";
import { gameSessions } from "@shared/schema";
import { eq } from "drizzle-orm";
import logger from "../../logger";
import { logServerEvent } from "../analyticsService";
import { MAX_PROCESSED_EVENTS, TURN_TIMEOUT_MS } from "./constants";
import { getNextLetter, isEliminated, rowToGameState } from "./helpers";
import type { TransitionResult } from "./types";

/**
 * Submit a trick with transactional state update and row-level locking
 */
export async function submitTrick(input: {
  eventId: string;
  gameId: string;
  odv: string;
  trickName: string;
  clipUrl?: string;
}): Promise<TransitionResult> {
  const { eventId, gameId, odv, trickName } = input;

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

      if (state.status !== "active") {
        return { success: false, error: "Game is not active" } as TransitionResult;
      }

      const currentPlayer = state.players[state.currentTurnIndex];
      if (currentPlayer?.odv !== odv) {
        return { success: false, error: "Not your turn" } as TransitionResult;
      }

      const now = new Date();
      const processedEventIds = [...state.processedEventIds, eventId].slice(-MAX_PROCESSED_EVENTS);
      let updateData: Partial<typeof gameSessions.$inferInsert>;

      if (state.currentAction === "set") {
        // Find the next non-eliminated player to attempt the trick
        let nextTurnIndex = (state.currentTurnIndex + 1) % state.players.length;
        let skipAttempts = 0;
        while (
          isEliminated(state.players[nextTurnIndex].letters) &&
          skipAttempts < state.players.length
        ) {
          nextTurnIndex = (nextTurnIndex + 1) % state.players.length;
          skipAttempts++;
        }

        updateData = {
          currentAction: "attempt",
          currentTrick: trickName,
          setterId: odv,
          currentTurnIndex: nextTurnIndex,
          updatedAt: now,
          turnDeadlineAt: new Date(Date.now() + TURN_TIMEOUT_MS),
          processedEventIds,
        };
      } else {
        let nextTurnIndex = (state.currentTurnIndex + 1) % state.players.length;

        let attempts = 0;
        while (
          isEliminated(state.players[nextTurnIndex].letters) &&
          attempts < state.players.length
        ) {
          nextTurnIndex = (nextTurnIndex + 1) % state.players.length;
          attempts++;
        }

        const setterIndex = state.players.findIndex((p) => p.odv === state.setterId);
        const isBackToSetter = nextTurnIndex === setterIndex;

        if (isBackToSetter) {
          // Find the next non-eliminated player to be the new setter
          let newSetterIndex = (setterIndex + 1) % state.players.length;
          let skipCount = 0;
          while (
            isEliminated(state.players[newSetterIndex].letters) &&
            skipCount < state.players.length
          ) {
            newSetterIndex = (newSetterIndex + 1) % state.players.length;
            skipCount++;
          }

          updateData = {
            currentTurnIndex: newSetterIndex,
            currentAction: "set",
            currentTrick: null,
            setterId: null,
            updatedAt: now,
            turnDeadlineAt: new Date(Date.now() + TURN_TIMEOUT_MS),
            processedEventIds,
          };
        } else {
          updateData = {
            currentTurnIndex: nextTurnIndex,
            currentAction: "attempt",
            currentTrick: trickName,
            setterId: state.setterId,
            updatedAt: now,
            turnDeadlineAt: new Date(Date.now() + TURN_TIMEOUT_MS),
            processedEventIds,
          };
        }
      }

      const [updated] = await tx
        .update(gameSessions)
        .set(updateData)
        .where(eq(gameSessions.id, gameId))
        .returning();

      return { success: true, game: rowToGameState(updated) } as TransitionResult;
    });

    if (result.success && !result.alreadyProcessed) {
      await logServerEvent(odv, "game_trick_submitted", {
        game_id: gameId,
        trick_name: trickName,
      });
      logger.info("[GameState] Trick submitted", { gameId, odv, trickName });
    }

    return result;
  } catch (error) {
    logger.error("[GameState] Failed to submit trick", { error, gameId, odv });
    return { success: false, error: "Failed to submit trick" };
  }
}

/**
 * Pass on a trick (player gets a letter) with transactional update
 */
export async function passTrick(input: {
  eventId: string;
  gameId: string;
  odv: string;
}): Promise<TransitionResult & { letterGained?: string; isEliminated?: boolean }> {
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
        return { success: false, error: "Game not found" };
      }

      const state = rowToGameState(game);

      if (state.processedEventIds.includes(eventId)) {
        return { success: true, game: state, alreadyProcessed: true };
      }

      if (state.status !== "active") {
        return { success: false, error: "Game is not active" };
      }

      if (state.currentAction !== "attempt") {
        return { success: false, error: "Can only pass during attempt phase" };
      }

      const currentPlayer = state.players[state.currentTurnIndex];
      if (currentPlayer?.odv !== odv) {
        return { success: false, error: "Not your turn" };
      }

      const currentLetters = currentPlayer.letters;
      const newLetters = getNextLetter(currentLetters);
      const playerEliminated = isEliminated(newLetters);

      const updatedPlayers = state.players.map((p) =>
        p.odv === odv ? { ...p, letters: newLetters } : p
      );

      const activePlayers = updatedPlayers.filter((p) => !isEliminated(p.letters));

      const now = new Date();
      const processedEventIds = [...state.processedEventIds, eventId].slice(-MAX_PROCESSED_EVENTS);
      let updateData: Partial<typeof gameSessions.$inferInsert>;

      if (activePlayers.length === 1) {
        updateData = {
          players: updatedPlayers,
          status: "completed",
          winnerId: activePlayers[0].odv,
          updatedAt: now,
          turnDeadlineAt: null,
          processedEventIds,
        };
      } else {
        let nextTurnIndex = (state.currentTurnIndex + 1) % state.players.length;

        let attempts = 0;
        while (
          isEliminated(updatedPlayers[nextTurnIndex].letters) &&
          attempts < state.players.length
        ) {
          nextTurnIndex = (nextTurnIndex + 1) % state.players.length;
          attempts++;
        }

        const setterIndex = state.players.findIndex((p) => p.odv === state.setterId);
        const isBackToSetter = nextTurnIndex === setterIndex;

        if (isBackToSetter) {
          let newSetterIndex = (setterIndex + 1) % state.players.length;
          while (
            isEliminated(updatedPlayers[newSetterIndex].letters) &&
            attempts < state.players.length
          ) {
            newSetterIndex = (newSetterIndex + 1) % state.players.length;
            attempts++;
          }

          updateData = {
            players: updatedPlayers,
            currentTurnIndex: newSetterIndex,
            currentAction: "set",
            currentTrick: null,
            setterId: null,
            updatedAt: now,
            turnDeadlineAt: new Date(Date.now() + TURN_TIMEOUT_MS),
            processedEventIds,
          };
        } else {
          updateData = {
            players: updatedPlayers,
            currentTurnIndex: nextTurnIndex,
            updatedAt: now,
            turnDeadlineAt: new Date(Date.now() + TURN_TIMEOUT_MS),
            processedEventIds,
          };
        }
      }

      const [updated] = await tx
        .update(gameSessions)
        .set(updateData)
        .where(eq(gameSessions.id, gameId))
        .returning();

      return {
        success: true,
        game: rowToGameState(updated),
        letterGained: newLetters,
        isEliminated: playerEliminated,
      };
    });

    if (result.success && !result.alreadyProcessed) {
      await logServerEvent(odv, "game_trick_passed", {
        game_id: gameId,
        letters: result.letterGained,
      });
      logger.info("[GameState] Player passed", { gameId, odv, letters: result.letterGained });
    }

    return result;
  } catch (error) {
    logger.error("[GameState] Failed to pass trick", { error, gameId, odv });
    return { success: false, error: "Failed to pass trick" };
  }
}
