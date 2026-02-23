/**
 * Game Socket Handlers — Disconnect Cleanup
 */

import logger from "../../../logger";
import { leaveRoom, broadcastToRoom } from "../../rooms";
import { handleDisconnect, generateEventId } from "../../../services/gameStateService";
import { getSocketGames, untrackSocket } from "./roomManagement";
import type { TypedServer, TypedSocket } from "./types";

/**
 * Clean up game subscriptions on disconnect
 */
export async function cleanupGameSubscriptions(
  io: TypedServer,
  socket: TypedSocket
): Promise<void> {
  const data = socket.data;
  const gameIds = getSocketGames(socket.id);

  for (const gameId of gameIds) {
    try {
      await leaveRoom(socket, "game", gameId);

      const eventId = generateEventId("disconnect", data.odv, gameId);
      const result = await handleDisconnect({
        eventId,
        gameId,
        odv: data.odv,
      });

      if (result.success && result.game && !result.alreadyProcessed) {
        const game = result.game;

        if (game.status === "paused") {
          broadcastToRoom(io, "game", gameId, "game:paused", {
            gameId,
            disconnectedPlayer: data.odv,
            reconnectTimeout: 120, // 2 minutes
          });
        }

        logger.info("[Game] Player disconnected from game", { gameId, odv: data.odv });
      }
    } catch (error) {
      logger.error("[Game] Cleanup failed for game", { error, gameId, odv: data.odv });
    }
  }

  untrackSocket(socket.id);
}
