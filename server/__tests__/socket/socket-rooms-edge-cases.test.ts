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

const { joinRoom, leaveRoom, cleanupEmptyRooms } = await import("../../socket/rooms");
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
