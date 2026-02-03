/**
 * Battle Event Handlers
 *
 * Real-time WebSocket handlers for 1v1 battles.
 * Integrates with battleService for business logic.
 */

import type { Server, Socket } from "socket.io";
import logger from "../../logger";
import { joinRoom, leaveRoom, broadcastToRoom, sendToUser, getRoomInfo } from "../rooms";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  BattleCreatedPayload,
  BattleJoinedPayload,
  BattleVotePayload,
  BattleCompletedPayload,
} from "../types";
import {
  createBattle,
  joinBattle,
  voteBattle,
  completeBattle,
  getBattle,
  getBattleVotes,
} from "../../services/battleService";

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

/**
 * Register battle event handlers on a socket
 */
export function registerBattleHandlers(io: TypedServer, socket: TypedSocket): void {
  const data = socket.data as SocketData;

  /**
   * Create a new battle
   */
  socket.on(
    "battle:create",
    async (input: { matchmaking: "open" | "direct"; opponentId?: string; creatorId?: string }) => {
      try {
        const result = await createBattle({
          creatorId: data.odv,
          matchmaking: input.matchmaking,
          opponentId: input.opponentId,
        });

        // Join the battle room
        await joinRoom(socket, "battle", result.battleId);

        const payload: BattleCreatedPayload = {
          battleId: result.battleId,
          creatorId: data.odv,
          matchmaking: input.matchmaking,
          opponentId: input.opponentId,
          createdAt: new Date().toISOString(),
        };

        // Notify creator
        socket.emit("battle:created", payload);

        // If direct challenge, notify opponent
        if (input.opponentId) {
          sendToUser(io, input.opponentId, "notification", {
            id: `battle-invite-${result.battleId}`,
            type: "challenge",
            title: "Battle Challenge!",
            message: "Someone challenged you to a battle",
            data: { battleId: result.battleId },
            createdAt: new Date().toISOString(),
          });
        }

        logger.info("[Battle] Created via socket", {
          battleId: result.battleId,
          creatorId: data.odv,
        });
      } catch (error) {
        logger.error("[Battle] Create failed", { error, odv: data.odv });
        socket.emit("error", {
          code: "battle_create_failed",
          message: "Failed to create battle",
        });
      }
    }
  );

  /**
   * Join an existing battle
   */
  socket.on("battle:join", async (battleId: string) => {
    try {
      // Check room exists and has space
      const roomInfo = getRoomInfo("battle", battleId);
      if (roomInfo && roomInfo.members.size >= 2) {
        socket.emit("error", {
          code: "battle_full",
          message: "This battle already has two players",
        });
        return;
      }

      await joinBattle(data.odv, battleId);
      await joinRoom(socket, "battle", battleId);

      const payload: BattleJoinedPayload = {
        battleId,
        odv: data.odv,
        joinedAt: new Date().toISOString(),
      };

      // Notify both players
      broadcastToRoom(io, "battle", battleId, "battle:joined", payload);

      // Send battle update with active state
      broadcastToRoom(io, "battle", battleId, "battle:update", {
        battleId,
        state: "active",
        roundNumber: 1,
      });

      logger.info("[Battle] Joined via socket", {
        battleId,
        odv: data.odv,
      });
    } catch (error) {
      logger.error("[Battle] Join failed", { error, battleId, odv: data.odv });
      socket.emit("error", {
        code: "battle_join_failed",
        message: "Failed to join battle",
      });
    }
  });

  /**
   * Cast a vote on a battle
   */
  socket.on(
    "battle:vote",
    async (input: { battleId: string; odv: string; vote: "clean" | "sketch" | "redo" }) => {
      try {
        await voteBattle({
          odv: data.odv,
          battleId: input.battleId,
          vote: input.vote,
        });

        const payload: BattleVotePayload = {
          battleId: input.battleId,
          odv: data.odv,
          vote: input.vote,
          votedAt: new Date().toISOString(),
        };

        // Broadcast vote to battle room
        broadcastToRoom(io, "battle", input.battleId, "battle:voted", payload);

        // Check if battle is complete (both players voted)
        const battle = await getBattle(input.battleId);
        const votes = await getBattleVotes(input.battleId);

        if (battle && votes.length >= 2) {
          // Calculate winner: count "clean" votes for each player
          const scores: { [odv: string]: number } = {};
          scores[battle.creatorId] = 0;
          if (battle.opponentId) scores[battle.opponentId] = 0;

          for (const v of votes) {
            // Vote "clean" on opponent = point for opponent
            // This assumes voters are judging the other player's trick
            if (v.vote === "clean") {
              // Find the OTHER player (not the voter)
              const target = v.odv === battle.creatorId ? battle.opponentId : battle.creatorId;
              if (target) scores[target] = (scores[target] || 0) + 1;
            }
          }

          const winnerId = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0];

          // Persist completion
          await completeBattle({
            battleId: input.battleId,
            winnerId,
            totalRounds: 1,
          });

          const completedPayload: BattleCompletedPayload = {
            battleId: input.battleId,
            winnerId,
            finalScore: scores,
            completedAt: new Date().toISOString(),
          };

          broadcastToRoom(io, "battle", input.battleId, "battle:completed", completedPayload);

          logger.info("[Battle] Completed", {
            battleId: input.battleId,
            winnerId,
            finalScore: scores,
          });
        }

        logger.info("[Battle] Vote cast via socket", {
          battleId: input.battleId,
          odv: data.odv,
          vote: input.vote,
        });
      } catch (error) {
        logger.error("[Battle] Vote failed", { error, input, odv: data.odv });
        socket.emit("error", {
          code: "battle_vote_failed",
          message: "Failed to cast vote",
        });
      }
    }
  );

  /**
   * Player ready to start
   */
  socket.on("battle:ready", async (battleId: string) => {
    try {
      // Join the battle room if not already
      await joinRoom(socket, "battle", battleId);

      // Broadcast ready status
      broadcastToRoom(
        io,
        "battle",
        battleId,
        "battle:update",
        {
          battleId,
          state: "waiting",
        },
        socket
      );

      logger.info("[Battle] Player ready", { battleId, odv: data.odv });
    } catch (error) {
      logger.error("[Battle] Ready failed", { error, battleId, odv: data.odv });
    }
  });
}

/**
 * Clean up battle subscriptions on disconnect
 */
export async function cleanupBattleSubscriptions(socket: TypedSocket): Promise<void> {
  const data = socket.data as SocketData;

  for (const roomId of data.rooms) {
    if (roomId.startsWith("battle:")) {
      const battleId = roomId.replace("battle:", "");
      await leaveRoom(socket, "battle", battleId);
    }
  }
}
