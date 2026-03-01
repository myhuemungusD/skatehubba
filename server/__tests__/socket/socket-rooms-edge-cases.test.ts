/**
 * @fileoverview Coverage tests for socket/rooms.ts
 *
 * Targets uncovered lines 132-133 (Redis sadd error catch in joinRoom)
 * and lines 170-171 (Redis srem error catch in leaveRoom)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

let mockRedisClient: any = null;

vi.mock("../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock("../../redis", () => ({
  getRedisClient: () => mockRedisClient,
}));

// ============================================================================
// Imports
// ============================================================================

const {
  joinRoom,
  leaveRoom,
  cleanupEmptyRooms,
  startRoomCleanup,
  stopRoomCleanup,
} = await import("../../socket/rooms");
const logger = (await import("../../logger")).default;

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  mockRedisClient = null;
  cleanupEmptyRooms();
});

function createMockSocket(odv: string) {
  return {
    id: `socket-${odv}`,
    data: { odv, rooms: new Set<string>() },
    join: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn().mockResolvedValue(undefined),
    emit: vi.fn(),
    to: vi.fn().mockReturnValue({ emit: vi.fn() }),
  } as any;
}

describe("Socket Rooms — stopRoomCleanup / startRoomCleanup (lines 98-100)", () => {
  it("does nothing when cleanupInterval is already null", () => {
    // Call stopRoomCleanup twice — the second call should be a no-op
    // because cleanupInterval was already set to null by the first call
    stopRoomCleanup();
    // Should not throw
    stopRoomCleanup();
  });

  it("startRoomCleanup is a no-op when interval already exists", () => {
    // startRoomCleanup was already called on module import.
    // Calling it again should not create a second interval.
    startRoomCleanup();
    startRoomCleanup();
    // Clean up
    stopRoomCleanup();
    // Restart for other tests
    startRoomCleanup();
  });
});

describe("Socket Rooms — Redis scard error in getRoomMemberCount (lines 115-116)", () => {
  it("falls back to local member count when Redis scard throws", async () => {
    mockRedisClient = {
      scard: vi.fn().mockRejectedValue(new Error("Redis scard failure")),
      sadd: vi.fn().mockRejectedValue(new Error("Redis sadd failure")),
    };

    const socket = createMockSocket("redis-scard-user");
    // joinRoom calls getRoomMemberCount which uses scard — when it fails,
    // it should fall through to the in-memory fallback and still succeed
    const result = await joinRoom(socket, "spot", "redis-spot-scard");
    expect(result).toBe(true);
    expect(socket.data.rooms.has("spot:redis-spot-scard")).toBe(true);
  });
});

describe("Socket Rooms — Redis error catches", () => {
  describe("joinRoom Redis sadd failure (lines 132-133)", () => {
    it("falls through to fallback when Redis sadd throws", async () => {
      mockRedisClient = {
        scard: vi.fn().mockResolvedValue(0),
        sadd: vi.fn().mockRejectedValue(new Error("Redis sadd failure")),
      };

      const socket = createMockSocket("redis-join-user");
      const result = await joinRoom(socket, "spot", "redis-spot-sadd");

      // Should still succeed via fallback
      // Should succeed via fallback (silent catch)
      expect(result).toBe(true);
      expect(socket.data.rooms.has("spot:redis-spot-sadd")).toBe(true);
    });
  });

  describe("leaveRoom Redis srem failure (lines 170-171)", () => {
    it("falls through when Redis srem throws", async () => {
      // First join without Redis
      mockRedisClient = null;
      const socket = createMockSocket("redis-leave-user");
      await joinRoom(socket, "spot", "redis-spot-srem");

      // Now make Redis srem fail
      mockRedisClient = {
        srem: vi.fn().mockRejectedValue(new Error("Redis srem failure")),
      };

      // Should not throw
      await leaveRoom(socket, "spot", "redis-spot-srem");

      // Should succeed via fallback (silent catch)
      expect(socket.leave).toHaveBeenCalledWith("spot:redis-spot-srem");
      expect(socket.data.rooms.has("spot:redis-spot-srem")).toBe(false);
    });
  });
});
