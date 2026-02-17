/**
 * @fileoverview Coverage tests for uncovered branches in socket-related files
 *
 * Targets:
 * 1. server/socket/auth.ts (lines 30-33): cleanupRateLimits() — stale fallback entries
 * 2. server/socket/index.ts (lines 168-232): getSocketStats(), broadcastSystemNotification(), shutdownSocketServer()
 * 3. server/socket/handlers/game.ts (lines 239-240,271,295,340,357-358): catch blocks in game:trick, game:pass, game:forfeit, game:reconnect
 * 4. server/socket/handlers/battle.ts (lines 119, 208-209, 244): battle:startVoting error, already-processed+not-complete branch
 * 5. server/socket/handlers/presence.ts (line 203): malformed presence entry in Redis
 * 6. server/socket/rooms.ts (line 201): parseRoomId returns null branch in leaveAllRooms
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Mock function references
// ============================================================================

const mockVerifyIdToken = vi.fn();
const mockFindUserByFirebaseUid = vi.fn();
let mockRedisClient: any = null;

// Battle service mocks
const mockCreateBattle = vi.fn();
const mockJoinBattle = vi.fn();
const mockGetBattle = vi.fn();
const mockInitializeVoting = vi.fn();
const mockCastVote = vi.fn();
const mockBattleGenerateEventId = vi.fn().mockReturnValue("test-event-id");

// Game state service mocks
const mockCreateGame = vi.fn();
const mockJoinGame = vi.fn();
const mockSubmitTrick = vi.fn();
const mockPassTrick = vi.fn();
const mockHandleDisconnect = vi.fn();
const mockHandleReconnect = vi.fn();
const mockForfeitGame = vi.fn();
const mockGameGenerateEventId = vi.fn().mockReturnValue("test-event-id");

// Room mocks
const mockJoinRoom = vi.fn().mockResolvedValue(true);
const mockLeaveRoom = vi.fn().mockResolvedValue(undefined);
const mockBroadcastToRoom = vi.fn();
const mockSendToUser = vi.fn();
const mockGetRoomInfo = vi.fn().mockReturnValue(null);
const mockLeaveAllRooms = vi.fn().mockResolvedValue(undefined);
const mockGetRoomStats = vi.fn().mockReturnValue({
  totalRooms: 0,
  totalMembers: 0,
  byType: { battle: 0, game: 0, spot: 0, global: 0 },
});

// Health mocks
const mockInitSocketHealth = vi.fn();
const mockCleanupSocketHealth = vi.fn();
const mockStartHealthMonitor = vi.fn().mockReturnValue(42);
const mockStopHealthMonitor = vi.fn();
const mockGetHealthStats = vi.fn().mockReturnValue({
  totalSockets: 0,
  avgLatency: 0,
  highLatencyCount: 0,
  staleConnections: 0,
});

// Presence mocks (for index.ts tests)
const mockGetPresenceStats = vi.fn().mockResolvedValue({ online: 0, away: 0 });

// ============================================================================
// Module mocks (before imports)
// ============================================================================

vi.mock("../admin", () => ({
  admin: {
    auth: () => ({
      verifyIdToken: (...args: any[]) => mockVerifyIdToken(...args),
    }),
  },
}));

vi.mock("../auth/service", () => ({
  AuthService: {
    findUserByFirebaseUid: (...args: any[]) => mockFindUserByFirebaseUid(...args),
  },
}));

vi.mock("../logger", () => ({
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

vi.mock("../redis", () => ({
  getRedisClient: () => mockRedisClient,
}));

vi.mock("../services/battleService", () => ({
  createBattle: (...args: any[]) => mockCreateBattle(...args),
  joinBattle: (...args: any[]) => mockJoinBattle(...args),
  getBattle: (...args: any[]) => mockGetBattle(...args),
}));

vi.mock("../services/battleStateService", () => ({
  initializeVoting: (...args: any[]) => mockInitializeVoting(...args),
  castVote: (...args: any[]) => mockCastVote(...args),
  generateEventId: (...args: any[]) => mockBattleGenerateEventId(...args),
}));

vi.mock("../services/gameStateService", () => ({
  createGame: (...args: any[]) => mockCreateGame(...args),
  joinGame: (...args: any[]) => mockJoinGame(...args),
  submitTrick: (...args: any[]) => mockSubmitTrick(...args),
  passTrick: (...args: any[]) => mockPassTrick(...args),
  handleDisconnect: (...args: any[]) => mockHandleDisconnect(...args),
  handleReconnect: (...args: any[]) => mockHandleReconnect(...args),
  forfeitGame: (...args: any[]) => mockForfeitGame(...args),
  generateEventId: (...args: any[]) => mockGameGenerateEventId(...args),
}));

vi.mock("../socket/rooms", () => ({
  joinRoom: (...args: any[]) => mockJoinRoom(...args),
  leaveRoom: (...args: any[]) => mockLeaveRoom(...args),
  leaveAllRooms: (...args: any[]) => mockLeaveAllRooms(...args),
  broadcastToRoom: (...args: any[]) => mockBroadcastToRoom(...args),
  sendToUser: (...args: any[]) => mockSendToUser(...args),
  getRoomInfo: (...args: any[]) => mockGetRoomInfo(...args),
  getRoomStats: (...args: any[]) => mockGetRoomStats(...args),
  getRoomId: vi.fn((type: string, id: string) => `${type}:${id}`),
  parseRoomId: vi.fn(),
  cleanupEmptyRooms: vi.fn(),
  getRoomsByType: vi.fn(),
}));

vi.mock("../socket/health", () => ({
  initSocketHealth: (...args: any[]) => mockInitSocketHealth(...args),
  cleanupSocketHealth: (...args: any[]) => mockCleanupSocketHealth(...args),
  startHealthMonitor: (...args: any[]) => mockStartHealthMonitor(...args),
  stopHealthMonitor: (...args: any[]) => mockStopHealthMonitor(...args),
  getHealthStats: (...args: any[]) => mockGetHealthStats(...args),
}));

vi.mock("../socket/auth", () => ({
  socketAuthMiddleware: vi.fn(),
}));

vi.mock("../socket/handlers/battle", () => ({
  registerBattleHandlers: vi.fn(),
  cleanupBattleSubscriptions: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../socket/handlers/game", () => ({
  registerGameHandlers: vi.fn(),
  cleanupGameSubscriptions: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../socket/handlers/presence", () => ({
  registerPresenceHandlers: vi.fn(),
  handlePresenceDisconnect: vi.fn(),
  getPresenceStats: (...args: any[]) => mockGetPresenceStats(...args),
  getOnlineUsers: vi.fn().mockResolvedValue([]),
  isUserOnline: vi.fn().mockResolvedValue(false),
  getUserPresence: vi.fn().mockResolvedValue(null),
}));

vi.mock("../services/timeoutScheduler", () => ({
  startTimeoutScheduler: vi.fn(),
  stopTimeoutScheduler: vi.fn(),
  forceTimeoutCheck: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../config/constants", () => ({
  SOCKET_PING_TIMEOUT_MS: 20_000,
  SOCKET_PING_INTERVAL_MS: 25_000,
  SOCKET_UPGRADE_TIMEOUT_MS: 10_000,
  SOCKET_MAX_HTTP_BUFFER_SIZE: 1_048_576,
  SOCKET_MAX_DISCONNECTION_DURATION_MS: 120_000,
}));

// Mock socket.io Server for index.ts tests
const _mockServerOn = vi.fn();
const _mockServerUse = vi.fn();
const _mockServerEmit = vi.fn();
const _mockServerClose = vi.fn((cb: () => void) => cb());
const _mockServerFetchSockets = vi.fn().mockResolvedValue([]);
const _mockServerEngine = { on: vi.fn() };

vi.mock("socket.io", () => {
  function Server(this: any) {
    this.on = _mockServerOn;
    this.use = _mockServerUse;
    this.emit = _mockServerEmit;
    this.close = _mockServerClose;
    this.fetchSockets = _mockServerFetchSockets;
    this.engine = _mockServerEngine;
    return this;
  }
  return { Server };
});

// ============================================================================
// Imports (after mocks)
// ============================================================================

// We import the real battle/game/presence handler modules directly (NOT through
// the mocked ../socket/handlers/* paths) because those mocks are only for the
// index.ts tests. For handler tests we need the real register functions.
// However, since rooms is mocked, the handlers will use the mocked rooms.

// For handler-level tests, we re-import the actual handler files.
// We need separate un-mocked imports for handler tests.
// The trick: vi.mock for ../socket/handlers/* is for index.ts. For direct
// handler tests we import the modules by their full paths which resolve
// to the same files but we can use vi.importActual or import directly.

// Actually, vi.mock hoists and applies to all imports in this file.
// So we need a different approach: use dynamic imports with vi.importActual
// for handler-level tests.

const {
  getSocketStats,
  broadcastSystemNotification,
  shutdownSocketServer,
  initializeSocketServer,
} = await import("../socket/index");

const logger = (await import("../logger")).default;

// For handler tests, use importActual to bypass the mocks
const battleHandlers = (await vi.importActual(
  "../socket/handlers/battle"
)) as typeof import("../socket/handlers/battle");
const gameHandlers = (await vi.importActual(
  "../socket/handlers/game"
)) as typeof import("../socket/handlers/game");

// ============================================================================
// Helpers
// ============================================================================

function createMockSocket(odv: string, prefix = "socket") {
  const handlers = new Map<string, Function>();
  return {
    id: `${prefix}-${odv}`,
    data: {
      odv,
      userId: odv,
      firebaseUid: `fb-${odv}`,
      roles: [],
      connectedAt: new Date(),
      rooms: new Set<string>(),
    },
    on: vi.fn((event: string, handler: Function) => {
      handlers.set(event, handler);
    }),
    emit: vi.fn(),
    join: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn().mockResolvedValue(undefined),
    to: vi.fn().mockReturnValue({ emit: vi.fn() }),
    broadcast: { emit: vi.fn() },
    handshake: { address: "127.0.0.1", auth: { token: "test-token" } },
    _handlers: handlers,
  } as any;
}

function createMockIo() {
  return {
    to: vi.fn().mockReturnValue({ emit: vi.fn() }),
    emit: vi.fn(),
    fetchSockets: vi.fn().mockResolvedValue([]),
    close: vi.fn((cb: () => void) => cb()),
  } as any;
}

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  mockRedisClient = null;
  mockVerifyIdToken.mockResolvedValue({ uid: "uid-1", admin: false });
  mockFindUserByFirebaseUid.mockResolvedValue({ id: "user-1", isActive: true });
  mockJoinRoom.mockResolvedValue(true);
  mockLeaveRoom.mockResolvedValue(undefined);
  mockGetRoomInfo.mockReturnValue(null);
  mockGameGenerateEventId.mockReturnValue("test-event-id");
  mockBattleGenerateEventId.mockReturnValue("test-event-id");
  mockGetPresenceStats.mockResolvedValue({ online: 0, away: 0 });
  mockStartHealthMonitor.mockReturnValue(42);
  mockGetHealthStats.mockReturnValue({
    totalSockets: 0,
    avgLatency: 0,
    highLatencyCount: 0,
    staleConnections: 0,
  });
  mockGetRoomStats.mockReturnValue({
    totalRooms: 0,
    totalMembers: 0,
    byType: { battle: 0, game: 0, spot: 0, global: 0 },
  });
});

// ============================================================================
// 1. socket/auth.ts — cleanupRateLimits (lines 30-33)
// ============================================================================

describe("Socket Auth — cleanupRateLimits (lines 30-33)", () => {
  it("cleans up stale fallback rate limit entries when interval fires", async () => {
    vi.useFakeTimers();
    try {
      // Clear any existing module state by re-importing with fake timers active.
      // We need the REAL auth module (not mocked), with Redis returning null
      // so it uses the fallback map.
      const authModule = (await vi.importActual(
        "../socket/auth"
      )) as typeof import("../socket/auth");

      // Populate the fallback map by calling socketAuthMiddleware
      // with no Redis (mockRedisClient is null), which will use the in-memory fallback.
      const socket = {
        handshake: { auth: { token: "valid-token" }, address: "10.99.99.1" },
        data: {},
      } as any;
      const next = vi.fn();

      // Call middleware to populate the fallback map entry for IP 10.99.99.1
      await authModule.socketAuthMiddleware(socket, next);

      // The entry is now in the map with resetAt = now + 60_000.
      // Advance time past the rate limit window so the entry becomes stale.
      vi.advanceTimersByTime(61_000);

      // The setInterval(cleanupRateLimits, 60_000) should fire now.
      // After cleanup, calling checkRateLimit for the same IP should create
      // a fresh entry (count: 1), which we can verify indirectly by checking
      // the middleware succeeds again (the entry was deleted, so it starts fresh).
      const socket2 = {
        handshake: { auth: { token: "valid-token" }, address: "10.99.99.1" },
        data: {},
      } as any;
      const next2 = vi.fn();

      await authModule.socketAuthMiddleware(socket2, next2);

      // If the stale entry was cleaned up, the new call should succeed
      // (count reset to 1, not accumulated from before).
      expect(next2).toHaveBeenCalledWith();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ============================================================================
// 2. socket/index.ts — getSocketStats, broadcastSystemNotification, shutdownSocketServer
// ============================================================================

describe("Socket Index — getSocketStats (lines 192-204)", () => {
  it("returns aggregated stats from rooms, presence, and health", async () => {
    mockGetRoomStats.mockReturnValue({
      totalRooms: 5,
      totalMembers: 10,
      byType: { battle: 1, game: 2, spot: 1, global: 1 },
    });
    mockGetPresenceStats.mockResolvedValue({ online: 7, away: 3 });
    mockGetHealthStats.mockReturnValue({
      totalSockets: 10,
      avgLatency: 50,
      highLatencyCount: 1,
      staleConnections: 0,
    });

    const stats = await getSocketStats();

    expect(stats).toEqual({
      connections: expect.any(Number),
      rooms: {
        totalRooms: 5,
        totalMembers: 10,
        byType: { battle: 1, game: 2, spot: 1, global: 1 },
      },
      presence: { online: 7, away: 3 },
      health: {
        totalSockets: 10,
        avgLatency: 50,
        highLatencyCount: 1,
        staleConnections: 0,
      },
    });

    expect(mockGetRoomStats).toHaveBeenCalled();
    expect(mockGetPresenceStats).toHaveBeenCalled();
    expect(mockGetHealthStats).toHaveBeenCalled();
  });
});

describe("Socket Index — broadcastSystemNotification (lines 209-221)", () => {
  it("emits a notification event to all connected clients via io", () => {
    const io = createMockIo();

    broadcastSystemNotification(io, "Test Title", "Test message body");

    expect(io.emit).toHaveBeenCalledWith("notification", {
      id: expect.stringMatching(/^system-\d+$/),
      type: "system",
      title: "Test Title",
      message: "Test message body",
      createdAt: expect.any(String),
    });
  });
});

describe("Socket Index — shutdownSocketServer (lines 226-263)", () => {
  it("stops health monitor, stops timeout scheduler, notifies clients, disconnects sockets, and closes server", async () => {
    // First initialize so healthMonitorInterval gets set
    initializeSocketServer({} as any);

    const io = createMockIo();
    const mockSocket1 = { disconnect: vi.fn() };
    const mockSocket2 = { disconnect: vi.fn() };
    io.fetchSockets.mockResolvedValue([mockSocket1, mockSocket2]);

    await shutdownSocketServer(io);

    // Should have notified all clients
    expect(io.emit).toHaveBeenCalledWith(
      "notification",
      expect.objectContaining({
        type: "system",
        title: "Server Maintenance",
      })
    );

    // Should have disconnected all sockets
    expect(mockSocket1.disconnect).toHaveBeenCalledWith(true);
    expect(mockSocket2.disconnect).toHaveBeenCalledWith(true);

    // Should have closed the server
    expect(io.close).toHaveBeenCalled();

    // Should have logged shutdown
    expect(logger.info).toHaveBeenCalledWith("[Socket] Shutting down...");
  });

  it("handles shutdown when healthMonitorInterval is null", async () => {
    // Call shutdown without initialize, so healthMonitorInterval is null
    const io = createMockIo();
    io.fetchSockets.mockResolvedValue([]);

    // Should not throw even if healthMonitorInterval is null
    await shutdownSocketServer(io);

    expect(io.close).toHaveBeenCalled();
  });
});

// ============================================================================
// 3. socket/handlers/game.ts — error catch blocks
// ============================================================================

describe("Game Handlers — game:trick catch block (lines 239-240)", () => {
  it("emits error when submitTrick throws", async () => {
    const io = createMockIo();
    const socket = createMockSocket("trick-fail-user", "game");
    gameHandlers.registerGameHandlers(io, socket);

    mockSubmitTrick.mockRejectedValue(new Error("DB connection lost"));

    const handler = socket._handlers.get("game:trick");
    await handler({ gameId: "g1", odv: "trick-fail-user", trickName: "kickflip" });

    expect(socket.emit).toHaveBeenCalledWith("error", {
      code: "trick_failed",
      message: "Failed to submit trick",
    });
    expect(logger.error).toHaveBeenCalledWith(
      "[Game] Trick failed",
      expect.objectContaining({ odv: "trick-fail-user" })
    );
  });
});

describe("Game Handlers — game:pass catch block (line 271 alreadyProcessed, lines 308-313 catch)", () => {
  it("returns early when result.alreadyProcessed is true (line 271)", async () => {
    const io = createMockIo();
    const socket = createMockSocket("pass-idempotent", "game");
    gameHandlers.registerGameHandlers(io, socket);

    mockPassTrick.mockResolvedValue({
      success: true,
      alreadyProcessed: true,
    });

    const handler = socket._handlers.get("game:pass");
    await handler("g-pass-1");

    // Should NOT emit any game events (early return)
    expect(mockBroadcastToRoom).not.toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it("emits error when passTrick throws (lines 308-313)", async () => {
    const io = createMockIo();
    const socket = createMockSocket("pass-fail-user", "game");
    gameHandlers.registerGameHandlers(io, socket);

    mockPassTrick.mockRejectedValue(new Error("Service unavailable"));

    const handler = socket._handlers.get("game:pass");
    await handler("g-pass-fail");

    expect(socket.emit).toHaveBeenCalledWith("error", {
      code: "pass_failed",
      message: "Failed to pass",
    });
    expect(logger.error).toHaveBeenCalledWith(
      "[Game] Pass failed",
      expect.objectContaining({ odv: "pass-fail-user" })
    );
  });

  it("broadcasts next turn when game is not completed after pass (line 295)", async () => {
    const io = createMockIo();
    const socket = createMockSocket("pass-continue-user", "game");
    gameHandlers.registerGameHandlers(io, socket);

    mockPassTrick.mockResolvedValue({
      success: true,
      alreadyProcessed: false,
      letterGained: "S",
      game: {
        id: "g-pass-cont",
        status: "active",
        players: [
          { odv: "pass-continue-user", letters: "S" },
          { odv: "player-2", letters: "" },
        ],
        currentTurnIndex: 1,
        currentAction: "set",
      },
    });

    const handler = socket._handlers.get("game:pass");
    await handler("g-pass-cont");

    // Should broadcast letter
    expect(mockBroadcastToRoom).toHaveBeenCalledWith(
      io,
      "game",
      "g-pass-cont",
      "game:letter",
      expect.objectContaining({ odv: "pass-continue-user", letters: "S" })
    );

    // Should broadcast next turn (line 295)
    expect(mockBroadcastToRoom).toHaveBeenCalledWith(
      io,
      "game",
      "g-pass-cont",
      "game:turn",
      expect.objectContaining({
        gameId: "g-pass-cont",
        currentPlayer: "player-2",
        action: "set",
      })
    );
  });
});

describe("Game Handlers — game:forfeit catch block (lines 340, 357-358)", () => {
  it("returns early when forfeit result.alreadyProcessed is true (line 340)", async () => {
    const io = createMockIo();
    const socket = createMockSocket("forfeit-idempotent", "game");
    gameHandlers.registerGameHandlers(io, socket);

    mockForfeitGame.mockResolvedValue({
      success: true,
      alreadyProcessed: true,
    });

    const handler = socket._handlers.get("game:forfeit");
    await handler("g-forfeit-1");

    // Should return early without broadcasting
    expect(mockBroadcastToRoom).not.toHaveBeenCalled();
  });

  it("emits error when forfeitGame throws (lines 357-358)", async () => {
    const io = createMockIo();
    const socket = createMockSocket("forfeit-fail", "game");
    gameHandlers.registerGameHandlers(io, socket);

    mockForfeitGame.mockRejectedValue(new Error("Forfeit DB error"));

    const handler = socket._handlers.get("game:forfeit");
    await handler("g-forfeit-fail");

    expect(socket.emit).toHaveBeenCalledWith("error", {
      code: "forfeit_failed",
      message: "Failed to forfeit",
    });
    expect(logger.error).toHaveBeenCalledWith(
      "[Game] Forfeit failed",
      expect.objectContaining({ odv: "forfeit-fail" })
    );
  });
});

describe("Game Handlers — game:reconnect catch block (lines 427-432)", () => {
  it("emits error when handleReconnect throws", async () => {
    const io = createMockIo();
    const socket = createMockSocket("reconnect-crash", "game");
    gameHandlers.registerGameHandlers(io, socket);

    mockHandleReconnect.mockRejectedValue(new Error("Reconnect service down"));

    const handler = socket._handlers.get("game:reconnect");
    await handler("g-reconnect-fail");

    expect(socket.emit).toHaveBeenCalledWith("error", {
      code: "reconnect_failed",
      message: "Failed to reconnect",
    });
    expect(logger.error).toHaveBeenCalledWith(
      "[Game] Reconnect failed",
      expect.objectContaining({ odv: "reconnect-crash" })
    );
  });
});

// ============================================================================
// 4. socket/handlers/battle.ts — battle:startVoting error, already-processed branch
// ============================================================================

describe("Battle Handlers — battle:startVoting error catch (lines 208-209)", () => {
  it("emits error when initializeVoting throws", async () => {
    const io = createMockIo();
    const socket = createMockSocket("voting-fail-user", "battle");
    battleHandlers.registerBattleHandlers(io, socket);

    mockGetBattle.mockResolvedValue({
      creatorId: "voting-fail-user",
      opponentId: "opponent-1",
    });
    mockInitializeVoting.mockRejectedValue(new Error("Voting init error"));

    const handler = socket._handlers.get("battle:startVoting");
    await handler("battle-sv-1");

    expect(socket.emit).toHaveBeenCalledWith("error", {
      code: "start_voting_failed",
      message: "Failed to start voting",
    });
    expect(logger.error).toHaveBeenCalledWith(
      "[Battle] Start voting failed",
      expect.objectContaining({ odv: "voting-fail-user" })
    );
  });

  it("emits error when getBattle throws (alternative error path)", async () => {
    const io = createMockIo();
    const socket = createMockSocket("voting-getBattle-fail", "battle");
    battleHandlers.registerBattleHandlers(io, socket);

    mockGetBattle.mockRejectedValue(new Error("DB query failed"));

    const handler = socket._handlers.get("battle:startVoting");
    await handler("battle-sv-2");

    expect(socket.emit).toHaveBeenCalledWith("error", {
      code: "start_voting_failed",
      message: "Failed to start voting",
    });
  });
});

describe("Battle Handlers — battle:join socketBattleMap (line 119)", () => {
  it("creates socketBattleMap entry when socket has no existing battles", async () => {
    const io = createMockIo();
    const socket = createMockSocket("join-new-user", "battle");
    battleHandlers.registerBattleHandlers(io, socket);

    mockGetRoomInfo.mockReturnValue(null);
    mockJoinBattle.mockResolvedValue(undefined);

    const handler = socket._handlers.get("battle:join");
    await handler("battle-join-1");

    // Should have called joinRoom and broadcastToRoom
    expect(mockJoinRoom).toHaveBeenCalledWith(socket, "battle", "battle-join-1");
    expect(mockBroadcastToRoom).toHaveBeenCalledWith(
      io,
      "battle",
      "battle-join-1",
      "battle:joined",
      expect.objectContaining({ battleId: "battle-join-1", odv: "join-new-user" })
    );
  });
});

describe("Battle Handlers — battle:vote already-processed + not complete (line 244)", () => {
  it("returns early when alreadyProcessed is true and battleComplete is false", async () => {
    const io = createMockIo();
    const socket = createMockSocket("vote-idempotent", "battle");
    battleHandlers.registerBattleHandlers(io, socket);

    mockCastVote.mockResolvedValue({
      success: true,
      alreadyProcessed: true,
      battleComplete: false,
    });

    const handler = socket._handlers.get("battle:vote");
    await handler({ battleId: "b-vote-1", odv: "vote-idempotent", vote: "clean" });

    // Should NOT broadcast any events (early return at line 244)
    expect(mockBroadcastToRoom).not.toHaveBeenCalled();
    // Should NOT emit error
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it("broadcasts when alreadyProcessed is true BUT battleComplete is also true", async () => {
    const io = createMockIo();
    const socket = createMockSocket("vote-complete-replay", "battle");
    battleHandlers.registerBattleHandlers(io, socket);

    mockCastVote.mockResolvedValue({
      success: true,
      alreadyProcessed: true,
      battleComplete: true,
      winnerId: "vote-complete-replay",
      finalScore: { "vote-complete-replay": 3, opponent: 1 },
    });

    const handler = socket._handlers.get("battle:vote");
    await handler({ battleId: "b-vote-2", odv: "vote-complete-replay", vote: "clean" });

    // Should still broadcast the vote and completion
    expect(mockBroadcastToRoom).toHaveBeenCalledWith(
      io,
      "battle",
      "b-vote-2",
      "battle:voted",
      expect.objectContaining({ battleId: "b-vote-2" })
    );
    expect(mockBroadcastToRoom).toHaveBeenCalledWith(
      io,
      "battle",
      "b-vote-2",
      "battle:completed",
      expect.objectContaining({
        battleId: "b-vote-2",
        winnerId: "vote-complete-replay",
      })
    );
  });
});

// ============================================================================
// 5. socket/handlers/presence.ts — malformed Redis entry (line 203)
// ============================================================================

describe("Presence — malformed presence entry in Redis (line 203)", () => {
  it("handles JSON parse error in getPresenceStats gracefully", async () => {
    // Import the real presence module
    const presenceModule = (await vi.importActual(
      "../socket/handlers/presence"
    )) as typeof import("../socket/handlers/presence");

    // Set up Redis mock that returns malformed values from hvals
    mockRedisClient = {
      hvals: vi.fn().mockResolvedValue([
        '{"status":"online"}', // valid
        "not-valid-json{{{", // malformed — triggers catch at line 203
        '{"status":"away"}', // valid
        "", // empty — also malformed
      ]),
      hkeys: vi.fn().mockResolvedValue([]),
      hget: vi.fn().mockResolvedValue(null),
      hset: vi.fn().mockResolvedValue(1),
      hdel: vi.fn().mockResolvedValue(1),
    };

    const stats = await presenceModule.getPresenceStats();

    // Two valid entries parsed: one online, one away
    // Two malformed entries should log warnings but not crash
    expect(stats.online).toBe(1);
    expect(stats.away).toBe(1);

    // Should have logged warnings for the malformed entries
    expect(logger.warn).toHaveBeenCalledWith(
      "[Presence] Malformed presence entry in Redis",
      expect.objectContaining({
        error: expect.any(String),
      })
    );
  });
});

// ============================================================================
// 6. socket/rooms.ts — parseRoomId returns null in leaveAllRooms (line 201)
// ============================================================================

describe("Rooms — leaveAllRooms with unparseable roomId (line 201)", () => {
  it("skips rooms where parseRoomId returns null", async () => {
    // Import the real rooms module
    const roomsModule = (await vi.importActual(
      "../socket/rooms"
    )) as typeof import("../socket/rooms");

    // Create a socket with a rooms set containing an unparseable room ID
    const socket = {
      data: {
        odv: "room-test-user",
        userId: "room-test-user",
        firebaseUid: "fb-room-test",
        roles: [],
        connectedAt: new Date(),
        rooms: new Set(["", "validtype:validid"]),
      },
      join: vi.fn().mockResolvedValue(undefined),
      leave: vi.fn().mockResolvedValue(undefined),
      emit: vi.fn(),
    } as any;

    // parseRoomId("") returns null because splitting "" gives [""] and id is empty
    // parseRoomId("validtype:validid") returns { type: "validtype", id: "validid" }

    // leaveAllRooms iterates data.rooms, calls parseRoomId, skips null
    await roomsModule.leaveAllRooms(socket);

    // The empty string should have been skipped (parseRoomId returns null).
    // The valid room should have triggered leaveRoom which calls socket.leave.
    // Since the rooms module is real here, it will call socket.leave for "validtype:validid"
    expect(socket.leave).toHaveBeenCalledWith("validtype:validid");

    // The empty/unparseable room should not trigger a leave call
    // (only 1 leave call for the valid one)
    expect(socket.leave).toHaveBeenCalledTimes(1);
  });
});
