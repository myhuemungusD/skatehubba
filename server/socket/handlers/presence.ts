/**
 * Presence Handler
 *
 * Tracks user online/offline status across the platform.
 */

import type { Server, Socket } from "socket.io";
import logger from "../../logger";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  PresencePayload,
} from "../types";

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

// Online users (move to Redis for horizontal scaling)
const onlineUsers = new Map<string, { status: "online" | "away"; lastSeen: Date }>();

/**
 * Get all online users
 */
export function getOnlineUsers(): string[] {
  return Array.from(onlineUsers.keys());
}

/**
 * Check if user is online
 */
export function isUserOnline(odv: string): boolean {
  return onlineUsers.has(odv);
}

/**
 * Get user presence
 */
export function getUserPresence(odv: string): PresencePayload | null {
  const presence = onlineUsers.get(odv);
  if (!presence) return null;

  return {
    odv,
    status: presence.status,
    lastSeen: presence.lastSeen.toISOString(),
  };
}

/**
 * Register presence handlers
 */
export function registerPresenceHandlers(_io: TypedServer, socket: TypedSocket): void {
  const data = socket.data as SocketData;

  // Join user's personal room for direct messages
  socket.join(`user:${data.odv}`);

  // Mark user as online
  onlineUsers.set(data.odv, { status: "online", lastSeen: new Date() });

  // Broadcast presence update
  const presencePayload: PresencePayload = {
    odv: data.odv,
    status: "online",
  };

  // Broadcast to all connected clients (or just friends in production)
  socket.broadcast.emit("presence:update", presencePayload);

  // Handle status updates
  socket.on("presence:update", (status: "online" | "away") => {
    const existing = onlineUsers.get(data.odv);
    if (existing) {
      existing.status = status;
      existing.lastSeen = new Date();
    }

    socket.broadcast.emit("presence:update", {
      odv: data.odv,
      status,
    });

    logger.debug("[Presence] Status updated", { odv: data.odv, status });
  });
}

/**
 * Handle user disconnect
 */
export function handlePresenceDisconnect(_io: TypedServer, socket: TypedSocket): void {
  const data = socket.data as SocketData;

  // Mark offline
  onlineUsers.delete(data.odv);

  // Broadcast offline status
  socket.broadcast.emit("presence:update", {
    odv: data.odv,
    status: "offline",
    lastSeen: new Date().toISOString(),
  });

  logger.debug("[Presence] User disconnected", { odv: data.odv });
}

/**
 * Get presence stats
 */
export function getPresenceStats(): {
  online: number;
  away: number;
} {
  let online = 0;
  let away = 0;

  for (const presence of onlineUsers.values()) {
    if (presence.status === "online") online++;
    else away++;
  }

  return { online, away };
}
