/**
 * @fileoverview Unit tests for Socket.io server initialization (socket/index.ts)
 *
 * Tests:
 * - initializeSocketServer: creates Server with correct config, sets up auth middleware,
 *   registers connection handler
 * - Connection handler: increments counter, registers feature handlers, sets up
 *   room/typing/disconnect/error listeners
 * - getSocketStats: returns stats object with connections, rooms, presence, health
 * - broadcastSystemNotification: emits notification event to all clients
 * - shutdownSocketServer: graceful shutdown sequence (stop monitors, disconnect, close)
 * - Disconnect handler: decrements counter and cleans up subscriptions
 *
 * All external dependencies are fully mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks -- declared before any application imports
// ============================================================================

// -- socket.io Server mock ---------------------------------------------------

const mockUse = vi.fn();
const mockOn = vi.fn();
const mockEmit = vi.fn();
const mockFetchSockets = vi.fn().mockResolvedValue([]);
const mockClose = vi.fn((cb: Function) => cb());
const mockEngine = { on: vi.fn() };

let serverConstructorArgs: unknown[] = [];

vi.mock("socket.io", () => ({
  Server: vi.fn().mockImplementation(function (this: any, ...args: unknown[]) {
    serverConstructorArgs = args;
    this.use = mockUse;
    this.on = mockOn;
    this.emit = mockEmit;
    this.fetchSockets = mockFetchSockets;
    this.close = mockClose;
    this.engine = mockEngine;
    return this;
  }),
}));

// -- ../socket/auth ----------------------------------------------------------

const mockSocketAuthMiddleware = vi.fn();

vi.mock("../../socket/auth", () => ({
  socketAuthMiddleware: mockSocketAuthMiddleware,
}));

// -- ../socket/rooms ---------------------------------------------------------

const mockJoinRoom = vi.fn();
const mockLeaveRoom = vi.fn();
const mockLeaveAllRooms = vi.fn();
const mockGetRoomStats = vi.fn(() => ({}));

vi.mock("../../socket/rooms", () => ({
  joinRoom: mockJoinRoom,
  leaveRoom: mockLeaveRoom,
  leaveAllRooms: mockLeaveAllRooms,
  getRoomStats: mockGetRoomStats,
  stopRoomCleanup: vi.fn(),
}));

// -- ../socket/handlers/battle -----------------------------------------------

const mockRegisterBattleHandlers = vi.fn();
const mockCleanupBattleSubscriptions = vi.fn().mockResolvedValue(undefined);

vi.mock("../../socket/handlers/battle", () => ({
  registerBattleHandlers: mockRegisterBattleHandlers,
  cleanupBattleSubscriptions: mockCleanupBattleSubscriptions,
}));

// -- ../socket/handlers/presence ---------------------------------------------

const mockRegisterPresenceHandlers = vi.fn();
const mockHandlePresenceDisconnect = vi.fn();
const mockGetPresenceStats = vi.fn().mockResolvedValue({});

vi.mock("../../socket/handlers/presence", () => ({
  registerPresenceHandlers: mockRegisterPresenceHandlers,
  handlePresenceDisconnect: mockHandlePresenceDisconnect,
  getPresenceStats: mockGetPresenceStats,
}));

// -- ../socket/health --------------------------------------------------------

const mockInitSocketHealth = vi.fn();
const mockCleanupSocketHealth = vi.fn();
const mockStartHealthMonitor = vi.fn(() => setInterval(() => {}, 99999));
const mockStopHealthMonitor = vi.fn();
const mockGetHealthStats = vi.fn(() => ({}));

vi.mock("../../socket/health", () => ({
  initSocketHealth: mockInitSocketHealth,
  cleanupSocketHealth: mockCleanupSocketHealth,
  startHealthMonitor: mockStartHealthMonitor,
  stopHealthMonitor: mockStopHealthMonitor,
  getHealthStats: mockGetHealthStats,
}));

// -- ../services/battleTimeoutScheduler --------------------------------------------

const mockStartTimeoutScheduler = vi.fn();
const mockStopTimeoutScheduler = vi.fn();

vi.mock("../../services/battleTimeoutScheduler", () => ({
  startTimeoutScheduler: mockStartTimeoutScheduler,
  stopTimeoutScheduler: mockStopTimeoutScheduler,
}));

// -- ../logger ---------------------------------------------------------------

vi.mock("../../logger", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// -- ../config/constants -----------------------------------------------------

vi.mock("../../config/constants", () => ({
  SOCKET_PING_TIMEOUT_MS: 5000,
  SOCKET_PING_INTERVAL_MS: 25000,
  SOCKET_UPGRADE_TIMEOUT_MS: 10000,
  SOCKET_MAX_HTTP_BUFFER_SIZE: 1e6,
  SOCKET_MAX_DISCONNECTION_DURATION_MS: 120000,
}));

// ============================================================================
// Dynamic imports (after mocks are registered)
// ============================================================================

const {
  initializeSocketServer,
  getSocketStats,
  broadcastSystemNotification,
  shutdownSocketServer,
} = await import("../../socket/index");

const logger = (await import("../../logger")).default;

// ============================================================================
// Helpers
// ============================================================================

/** Create a mock socket with event listener capture */
function createMockSocket(overrides: Record<string, any> = {}) {
  return {
    id: "socket-1",
    data: { odv: "user-1" },
    conn: { transport: { name: "websocket" } },
    emit: vi.fn(),
    on: vi.fn(),
    to: vi.fn(() => ({ emit: vi.fn() })),
    ...overrides,
  };
}

