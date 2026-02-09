/**
 * Production-level integration tests for Presence Socket Handlers
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock dependencies
const mockGetRedisClient = vi.fn();

vi.mock("../../../redis", () => ({
  getRedisClient: mockGetRedisClient,
}));

vi.mock("../../../logger", () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Presence Socket Handlers Integration", () => {
  let mockSocket: any;
  let mockIo: any;
  let mockRedis: any;
  let eventHandlers: Map<string, Function>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset modules to clear in-memory fallback store
    vi.resetModules();

    eventHandlers = new Map();

    mockSocket = {
      id: "socket-123",
      data: { odv: "user-123" },
      on: vi.fn((event: string, handler: Function) => {
        eventHandlers.set(event, handler);
      }),
      emit: vi.fn(),
      join: vi.fn(),
      broadcast: {
        emit: vi.fn(),
      },
    };

    mockIo = {
      to: vi.fn().mockReturnThis(),
      emit: vi.fn(),
    };

    mockRedis = {
      hset: vi.fn().mockResolvedValue(undefined),
      hdel: vi.fn().mockResolvedValue(undefined),
      hget: vi.fn().mockResolvedValue(null),
      hkeys: vi.fn().mockResolvedValue([]),
      hvals: vi.fn().mockResolvedValue([]),
    };

    mockGetRedisClient.mockReturnValue(mockRedis);
  });

  describe("registerPresenceHandlers", () => {
    it("should join user's personal room", async () => {
      const { registerPresenceHandlers } = await import("../presence");
      registerPresenceHandlers(mockIo, mockSocket);

      expect(mockSocket.join).toHaveBeenCalledWith("user:user-123");
    });

    it("should mark user as online in Redis", async () => {
      const { registerPresenceHandlers } = await import("../presence");
      registerPresenceHandlers(mockIo, mockSocket);

      expect(mockRedis.hset).toHaveBeenCalledWith(
        "presence:users",
        "user-123",
        expect.stringContaining("online")
      );
    });

    it("should broadcast online status", async () => {
      const { registerPresenceHandlers } = await import("../presence");
      registerPresenceHandlers(mockIo, mockSocket);

      expect(mockSocket.broadcast.emit).toHaveBeenCalledWith("presence:update", {
        odv: "user-123",
        status: "online",
      });
    });

    it("should register presence:update handler", async () => {
      const { registerPresenceHandlers } = await import("../presence");
      registerPresenceHandlers(mockIo, mockSocket);

      expect(mockSocket.on).toHaveBeenCalledWith("presence:update", expect.any(Function));
    });

    it("should fallback to in-memory when Redis unavailable", async () => {
      mockGetRedisClient.mockReturnValueOnce(null);

      const { registerPresenceHandlers } = await import("../presence");
      registerPresenceHandlers(mockIo, mockSocket);

      expect(mockSocket.broadcast.emit).toHaveBeenCalledWith("presence:update", {
        odv: "user-123",
        status: "online",
      });
    });
  });

  describe("presence:update handler", () => {
    it("should update user status to away", async () => {
      const { registerPresenceHandlers } = await import("../presence");
      registerPresenceHandlers(mockIo, mockSocket);

      const updateHandler = eventHandlers.get("presence:update");
      await updateHandler!("away");

      expect(mockRedis.hset).toHaveBeenCalledWith(
        "presence:users",
        "user-123",
        expect.stringContaining("away")
      );
      expect(mockSocket.broadcast.emit).toHaveBeenCalledWith("presence:update", {
        odv: "user-123",
        status: "away",
      });
    });

    it("should update user status to online", async () => {
      const { registerPresenceHandlers } = await import("../presence");
      registerPresenceHandlers(mockIo, mockSocket);

      const updateHandler = eventHandlers.get("presence:update");
      await updateHandler!("online");

      expect(mockRedis.hset).toHaveBeenCalledWith(
        "presence:users",
        "user-123",
        expect.stringContaining("online")
      );
    });

    it("should handle Redis errors gracefully", async () => {
      mockRedis.hset.mockRejectedValueOnce(new Error("Redis error"));

      const { registerPresenceHandlers } = await import("../presence");
      registerPresenceHandlers(mockIo, mockSocket);

      const updateHandler = eventHandlers.get("presence:update");

      // Should not throw (function is synchronous but hset error is swallowed)
      expect(() => updateHandler!("away")).not.toThrow();
    });
  });

  describe("handlePresenceDisconnect", () => {
    it("should remove user from presence store", async () => {
      const { handlePresenceDisconnect } = await import("../presence");
      handlePresenceDisconnect(mockIo, mockSocket);

      expect(mockRedis.hdel).toHaveBeenCalledWith("presence:users", "user-123");
    });

    it("should broadcast offline status with lastSeen", async () => {
      const { handlePresenceDisconnect } = await import("../presence");
      handlePresenceDisconnect(mockIo, mockSocket);

      expect(mockSocket.broadcast.emit).toHaveBeenCalledWith("presence:update", {
        odv: "user-123",
        status: "offline",
        lastSeen: expect.any(String),
      });
    });

    it("should handle Redis errors gracefully", async () => {
      mockRedis.hdel.mockRejectedValue(new Error("Redis error"));

      const { handlePresenceDisconnect } = await import("../presence");

      // Should not throw
      expect(() => handlePresenceDisconnect(mockIo, mockSocket)).not.toThrow();
    });

    it("should use in-memory fallback when Redis unavailable", async () => {
      mockGetRedisClient.mockReturnValueOnce(null);

      const { registerPresenceHandlers, handlePresenceDisconnect } = await import("../presence");

      // First register (adds to in-memory)
      registerPresenceHandlers(mockIo, mockSocket);

      // Then disconnect (removes from in-memory)
      handlePresenceDisconnect(mockIo, mockSocket);

      expect(mockSocket.broadcast.emit).toHaveBeenCalledWith(
        "presence:update",
        expect.objectContaining({
          status: "offline",
        })
      );
    });
  });

  describe("getOnlineUsers", () => {
    it("should return online users from Redis", async () => {
      mockRedis.hkeys.mockResolvedValue(["user-1", "user-2", "user-3"]);

      const { getOnlineUsers } = await import("../presence");
      const users = await getOnlineUsers();

      expect(users).toEqual(["user-1", "user-2", "user-3"]);
      expect(mockRedis.hkeys).toHaveBeenCalledWith("presence:users");
    });

    it("should fallback to in-memory when Redis unavailable", async () => {
      // Mock Redis as unavailable for ALL calls in this test
      mockGetRedisClient.mockReturnValue(null);

      const { registerPresenceHandlers, getOnlineUsers } = await import("../presence");

      // Add a user to in-memory store
      registerPresenceHandlers(mockIo, mockSocket);

      const users = await getOnlineUsers();
      expect(users).toContain("user-123");

      // Restore Redis mock for other tests
      mockGetRedisClient.mockReturnValue(mockRedis);
    });

    it("should handle Redis errors gracefully", async () => {
      mockRedis.hkeys.mockRejectedValueOnce(new Error("Redis error"));

      const { getOnlineUsers } = await import("../presence");
      const users = await getOnlineUsers();

      // Should fallback to in-memory (which might have users from previous tests)
      expect(Array.isArray(users)).toBe(true);
    });
  });

  describe("isUserOnline", () => {
    it("should return true for online user in Redis", async () => {
      mockRedis.hget.mockResolvedValue(
        JSON.stringify({
          status: "online",
          lastSeen: new Date().toISOString(),
        })
      );

      const { isUserOnline } = await import("../presence");
      const online = await isUserOnline("user-456");

      expect(online).toBe(true);
      expect(mockRedis.hget).toHaveBeenCalledWith("presence:users", "user-456");
    });

    it("should return false for offline user", async () => {
      mockRedis.hget.mockResolvedValue(null);

      const { isUserOnline } = await import("../presence");
      const online = await isUserOnline("user-789");

      expect(online).toBe(false);
    });

    it("should check in-memory when Redis unavailable", async () => {
      mockGetRedisClient.mockReturnValue(null);

      const { registerPresenceHandlers, isUserOnline } = await import("../presence");

      // Add user to in-memory
      registerPresenceHandlers(mockIo, mockSocket);

      const online = await isUserOnline("user-123");
      expect(online).toBe(true);

      mockGetRedisClient.mockReturnValue(mockRedis);
    });

    it("should handle Redis errors gracefully", async () => {
      mockRedis.hget.mockRejectedValue(new Error("Redis error"));

      const { isUserOnline } = await import("../presence");
      const online = await isUserOnline("user-456");

      expect(online).toBe(false);
    });
  });

  describe("getUserPresence", () => {
    it("should return user presence from Redis", async () => {
      mockRedis.hget.mockResolvedValue(
        JSON.stringify({
          status: "online",
          lastSeen: "2024-01-01T00:00:00Z",
        })
      );

      const { getUserPresence } = await import("../presence");
      const presence = await getUserPresence("user-456");

      expect(presence).toEqual({
        odv: "user-456",
        status: "online",
        lastSeen: "2024-01-01T00:00:00Z",
      });
    });

    it("should return null for offline user", async () => {
      mockRedis.hget.mockResolvedValue(null);

      const { getUserPresence } = await import("../presence");
      const presence = await getUserPresence("user-789");

      expect(presence).toBeNull();
    });

    it("should return away status", async () => {
      mockRedis.hget.mockResolvedValue(
        JSON.stringify({
          status: "away",
          lastSeen: "2024-01-01T00:00:00Z",
        })
      );

      const { getUserPresence } = await import("../presence");
      const presence = await getUserPresence("user-456");

      expect(presence?.status).toBe("away");
    });

    it("should fallback to in-memory when Redis unavailable", async () => {
      mockGetRedisClient.mockReturnValue(null);

      const { registerPresenceHandlers, getUserPresence } = await import("../presence");

      registerPresenceHandlers(mockIo, mockSocket);

      const presence = await getUserPresence("user-123");
      expect(presence).toEqual({
        odv: "user-123",
        status: "online",
        lastSeen: expect.any(String),
      });

      mockGetRedisClient.mockReturnValue(mockRedis);
    });

    it("should handle Redis errors gracefully", async () => {
      mockRedis.hget.mockRejectedValue(new Error("Redis error"));

      const { getUserPresence } = await import("../presence");
      const presence = await getUserPresence("user-456");

      expect(presence).toBeNull();
    });
  });

  describe("getPresenceStats", () => {
    it("should return presence stats from Redis", async () => {
      mockRedis.hvals.mockResolvedValue([
        JSON.stringify({ status: "online", lastSeen: "2024-01-01T00:00:00Z" }),
        JSON.stringify({ status: "online", lastSeen: "2024-01-01T00:00:00Z" }),
        JSON.stringify({ status: "away", lastSeen: "2024-01-01T00:00:00Z" }),
      ]);

      const { getPresenceStats } = await import("../presence");
      const stats = await getPresenceStats();

      expect(stats).toEqual({
        online: 2,
        away: 1,
      });
    });

    it("should handle malformed entries in Redis", async () => {
      mockRedis.hvals.mockResolvedValue([
        JSON.stringify({ status: "online", lastSeen: "2024-01-01T00:00:00Z" }),
        "invalid-json",
        JSON.stringify({ status: "away", lastSeen: "2024-01-01T00:00:00Z" }),
      ]);

      const { getPresenceStats } = await import("../presence");
      const stats = await getPresenceStats();

      expect(stats.online).toBe(1);
      expect(stats.away).toBe(1);
    });

    it("should fallback to in-memory when Redis unavailable", async () => {
      mockGetRedisClient.mockReturnValue(null);

      const { registerPresenceHandlers, getPresenceStats } = await import("../presence");

      registerPresenceHandlers(mockIo, mockSocket);

      const stats = await getPresenceStats();
      expect(stats.online).toBeGreaterThanOrEqual(1);

      mockGetRedisClient.mockReturnValue(mockRedis);
    });

    it("should handle Redis errors gracefully", async () => {
      mockRedis.hvals.mockRejectedValueOnce(new Error("Redis error"));

      const { getPresenceStats } = await import("../presence");
      const stats = await getPresenceStats();

      // Should fallback to in-memory (which might have users from previous tests)
      expect(stats).toHaveProperty("online");
      expect(stats).toHaveProperty("away");
      expect(typeof stats.online).toBe("number");
      expect(typeof stats.away).toBe("number");
    });
  });

  describe("Redis Fallback Behavior", () => {
    it("should use in-memory store when Redis is null", async () => {
      mockGetRedisClient.mockReturnValue(null);

      const { registerPresenceHandlers, isUserOnline } = await import("../presence");

      registerPresenceHandlers(mockIo, mockSocket);

      const online = await isUserOnline("user-123");
      expect(online).toBe(true);

      mockGetRedisClient.mockReturnValue(mockRedis);
    });

    it("should switch to in-memory on Redis errors", async () => {
      mockRedis.hset.mockRejectedValueOnce(new Error("Redis down"));

      const { registerPresenceHandlers } = await import("../presence");

      // Should not throw
      expect(() => registerPresenceHandlers(mockIo, mockSocket)).not.toThrow();
    });
  });

  describe("Timestamp Handling", () => {
    it("should include timestamp in presence data", async () => {
      const { registerPresenceHandlers } = await import("../presence");
      registerPresenceHandlers(mockIo, mockSocket);

      const setCall = mockRedis.hset.mock.calls[0];
      let presenceData;
      try {
        presenceData = JSON.parse(setCall[2]);
      } catch (error) {
        throw new Error(`Failed to parse presence data: ${error}`);
      }

      expect(presenceData).toHaveProperty("lastSeen");
      expect(new Date(presenceData.lastSeen).getTime()).toBeGreaterThan(0);
    });

    it("should update timestamp on status change", async () => {
      const { registerPresenceHandlers } = await import("../presence");
      registerPresenceHandlers(mockIo, mockSocket);

      const updateHandler = eventHandlers.get("presence:update");
      await updateHandler!("away");

      const lastCall = mockRedis.hset.mock.calls[mockRedis.hset.mock.calls.length - 1];
      let presenceData;
      try {
        presenceData = JSON.parse(lastCall[2]);
      } catch (error) {
        throw new Error(`Failed to parse presence data: ${error}`);
      }

      expect(presenceData.lastSeen).toBeDefined();
    });
  });

  describe("Concurrent Users", () => {
    it("should track multiple users simultaneously", async () => {
      const socket1 = { ...mockSocket, data: { odv: "user-1" }, id: "socket-1" };
      const socket2 = { ...mockSocket, data: { odv: "user-2" }, id: "socket-2" };

      const { registerPresenceHandlers, getOnlineUsers } = await import("../presence");

      registerPresenceHandlers(mockIo, socket1);
      registerPresenceHandlers(mockIo, socket2);

      mockRedis.hkeys.mockResolvedValue(["user-1", "user-2"]);

      const users = await getOnlineUsers();
      expect(users.length).toBeGreaterThanOrEqual(2);
    });
  });
});
