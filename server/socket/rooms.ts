/**
 * Socket Room Manager
 *
 * Handles room subscriptions with validation and cleanup.
 * Supports battle rooms, game rooms, spot rooms, and global broadcasts.
 *
 * Uses Redis Sets for room membership (shared across instances).
 * Falls back to in-memory Maps when Redis is unavailable.
 */

import type { Server, Socket } from "socket.io";
import logger from "../logger";
import type {
  RoomType,
  RoomInfo,
  SocketData,
  ServerToClientEvents,
  ClientToServerEvents,
} from "./types";
import { getRedisClient } from "../redis";

type BroadcastEmitter = {
  emit(event: string, ...args: unknown[]): void;
};

const ROOM_KEY_PREFIX = "room:";

// Fallback active rooms registry
const roomsFallback = new Map<string, RoomInfo>();

// Room size limits
const ROOM_LIMITS: Record<RoomType, number> = {
  battle: 2, // 1v1 battles
  game: 8, // S.K.A.T.E. can have up to 8 players
  spot: 100, // Spot chat/activity
  global: Infinity, // No limit for global broadcasts
};

/**
 * Generate room ID from type and id
 */
export function getRoomId(type: RoomType, id: string): string {
  return `${type}:${id}`;
}

/**
 * Parse room ID back to type and id
 */
export function parseRoomId(roomId: string): { type: RoomType; id: string } | null {
  const [type, ...rest] = roomId.split(":");
  const id = rest.join(":");
  if (!type || !id) return null;
  return { type: type as RoomType, id };
}

/**
 * Get or create a room (fallback)
 */
function getOrCreateRoomFallback(type: RoomType, id: string): RoomInfo {
  const roomId = getRoomId(type, id);
  let room = roomsFallback.get(roomId);

  if (!room) {
    room = {
      type,
      id,
      members: new Set(),
      createdAt: new Date(),
    };
    roomsFallback.set(roomId, room);
  }

  return room;
}

/**
 * Clean up empty rooms
 */
export function cleanupEmptyRooms(): void {
  for (const [roomId, room] of roomsFallback.entries()) {
    if (room.members.size === 0) {
      roomsFallback.delete(roomId);
      logger.debug("[Socket] Cleaned up empty room", { roomId });
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupEmptyRooms, 5 * 60 * 1000);

/**
 * Get room member count
 */
async function getRoomMemberCount(roomId: string): Promise<number> {
  const redis = getRedisClient();
  if (redis) {
    try {
      return await redis.scard(`${ROOM_KEY_PREFIX}${roomId}`);
    } catch {
      /* fall through */
    }
  }
  const room = roomsFallback.get(roomId);
  return room?.members.size ?? 0;
}

/**
 * Join a room
 */
export async function joinRoom(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  type: RoomType,
  id: string
): Promise<boolean> {
  const data = socket.data as SocketData;
  const roomId = getRoomId(type, id);

  // Check room capacity
  const memberCount = await getRoomMemberCount(roomId);
  if (memberCount >= ROOM_LIMITS[type]) {
    logger.warn("[Socket] Room full", { roomId, odv: data.odv });
    socket.emit("error", { code: "room_full", message: "This room is full" });
    return false;
  }

  // Join socket.io room
  await socket.join(roomId);

  // Track membership in Redis
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.sadd(`${ROOM_KEY_PREFIX}${roomId}`, data.odv);
    } catch {
      /* fall through to fallback */
    }
  }

  // Always track in fallback for local stats
  const room = getOrCreateRoomFallback(type, id);
  room.members.add(data.odv);
  data.rooms.add(roomId);

  logger.info("[Socket] Joined room", {
    roomId,
    odv: data.odv,
    memberCount: memberCount + 1,
  });

  return true;
}

/**
 * Leave a room
 */
export async function leaveRoom(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  type: RoomType,
  id: string
): Promise<void> {
  const data = socket.data as SocketData;
  const roomId = getRoomId(type, id);

  // Leave socket.io room
  await socket.leave(roomId);

  // Update Redis tracking
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.srem(`${ROOM_KEY_PREFIX}${roomId}`, data.odv);
    } catch {
      /* fall through */
    }
  }

  // Update fallback tracking
  const room = roomsFallback.get(roomId);
  if (room) {
    room.members.delete(data.odv);
  }
  data.rooms.delete(roomId);

  logger.info("[Socket] Left room", {
    roomId,
    odv: data.odv,
    memberCount: room?.members.size ?? 0,
  });
}

/**
 * Leave all rooms (on disconnect)
 */
export async function leaveAllRooms(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>
): Promise<void> {
  const data = socket.data as SocketData;

  for (const roomId of data.rooms) {
    const parsed = parseRoomId(roomId);
    if (parsed) {
      await leaveRoom(socket, parsed.type, parsed.id);
    }
  }
}

/**
 * Broadcast to a room (excluding sender)
 */
export function broadcastToRoom<E extends keyof ServerToClientEvents>(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  type: RoomType,
  id: string,
  event: E,
  data: Parameters<ServerToClientEvents[E]>[0],
  excludeSocket?: Socket
): void {
  const roomId = getRoomId(type, id);

  if (excludeSocket) {
    // Type assertion needed due to Socket.io generic constraints

    (excludeSocket.to(roomId) as unknown as BroadcastEmitter).emit(event as string, data);
  } else {
    (io.to(roomId) as unknown as BroadcastEmitter).emit(event as string, data);
  }
}

/**
 * Send to a specific user (by userId)
 */
export function sendToUser<E extends keyof ServerToClientEvents>(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  odv: string,
  event: E,
  data: Parameters<ServerToClientEvents[E]>[0]
): void {
  // User's personal room is their ID

  (io.to(`user:${odv}`) as unknown as BroadcastEmitter).emit(event as string, data);
}

/**
 * Get room info
 */
export function getRoomInfo(type: RoomType, id: string): RoomInfo | undefined {
  return roomsFallback.get(getRoomId(type, id));
}

/**
 * Get all rooms of a type
 */
export function getRoomsByType(type: RoomType): RoomInfo[] {
  return Array.from(roomsFallback.values()).filter((r) => r.type === type);
}

/**
 * Get stats for monitoring
 */
export function getRoomStats(): {
  totalRooms: number;
  totalMembers: number;
  byType: Record<RoomType, number>;
} {
  const byType: Record<RoomType, number> = {
    battle: 0,
    game: 0,
    spot: 0,
    global: 0,
  };

  let totalMembers = 0;

  for (const room of roomsFallback.values()) {
    byType[room.type]++;
    totalMembers += room.members.size;
  }

  return {
    totalRooms: roomsFallback.size,
    totalMembers,
    byType,
  };
}
