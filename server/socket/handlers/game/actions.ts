/**
 * Game Socket Handlers — game:trick, game:pass, game:forfeit
 */

import logger from "../../../logger";
import { broadcastToRoom } from "../../rooms";
import type { GameTrickPayload, GameTurnPayload } from "../../types";
import {
  submitTrick,
  passTrick,
  forfeitGame,
  generateEventId,
} from "../../../services/gameStateService";
import { checkRateLimit } from "../../socketRateLimit";
import type { TypedServer, TypedSocket } from "./types";

export function registerActionsHandler(io: TypedServer, socket: TypedSocket): void {
  const data = socket.data;

  /**
   * Submit a trick
   */
  socket.on(
    "game:trick",
    async (input: { gameId: string; odv: string; trickName: string; clipUrl?: string }) => {
      if (!checkRateLimit(socket.id, "game:trick")) {
        socket.emit("error", { code: "rate_limited", message: "Too many requests, slow down" });
        return;
      }
      try {
        const eventId = generateEventId("trick", data.odv, input.gameId);

        const result = await submitTrick({
          eventId,
          gameId: input.gameId,
          odv: data.odv,
          trickName: input.trickName,
          clipUrl: input.clipUrl,
        });

        if (!result.success) {
          socket.emit("error", {
            code: "trick_failed",
            message: result.error || "Failed to submit trick",
          });
          return;
        }

        if (result.alreadyProcessed) {
          return;
        }

        const game = result.game!;

        const trickPayload: GameTrickPayload = {
          gameId: input.gameId,
          odv: data.odv,
          trickName: input.trickName,
          clipUrl: input.clipUrl,
          sentAt: new Date().toISOString(),
        };

        broadcastToRoom(io, "game", input.gameId, "game:trick", trickPayload);

        if (game.status === "completed" && game.winnerId) {
          broadcastToRoom(io, "game", input.gameId, "game:ended", {
            gameId: input.gameId,
            winnerId: game.winnerId,
            finalStandings: game.players.map((p) => ({
              odv: p.odv,
              letters: p.letters,
            })),
          });
        } else {
          const turnPayload: GameTurnPayload = {
            gameId: input.gameId,
            currentPlayer: game.players[game.currentTurnIndex].odv,
            action: game.currentAction,
            timeLimit: 60,
          };

          broadcastToRoom(io, "game", input.gameId, "game:turn", turnPayload);
        }

        logger.info("[Game] Trick submitted", {
          gameId: input.gameId,
          odv: data.odv,
          trick: input.trickName,
        });
      } catch (error) {
        logger.error("[Game] Trick failed", { error, input, odv: data.odv });
        socket.emit("error", {
          code: "trick_failed",
          message: "Failed to submit trick",
        });
      }
    }
  );

  /**
   * Pass on a trick (gets a letter)
   */
  socket.on("game:pass", async (gameId: string) => {
    if (!checkRateLimit(socket.id, "game:pass")) {
      socket.emit("error", { code: "rate_limited", message: "Too many requests, slow down" });
      return;
    }
    try {
      const eventId = generateEventId("pass", data.odv, gameId);

      const result = await passTrick({
        eventId,
        gameId,
        odv: data.odv,
      });

      if (!result.success) {
        socket.emit("error", {
          code: "pass_failed",
          message: result.error || "Failed to pass",
        });
        return;
      }

      if (result.alreadyProcessed) {
        return;
      }

      const game = result.game!;

      broadcastToRoom(io, "game", gameId, "game:letter", {
        gameId,
        odv: data.odv,
        letters: result.letterGained || "",
      });

      if (game.status === "completed" && game.winnerId) {
        broadcastToRoom(io, "game", gameId, "game:ended", {
          gameId,
          winnerId: game.winnerId,
          finalStandings: game.players.map((p) => ({
            odv: p.odv,
            letters: p.letters,
          })),
        });
      } else {
        broadcastToRoom(io, "game", gameId, "game:turn", {
          gameId,
          currentPlayer: game.players[game.currentTurnIndex].odv,
          action: game.currentAction,
          timeLimit: 60,
        });
      }

      logger.info("[Game] Player passed", {
        gameId,
        odv: data.odv,
        letters: result.letterGained,
      });
    } catch (error) {
      logger.error("[Game] Pass failed", { error, gameId, odv: data.odv });
      socket.emit("error", {
        code: "pass_failed",
        message: "Failed to pass",
      });
    }
  });

  /**
   * Forfeit a game voluntarily
   */
  socket.on("game:forfeit", async (gameId: string) => {
    if (!checkRateLimit(socket.id, "game:forfeit")) {
      socket.emit("error", { code: "rate_limited", message: "Too many requests, slow down" });
      return;
    }
    try {
      const eventId = generateEventId("forfeit", data.odv, gameId);

      const result = await forfeitGame({
        eventId,
        gameId,
        odv: data.odv,
        reason: "voluntary",
      });

      if (!result.success) {
        socket.emit("error", {
          code: "forfeit_failed",
          message: result.error || "Failed to forfeit",
        });
        return;
      }

      if (result.alreadyProcessed) {
        return;
      }

      const game = result.game!;

      broadcastToRoom(io, "game", gameId, "game:ended", {
        gameId,
        winnerId: game.winnerId || "",
        finalStandings: game.players.map((p) => ({
          odv: p.odv,
          letters: p.letters,
        })),
      });

      logger.info("[Game] Player forfeited", { gameId, odv: data.odv });
    } catch (error) {
      logger.error("[Game] Forfeit failed", { error, gameId, odv: data.odv });
      socket.emit("error", {
        code: "forfeit_failed",
        message: "Failed to forfeit",
      });
    }
  });
}
