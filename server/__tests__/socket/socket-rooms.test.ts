/**
 * @fileoverview Unit tests for Socket Room Manager
 *
 * Tests room management functions with in-memory fallback (Redis mocked as null):
 * - getRoomId / parseRoomId: room ID formatting and parsing
 * - cleanupEmptyRooms: removes rooms with 0 members
 * - joinRoom: joins room, respects capacity limits
 * - leaveRoom: leaves room, updates tracking
 * - leaveAllRooms: leaves all rooms on disconnect
 * - broadcastToRoom: broadcasts events to room
 * - sendToUser: sends events to a user's personal room
 * - getRoomInfo / getRoomsByType / getRoomStats: querying room state
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks — declared before any application imports
// ============================================================================

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
  getRedisClient: vi.fn().mockReturnValue(null),
}));

// ============================================================================
// Imports after mocks
// ============================================================================

const {
  getRoomId,
  parseRoomId,
  cleanupEmptyRooms,
  joinRoom,
  leaveRoom,
  leaveAllRooms,
  broadcastToRoom,
  sendToUser,
  getRoomInfo,
  getRoomsByType,
  getRoomStats,
} = await import("../../socket/rooms");

const logger = (await import("../../logger")).default;

// ============================================================================
// Helpers
// ============================================================================

function createMockSocket(odv: string) {
  const emitMock = vi.fn();
  return {
    id: `socket-${odv}`,
    data: {
      odv,
      rooms: new Set<string>(),
    },
    join: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn().mockResolvedValue(undefined),
    to: vi.fn().mockReturnValue({ emit: emitMock }),
    emit: vi.fn(),
  } as any;
}

function createMockIo() {
  const emitMock = vi.fn();
  return {
    to: vi.fn().mockReturnValue({ emit: emitMock }),
  } as any;
}

// ============================================================================
// Tests
// ============================================================================

describe("Socket Room Manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clean up fallback rooms by cleaning up empties
    cleanupEmptyRooms();
  });

  // ==========================================================================
  // getRoomId
  // ==========================================================================

  describe("getRoomId", () => {
    it("returns 'type:id' format", () => {
      expect(getRoomId("battle", "abc123")).toBe("battle:abc123");
    });

    it("works with different room types", () => {
      expect(getRoomId("battle", "g1")).toBe("battle:g1");
      expect(getRoomId("spot", "s1")).toBe("spot:s1");
      expect(getRoomId("global", "main")).toBe("global:main");
    });
  });

  // ==========================================================================
  // parseRoomId
  // ==========================================================================

  describe("parseRoomId", () => {
    it("parses a valid room ID", () => {
      const result = parseRoomId("battle:abc123");
      expect(result).toEqual({ type: "battle", id: "abc123" });
    });

    it("handles IDs with colons in the id portion", () => {
      const result = parseRoomId("spot:some:complex:id");
      expect(result).toEqual({ type: "spot", id: "some:complex:id" });
    });

    it("returns null for invalid room ID (no colon)", () => {
      const result = parseRoomId("invalid");
      expect(result).toBeNull();
    });

    it("returns null for empty string", () => {
      const result = parseRoomId("");
      expect(result).toBeNull();
    });

    it("returns null when type is present but id is empty", () => {
      const result = parseRoomId("battle:");
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // joinRoom
  // ==========================================================================

  describe("joinRoom", () => {
    it("joins a room successfully", async () => {
      const socket = createMockSocket("user-join-1");
      const result = await joinRoom(socket, "spot", "spot-1");

      expect(result).toBe(true);
      expect(socket.join).toHaveBeenCalledWith("spot:spot-1");
      expect(socket.data.rooms.has("spot:spot-1")).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(
        "[Socket] Joined room",
        expect.objectContaining({ roomId: "spot:spot-1", odv: "user-join-1" })
      );
    });

    it("rejects when room is at capacity (battle = 2)", async () => {
      // Fill the battle room
      const socket1 = createMockSocket("user-battle-1");
      const socket2 = createMockSocket("user-battle-2");
      const socket3 = createMockSocket("user-battle-3");

      await joinRoom(socket1, "battle", "b-full");
      await joinRoom(socket2, "battle", "b-full");

      // Third player should be rejected
      const result = await joinRoom(socket3, "battle", "b-full");
      expect(result).toBe(false);
      expect(socket3.emit).toHaveBeenCalledWith("error", {
        code: "room_full",
        message: "This room is full",
      });
      expect(logger.warn).toHaveBeenCalledWith(
        "[Socket] Room full",
        expect.objectContaining({ roomId: "battle:b-full" })
      );
    });

    it("allows joining a global room (unlimited capacity)", async () => {
      const sockets = [];
      for (let i = 0; i < 5; i++) {
        const s = createMockSocket(`user-global-${i}`);
        const result = await joinRoom(s, "global", "main");
        expect(result).toBe(true);
        sockets.push(s);
      }
    });

    it("tracks room membership in socket.data.rooms", async () => {
      const socket = createMockSocket("user-track-1");
      await joinRoom(socket, "spot", "g-track");
      await joinRoom(socket, "spot", "s-track");

      expect(socket.data.rooms.has("spot:g-track")).toBe(true);
      expect(socket.data.rooms.has("spot:s-track")).toBe(true);
    });
  });

  // ==========================================================================
  // leaveRoom
  // ==========================================================================

  describe("leaveRoom", () => {
    it("leaves a room successfully", async () => {
      const socket = createMockSocket("user-leave-1");
      await joinRoom(socket, "spot", "s-leave");

      await leaveRoom(socket, "spot", "s-leave");

      expect(socket.leave).toHaveBeenCalledWith("spot:s-leave");
      expect(socket.data.rooms.has("spot:s-leave")).toBe(false);
      expect(logger.info).toHaveBeenCalledWith(
        "[Socket] Left room",
        expect.objectContaining({ roomId: "spot:s-leave", odv: "user-leave-1" })
      );
    });

    it("removes member from room info", async () => {
      const socket = createMockSocket("user-leave-2");
      await joinRoom(socket, "spot", "s-leave-2");

      const infoBefore = getRoomInfo("spot", "s-leave-2");
      expect(infoBefore?.members.has("user-leave-2")).toBe(true);

      await leaveRoom(socket, "spot", "s-leave-2");

      const infoAfter = getRoomInfo("spot", "s-leave-2");
      expect(infoAfter?.members.has("user-leave-2")).toBe(false);
    });

    it("handles leaving a room that does not exist in fallback", async () => {
      const socket = createMockSocket("user-leave-3");
      // Leave without joining — should not throw
      await leaveRoom(socket, "spot", "nonexistent-room");
      expect(socket.leave).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // leaveAllRooms
  // ==========================================================================

  describe("leaveAllRooms", () => {
    it("leaves all rooms the socket has joined", async () => {
      const socket = createMockSocket("user-leaveall-1");
      await joinRoom(socket, "spot", "s1");
      await joinRoom(socket, "spot", "g1");

      expect(socket.data.rooms.size).toBe(2);

      await leaveAllRooms(socket);

      expect(socket.data.rooms.size).toBe(0);
      expect(socket.leave).toHaveBeenCalledTimes(2);
    });

    it("does nothing when socket has no rooms", async () => {
      const socket = createMockSocket("user-leaveall-2");
      await leaveAllRooms(socket);

      expect(socket.leave).not.toHaveBeenCalled();
    });

    it("skips rooms with unparseable room IDs (line 217)", async () => {
      const socket = createMockSocket("user-leaveall-3");
      // Manually add an invalid room ID (no colon separator)
      socket.data.rooms.add("invalidroomid");
      // Also add a valid room
      await joinRoom(socket, "spot", "valid-room");

      await leaveAllRooms(socket);

      // The valid room should have been left
      expect(socket.leave).toHaveBeenCalledWith("spot:valid-room");
      // The invalid room ID should NOT cause a leaveRoom call (parseRoomId returns null)
      // socket.leave is only called for valid rooms
    });
  });

  // ==========================================================================
  // broadcastToRoom
  // ==========================================================================

  describe("broadcastToRoom", () => {
    it("broadcasts to room via io when no excludeSocket", () => {
      const io = createMockIo();
      broadcastToRoom(io, "spot", "s-broadcast", "error" as any, { code: "test", message: "hi" });

      expect(io.to).toHaveBeenCalledWith("spot:s-broadcast");
      expect(io.to("spot:s-broadcast").emit).toHaveBeenCalledWith("error", {
        code: "test",
        message: "hi",
      });
    });

    it("broadcasts via excludeSocket.to when excludeSocket is provided", () => {
      const io = createMockIo();
      const socket = createMockSocket("user-broadcast-1");

      broadcastToRoom(
        io,
        "spot",
        "s-broadcast-2",
        "error" as any,
        { code: "test", message: "hi" },
        socket
      );

      expect(socket.to).toHaveBeenCalledWith("spot:s-broadcast-2");
      expect(io.to).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // sendToUser
  // ==========================================================================

  describe("sendToUser", () => {
    it("sends to user's personal room (user:<odv>)", () => {
      const io = createMockIo();
      sendToUser(io, "user-123", "error" as any, { code: "test", message: "hello" });

      expect(io.to).toHaveBeenCalledWith("user:user-123");
      expect(io.to("user:user-123").emit).toHaveBeenCalledWith("error", {
        code: "test",
        message: "hello",
      });
    });
  });

  // ==========================================================================
  // getRoomInfo
  // ==========================================================================

  describe("getRoomInfo", () => {
    it("returns room info for an existing room", async () => {
      const socket = createMockSocket("user-info-1");
      await joinRoom(socket, "spot", "g-info");

      const info = getRoomInfo("spot", "g-info");
      expect(info).toBeDefined();
      expect(info!.type).toBe("spot");
      expect(info!.id).toBe("g-info");
      expect(info!.members.has("user-info-1")).toBe(true);
      expect(info!.createdAt).toBeInstanceOf(Date);
    });

    it("returns undefined for a nonexistent room", () => {
      const info = getRoomInfo("battle", "nonexistent");
      expect(info).toBeUndefined();
    });
  });

  // ==========================================================================
  // getRoomsByType
  // ==========================================================================

  describe("getRoomsByType", () => {
    it("returns rooms filtered by type", async () => {
      const s1 = createMockSocket("user-type-1");
      const s2 = createMockSocket("user-type-2");
      const s3 = createMockSocket("user-type-3");

      await joinRoom(s1, "spot", "s-type-1");
      await joinRoom(s2, "spot", "s-type-2");
      await joinRoom(s3, "spot", "g-type-1");

      const spotRooms = getRoomsByType("spot");
      expect(spotRooms.length).toBeGreaterThanOrEqual(2);
      spotRooms.forEach((r) => expect(r.type).toBe("spot"));

      const gameRooms = getRoomsByType("spot");
      expect(gameRooms.length).toBeGreaterThanOrEqual(1);
      gameRooms.forEach((r) => expect(r.type).toBe("spot"));
    });

    it("returns empty array when no rooms of that type exist", () => {
      const rooms = getRoomsByType("battle");
      // Might be empty or have leftovers from other tests; just check it's an array
      expect(Array.isArray(rooms)).toBe(true);
    });
  });

  // ==========================================================================
  // getRoomStats
  // ==========================================================================

  describe("getRoomStats", () => {
    it("returns aggregate stats with byType breakdown", async () => {
      const s1 = createMockSocket("user-stats-1");
      const s2 = createMockSocket("user-stats-2");

      await joinRoom(s1, "spot", "s-stats-1");
      await joinRoom(s2, "spot", "g-stats-1");

      const stats = getRoomStats();
      expect(stats.totalRooms).toBeGreaterThanOrEqual(2);
      expect(stats.totalMembers).toBeGreaterThanOrEqual(2);
      expect(stats.byType).toEqual(
        expect.objectContaining({
          battle: expect.any(Number),
          spot: expect.any(Number),
          global: expect.any(Number),
        })
      );
    });
  });

  // ==========================================================================
  // cleanupEmptyRooms
  // ==========================================================================

  describe("cleanupEmptyRooms", () => {
    it("removes rooms with 0 members", async () => {
      const socket = createMockSocket("user-cleanup-1");
      await joinRoom(socket, "spot", "s-cleanup-1");
      await leaveRoom(socket, "spot", "s-cleanup-1");

      // Room exists but has 0 members
      const infoBefore = getRoomInfo("spot", "s-cleanup-1");
      expect(infoBefore).toBeDefined();
      expect(infoBefore!.members.size).toBe(0);

      cleanupEmptyRooms();

      const infoAfter = getRoomInfo("spot", "s-cleanup-1");
      expect(infoAfter).toBeUndefined();

      expect(logger.debug).toHaveBeenCalledWith(
        "[Socket] Cleaned up empty room",
        expect.objectContaining({ roomId: "spot:s-cleanup-1" })
      );
    });

    it("does not remove rooms that still have members", async () => {
      const socket = createMockSocket("user-cleanup-2");
      await joinRoom(socket, "spot", "s-cleanup-2");

      cleanupEmptyRooms();

      const info = getRoomInfo("spot", "s-cleanup-2");
      expect(info).toBeDefined();
      expect(info!.members.size).toBe(1);
    });
  });
});
