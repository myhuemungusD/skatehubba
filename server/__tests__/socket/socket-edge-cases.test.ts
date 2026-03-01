/**
 * @fileoverview Additional coverage tests for socket handlers
 *
 * Targets specific uncovered lines in:
 * - server/socket/auth.ts (lines 49-55 — Redis rate limit path)
 * - server/socket/rooms.ts (lines 132-133, 170-171 — Redis error catches)
 * - server/socket/handlers/battle.ts (lines 282-283, 301, 320 — error catches)
 * - server/socket/handlers/presence.ts (lines 125, 220 — fallback remove, away count)
 * - server/socket/health.ts (lines 116, 137 — edge cases)
 * - server/socket/index.ts (lines 165, 175 — see socket-index-coverage.test.ts)
 *
 * All vi.mock paths are relative to this test file at server/__tests__/.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const mockVerifyIdToken = vi.fn();
const mockFindUserByFirebaseUid = vi.fn();
let mockRedisClient: any = null;

// Battle service
const mockCreateBattle = vi.fn();
const mockJoinBattle = vi.fn();
const mockGetBattle = vi.fn();
const mockInitializeVoting = vi.fn();
const mockCastVote = vi.fn();
const mockBattleGenerateEventId = vi.fn().mockReturnValue("test-event-id");

// Rooms (mocked for handler tests — auth/rooms tests use real modules)
const mockJoinRoom = vi.fn().mockResolvedValue(true);
const mockLeaveRoom = vi.fn().mockResolvedValue(undefined);
const mockBroadcastToRoom = vi.fn();
const mockSendToUser = vi.fn();
const mockGetRoomInfo = vi.fn().mockReturnValue(null);

// ---- Module mocks ----

vi.mock("../../admin", () => ({
  admin: {
    auth: () => ({
      verifyIdToken: (...args: any[]) => mockVerifyIdToken(...args),
    }),
  },
}));

vi.mock("../../auth/service", () => ({
  AuthService: {
    findUserByFirebaseUid: (...args: any[]) => mockFindUserByFirebaseUid(...args),
  },
}));

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

vi.mock("../../services/battleService", () => ({
  createBattle: (...args: any[]) => mockCreateBattle(...args),
  joinBattle: (...args: any[]) => mockJoinBattle(...args),
  getBattle: (...args: any[]) => mockGetBattle(...args),
}));

vi.mock("../../services/battleStateService", () => ({
  initializeVoting: (...args: any[]) => mockInitializeVoting(...args),
  castVote: (...args: any[]) => mockCastVote(...args),
  generateEventId: (...args: any[]) => mockBattleGenerateEventId(...args),
}));

vi.mock("../../socket/rooms", () => ({
  joinRoom: (...args: any[]) => mockJoinRoom(...args),
  leaveRoom: (...args: any[]) => mockLeaveRoom(...args),
  broadcastToRoom: (...args: any[]) => mockBroadcastToRoom(...args),
  sendToUser: (...args: any[]) => mockSendToUser(...args),
  getRoomInfo: (...args: any[]) => mockGetRoomInfo(...args),
}));

// ============================================================================
// Imports
// ============================================================================

const authModule = await import("../../socket/auth");
const battleModule = await import("../../socket/handlers/battle");
const presenceModule = await import("../../socket/handlers/presence");
const healthModule = await import("../../socket/health");
const logger = (await import("../../logger")).default;

// ============================================================================
// Helpers
// ============================================================================

function createSocketMock(odv: string, prefix = "socket") {
  const socketId = `${prefix}-${odv}`;
  const handlers = new Map<string, Function>();
  return {
    id: socketId,
    data: { odv, rooms: new Set<string>() },
    rooms: new Set<string>([socketId]),
    on: vi.fn((event: string, handler: Function) => {
      handlers.set(event, handler);
    }),
    emit: vi.fn(),
    join: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn().mockResolvedValue(undefined),
    to: vi.fn().mockReturnValue({ emit: vi.fn() }),
    broadcast: { emit: vi.fn() },
    _handlers: handlers,
  } as any;
}

function createIoMock() {
  return {
    to: vi.fn().mockReturnValue({ emit: vi.fn() }),
  } as any;
}

// ============================================================================
// Setup
// ============================================================================

let trackedHealthIds: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  mockRedisClient = null;
  mockVerifyIdToken.mockResolvedValue({ uid: "uid-1", admin: false });
  mockFindUserByFirebaseUid.mockResolvedValue({ id: "user-1", isActive: true });
  mockJoinRoom.mockResolvedValue(true);
  mockLeaveRoom.mockResolvedValue(undefined);
  mockGetRoomInfo.mockReturnValue(null);
  mockBattleGenerateEventId.mockReturnValue("test-event-id");
  trackedHealthIds = [];
});

afterEach(() => {
  for (const id of trackedHealthIds) {
    healthModule.cleanupSocketHealth(id);
  }
});

// ============================================================================
// Section 1: socket/auth.ts — Redis rate limit (lines 49-55)
// ============================================================================

describe("Socket Auth — Redis rate limit paths (lines 49-55)", () => {
  it("uses Redis incr/expire when redis client is available and count is 1", async () => {
    const mockIncr = vi.fn().mockResolvedValue(1);
    const mockExpire = vi.fn().mockResolvedValue(true);
    mockRedisClient = { incr: mockIncr, expire: mockExpire };

    const socket = {
      handshake: { auth: { token: "valid-token" }, address: "10.0.0.1" },
      data: {},
    } as any;
    const next = vi.fn();

    await authModule.socketAuthMiddleware(socket, next);

    expect(mockIncr).toHaveBeenCalled();
    expect(mockExpire).toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it("skips expire when Redis count > 1", async () => {
    const mockIncr = vi.fn().mockResolvedValue(5);
    const mockExpire = vi.fn();
    mockRedisClient = { incr: mockIncr, expire: mockExpire };

    const socket = {
      handshake: { auth: { token: "valid-token" }, address: "10.0.0.2" },
      data: {},
    } as any;
    const next = vi.fn();

    await authModule.socketAuthMiddleware(socket, next);

    expect(mockIncr).toHaveBeenCalled();
    expect(mockExpire).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it("rate limits via Redis when count exceeds limit", async () => {
    const mockIncr = vi.fn().mockResolvedValue(11);
    mockRedisClient = { incr: mockIncr, expire: vi.fn() };

    const socket = {
      handshake: { auth: { token: "valid-token" }, address: "10.0.0.3" },
      data: {},
    } as any;
    const next = vi.fn();

    await authModule.socketAuthMiddleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    const error = next.mock.calls[0][0] as Error;
    expect(error.message).toBe("rate_limit_exceeded");
  });

  it("falls back to in-memory when Redis incr throws (line 56-57)", async () => {
    const mockIncr = vi.fn().mockRejectedValue(new Error("Redis down"));
    mockRedisClient = { incr: mockIncr, expire: vi.fn() };

    const socket = {
      handshake: { auth: { token: "valid-token" }, address: "10.0.0.4" },
      data: {},
    } as any;
    const next = vi.fn();

    await authModule.socketAuthMiddleware(socket, next);

    // Should succeed via in-memory fallback (silent catch)
    expect(next).toHaveBeenCalledWith();
  });
});

// ============================================================================
// Section 2: socket/rooms.ts — Redis error catches (lines 132-133, 170-171)
// Note: rooms module is mocked in this file for handler tests.
// Real rooms tests are in socket-rooms-coverage.test.ts.
// ============================================================================

// ============================================================================
// Section 3: socket/handlers/battle.ts — error catches (lines 282-283, 301, 320)
// ============================================================================

describe("Battle Handlers — error catch paths (lines 282-283, 301, 320)", () => {
  it("battle:vote error catch emits error (lines 282-283)", async () => {
    const io = createIoMock();
    const socket = createSocketMock("voter-1", "battle");
    battleModule.registerBattleHandlers(io, socket);

    // Mock getRoomInfo to return a room with this socket as a member
    // so the vote passes the verifyBattleRoomMembership check
    mockGetRoomInfo.mockReturnValue({ members: new Set([socket.id]) });
    mockCastVote.mockRejectedValue(new Error("Vote service down"));

    const handler = socket._handlers.get("battle:vote");
    await handler({ battleId: "b1", odv: "voter-1", vote: "clean" });

    expect(socket.emit).toHaveBeenCalledWith("error", {
      code: "battle_vote_failed",
      message: "Failed to cast vote",
    });
  });

  it("battle:ready error catch handles joinRoom failure (line 320)", async () => {
    const io = createIoMock();
    const socket = createSocketMock("ready-1", "battle");
    battleModule.registerBattleHandlers(io, socket);

    // Mock getBattle to return a battle where this user is a participant
    mockGetBattle.mockResolvedValue({
      creatorId: "ready-1",
      opponentId: "opponent-1",
    });
    mockJoinRoom.mockRejectedValue(new Error("Room join failed"));

    const handler = socket._handlers.get("battle:ready");
    await handler("battle-123");

    expect(logger.error).toHaveBeenCalledWith(
      "[Battle] Ready failed",
      expect.objectContaining({ battleId: "battle-123" })
    );
  });

  it("battle:ready creates socketBattleMap entry (line 301)", async () => {
    const io = createIoMock();
    const socket = createSocketMock("ready-new", "battle");
    battleModule.registerBattleHandlers(io, socket);

    // Mock getBattle to return a battle where this user is a participant
    mockGetBattle.mockResolvedValue({
      creatorId: "ready-new",
      opponentId: "opponent-1",
    });

    const handler = socket._handlers.get("battle:ready");
    await handler("battle-456");

    expect(mockJoinRoom).toHaveBeenCalled();
    expect(mockBroadcastToRoom).toHaveBeenCalled();
  });
});

// ============================================================================
// Section 4: socket/handlers/presence.ts — fallback remove (line 125), away count (line 220)
// ============================================================================

describe("Presence Handlers — uncovered paths (lines 125, 220)", () => {
  it("removePresence uses in-memory fallback when Redis is null (line 125)", async () => {
    mockRedisClient = null;

    const io = createIoMock();
    const socket = createSocketMock("presence-fb-user", "presence");

    presenceModule.registerPresenceHandlers(io, socket);

    const statsBefore = await presenceModule.getPresenceStats();
    expect(statsBefore.online).toBeGreaterThanOrEqual(1);

    presenceModule.handlePresenceDisconnect(io, socket);

    const statsAfter = await presenceModule.getPresenceStats();
    expect(statsAfter.online).toBeLessThan(statsBefore.online);
  });

  it("getPresenceStats counts away users in fallback (line 220)", async () => {
    mockRedisClient = null;

    const io = createIoMock();

    const socket1 = createSocketMock("online-user", "presence");
    presenceModule.registerPresenceHandlers(io, socket1);

    const socket2 = createSocketMock("away-user", "presence");
    presenceModule.registerPresenceHandlers(io, socket2);

    const presenceUpdateCall = socket2.on.mock.calls.find(
      (call: any[]) => call[0] === "presence:update"
    );
    expect(presenceUpdateCall).toBeDefined();
    presenceUpdateCall![1]("away");

    const stats = await presenceModule.getPresenceStats();
    expect(stats.away).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// Section 5: socket/health.ts — edge cases (lines 116, 137)
// ============================================================================

describe("Socket Health — edge cases (lines 116, 137)", () => {
  it("skips sockets with no health entry (line 116: if (!health) continue)", async () => {
    vi.useFakeTimers();
    try {
      const unknownSocket = {
        id: "no-health-entry-coverage",
        data: { odv: "unknown-user" },
        disconnect: vi.fn(),
      };

      const mockIo = {
        fetchSockets: vi.fn().mockResolvedValue([unknownSocket]),
      } as any;

      const intervalId = healthModule.startHealthMonitor(mockIo);

      vi.advanceTimersByTime(31_000);
      await vi.advanceTimersToNextTimerAsync();
      await Promise.resolve();

      expect(unknownSocket.disconnect).not.toHaveBeenCalled();

      healthModule.stopHealthMonitor(intervalId);
    } finally {
      vi.useRealTimers();
    }
  });

  it("logs health summary when sockets are tracked (line 137)", async () => {
    vi.useFakeTimers();
    try {
      const socketId = "tracked-for-logging";
      healthModule.initSocketHealth({ id: socketId } as any);
      trackedHealthIds.push(socketId);

      const mockIo = {
        fetchSockets: vi
          .fn()
          .mockResolvedValue([{ id: socketId, data: { odv: "user-1" }, disconnect: vi.fn() }]),
      } as any;

      const intervalId = healthModule.startHealthMonitor(mockIo);

      vi.advanceTimersByTime(31_000);
      await vi.advanceTimersToNextTimerAsync();
      await Promise.resolve();

      expect(logger.debug).toHaveBeenCalledWith(
        "[Socket] Health check complete",
        expect.objectContaining({ totalSockets: expect.any(Number) })
      );

      healthModule.stopHealthMonitor(intervalId);
    } finally {
      vi.useRealTimers();
    }
  });
});
