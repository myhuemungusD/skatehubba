/**
 * Battle Event Handlers
 *
 * Real-time WebSocket handlers for 1v1 battles.
 * Integrates with battleStateService for transactional voting.
 *
 * Features:
 * - Vote timeouts (60 seconds)
 * - Tie handling (challenger/creator wins on tie)
 * - Double-vote protection (updates existing vote)
 * - Idempotency keys
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
import { createBattle, joinBattle, getBattle } from "../../services/battleService";
import { initializeVoting, castVote, generateEventId } from "../../services/battleStateService";

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

// Track which sockets are in which battles for cleanup
const socketBattleMap = new Map<string, Set<string>>();

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

        // Track socket-battle association
        if (!socketBattleMap.has(socket.id)) {
          socketBattleMap.set(socket.id, new Set());
        }
        socketBattleMap.get(socket.id)!.add(result.battleId);

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

      // Track socket-battle association
      if (!socketBattleMap.has(socket.id)) {
        socketBattleMap.set(socket.id, new Set());
      }
      socketBattleMap.get(socket.id)!.add(battleId);

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
   * Start voting phase for a battle
   */
  socket.on("battle:startVoting", async (battleId: string) => {
    try {
      const battle = await getBattle(battleId);
      if (!battle) {
        socket.emit("error", {
          code: "battle_not_found",
          message: "Battle not found",
        });
        return;
      }

      if (!battle.opponentId) {
        socket.emit("error", {
          code: "battle_not_ready",
          message: "Battle needs two players to start voting",
        });
        return;
      }

      // Only allow participants to start voting
      if (data.odv !== battle.creatorId && data.odv !== battle.opponentId) {
        socket.emit("error", {
          code: "not_participant",
          message: "Only battle participants can start voting",
        });
        return;
      }

      const eventId = generateEventId("startVoting", data.odv, battleId);
      await initializeVoting({
        eventId,
        battleId,
        creatorId: battle.creatorId,
        opponentId: battle.opponentId,
      });

      // Notify both players
      broadcastToRoom(io, "battle", battleId, "battle:update", {
        battleId,
        state: "voting",
      });

      // Send voting started event with timeout
      broadcastToRoom(io, "battle", battleId, "battle:votingStarted", {
        battleId,
        timeoutSeconds: 60,
        startedAt: new Date().toISOString(),
      });

      logger.info("[Battle] Voting started", { battleId, startedBy: data.odv });
    } catch (error) {
      logger.error("[Battle] Start voting failed", { error, battleId, odv: data.odv });
      socket.emit("error", {
        code: "start_voting_failed",
        message: "Failed to start voting",
      });
    }
  });

  /**
   * Cast a vote on a battle
   * - Double-vote protection: updates existing vote
   * - Participant validation: only battle participants can vote
   * - Tie handling: creator wins on tie
   */
  socket.on(
    "battle:vote",
    async (input: { battleId: string; odv: string; vote: "clean" | "sketch" | "redo" }) => {
      try {
        const eventId = generateEventId("vote", data.odv, input.battleId);

        const result = await castVote({
          eventId,
          battleId: input.battleId,
          odv: data.odv, // Use authenticated user ID, not input
          vote: input.vote,
        });

        if (!result.success) {
          socket.emit("error", {
            code: "battle_vote_failed",
            message: result.error || "Failed to cast vote",
          });
          return;
        }

        // Skip broadcast if already processed (idempotency)
        if (result.alreadyProcessed && !result.battleComplete) {
          return;
        }

        const payload: BattleVotePayload = {
          battleId: input.battleId,
          odv: data.odv,
          vote: input.vote,
          votedAt: new Date().toISOString(),
        };

        // Broadcast vote to battle room
        broadcastToRoom(io, "battle", input.battleId, "battle:voted", payload);

        // If battle is complete, broadcast completion
        if (result.battleComplete && result.winnerId) {
          const completedPayload: BattleCompletedPayload = {
            battleId: input.battleId,
            winnerId: result.winnerId,
            finalScore: result.finalScore || {},
            completedAt: new Date().toISOString(),
          };

          broadcastToRoom(io, "battle", input.battleId, "battle:completed", completedPayload);

          logger.info("[Battle] Completed", {
            battleId: input.battleId,
            winnerId: result.winnerId,
            finalScore: result.finalScore,
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

      // Track socket-battle association
      if (!socketBattleMap.has(socket.id)) {
        socketBattleMap.set(socket.id, new Set());
      }
      socketBattleMap.get(socket.id)!.add(battleId);

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
  const battleIds = socketBattleMap.get(socket.id) || new Set();

  for (const battleId of battleIds) {
    try {
      await leaveRoom(socket, "battle", battleId);
      logger.info("[Battle] Player disconnected from battle", { battleId, odv: data.odv });
    } catch (error) {
      logger.error("[Battle] Cleanup failed for battle", { error, battleId, odv: data.odv });
    }
  }

  // Clean up socket tracking
  socketBattleMap.delete(socket.id);
}
