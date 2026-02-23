/**
 * Game Socket Handlers — game:create
 */

import logger from "../../../logger";
import { joinRoom } from "../../rooms";
import type { GameCreatedPayload } from "../../types";
import { createGame, generateEventId } from "../../../services/gameStateService";
import { checkRateLimit } from "../../socketRateLimit";
import { trackSocketGame } from "./roomManagement";
import type { TypedServer, TypedSocket } from "./types";

export function registerCreateHandler(io: TypedServer, socket: TypedSocket): void {
  socket.on("game:create", async (spotId: string, maxPlayers: number = 4) => {
    if (!checkRateLimit(socket.id, "game:create")) {
      socket.emit("error", { code: "rate_limited", message: "Too many requests, slow down" });
      return;
    }
    const data = socket.data;
    try {
      const eventId = generateEventId("create", data.odv, "new");

      const result = await createGame({
        eventId,
        spotId,
        creatorId: data.odv,
        maxPlayers,
      });

      if (!result.success || !result.game) {
        socket.emit("error", {
          code: "game_create_failed",
          message: result.error || "Failed to create game",
        });
        return;
      }

      const game = result.game;

      trackSocketGame(socket.id, game.id);
      await joinRoom(socket, "game", game.id);

      const payload: GameCreatedPayload = {
        gameId: game.id,
        spotId: game.spotId,
        creatorId: data.odv,
        maxPlayers: game.maxPlayers,
        createdAt: game.createdAt,
      };

      socket.emit("game:created", payload);

      logger.info("[Game] Created", { gameId: game.id, creatorId: data.odv, spotId });
    } catch (error) {
      logger.error("[Game] Create failed", { error, odv: data.odv });
      socket.emit("error", {
        code: "game_create_failed",
        message: "Failed to create game",
      });
    }
  });
}
