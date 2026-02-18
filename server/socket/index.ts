/**
 * Socket.io Server Setup
 *
 * Enterprise-grade WebSocket infrastructure with:
 * - Firebase authentication
 * - Room-based event routing
 * - Rate limiting
 * - Graceful shutdown
 * - Monitoring/metrics
 * - Health monitoring
 * - Input validation
 */

import { Server as HttpServer } from "http";
import { Server } from "socket.io";
import logger from "../logger";
import { socketAuthMiddleware } from "./auth";
import { joinRoom, leaveRoom, leaveAllRooms, getRoomStats } from "./rooms";
import { registerBattleHandlers, cleanupBattleSubscriptions } from "./handlers/battle";
import { registerGameHandlers, cleanupGameSubscriptions } from "./handlers/game";
import { cleanupRateLimits } from "./socketRateLimit";
import {
  registerPresenceHandlers,
  handlePresenceDisconnect,
  getPresenceStats,
} from "./handlers/presence";
import {
  initSocketHealth,
  cleanupSocketHealth,
  startHealthMonitor,
  stopHealthMonitor,
  getHealthStats,
} from "./health";
import { startTimeoutScheduler, stopTimeoutScheduler } from "../services/timeoutScheduler";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "./types";
import {
  SOCKET_PING_TIMEOUT_MS,
  SOCKET_PING_INTERVAL_MS,
  SOCKET_UPGRADE_TIMEOUT_MS,
  SOCKET_MAX_HTTP_BUFFER_SIZE,
  SOCKET_MAX_DISCONNECTION_DURATION_MS,
} from "../config/constants";

// Re-export types for convenience
export type { ClientToServerEvents, ServerToClientEvents, SocketData } from "./types";

// Track connected sockets for metrics
let connectedSockets = 0;
let healthMonitorInterval: NodeJS.Timeout | null = null;

/**
 * Initialize Socket.io server
 */
export function initializeSocketServer(
  httpServer: HttpServer
): Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    {
      cors: {
        origin:
          process.env.ALLOWED_ORIGINS?.split(",") ||
          (process.env.NODE_ENV === "production" ? false : "*"),
        credentials: true,
      },
      // Transport options
      transports: ["websocket", "polling"],
      // Ping settings for connection health
      pingTimeout: SOCKET_PING_TIMEOUT_MS,
      pingInterval: SOCKET_PING_INTERVAL_MS,
      // Upgrade timeout
      upgradeTimeout: SOCKET_UPGRADE_TIMEOUT_MS,
      // Max HTTP buffer size
      maxHttpBufferSize: SOCKET_MAX_HTTP_BUFFER_SIZE,
      // Connection state recovery (for reconnections)
      connectionStateRecovery: {
        maxDisconnectionDuration: SOCKET_MAX_DISCONNECTION_DURATION_MS,
        skipMiddlewares: false,
      },
    }
  );

  // Authentication middleware
  io.use(socketAuthMiddleware);

  // Start health monitor
  healthMonitorInterval = startHealthMonitor(io);

  // Start timeout scheduler for game/battle timeouts
  startTimeoutScheduler();

  // Connection handler
  io.on("connection", async (socket) => {
    connectedSockets++;
    const data = socket.data as SocketData;

    // Initialize health tracking
    initSocketHealth(socket);

    logger.info("[Socket] Client connected", {
      socketId: socket.id,
      odv: data.odv,
      transport: socket.conn.transport.name,
      totalConnections: connectedSockets,
    });

    // Send connection confirmation
    socket.emit("connected", {
      userId: data.odv,
      serverTime: new Date().toISOString(),
    });

    // Register feature handlers
    registerPresenceHandlers(io, socket);
    registerBattleHandlers(io, socket);
    registerGameHandlers(io, socket);

    // Room management
    socket.on(
      "room:join",
      async (roomType: "battle" | "game" | "spot" | "global", roomId: string) => {
        await joinRoom(socket, roomType, roomId);
      }
    );

    socket.on(
      "room:leave",
      async (roomType: "battle" | "game" | "spot" | "global", roomId: string) => {
        await leaveRoom(socket, roomType, roomId);
      }
    );

    // Typing indicators
    socket.on("typing", (roomId: string, isTyping: boolean) => {
      socket.to(roomId).emit("typing", {
        odv: data.odv,
        roomId,
        isTyping,
      });
    });

    // Handle disconnection
    socket.on("disconnect", async (reason: string) => {
      connectedSockets--;

      logger.info("[Socket] Client disconnected", {
        socketId: socket.id,
        odv: data.odv,
        reason,
        totalConnections: connectedSockets,
      });

      // Cleanup subscriptions
      await cleanupBattleSubscriptions(socket);
      await cleanupGameSubscriptions(io, socket);
      await leaveAllRooms(socket);
      handlePresenceDisconnect(io, socket);
      cleanupSocketHealth(socket.id);
      cleanupRateLimits(socket.id);
    });

    // Error handling
    socket.on("error", (error: Error) => {
      logger.error("[Socket] Socket error", {
        socketId: socket.id,
        odv: data.odv,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    });
  });

  // Engine-level error handling
  io.engine.on("connection_error", (err: { code: number; message: string; context?: unknown }) => {
    logger.error("[Socket] Connection error", {
      code: err.code,
      message: err.message,
      context: err.context,
    });
  });

  if (!process.env.ALLOWED_ORIGINS && process.env.NODE_ENV === "production") {
    logger.warn(
      "[Socket] ALLOWED_ORIGINS is not set — all WebSocket connections will be rejected in production. " +
        "Set ALLOWED_ORIGINS to a comma-separated list of allowed origins."
    );
  }

  logger.info("[Socket] Server initialized", {
    transports: ["websocket", "polling"],
  });

  return io;
}

/**
 * Get socket server stats for monitoring
 */
export async function getSocketStats(): Promise<{
  connections: number;
  rooms: ReturnType<typeof getRoomStats>;
  presence: Awaited<ReturnType<typeof getPresenceStats>>;
  health: ReturnType<typeof getHealthStats>;
}> {
  return {
    connections: connectedSockets,
    rooms: getRoomStats(),
    presence: await getPresenceStats(),
    health: getHealthStats(),
  };
}

/**
 * Broadcast system notification to all users
 */
export function broadcastSystemNotification(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  title: string,
  message: string
): void {
  io.emit("notification", {
    id: `system-${Date.now()}`,
    type: "system",
    title,
    message,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Graceful shutdown
 */
export async function shutdownSocketServer(
  io: Server<ClientToServerEvents, ServerToClientEvents>
): Promise<void> {
  logger.info("[Socket] Shutting down...");

  // Stop health monitor
  if (healthMonitorInterval) {
    stopHealthMonitor(healthMonitorInterval);
    healthMonitorInterval = null;
  }

  // Stop timeout scheduler
  stopTimeoutScheduler();

  // Notify all clients
  broadcastSystemNotification(
    io,
    "Server Maintenance",
    "Server is restarting. You will be reconnected shortly."
  );

  // Wait a moment for message to send
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Disconnect all sockets
  const sockets = await io.fetchSockets();
  for (const socket of sockets) {
    socket.disconnect(true);
  }

  // Close the server
  await new Promise<void>((resolve) => {
    io.close(() => {
      logger.info("[Socket] Server closed");
      resolve();
    });
  });
}
