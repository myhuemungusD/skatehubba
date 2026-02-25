/**
 * Game Socket Handlers — game:join
 */

import logger from "../../../logger";
import { joinRoom, broadcastToRoom } from "../../rooms";
import type { GameJoinedPayload, GameTurnPayload } from "../../types";
import { joinGame, generateEventId } from "../../../services/gameStateService";
import { checkRateLimit } from "../../socketRateLimit";
import { trackSocketGame } from "./roomManagement";
import type { TypedServer, TypedSocket } from "./types";

export function registerJoinHandler(io: TypedServer, socket: TypedSocket): void {
  socket.on("game:join", async (gameId: string) => {
    if (!checkRateLimit(socket.id, "game:join")) {
      socket.emit("error", { code: "rate_limited", message: "Too many requests, slow down" });
      return;
    }
    const data = socket.data;
    try {
      const eventId = generateEventId("join", data.odv, gameId);

      // L6: Timeout DB operations to prevent hanging socket handlers
      const SOCKET_OP_TIMEOUT = 5000;
      const result = await Promise.race([
        joinGame({ eventId, gameId, odv: data.odv }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Operation timed out")), SOCKET_OP_TIMEOUT)
        ),
      ]);

      if (!result.success) {
        socket.emit("error", {
          code: "game_join_failed",
          message: result.error || "Failed to join game",
        });
        return;
      }

      // Skip broadcast if already processed (idempotency)
      if (result.alreadyProcessed) {
        return;
      }

      const game = result.game!;

      trackSocketGame(socket.id, gameId);
      await joinRoom(socket, "game", gameId);

      const payload: GameJoinedPayload = {
        gameId,
        odv: data.odv,
        playerCount: game.players.length,
      };

      broadcastToRoom(io, "game", gameId, "game:joined", payload);

      // If game just started, broadcast turn info
      if (game.status === "active") {
        const turnPayload: GameTurnPayload = {
          gameId,
          currentPlayer: game.players[game.currentTurnIndex].odv,
          action: game.currentAction,
          timeLimit: 60,
        };

        broadcastToRoom(io, "game", gameId, "game:turn", turnPayload);
      }

      logger.info("[Game] Player joined", {
        gameId,
        odv: data.odv,
        playerCount: game.players.length,
      });
    } catch (error) {
      logger.error("[Game] Join failed", { error, gameId, odv: data.odv });
      socket.emit("error", {
        code: "game_join_failed",
        message: "Failed to join game",
      });
    }
  });
}
