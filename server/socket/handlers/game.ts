/**
 * S.K.A.T.E. Game Event Handlers
 *
 * Real-time WebSocket handlers for multiplayer S.K.A.T.E. games.
 * Uses PostgreSQL for persistent, race-condition-safe game state.
 */

import type { Server, Socket } from "socket.io";
import logger from "../../logger";
import { joinRoom, leaveRoom, broadcastToRoom } from "../rooms";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  GameCreatedPayload,
  GameJoinedPayload,
  GameTrickPayload,
  GameTurnPayload,
} from "../types";
import {
  createGame,
  joinGame,
  submitTrick,
  passTrick,
  handleDisconnect,
  handleReconnect,
  forfeitGame,
  generateEventId,
} from "../../services/gameStateService";

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

// Track which sockets are in which games for cleanup
const socketGameMap = new Map<string, Set<string>>();

// ============================================================================
// Per-socket rate limiting for game events
// ============================================================================

/**
 * Simple sliding-window rate limiter for socket events.
 * Tracks timestamps per socket per event type; no external dependencies.
 */
const socketRateLimits = new Map<string, Map<string, number[]>>();

const RATE_LIMIT_RULES: Record<string, { maxPerWindow: number; windowMs: number }> = {
  "game:create": { maxPerWindow: 3, windowMs: 60_000 },
  "game:join": { maxPerWindow: 5, windowMs: 60_000 },
  "game:trick": { maxPerWindow: 10, windowMs: 60_000 },
  "game:pass": { maxPerWindow: 10, windowMs: 60_000 },
  "game:forfeit": { maxPerWindow: 3, windowMs: 60_000 },
  "game:reconnect": { maxPerWindow: 5, windowMs: 60_000 },
};

function checkSocketRateLimit(socketId: string, eventName: string): boolean {
  const rule = RATE_LIMIT_RULES[eventName];
  if (!rule) return true;

  const now = Date.now();
  if (!socketRateLimits.has(socketId)) {
    socketRateLimits.set(socketId, new Map());
  }
  const perEvent = socketRateLimits.get(socketId)!;

  const timestamps = perEvent.get(eventName) || [];
  // Remove entries outside the window
  const recent = timestamps.filter((t) => now - t < rule.windowMs);

  if (recent.length >= rule.maxPerWindow) {
    return false; // rate limited
  }

  recent.push(now);
  perEvent.set(eventName, recent);
  return true;
}

/** Clean up rate-limit tracking for a disconnected socket */
export function cleanupSocketRateLimits(socketId: string): void {
  socketRateLimits.delete(socketId);
}

/**
 * Register game event handlers on a socket
 */
export function registerGameHandlers(io: TypedServer, socket: TypedSocket): void {
  const data = socket.data as SocketData;

  /**
   * Create a new S.K.A.T.E. game
   */
  socket.on("game:create", async (spotId: string, maxPlayers: number = 4) => {
    if (!checkSocketRateLimit(socket.id, "game:create")) {
      socket.emit("error", { code: "rate_limited", message: "Too many requests, slow down" });
      return;
    }
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

      // Track socket-game association
      if (!socketGameMap.has(socket.id)) {
        socketGameMap.set(socket.id, new Set());
      }
      socketGameMap.get(socket.id)!.add(game.id);

      // Join game room
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

  /**
   * Join an existing game
   */
  socket.on("game:join", async (gameId: string) => {
    if (!checkSocketRateLimit(socket.id, "game:join")) {
      socket.emit("error", { code: "rate_limited", message: "Too many requests, slow down" });
      return;
    }
    try {
      const eventId = generateEventId("join", data.odv, gameId);

      const result = await joinGame({
        eventId,
        gameId,
        odv: data.odv,
      });

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

      // Track socket-game association
      if (!socketGameMap.has(socket.id)) {
        socketGameMap.set(socket.id, new Set());
      }
      socketGameMap.get(socket.id)!.add(gameId);

      // Join room
      await joinRoom(socket, "game", gameId);

      const payload: GameJoinedPayload = {
        gameId,
        odv: data.odv,
        playerCount: game.players.length,
      };

      // Broadcast to all players
      broadcastToRoom(io, "game", gameId, "game:joined", payload);

      // If game just started, broadcast turn info
      if (game.status === "active") {
        const turnPayload: GameTurnPayload = {
          gameId,
          currentPlayer: game.players[game.currentTurnIndex].odv,
          action: game.currentAction,
          timeLimit: 60, // 60 second timeout
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

  /**
   * Submit a trick
   */
  socket.on(
    "game:trick",
    async (input: { gameId: string; odv: string; trickName: string; clipUrl?: string }) => {
      if (!checkSocketRateLimit(socket.id, "game:trick")) {
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

        // Skip broadcast if already processed (idempotency)
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

        // Broadcast trick to all players
        broadcastToRoom(io, "game", input.gameId, "game:trick", trickPayload);

        // Check if game is completed
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
          // Broadcast next turn
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
    if (!checkSocketRateLimit(socket.id, "game:pass")) {
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

      // Skip broadcast if already processed (idempotency)
      if (result.alreadyProcessed) {
        return;
      }

      const game = result.game!;

      // Broadcast letter gained
      broadcastToRoom(io, "game", gameId, "game:letter", {
        gameId,
        odv: data.odv,
        letters: result.letterGained || "",
      });

      // Check if game is completed
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
        // Broadcast next turn
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
    if (!checkSocketRateLimit(socket.id, "game:forfeit")) {
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

      // Broadcast game ended
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

  /**
   * Reconnect to a game after disconnect
   */
  socket.on("game:reconnect", async (gameId: string) => {
    if (!checkSocketRateLimit(socket.id, "game:reconnect")) {
      socket.emit("error", { code: "rate_limited", message: "Too many requests, slow down" });
      return;
    }
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

      // Track socket-game association
      if (!socketGameMap.has(socket.id)) {
        socketGameMap.set(socket.id, new Set());
      }
      socketGameMap.get(socket.id)!.add(gameId);

      // Rejoin room
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

/**
 * Clean up game subscriptions on disconnect
 */
export async function cleanupGameSubscriptions(
  io: TypedServer,
  socket: TypedSocket
): Promise<void> {
  const data = socket.data as SocketData;
  const gameIds = socketGameMap.get(socket.id) || new Set();

  for (const gameId of gameIds) {
    try {
      await leaveRoom(socket, "game", gameId);

      // Notify game of disconnect
      const eventId = generateEventId("disconnect", data.odv, gameId);
      const result = await handleDisconnect({
        eventId,
        gameId,
        odv: data.odv,
      });

      if (result.success && result.game && !result.alreadyProcessed) {
        const game = result.game;

        // Notify other players
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

  // Clean up socket tracking
  socketGameMap.delete(socket.id);
}
