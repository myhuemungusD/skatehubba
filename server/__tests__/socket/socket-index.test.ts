/**
 * @fileoverview Unit tests for Socket.io Server Setup (socket/index.ts)
 *
 * Tests:
 * - initializeSocketServer: creates Server with correct options, registers auth middleware
 * - getSocketStats: returns expected structure with connections, rooms, presence, health
 * - broadcastSystemNotification: emits notification to all connected clients
 * - shutdownSocketServer: graceful shutdown sequence
 *
 * All external dependencies are mocked since initializeSocketServer creates real
 * Socket.io servers. We mock the Server constructor and every imported module.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks — declared before any application imports
// ============================================================================

// -- socket.io Server mock --------------------------------------------------

const mockServerOn = vi.fn();
const mockServerUse = vi.fn();
const mockServerEmit = vi.fn();
const mockServerClose = vi.fn((cb: () => void) => cb());
const mockServerFetchSockets = vi.fn().mockResolvedValue([]);
const mockServerEngine = { on: vi.fn() };

const MockServerInstance = {
  on: mockServerOn,
  use: mockServerUse,
  emit: mockServerEmit,
  close: mockServerClose,
  fetchSockets: mockServerFetchSockets,
  engine: mockServerEngine,
};

/** Track constructor args for assertions */
let serverConstructorArgs: unknown[] = [];

vi.mock("socket.io", () => {
  // Must use a real function so `new Server(...)` works
  function Server(this: any, ...args: unknown[]) {
    serverConstructorArgs = args;
    Object.assign(this, MockServerInstance);
    return this;
  }
  return { Server };
});

// -- ./auth ------------------------------------------------------------------

const mockSocketAuthMiddleware = vi.fn();

vi.mock("../../socket/auth", () => ({
  socketAuthMiddleware: mockSocketAuthMiddleware,
}));

// -- ./rooms -----------------------------------------------------------------

const mockJoinRoom = vi.fn();
const mockLeaveRoom = vi.fn();
const mockLeaveAllRooms = vi.fn();
const mockGetRoomStats = vi.fn().mockReturnValue({
  totalRooms: 0,
  roomsByType: {},
});

vi.mock("../../socket/rooms", () => ({
  joinRoom: mockJoinRoom,
  leaveRoom: mockLeaveRoom,
  leaveAllRooms: mockLeaveAllRooms,
  getRoomStats: mockGetRoomStats,
  getRoomId: vi.fn(),
  parseRoomId: vi.fn(),
  cleanupEmptyRooms: vi.fn(),
  broadcastToRoom: vi.fn(),
  sendToUser: vi.fn(),
  getRoomInfo: vi.fn(),
  getRoomsByType: vi.fn(),
  stopRoomCleanup: vi.fn(),
}));

// -- ./handlers/battle -------------------------------------------------------

const mockRegisterBattleHandlers = vi.fn();
const mockCleanupBattleSubscriptions = vi.fn().mockResolvedValue(undefined);

vi.mock("../../socket/handlers/battle", () => ({
  registerBattleHandlers: mockRegisterBattleHandlers,
  cleanupBattleSubscriptions: mockCleanupBattleSubscriptions,
}));

// -- ./handlers/presence -----------------------------------------------------

const mockRegisterPresenceHandlers = vi.fn();
const mockHandlePresenceDisconnect = vi.fn();
const mockGetPresenceStats = vi.fn().mockResolvedValue({ onlineUsers: 0 });

vi.mock("../../socket/handlers/presence", () => ({
  registerPresenceHandlers: mockRegisterPresenceHandlers,
  handlePresenceDisconnect: mockHandlePresenceDisconnect,
  getPresenceStats: mockGetPresenceStats,
  getOnlineUsers: vi.fn().mockResolvedValue([]),
  isUserOnline: vi.fn().mockResolvedValue(false),
  getUserPresence: vi.fn().mockResolvedValue(null),
}));

// -- ./health ----------------------------------------------------------------

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

vi.mock("../../socket/health", () => ({
  initSocketHealth: mockInitSocketHealth,
  cleanupSocketHealth: mockCleanupSocketHealth,
  startHealthMonitor: mockStartHealthMonitor,
  stopHealthMonitor: mockStopHealthMonitor,
  getHealthStats: mockGetHealthStats,
}));

