/**
 * Game Socket Handlers — game:reconnect
 */

import logger from "../../../logger";
import { joinRoom, broadcastToRoom } from "../../rooms";
import { handleReconnect, generateEventId } from "../../../services/gameStateService";
import { checkRateLimit } from "../../socketRateLimit";
import { trackSocketGame } from "./roomManagement";
import type { TypedServer, TypedSocket } from "./types";

export function registerReconnectHandler(io: TypedServer, socket: TypedSocket): void {
  socket.on("game:reconnect", async (gameId: string) => {
    if (!checkRateLimit(socket.id, "game:reconnect")) {
      socket.emit("error", { code: "rate_limited", message: "Too many requests, slow down" });
      return;
    }
    const data = socket.data;
    try {
      const eventId = generateEventId("reconnect", data.odv, gameId);

      const result = await handleReconnect({
        eventId,
        gameId,
        odv: data.odv,
      });

      if (!result.success) {
        socket.emit("error", {
          code: "reconnect_failed",
          message: result.error || "Failed to reconnect",
        });
        return;
      }

      const game = result.game!;

      trackSocketGame(socket.id, gameId);
      await joinRoom(socket, "game", gameId);

      // Send current game state to reconnected player
      socket.emit("game:state", {
        gameId: game.id,
        players: game.players.map((p) => ({
          odv: p.odv,
          letters: p.letters,
          connected: p.connected,
        })),
        currentPlayer: game.players[game.currentTurnIndex]?.odv,
        currentAction: game.currentAction,
        currentTrick: game.currentTrick,
        status: game.status,
      });

      // If game resumed from paused, notify all players
      if (game.status === "active" && !result.alreadyProcessed) {
        broadcastToRoom(io, "game", gameId, "game:resumed", {
          gameId,
          reconnectedPlayer: data.odv,
        });

        broadcastToRoom(io, "game", gameId, "game:turn", {
          gameId,
          currentPlayer: game.players[game.currentTurnIndex].odv,
          action: game.currentAction,
          timeLimit: 60,
        });
      }

      logger.info("[Game] Player reconnected", { gameId, odv: data.odv });
    } catch (error) {
      logger.error("[Game] Reconnect failed", { error, gameId, odv: data.odv });
      socket.emit("error", {
        code: "reconnect_failed",
        message: "Failed to reconnect",
      });
    }
  });
}