/**
 * Initialize the server, then extract and return the "connection" callback
 * registered via io.on("connection", handler).
 */
function getConnectionHandler() {
  initializeSocketServer({} as any);
  const call = mockOn.mock.calls.find((c) => c[0] === "connection");
  if (!call) throw new Error("No connection handler registered");
  return call[1] as (socket: any) => Promise<void>;
}

/**
 * Given a mock socket that has had .on() called on it, find the handler
 * registered for the given event name.
 */
function getSocketEventHandler(mockSocket: any, eventName: string) {
  const call = mockSocket.on.mock.calls.find((c: any[]) => c[0] === eventName);
  if (!call) throw new Error(`No handler registered for "${eventName}"`);
  return call[1] as (...args: any[]) => any;
}

// ============================================================================
// Tests
// ============================================================================

describe("Socket Server Initialization (socket/index.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serverConstructorArgs = [];

    // Restore default return values after clearAllMocks
    mockStartHealthMonitor.mockReturnValue(setInterval(() => {}, 99999));
    mockGetRoomStats.mockReturnValue({});
    mockGetPresenceStats.mockResolvedValue({});
    mockGetHealthStats.mockReturnValue({});
    mockFetchSockets.mockResolvedValue([]);
    mockClose.mockImplementation((cb: Function) => cb());
    mockCleanupBattleSubscriptions.mockResolvedValue(undefined);
  });

  // ==========================================================================
  // initializeSocketServer
  // ==========================================================================

  describe("initializeSocketServer", () => {
    it("creates a Socket.io Server with the correct configuration", () => {
      const fakeHttp = {} as any;
      initializeSocketServer(fakeHttp);

      expect(serverConstructorArgs[0]).toBe(fakeHttp);

      const options = serverConstructorArgs[1] as Record<string, any>;
      expect(options).toEqual(
        expect.objectContaining({
          transports: ["websocket", "polling"],
          pingTimeout: 5000,
          pingInterval: 25000,
          upgradeTimeout: 10000,
          maxHttpBufferSize: 1e6,
          connectionStateRecovery: expect.objectContaining({
            maxDisconnectionDuration: 120000,
            skipMiddlewares: false,
          }),
        })
      );
      expect(options.cors).toBeDefined();
    });

    it("sets up auth middleware via io.use()", () => {
      initializeSocketServer({} as any);

      expect(mockUse).toHaveBeenCalledWith(mockSocketAuthMiddleware);
    });

    it("registers a connection handler on the io instance", () => {
      initializeSocketServer({} as any);

      expect(mockOn).toHaveBeenCalledWith("connection", expect.any(Function));
    });

    it("starts the health monitor with the io instance", () => {
      const io = initializeSocketServer({} as any);

      expect(mockStartHealthMonitor).toHaveBeenCalledWith(io);
    });

    it("starts the timeout scheduler", () => {
      initializeSocketServer({} as any);

      expect(mockStartTimeoutScheduler).toHaveBeenCalled();
    });

    it("registers an engine-level connection_error handler", () => {
      initializeSocketServer({} as any);

      expect(mockEngine.on).toHaveBeenCalledWith("connection_error", expect.any(Function));
    });

    it("returns the io server instance", () => {
      const io = initializeSocketServer({} as any);

      expect(io.on).toBe(mockOn);
      expect(io.use).toBe(mockUse);
      expect(io.emit).toBe(mockEmit);
    });
  });

  // ==========================================================================
  // Connection handler
  // ==========================================================================

  describe("connection handler", () => {
    it("increments connected socket counter and registers all feature handlers", async () => {
      const connectionHandler = getConnectionHandler();
      const mockSocket = createMockSocket();

      await connectionHandler(mockSocket);

      // Health tracking initialized
      expect(mockInitSocketHealth).toHaveBeenCalledWith(mockSocket);

      // Feature handlers registered
      expect(mockRegisterPresenceHandlers).toHaveBeenCalledWith(expect.anything(), mockSocket);
      expect(mockRegisterBattleHandlers).toHaveBeenCalledWith(expect.anything(), mockSocket);
    });

    it("emits a 'connected' event to the socket with userId and serverTime", async () => {
      const connectionHandler = getConnectionHandler();
      const mockSocket = createMockSocket({ data: { odv: "user-42" } });

      await connectionHandler(mockSocket);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        "connected",
        expect.objectContaining({
          userId: "user-42",
          serverTime: expect.any(String),
        })
      );
    });

    it("registers room:join, room:leave, typing, disconnect, and error listeners on the socket", async () => {
      const connectionHandler = getConnectionHandler();
      const mockSocket = createMockSocket();

      await connectionHandler(mockSocket);

      const registeredEvents = mockSocket.on.mock.calls.map((c: any[]) => c[0]);
      expect(registeredEvents).toContain("room:join");
      expect(registeredEvents).toContain("room:leave");
      expect(registeredEvents).toContain("typing");
      expect(registeredEvents).toContain("disconnect");
      expect(registeredEvents).toContain("error");
    });

    it("room:join handler calls joinRoom with socket, roomType, and roomId", async () => {
      const connectionHandler = getConnectionHandler();
      const mockSocket = createMockSocket();
      await connectionHandler(mockSocket);

      const roomJoinHandler = getSocketEventHandler(mockSocket, "room:join");
      await roomJoinHandler("battle", "room-abc");

      expect(mockJoinRoom).toHaveBeenCalledWith(mockSocket, "battle", "room-abc");
    });

    it("room:leave handler calls leaveRoom with socket, roomType, and roomId", async () => {
      const connectionHandler = getConnectionHandler();
      const mockSocket = createMockSocket();
      await connectionHandler(mockSocket);

      const roomLeaveHandler = getSocketEventHandler(mockSocket, "room:leave");
      await roomLeaveHandler("game", "room-xyz");

      expect(mockLeaveRoom).toHaveBeenCalledWith(mockSocket, "game", "room-xyz");
    });

    it("typing handler broadcasts typing indicator to the specified room", async () => {
      const connectionHandler = getConnectionHandler();
      const roomEmitFn = vi.fn();
      const mockSocket = createMockSocket({
        data: { odv: "user-1", rooms: new Set(["room-chat"]) },
        to: vi.fn(() => ({ emit: roomEmitFn })),
      });
      await connectionHandler(mockSocket);

      const typingHandler = getSocketEventHandler(mockSocket, "typing");
      typingHandler("room-chat", true);

      expect(mockSocket.to).toHaveBeenCalledWith("room-chat");
      expect(roomEmitFn).toHaveBeenCalledWith("typing", {
        odv: "user-1",
        roomId: "room-chat",
        isTyping: true,
      });
    });

    it("logs connection info", async () => {
      const connectionHandler = getConnectionHandler();
      const mockSocket = createMockSocket();

      await connectionHandler(mockSocket);

      expect(logger.info).toHaveBeenCalledWith(
        "[Socket] Client connected",
        expect.objectContaining({
          socketId: "socket-1",
          odv: "user-1",
          transport: "websocket",
        })
      );
    });
  });

  // ==========================================================================
  // Disconnect handler
  // ==========================================================================

  describe("disconnect handler", () => {
    it("decrements connected socket counter and cleans up all subscriptions", async () => {
      const connectionHandler = getConnectionHandler();
      const mockSocket = createMockSocket();

      // Connect first (increments counter)
      await connectionHandler(mockSocket);

      // Get the disconnect handler
      const disconnectHandler = getSocketEventHandler(mockSocket, "disconnect");
      await disconnectHandler("transport close");

      // Cleanup functions called
      expect(mockCleanupBattleSubscriptions).toHaveBeenCalledWith(mockSocket);
      expect(mockLeaveAllRooms).toHaveBeenCalledWith(mockSocket);
      expect(mockHandlePresenceDisconnect).toHaveBeenCalledWith(expect.anything(), mockSocket);
      expect(mockCleanupSocketHealth).toHaveBeenCalledWith("socket-1");
    });

    it("logs disconnection with reason", async () => {
      const connectionHandler = getConnectionHandler();
      const mockSocket = createMockSocket();
      await connectionHandler(mockSocket);

      const disconnectHandler = getSocketEventHandler(mockSocket, "disconnect");
      await disconnectHandler("ping timeout");

      expect(logger.info).toHaveBeenCalledWith(
        "[Socket] Client disconnected",
        expect.objectContaining({
          socketId: "socket-1",
          odv: "user-1",
          reason: "ping timeout",
        })
      );
    });
  });

  // ==========================================================================
  // getSocketStats
  // ==========================================================================

  describe("getSocketStats", () => {
    it("returns a stats object with connections, rooms, presence, and health", async () => {
      const stats = await getSocketStats();

      expect(stats).toEqual({
        connections: expect.any(Number),
        rooms: expect.any(Object),
        presence: expect.any(Object),
        health: expect.any(Object),
      });
    });

    it("calls getRoomStats, getPresenceStats, and getHealthStats", async () => {
      await getSocketStats();

      expect(mockGetRoomStats).toHaveBeenCalled();
      expect(mockGetPresenceStats).toHaveBeenCalled();
      expect(mockGetHealthStats).toHaveBeenCalled();
    });

    it("returns values from underlying stat functions", async () => {
      mockGetRoomStats.mockReturnValue({ totalRooms: 3 });
      mockGetPresenceStats.mockResolvedValue({ onlineUsers: 7 });
      mockGetHealthStats.mockReturnValue({ avgLatency: 22 });

      const stats = await getSocketStats();

      expect(stats.rooms).toEqual({ totalRooms: 3 });
      expect(stats.presence).toEqual({ onlineUsers: 7 });
      expect(stats.health).toEqual({ avgLatency: 22 });
    });
  });

  // ==========================================================================
  // broadcastSystemNotification
  // ==========================================================================

  describe("broadcastSystemNotification", () => {
    it("emits a notification event to all connected clients", () => {
      const mockIo = { emit: vi.fn() } as any;

      broadcastSystemNotification(mockIo, "Alert", "Something happened");

      expect(mockIo.emit).toHaveBeenCalledTimes(1);
      expect(mockIo.emit).toHaveBeenCalledWith(
        "notification",
        expect.objectContaining({
          type: "system",
          title: "Alert",
          message: "Something happened",
        })
      );
    });

    it("includes an id prefixed with 'system-' and a valid ISO createdAt timestamp", () => {
      const mockIo = { emit: vi.fn() } as any;

      broadcastSystemNotification(mockIo, "Test", "Test message");

      const payload = mockIo.emit.mock.calls[0][1];
      expect(payload.id).toMatch(/^system-\d+$/);
      expect(payload.createdAt).toBeDefined();
      expect(new Date(payload.createdAt).toISOString()).toBe(payload.createdAt);
    });
  });

  // ==========================================================================
  // shutdownSocketServer
  // ==========================================================================

  describe("shutdownSocketServer", () => {
    /** Helper: initialize, then clear mocks so shutdown assertions are clean */
    function initAndPrepareForShutdown() {
      const io = initializeSocketServer({} as any);
      vi.clearAllMocks();
      // Re-set defaults after clearAllMocks
      mockClose.mockImplementation((cb: Function) => cb());
      mockFetchSockets.mockResolvedValue([]);
      return io;
    }

    it("stops the health monitor", async () => {
      const io = initAndPrepareForShutdown();

      await shutdownSocketServer(io as any);

      expect(mockStopHealthMonitor).toHaveBeenCalled();
    });

    it("stops the timeout scheduler", async () => {
      const io = initAndPrepareForShutdown();

      await shutdownSocketServer(io as any);

      expect(mockStopTimeoutScheduler).toHaveBeenCalled();
    });

    it("broadcasts a maintenance notification before closing", async () => {
      const io = initAndPrepareForShutdown();

      await shutdownSocketServer(io as any);

      expect(mockEmit).toHaveBeenCalledWith(
        "notification",
        expect.objectContaining({
          type: "system",
          title: "Server Maintenance",
          message: "Server is restarting. You will be reconnected shortly.",
        })
      );
    });

    it("disconnects all connected sockets", async () => {
      const socket1 = { disconnect: vi.fn() };
      const socket2 = { disconnect: vi.fn() };

      const io = initAndPrepareForShutdown();
      mockFetchSockets.mockResolvedValue([socket1, socket2]);

      await shutdownSocketServer(io as any);

      expect(socket1.disconnect).toHaveBeenCalledWith(true);
      expect(socket2.disconnect).toHaveBeenCalledWith(true);
    });

    it("closes the server", async () => {
      const io = initAndPrepareForShutdown();

      await shutdownSocketServer(io as any);

      expect(mockClose).toHaveBeenCalledWith(expect.any(Function));
    });

    it("logs shutdown and closed messages", async () => {
      const io = initAndPrepareForShutdown();

      await shutdownSocketServer(io as any);

      expect(logger.info).toHaveBeenCalledWith("[Socket] Shutting down...");
      expect(logger.info).toHaveBeenCalledWith("[Socket] Server closed");
    });
  });
});