// -- ../services/battleTimeoutScheduler -------------------------------------------

const mockStartTimeoutScheduler = vi.fn();
const mockStopTimeoutScheduler = vi.fn();

vi.mock("../../services/battleTimeoutScheduler", () => ({
  startTimeoutScheduler: mockStartTimeoutScheduler,
  stopTimeoutScheduler: mockStopTimeoutScheduler,
  forceTimeoutCheck: vi.fn().mockResolvedValue(undefined),
}));

// -- ../logger ---------------------------------------------------------------

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

// -- ../config/constants -----------------------------------------------------

vi.mock("../../config/constants", () => ({
  SOCKET_PING_TIMEOUT_MS: 20_000,
  SOCKET_PING_INTERVAL_MS: 25_000,
  SOCKET_UPGRADE_TIMEOUT_MS: 10_000,
  SOCKET_MAX_HTTP_BUFFER_SIZE: 1_048_576,
  SOCKET_MAX_DISCONNECTION_DURATION_MS: 120_000,
}));

// ============================================================================
// Imports after mocks
// ============================================================================

const {
  initializeSocketServer,
  getSocketStats,
  broadcastSystemNotification,
  shutdownSocketServer,
} = await import("../../socket/index");

const logger = (await import("../../logger")).default;

// ============================================================================
// Tests
// ============================================================================

