/**
 * @fileoverview Coverage tests for socket/index.ts
 *
 * Targets uncovered lines:
 * - Line 165: socket "error" event handler
 * - Line 175: engine "connection_error" event handler
 *
 * This file requires mocking ALL socket sub-modules (auth, rooms, handlers,
 * health, etc.) because socket/index.ts imports them all. A separate file
 * is needed because these mocks conflict with the real imports used in
 * socket-coverage.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const _mockServerOn = vi.fn();
const _mockServerEngine = { on: vi.fn() };

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

const mockGetRoomStats = vi.fn().mockReturnValue({ totalRooms: 0, roomsByType: {} });

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
  getRedisClient: () => null,
}));

vi.mock("socket.io", () => {
  function Server(this: any) {
    this.on = _mockServerOn;
    this.use = vi.fn();
    this.emit = vi.fn();
    this.close = vi.fn((cb: () => void) => cb());
    this.fetchSockets = vi.fn().mockResolvedValue([]);
    this.engine = _mockServerEngine;
    return this;
  }
  return { Server };
});

vi.mock("../../socket/auth", () => ({
  socketAuthMiddleware: vi.fn(),
}));

vi.mock("../../socket/rooms", () => ({
  joinRoom: vi.fn(),
  leaveRoom: vi.fn(),
  leaveAllRooms: vi.fn(),
  getRoomStats: (...args: any[]) => mockGetRoomStats(...args),
  getRoomId: vi.fn(),
  parseRoomId: vi.fn(),
  cleanupEmptyRooms: vi.fn(),
  broadcastToRoom: vi.fn(),
  sendToUser: vi.fn(),
  getRoomInfo: vi.fn(),
  getRoomsByType: vi.fn(),
  stopRoomCleanup: vi.fn(),
}));

vi.mock("../../socket/handlers/battle", () => ({
  registerBattleHandlers: vi.fn(),
  cleanupBattleSubscriptions: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../socket/handlers/presence", () => ({
  registerPresenceHandlers: vi.fn(),
  handlePresenceDisconnect: vi.fn(),
  getPresenceStats: vi.fn().mockResolvedValue({ onlineUsers: 0 }),
  getOnlineUsers: vi.fn().mockResolvedValue([]),
  isUserOnline: vi.fn().mockResolvedValue(false),
  getUserPresence: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../socket/health", () => ({
  initSocketHealth: (...args: any[]) => mockInitSocketHealth(...args),
  cleanupSocketHealth: (...args: any[]) => mockCleanupSocketHealth(...args),
  startHealthMonitor: (...args: any[]) => mockStartHealthMonitor(...args),
  stopHealthMonitor: (...args: any[]) => mockStopHealthMonitor(...args),
  getHealthStats: (...args: any[]) => mockGetHealthStats(...args),
}));

vi.mock("../../socket/socketRateLimit", () => ({
  registerRateLimitRules: vi.fn(),
  checkRateLimit: vi.fn().mockReturnValue(true),
  cleanupRateLimits: vi.fn(),
}));

vi.mock("../../services/battleTimeoutScheduler", () => ({
  startTimeoutScheduler: vi.fn(),
  stopTimeoutScheduler: vi.fn(),
  forceTimeoutCheck: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../config/constants", () => ({
  SOCKET_PING_TIMEOUT_MS: 20_000,
  SOCKET_PING_INTERVAL_MS: 25_000,
  SOCKET_UPGRADE_TIMEOUT_MS: 10_000,
  SOCKET_MAX_HTTP_BUFFER_SIZE: 1_048_576,
  SOCKET_MAX_DISCONNECTION_DURATION_MS: 120_000,
}));

// ============================================================================
// Imports
// ============================================================================

const { initializeSocketServer, shutdownSocketServer } = await import("../../socket/index");
const logger = (await import("../../logger")).default;

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  mockStartHealthMonitor.mockReturnValue(42);
  mockGetHealthStats.mockReturnValue({
    totalSockets: 0,
    avgLatency: 0,
    highLatencyCount: 0,
    staleConnections: 0,
  });
  mockGetRoomStats.mockReturnValue({ totalRooms: 0, roomsByType: {} });
});

describe("Socket Index — edge cases (lines 165, 175)", () => {
  it("socket error handler logs errors (line 165)", async () => {
    initializeSocketServer({} as any);

    const connectionCall = _mockServerOn.mock.calls.find((call: any[]) => call[0] === "connection");
    expect(connectionCall).toBeDefined();

    const connectionHandler = connectionCall![1];

    const socketHandlers = new Map<string, Function>();
    const mockSocket = {
      id: "socket-error-test",
      data: { odv: "user-error", rooms: new Set() },
      conn: { transport: { name: "websocket" } },
      on: vi.fn((event: string, handler: Function) => {
        socketHandlers.set(event, handler);
      }),
      emit: vi.fn(),
      join: vi.fn(),
    };

    await connectionHandler(mockSocket);

    const errorHandler = socketHandlers.get("error");
    expect(errorHandler).toBeDefined();
    errorHandler!(new Error("test socket error"));

    expect(logger.error).toHaveBeenCalledWith(
      "[Socket] Socket error",
      expect.objectContaining({
        socketId: "socket-error-test",
        error: "test socket error",
      })
    );
  });

  it("socket error handler handles non-Error values (line 193)", async () => {
    initializeSocketServer({} as any);

    const connectionCall = _mockServerOn.mock.calls.find((call: any[]) => call[0] === "connection");
    const connectionHandler = connectionCall![1];

    const socketHandlers = new Map<string, Function>();
    const mockSocket = {
      id: "socket-nonerror-test",
      data: { odv: "user-nonerror", rooms: new Set() },
      conn: { transport: { name: "websocket" } },
      on: vi.fn((event: string, handler: Function) => {
        socketHandlers.set(event, handler);
      }),
      emit: vi.fn(),
      join: vi.fn(),
    };

    await connectionHandler(mockSocket);

    const errorHandler = socketHandlers.get("error");
    expect(errorHandler).toBeDefined();
    // Pass a non-Error value
    errorHandler!("string error value");

    expect(logger.error).toHaveBeenCalledWith(
      "[Socket] Socket error",
      expect.objectContaining({
        socketId: "socket-nonerror-test",
        error: "Unknown error",
      })
    );
  });

  it("engine connection_error handler logs errors (line 175)", () => {
    initializeSocketServer({} as any);

    const engineErrorCall = _mockServerEngine.on.mock.calls.find(
      (call: any[]) => call[0] === "connection_error"
    );
    expect(engineErrorCall).toBeDefined();

    const engineErrorHandler = engineErrorCall![1];
    engineErrorHandler({ code: 1, message: "Transport error", context: {} });

    expect(logger.error).toHaveBeenCalledWith(
      "[Socket] Connection error",
      expect.objectContaining({
        code: 1,
        message: "Transport error",
      })
    );
  });

  it("room:join rate limit emits error when throttled (lines 134-136)", async () => {
    // Mock checkRateLimit to return false for room:join
    const { checkRateLimit } = await import("../../socket/socketRateLimit");
    vi.mocked(checkRateLimit).mockReturnValue(false);

    initializeSocketServer({} as any);

    const connectionCall = _mockServerOn.mock.calls.find((call: any[]) => call[0] === "connection");
    const connectionHandler = connectionCall![1];

    const socketHandlers = new Map<string, Function>();
    const mockSocket = {
      id: "socket-rl-join-test",
      data: { odv: "user-rl", rooms: new Set() },
      conn: { transport: { name: "websocket" } },
      on: vi.fn((event: string, handler: Function) => {
        socketHandlers.set(event, handler);
      }),
      emit: vi.fn(),
      join: vi.fn(),
    };

    await connectionHandler(mockSocket);

    const roomJoinHandler = socketHandlers.get("room:join");
    expect(roomJoinHandler).toBeDefined();
    await roomJoinHandler!("battle", "room-1");

    expect(mockSocket.emit).toHaveBeenCalledWith("error", {
      code: "rate_limited",
      message: "Too many room joins, slow down",
    });

    // Restore checkRateLimit
    vi.mocked(checkRateLimit).mockReturnValue(true);
  });

  it("room:leave rate limit emits error when throttled (lines 146-147)", async () => {
    const { checkRateLimit } = await import("../../socket/socketRateLimit");
    vi.mocked(checkRateLimit).mockReturnValue(false);

    initializeSocketServer({} as any);

    const connectionCall = _mockServerOn.mock.calls.find((call: any[]) => call[0] === "connection");
    const connectionHandler = connectionCall![1];

    const socketHandlers = new Map<string, Function>();
    const mockSocket = {
      id: "socket-rl-leave-test",
      data: { odv: "user-rl", rooms: new Set() },
      conn: { transport: { name: "websocket" } },
      on: vi.fn((event: string, handler: Function) => {
        socketHandlers.set(event, handler);
      }),
      emit: vi.fn(),
      join: vi.fn(),
    };

    await connectionHandler(mockSocket);

    const roomLeaveHandler = socketHandlers.get("room:leave");
    expect(roomLeaveHandler).toBeDefined();
    await roomLeaveHandler!("battle", "room-1");

    expect(mockSocket.emit).toHaveBeenCalledWith("error", {
      code: "rate_limited",
      message: "Too many room leaves, slow down",
    });

    vi.mocked(checkRateLimit).mockReturnValue(true);
  });

  it("typing handler broadcasts when user is in the room (line 161-165)", async () => {
    const { checkRateLimit } = await import("../../socket/socketRateLimit");
    vi.mocked(checkRateLimit).mockReturnValue(true);

    initializeSocketServer({} as any);

    const connectionCall = _mockServerOn.mock.calls.find((call: any[]) => call[0] === "connection");
    const connectionHandler = connectionCall![1];

    const socketHandlers = new Map<string, Function>();
    const toEmitMock = vi.fn();
    const mockSocket = {
      id: "socket-typing-test",
      data: { odv: "user-typing", rooms: new Set(["spot:room-abc"]) },
      conn: { transport: { name: "websocket" } },
      on: vi.fn((event: string, handler: Function) => {
        socketHandlers.set(event, handler);
      }),
      emit: vi.fn(),
      join: vi.fn(),
      to: vi.fn().mockReturnValue({ emit: toEmitMock }),
    };

    await connectionHandler(mockSocket);

    const typingHandler = socketHandlers.get("typing");
    expect(typingHandler).toBeDefined();

    // When user IS in the room, it should broadcast
    typingHandler!("spot:room-abc", true);
    expect(mockSocket.to).toHaveBeenCalledWith("spot:room-abc");
    expect(toEmitMock).toHaveBeenCalledWith("typing", {
      odv: "user-typing",
      roomId: "spot:room-abc",
      isTyping: true,
    });

    vi.mocked(checkRateLimit).mockReturnValue(true);
  });

  it("typing handler does not broadcast when user is NOT in the room (line 160)", async () => {
    const { checkRateLimit } = await import("../../socket/socketRateLimit");
    vi.mocked(checkRateLimit).mockReturnValue(true);

    initializeSocketServer({} as any);

    const connectionCall = _mockServerOn.mock.calls.find((call: any[]) => call[0] === "connection");
    const connectionHandler = connectionCall![1];

    const socketHandlers = new Map<string, Function>();
    const toEmitMock = vi.fn();
    const mockSocket = {
      id: "socket-typing-noroom",
      data: { odv: "user-typing-2", rooms: new Set(["spot:other-room"]) },
      conn: { transport: { name: "websocket" } },
      on: vi.fn((event: string, handler: Function) => {
        socketHandlers.set(event, handler);
      }),
      emit: vi.fn(),
      join: vi.fn(),
      to: vi.fn().mockReturnValue({ emit: toEmitMock }),
    };

    await connectionHandler(mockSocket);

    const typingHandler = socketHandlers.get("typing");
    typingHandler!("spot:room-xyz", true);

    // Should NOT broadcast since user isn't in "spot:room-xyz"
    expect(toEmitMock).not.toHaveBeenCalled();

    vi.mocked(checkRateLimit).mockReturnValue(true);
  });

  it("typing handler is silenced by rate limit (line 159)", async () => {
    const { checkRateLimit } = await import("../../socket/socketRateLimit");
    vi.mocked(checkRateLimit).mockReturnValue(false);

    initializeSocketServer({} as any);

    const connectionCall = _mockServerOn.mock.calls.find((call: any[]) => call[0] === "connection");
    const connectionHandler = connectionCall![1];

    const socketHandlers = new Map<string, Function>();
    const toEmitMock = vi.fn();
    const mockSocket = {
      id: "socket-typing-rl",
      data: { odv: "user-rl-typing", rooms: new Set(["spot:room-abc"]) },
      conn: { transport: { name: "websocket" } },
      on: vi.fn((event: string, handler: Function) => {
        socketHandlers.set(event, handler);
      }),
      emit: vi.fn(),
      join: vi.fn(),
      to: vi.fn().mockReturnValue({ emit: toEmitMock }),
    };

    await connectionHandler(mockSocket);

    const typingHandler = socketHandlers.get("typing");
    typingHandler!("spot:room-abc", true);

    // Rate limited - should NOT broadcast
    expect(toEmitMock).not.toHaveBeenCalled();

    vi.mocked(checkRateLimit).mockReturnValue(true);
  });

  it("disconnect handler runs full cleanup sequence (lines 170-186)", async () => {
    const { checkRateLimit, cleanupRateLimits: mockCleanupRL } =
      await import("../../socket/socketRateLimit");
    vi.mocked(checkRateLimit).mockReturnValue(true);

    initializeSocketServer({} as any);

    const connectionCall = _mockServerOn.mock.calls.find((call: any[]) => call[0] === "connection");
    const connectionHandler = connectionCall![1];

    const socketHandlers = new Map<string, Function>();
    const mockSocket = {
      id: "socket-disconnect-test",
      data: { odv: "user-disconnect", rooms: new Set() },
      conn: { transport: { name: "websocket" } },
      on: vi.fn((event: string, handler: Function) => {
        socketHandlers.set(event, handler);
      }),
      emit: vi.fn(),
      join: vi.fn(),
    };

    await connectionHandler(mockSocket);

    const disconnectHandler = socketHandlers.get("disconnect");
    expect(disconnectHandler).toBeDefined();

    await disconnectHandler!("transport close");

    // Verify cleanup functions were called
    const { cleanupBattleSubscriptions } = await import("../../socket/handlers/battle");
    const { leaveAllRooms } = await import("../../socket/rooms");
    const { handlePresenceDisconnect } = await import("../../socket/handlers/presence");

    expect(cleanupBattleSubscriptions).toHaveBeenCalledWith(mockSocket);
    expect(leaveAllRooms).toHaveBeenCalledWith(mockSocket);
    expect(handlePresenceDisconnect).toHaveBeenCalled();
    expect(mockCleanupSocketHealth).toHaveBeenCalledWith("socket-disconnect-test");
    expect(mockCleanupRL).toHaveBeenCalledWith("socket-disconnect-test");

    expect(logger.info).toHaveBeenCalledWith(
      "[Socket] Client disconnected",
      expect.objectContaining({
        socketId: "socket-disconnect-test",
        reason: "transport close",
      })
    );
  });

  it("connection handler emits 'connected' and registers handlers (lines 121-129)", async () => {
    const { checkRateLimit } = await import("../../socket/socketRateLimit");
    vi.mocked(checkRateLimit).mockReturnValue(true);

    initializeSocketServer({} as any);

    const connectionCall = _mockServerOn.mock.calls.find((call: any[]) => call[0] === "connection");
    const connectionHandler = connectionCall![1];

    const socketHandlers = new Map<string, Function>();
    const mockSocket = {
      id: "socket-connect-test",
      data: { odv: "user-connect", rooms: new Set() },
      conn: { transport: { name: "websocket" } },
      on: vi.fn((event: string, handler: Function) => {
        socketHandlers.set(event, handler);
      }),
      emit: vi.fn(),
      join: vi.fn(),
    };

    await connectionHandler(mockSocket);

    // Should emit 'connected' event
    expect(mockSocket.emit).toHaveBeenCalledWith(
      "connected",
      expect.objectContaining({
        userId: "user-connect",
        serverTime: expect.any(String),
      })
    );

    // Should have registered handlers for room:join, room:leave, typing, disconnect, error
    expect(socketHandlers.has("room:join")).toBe(true);
    expect(socketHandlers.has("room:leave")).toBe(true);
    expect(socketHandlers.has("typing")).toBe(true);
    expect(socketHandlers.has("disconnect")).toBe(true);
    expect(socketHandlers.has("error")).toBe(true);

    // Should have called registerPresenceHandlers, registerBattleHandlers
    const { registerPresenceHandlers } = await import("../../socket/handlers/presence");
    const { registerBattleHandlers } = await import("../../socket/handlers/battle");

    expect(registerPresenceHandlers).toHaveBeenCalled();
    expect(registerBattleHandlers).toHaveBeenCalled();

    vi.mocked(checkRateLimit).mockReturnValue(true);
  });

  it("room:join calls joinRoom when not rate limited", async () => {
    const { checkRateLimit } = await import("../../socket/socketRateLimit");
    vi.mocked(checkRateLimit).mockReturnValue(true);

    initializeSocketServer({} as any);

    const connectionCall = _mockServerOn.mock.calls.find((call: any[]) => call[0] === "connection");
    const connectionHandler = connectionCall![1];

    const socketHandlers = new Map<string, Function>();
    const mockSocket = {
      id: "socket-join-test",
      data: { odv: "user-join", rooms: new Set() },
      conn: { transport: { name: "websocket" } },
      on: vi.fn((event: string, handler: Function) => {
        socketHandlers.set(event, handler);
      }),
      emit: vi.fn(),
      join: vi.fn(),
    };

    await connectionHandler(mockSocket);

    const roomJoinHandler = socketHandlers.get("room:join");
    await roomJoinHandler!("battle", "room-1");

    const { joinRoom } = await import("../../socket/rooms");
    expect(joinRoom).toHaveBeenCalledWith(mockSocket, "battle", "room-1");

    vi.mocked(checkRateLimit).mockReturnValue(true);
  });

  it("room:leave calls leaveRoom when not rate limited", async () => {
    const { checkRateLimit } = await import("../../socket/socketRateLimit");
    vi.mocked(checkRateLimit).mockReturnValue(true);

    initializeSocketServer({} as any);

    const connectionCall = _mockServerOn.mock.calls.find((call: any[]) => call[0] === "connection");
    const connectionHandler = connectionCall![1];

    const socketHandlers = new Map<string, Function>();
    const mockSocket = {
      id: "socket-leave-test",
      data: { odv: "user-leave", rooms: new Set() },
      conn: { transport: { name: "websocket" } },
      on: vi.fn((event: string, handler: Function) => {
        socketHandlers.set(event, handler);
      }),
      emit: vi.fn(),
      join: vi.fn(),
    };

    await connectionHandler(mockSocket);

    const roomLeaveHandler = socketHandlers.get("room:leave");
    await roomLeaveHandler!("game", "room-2");

    const { leaveRoom } = await import("../../socket/rooms");
    expect(leaveRoom).toHaveBeenCalledWith(mockSocket, "game", "room-2");

    vi.mocked(checkRateLimit).mockReturnValue(true);
  });

  it("shutdownSocketServer skips stopHealthMonitor when healthMonitorInterval is null (line 264)", async () => {
    const io = initializeSocketServer({} as any);

    // First shutdown sets healthMonitorInterval to null
    await shutdownSocketServer(io as any);

    vi.clearAllMocks();
    mockStartHealthMonitor.mockReturnValue(42);

    // Second shutdown — healthMonitorInterval is already null, so stopHealthMonitor should NOT be called
    await shutdownSocketServer(io as any);

    expect(mockStopHealthMonitor).not.toHaveBeenCalled();
  });

  it("logs warning when ALLOWED_ORIGINS is not set in production (line 204)", () => {
    const origEnv = process.env.NODE_ENV;
    const origOrigins = process.env.ALLOWED_ORIGINS;
    delete process.env.ALLOWED_ORIGINS;
    process.env.NODE_ENV = "production";

    initializeSocketServer({} as any);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("ALLOWED_ORIGINS is not set"));

    // Restore
    process.env.NODE_ENV = origEnv;
    if (origOrigins !== undefined) {
      process.env.ALLOWED_ORIGINS = origOrigins;
    }
  });
});
