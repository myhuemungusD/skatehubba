/**
 * Game Timeout Processing
 *
 * Handles turn timeouts and disconnect timeouts.
 * Should be called periodically (e.g., every 10 seconds).
 */

import { getDb } from "../../db";
import { gameSessions } from "@shared/schema";
import { eq, and, lt } from "drizzle-orm";
import logger from "../../logger";
import { MAX_PROCESSED_EVENTS, RECONNECT_WINDOW_MS, TURN_TIMEOUT_MS } from "./constants";
import { generateEventId, isEliminated, rowToGameState } from "./helpers";
import { forfeitGame } from "./forfeit";

/**
 * Check and process timed out games
 * Should be called periodically (e.g., every 10 seconds)
 */
export async function processTimeouts(): Promise<void> {
  try {
    const db = getDb();
    const now = new Date();

    // Find active games with expired turn deadlines
    const activeGames = await db
      .select()
      .from(gameSessions)
      .where(and(eq(gameSessions.status, "active"), lt(gameSessions.turnDeadlineAt, now)));

    for (const game of activeGames) {
      const state = rowToGameState(game);

      if (state.currentAction === "attempt") {
        // Attempt phase timeout — defender wins round, move to next setter
        await db.transaction(async (tx) => {
          const [fresh] = await tx
            .select()
            .from(gameSessions)
            .where(eq(gameSessions.id, game.id))
            .for("update");

          if (!fresh) return;
          const freshState = rowToGameState(fresh);

          if (freshState.status !== "active") return;
          if (!fresh.turnDeadlineAt || fresh.turnDeadlineAt >= now) return;
          if (freshState.currentAction !== "attempt") return;

          const freshPlayer = freshState.players[freshState.currentTurnIndex];
          if (!freshPlayer) return;

          const sequenceKey = `deadline-${fresh.turnDeadlineAt.toISOString()}`;
          const eventId = generateEventId("timeout", freshPlayer.odv, freshState.id, sequenceKey);

          if (freshState.processedEventIds.includes(eventId)) return;

          const setterIndex = freshState.players.findIndex((p) => p.odv === freshState.setterId);
          let newSetterIndex = (setterIndex + 1) % freshState.players.length;
          let attempts = 0;
          while (
            isEliminated(freshState.players[newSetterIndex].letters) &&
            attempts < freshState.players.length
          ) {
            newSetterIndex = (newSetterIndex + 1) % freshState.players.length;
            attempts++;
          }

          await tx
            .update(gameSessions)
            .set({
              currentTurnIndex: newSetterIndex,
              currentAction: "set",
              currentTrick: null,
              setterId: null,
              updatedAt: now,
              turnDeadlineAt: new Date(Date.now() + TURN_TIMEOUT_MS),
              processedEventIds: [...freshState.processedEventIds, eventId].slice(
                -MAX_PROCESSED_EVENTS
              ),
            })
            .where(eq(gameSessions.id, game.id));

          logger.info("[GameState] Turn timeout - defender wins round", {
            gameId: game.id,
            timedOutPlayer: freshPlayer.odv,
          });
        });
      } else {
        // Set phase timeout — forfeit the game
        const result = await db.transaction(async (tx) => {
          const [fresh] = await tx
            .select()
            .from(gameSessions)
            .where(eq(gameSessions.id, game.id))
            .for("update");

          if (!fresh) return null;
          const freshState = rowToGameState(fresh);

          if (freshState.status !== "active") return null;
          if (!fresh.turnDeadlineAt || fresh.turnDeadlineAt >= now) return null;
          if (freshState.currentAction !== "set") return null;

          const freshPlayer = freshState.players[freshState.currentTurnIndex];
          if (!freshPlayer) return null;

          const sequenceKey = `deadline-${fresh.turnDeadlineAt.toISOString()}`;
          const eventId = generateEventId("timeout", freshPlayer.odv, freshState.id, sequenceKey);

          if (freshState.processedEventIds.includes(eventId)) return null;

          return { eventId, odv: freshPlayer.odv };
        });

        if (result) {
          await forfeitGame({
            eventId: result.eventId,
            gameId: game.id,
            odv: result.odv,
            reason: "turn_timeout",
          });
        }
      }
    }

    // Find paused games that exceeded reconnection window
    const pausedGames = await db
      .select()
      .from(gameSessions)
      .where(eq(gameSessions.status, "paused"));

    for (const game of pausedGames) {
      const state = rowToGameState(game);

      for (const player of state.players) {
        if (!player.connected && player.disconnectedAt) {
          const disconnectedTime = new Date(player.disconnectedAt).getTime();
          const elapsed = now.getTime() - disconnectedTime;

          if (elapsed > RECONNECT_WINDOW_MS) {
            const result = await db.transaction(async (tx) => {
              const [fresh] = await tx
                .select()
                .from(gameSessions)
                .where(eq(gameSessions.id, game.id))
                .for("update");

              if (!fresh) return null;
              const freshState = rowToGameState(fresh);

              const freshPlayer = freshState.players.find((p) => p.odv === player.odv);
              if (
                !freshPlayer ||
                freshPlayer.connected ||
                freshPlayer.disconnectedAt !== player.disconnectedAt
              ) {
                return null;
              }

              const sequenceKey = `disconnected-${freshPlayer.disconnectedAt}`;
              const eventId = generateEventId(
                "disconnect_timeout",
                freshPlayer.odv,
                freshState.id,
                sequenceKey
              );

              if (freshState.processedEventIds.includes(eventId)) return null;

              return { eventId, odv: freshPlayer.odv };
            });

            if (result) {
              await forfeitGame({
                eventId: result.eventId,
                gameId: game.id,
                odv: result.odv,
                reason: "disconnect_timeout",
              });
              break;
            }
          }
        }
      }
    }
  } catch (error) {
    logger.error("[GameState] Failed to process timeouts", { error });
  }
}