describe("Socket Server (socket/index.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serverConstructorArgs = [];
    // Reset defaults after clearAllMocks
    mockStartHealthMonitor.mockReturnValue(42);
    mockGetRoomStats.mockReturnValue({ totalRooms: 0, roomsByType: {} });
    mockGetPresenceStats.mockResolvedValue({ onlineUsers: 0 });
    mockGetHealthStats.mockReturnValue({
      totalSockets: 0,
      avgLatency: 0,
      highLatencyCount: 0,
      staleConnections: 0,
    });
    mockServerFetchSockets.mockResolvedValue([]);
    mockServerClose.mockImplementation((cb: () => void) => cb());
  });

  // ==========================================================================
  // initializeSocketServer
  // ==========================================================================

  describe("initializeSocketServer", () => {
    it("creates a Socket.io Server with the given httpServer and correct options", () => {
      const mockHttpServer = {} as any;
      initializeSocketServer(mockHttpServer);

      // The constructor was called with (httpServer, options)
      expect(serverConstructorArgs[0]).toBe(mockHttpServer);

      const options = serverConstructorArgs[1] as Record<string, any>;
      expect(options).toEqual(
        expect.objectContaining({
          cors: expect.any(Object),
          transports: ["websocket", "polling"],
          pingTimeout: 20_000,
          pingInterval: 25_000,
          upgradeTimeout: 10_000,
          maxHttpBufferSize: 1_048_576,
          connectionStateRecovery: expect.objectContaining({
            maxDisconnectionDuration: 120_000,
            skipMiddlewares: false,
          }),
        })
      );
    });

    it("registers the auth middleware via io.use", () => {
      initializeSocketServer({} as any);

      expect(mockServerUse).toHaveBeenCalledWith(mockSocketAuthMiddleware);
    });

    it("starts the health monitor", () => {
      const io = initializeSocketServer({} as any);

      expect(mockStartHealthMonitor).toHaveBeenCalledWith(io);
    });

    it("starts the timeout scheduler", () => {
      initializeSocketServer({} as any);

      expect(mockStartTimeoutScheduler).toHaveBeenCalled();
    });

    it("registers a 'connection' event handler", () => {
      initializeSocketServer({} as any);

      expect(mockServerOn).toHaveBeenCalledWith("connection", expect.any(Function));
    });

    it("returns the io server instance with expected methods", () => {
      const result = initializeSocketServer({} as any);

      // The returned object should have our mock methods (assigned via Object.assign)
      expect(result.on).toBe(mockServerOn);
      expect(result.use).toBe(mockServerUse);
      expect(result.emit).toBe(mockServerEmit);
    });

    it("logs server initialization", () => {
      initializeSocketServer({} as any);

      expect(logger.info).toHaveBeenCalledWith(
        "[Socket] Server initialized",
        expect.objectContaining({ transports: ["websocket", "polling"] })
      );
    });
  });

  // ==========================================================================
  // getSocketStats
  // ==========================================================================

  describe("getSocketStats", () => {
    it("returns an object with connections, rooms, presence, and health", async () => {
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
      mockGetRoomStats.mockReturnValue({ totalRooms: 5, roomsByType: { battle: 2, game: 3 } });
      mockGetPresenceStats.mockResolvedValue({ onlineUsers: 10 });
      mockGetHealthStats.mockReturnValue({
        totalSockets: 8,
        avgLatency: 45,
        highLatencyCount: 1,
        staleConnections: 0,
      });

      const stats = await getSocketStats();

      expect(stats.rooms).toEqual({ totalRooms: 5, roomsByType: { battle: 2, game: 3 } });
      expect(stats.presence).toEqual({ onlineUsers: 10 });
      expect(stats.health).toEqual({
        totalSockets: 8,
        avgLatency: 45,
        highLatencyCount: 1,
        staleConnections: 0,
      });
    });
  });

  // ==========================================================================
  // broadcastSystemNotification
  // ==========================================================================

  describe("broadcastSystemNotification", () => {
    it("emits a notification event to all clients", () => {
      const mockIo = { emit: vi.fn() } as any;

      broadcastSystemNotification(mockIo, "Maintenance", "Server restarting soon");

      expect(mockIo.emit).toHaveBeenCalledTimes(1);
      expect(mockIo.emit).toHaveBeenCalledWith(
        "notification",
        expect.objectContaining({
          type: "system",
          title: "Maintenance",
          message: "Server restarting soon",
        })
      );
    });

    it("includes an id starting with 'system-' and a createdAt timestamp", () => {
      const mockIo = { emit: vi.fn() } as any;

      broadcastSystemNotification(mockIo, "Update", "New version available");

      const payload = mockIo.emit.mock.calls[0][1];
      expect(payload.id).toMatch(/^system-\d+$/);
      expect(payload.createdAt).toBeDefined();
      // createdAt should be a valid ISO date string
      expect(new Date(payload.createdAt).toISOString()).toBe(payload.createdAt);
    });
  });

  // ==========================================================================
  // shutdownSocketServer
  // ==========================================================================

  describe("shutdownSocketServer", () => {
    /** Helper: initialize and return the io instance, then clear mocks for shutdown assertions */
    function initAndPrepareForShutdown() {
      const io = initializeSocketServer({} as any);
      vi.clearAllMocks();
      // Re-set mocks cleared above
      mockServerClose.mockImplementation((cb: () => void) => cb());
      mockServerFetchSockets.mockResolvedValue([]);
      return io;
    }

    it("stops the health monitor if it was started", async () => {
      const io = initAndPrepareForShutdown();

      await shutdownSocketServer(io as any);

      expect(mockStopHealthMonitor).toHaveBeenCalled();
    });

    it("stops the timeout scheduler", async () => {
      const io = initAndPrepareForShutdown();

      await shutdownSocketServer(io as any);

      expect(mockStopTimeoutScheduler).toHaveBeenCalled();
    });

    it("broadcasts a system notification about shutdown", async () => {
      const io = initAndPrepareForShutdown();

      await shutdownSocketServer(io as any);

      expect(mockServerEmit).toHaveBeenCalledWith(
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
      mockServerFetchSockets.mockResolvedValue([socket1, socket2]);

      await shutdownSocketServer(io as any);

      expect(socket1.disconnect).toHaveBeenCalledWith(true);
      expect(socket2.disconnect).toHaveBeenCalledWith(true);
    });

    it("closes the server", async () => {
      const io = initAndPrepareForShutdown();

      await shutdownSocketServer(io as any);

      expect(mockServerClose).toHaveBeenCalledWith(expect.any(Function));
    });

    it("logs shutdown messages", async () => {
      const io = initAndPrepareForShutdown();

      await shutdownSocketServer(io as any);

      expect(logger.info).toHaveBeenCalledWith("[Socket] Shutting down...");
      expect(logger.info).toHaveBeenCalledWith("[Socket] Server closed");
    });
  });
});
