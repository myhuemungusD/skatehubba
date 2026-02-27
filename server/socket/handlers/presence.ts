/**
 * Presence Handler
 *
 * Tracks user online/offline status across the platform.
 * Uses Redis Hash for shared presence state across instances.
 * Falls back to in-memory Map when Redis is unavailable.
 */

import type { Server, Socket } from "socket.io";
import logger from "../../logger";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  PresencePayload,
} from "../types";
import { getRedisClient } from "../../redis";

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

const PRESENCE_HASH = "presence:users";

// Fallback in-memory store when Redis is unavailable
const onlineUsersFallback = new Map<string, { status: "online" | "away"; lastSeen: Date }>();

/**
 * Get all online users
 */
export async function getOnlineUsers(): Promise<string[]> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const all = await redis.hkeys(PRESENCE_HASH);
      return all;
    } catch (error) {
      logger.warn("[Presence] Redis hkeys failed, falling back to memory", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return Array.from(onlineUsersFallback.keys());
}

/**
 * Check if user is online
 */
export async function isUserOnline(odv: string): Promise<boolean> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const val = await redis.hget(PRESENCE_HASH, odv);
      return val !== null;
    } catch (error) {
      logger.warn("[Presence] Redis hget failed in isUserOnline, falling back to memory", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return onlineUsersFallback.has(odv);
}

/**
 * Get user presence
 */
export async function getUserPresence(odv: string): Promise<PresencePayload | null> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const val = await redis.hget(PRESENCE_HASH, odv);
      if (!val) return null;
      const parsed = JSON.parse(val) as { status: "online" | "away"; lastSeen: string };
      return { odv, status: parsed.status, lastSeen: parsed.lastSeen };
    } catch (error) {
      logger.warn("[Presence] Redis hget/parse failed in getUserPresence, falling back to memory", {
        odv,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const presence = onlineUsersFallback.get(odv);
  if (!presence) return null;

  return {
    odv,
    status: presence.status,
    lastSeen: presence.lastSeen.toISOString(),
  };
}

/**
 * Set user presence in store
 */
function setPresence(odv: string, status: "online" | "away"): void {
  const now = new Date();
  const redis = getRedisClient();

  if (redis) {
    const val = JSON.stringify({ status, lastSeen: now.toISOString() });
    redis.hset(PRESENCE_HASH, odv, val).catch((error: unknown) => {
      logger.warn("[Presence] Redis hset failed for presence update", {
        odv,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  } else {
    onlineUsersFallback.set(odv, { status, lastSeen: now });
  }
}

/**
 * Remove user presence from store
 */
function removePresence(odv: string): void {
  const redis = getRedisClient();
  if (redis) {
    redis.hdel(PRESENCE_HASH, odv).catch((error: unknown) => {
      logger.warn("[Presence] Redis hdel failed for presence removal", {
        odv,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  } else {
    onlineUsersFallback.delete(odv);
  }
}

/**
 * Register presence handlers
 */
export function registerPresenceHandlers(_io: TypedServer, socket: TypedSocket): void {
  const data = socket.data as SocketData;

  // Join user's personal room for direct messages
  socket.join(`user:${data.odv}`);

  // Mark user as online
  setPresence(data.odv, "online");

  // Broadcast presence update
  const presencePayload: PresencePayload = {
    odv: data.odv,
    status: "online",
  };

  // L5: Broadcast presence only to rooms the user is in (not globally)
  // This prevents leaking online status to arbitrary users
  for (const room of socket.rooms) {
    if (room !== socket.id) {
      socket.to(room).emit("presence:update", presencePayload);
    }
  }

  // Handle status updates
  socket.on("presence:update", (status: "online" | "away") => {
    setPresence(data.odv, status);

    // L5: Scope broadcast to user's joined rooms only
    for (const room of socket.rooms) {
      if (room !== socket.id) {
        socket.to(room).emit("presence:update", { odv: data.odv, status });
      }
    }

    logger.debug("[Presence] Status updated", { odv: data.odv, status });
  });
}

/**
 * Handle user disconnect
 */
export function handlePresenceDisconnect(_io: TypedServer, socket: TypedSocket): void {
  const data = socket.data as SocketData;

  // Mark offline
  removePresence(data.odv);

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
export async function getPresenceStats(): Promise<{
  online: number;
  away: number;
}> {
  const redis = getRedisClient();

  if (redis) {
    try {
      const all = await redis.hvals(PRESENCE_HASH);
      let online = 0;
      let away = 0;
      for (const val of all) {
        try {
          const parsed = JSON.parse(val) as { status: string };
          if (parsed.status === "online") online++;
          else away++;
        } catch (error) {
          logger.warn("[Presence] Malformed presence entry in Redis", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return { online, away };
    } catch (error) {
      logger.warn("[Presence] Redis hvals failed in getPresenceStats, falling back to memory", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let online = 0;
  let away = 0;

  for (const presence of onlineUsersFallback.values()) {
    if (presence.status === "online") online++;
    else away++;
  }

  return { online, away };
}
