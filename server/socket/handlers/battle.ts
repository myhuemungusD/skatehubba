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

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

// In-memory battle state (will be replaced with DB + battleService)
interface BattleState {
  id: string;
  creatorId: string;
  opponentId?: string;
  matchmaking: "open" | "direct";
  status: "waiting" | "active" | "voting" | "completed";
  votes: Map<string, "clean" | "sketch" | "redo">;
  createdAt: Date;
}

const battles = new Map<string, BattleState>();

function generateBattleId(): string {
  return `battle-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

// In-memory battle service functions (to be replaced with proper DB service)
async function createBattleInMemory(params: {
  creatorId: string;
  matchmaking: "open" | "direct";
  opponentId?: string;
}): Promise<{ battleId: string }> {
  const battleId = generateBattleId();
  battles.set(battleId, {
    id: battleId,
    creatorId: params.creatorId,
    opponentId: params.opponentId,
    matchmaking: params.matchmaking,
    status: "waiting",
    votes: new Map(),
    createdAt: new Date(),
  });
  return { battleId };
}

async function joinBattleInMemory(odv: string, battleId: string): Promise<void> {
  const battle = battles.get(battleId);
  if (!battle) {
    throw new Error("Battle not found");
  }
  if (battle.opponentId && battle.opponentId !== odv) {
    throw new Error("Battle already has an opponent");
  }
  battle.opponentId = odv;
  battle.status = "active";
}

async function voteBattleInMemory(params: {
  odv: string;
  battleId: string;
  vote: "clean" | "sketch" | "redo";
}): Promise<void> {
  const battle = battles.get(params.battleId);
  if (!battle) {
    throw new Error("Battle not found");
  }
  battle.votes.set(params.odv, params.vote);
}

/**
 * Register battle event handlers on a socket
 */
export function registerBattleHandlers(io: TypedServer, socket: TypedSocket): void {
  const data = socket.data as SocketData;

  /**
   * Create a new battle
   */
  socket.on("battle:create", async (input) => {
    try {
      const result = await createBattleInMemory({
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
  });

  /**
   * Join an existing battle
   */
  socket.on("battle:join", async (battleId) => {
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

      await joinBattleInMemory(data.odv, battleId);
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
  socket.on("battle:vote", async (input) => {
    try {
      await voteBattleInMemory({
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
      const battle = battles.get(input.battleId);
      if (battle && battle.votes.size >= 2) {
        battle.status = "completed";

        // Calculate winner based on votes (simplified: clean wins)
        const scores: { [odv: string]: number } = {};
        scores[battle.creatorId] = 0;
        if (battle.opponentId) scores[battle.opponentId] = 0;

        for (const [odv, vote] of battle.votes) {
          if (vote === "clean") scores[odv] = (scores[odv] || 0) + 1;
        }

        const winnerId = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0];

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
  });

  /**
   * Player ready to start
   */
  socket.on("battle:ready", async (battleId) => {
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
