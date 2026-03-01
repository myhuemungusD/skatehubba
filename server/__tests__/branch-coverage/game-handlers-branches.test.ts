/**
 * Branch coverage tests for game socket handler files:
 * - server/socket/handlers/game/cleanup.ts (lines 32-35)
 * - server/socket/handlers/game/roomManagement.ts (line 32)
 * - server/socket/handlers/game/reconnect.ts (line 31)
 * - server/socket/handlers/game/create.ts (line 33)
 * - server/socket/handlers/game/actions.ts (line 50)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const mockJoinRoom = vi.fn().mockResolvedValue(undefined);
const mockLeaveRoom = vi.fn().mockResolvedValue(undefined);
const mockBroadcastToRoom = vi.fn();

const mockCreateGame = vi.fn();
const mockSubmitTrick = vi.fn();
const mockPassTrick = vi.fn();
const mockForfeitGame = vi.fn();
const mockHandleReconnect = vi.fn();
const mockHandleDisconnect = vi.fn();
const mockGenerateEventId = vi.fn(() => "event-123");

vi.mock("../../socket/rooms", () => ({
  joinRoom: mockJoinRoom,
  leaveRoom: mockLeaveRoom,
  broadcastToRoom: mockBroadcastToRoom,
}));

vi.mock("../../services/gameStateService", () => ({
  createGame: mockCreateGame,
  joinGame: vi.fn(),
  submitTrick: mockSubmitTrick,
  passTrick: mockPassTrick,
  forfeitGame: mockForfeitGame,
  handleReconnect: mockHandleReconnect,
  handleDisconnect: mockHandleDisconnect,
  generateEventId: mockGenerateEventId,
}));

vi.mock("../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../socket/socketRateLimit", () => ({
  registerRateLimitRules: vi.fn(),
  checkRateLimit: vi.fn(() => true),
}));

describe("Game Handler Branch Coverage", () => {
  let mockSocket: any;
  let mockIo: any;
  let eventHandlers: Map<string, Function>;

  beforeEach(() => {
    vi.clearAllMocks();
    eventHandlers = new Map();

    mockSocket = {
      id: "socket-123",
      data: { odv: "user-123" },
      on: vi.fn((event: string, handler: Function) => {
        eventHandlers.set(event, handler);
      }),
      emit: vi.fn(),
      join: vi.fn(),
    };

    mockIo = {
      to: vi.fn().mockReturnThis(),
      emit: vi.fn(),
    };
  });

  describe("cleanup.ts — Line 32-35: result.success && result.game && !result.alreadyProcessed", () => {
    it("should not broadcast when result.success is false", async () => {
      mockHandleDisconnect.mockResolvedValue({
        success: false,
        error: "Game not found",
      });

      // Pre-track the socket
      const { trackSocketGame, socketGameMap } = await import(
        "../../socket/handlers/game/roomManagement"
      );
      trackSocketGame("socket-123", "game-abc");

      const { cleanupGameSubscriptions } = await import(
        "../../socket/handlers/game/cleanup"
      );

      await cleanupGameSubscriptions(mockIo, mockSocket);

      expect(mockBroadcastToRoom).not.toHaveBeenCalled();

      // Cleanup
      socketGameMap.delete("socket-123");
    });

    it("should not broadcast when result.game is null", async () => {
      mockHandleDisconnect.mockResolvedValue({
        success: true,
        game: null,
      });

      const { trackSocketGame, socketGameMap } = await import(
        "../../socket/handlers/game/roomManagement"
      );
      trackSocketGame("socket-123", "game-abc");

      const { cleanupGameSubscriptions } = await import(
        "../../socket/handlers/game/cleanup"
      );

      await cleanupGameSubscriptions(mockIo, mockSocket);

      expect(mockBroadcastToRoom).not.toHaveBeenCalled();

      socketGameMap.delete("socket-123");
    });

    it("should not broadcast when result.alreadyProcessed is true", async () => {
      mockHandleDisconnect.mockResolvedValue({
        success: true,
        game: { status: "paused" },
        alreadyProcessed: true,
      });

      const { trackSocketGame, socketGameMap } = await import(
        "../../socket/handlers/game/roomManagement"
      );
      trackSocketGame("socket-123", "game-abc");

      const { cleanupGameSubscriptions } = await import(
        "../../socket/handlers/game/cleanup"
      );

      await cleanupGameSubscriptions(mockIo, mockSocket);

      expect(mockBroadcastToRoom).not.toHaveBeenCalled();

      socketGameMap.delete("socket-123");
    });
  });

  describe("roomManagement.ts — Line 32: socketGameMap.get returns undefined", () => {
    it("should return empty set when socket has no tracked games", async () => {
      const { getSocketGames, socketGameMap } = await import(
        "../../socket/handlers/game/roomManagement"
      );

      // Ensure the socket is not tracked
      socketGameMap.delete("unknown-socket");

      const result = getSocketGames("unknown-socket");
      expect(result).toEqual(new Set());
      expect(result.size).toBe(0);
    });
  });

  describe("reconnect.ts — Line 31: result.error fallback", () => {
    it("should use fallback message when result.error is undefined", async () => {
      mockHandleReconnect.mockResolvedValue({
        success: false,
        // no error property
      });

      const { registerReconnectHandler } = await import(
        "../../socket/handlers/game/reconnect"
      );
      registerReconnectHandler(mockIo, mockSocket);

      const handler = eventHandlers.get("game:reconnect");
      await handler!("game-123");

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "reconnect_failed",
        message: "Failed to reconnect",
      });
    });
  });

  describe("create.ts — Line 33: result.error fallback", () => {
    it("should use fallback message when createGame returns no error message", async () => {
      mockCreateGame.mockResolvedValue({
        success: false,
        game: null,
        // no error property
      });

      const { registerCreateHandler } = await import(
        "../../socket/handlers/game/create"
      );
      registerCreateHandler(mockIo, mockSocket);

      const handler = eventHandlers.get("game:create");
      await handler!("spot-123", 4);

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "game_create_failed",
        message: "Failed to create game",
      });
    });
  });

  describe("actions.ts — Line 50: alreadyProcessed early return for trick", () => {
    it("should return early when trick is already processed", async () => {
      mockSubmitTrick.mockResolvedValue({
        success: true,
        alreadyProcessed: true,
        game: { id: "game-123" },
      });

      const { registerActionsHandler } = await import(
        "../../socket/handlers/game/actions"
      );
      registerActionsHandler(mockIo, mockSocket);

      const handler = eventHandlers.get("game:trick");
      await handler!({
        gameId: "game-123",
        odv: "user-123",
        trickName: "kickflip",
      });

      // Should not broadcast when already processed
      expect(mockBroadcastToRoom).not.toHaveBeenCalled();
    });

    it("should use fallback message when trick result.error is undefined", async () => {
      mockSubmitTrick.mockResolvedValue({
        success: false,
        // no error property
      });

      const { registerActionsHandler } = await import(
        "../../socket/handlers/game/actions"
      );
      registerActionsHandler(mockIo, mockSocket);

      const handler = eventHandlers.get("game:trick");
      await handler!({
        gameId: "game-123",
        odv: "user-123",
        trickName: "kickflip",
      });

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "trick_failed",
        message: "Failed to submit trick",
      });
    });

    it("should use fallback message when pass result.error is undefined", async () => {
      mockPassTrick.mockResolvedValue({
        success: false,
        // no error property
      });

      const { registerActionsHandler } = await import(
        "../../socket/handlers/game/actions"
      );
      registerActionsHandler(mockIo, mockSocket);

      const handler = eventHandlers.get("game:pass");
      await handler!("game-123");

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "pass_failed",
        message: "Failed to pass",
      });
    });

    it("should use fallback message when forfeit result.error is undefined", async () => {
      mockForfeitGame.mockResolvedValue({
        success: false,
        // no error property
      });

      const { registerActionsHandler } = await import(
        "../../socket/handlers/game/actions"
      );
      registerActionsHandler(mockIo, mockSocket);

      const handler = eventHandlers.get("game:forfeit");
      await handler!("game-123");

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "forfeit_failed",
        message: "Failed to forfeit",
      });
    });
  });
});
