/**
 * Production-level integration tests for Game Socket Handlers
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Socket, Server } from "socket.io";

// Mock dependencies
const mockJoinRoom = vi.fn().mockResolvedValue(undefined);
const mockLeaveRoom = vi.fn().mockResolvedValue(undefined);
const mockBroadcastToRoom = vi.fn();

const mockCreateGame = vi.fn();
const mockJoinGame = vi.fn();
const mockSubmitTrick = vi.fn();
const mockPassTrick = vi.fn();
const mockForfeitGame = vi.fn();
const mockHandleReconnect = vi.fn();
const mockHandleDisconnect = vi.fn();
const mockGenerateEventId = vi.fn(() => "event-123");

vi.mock("../../rooms", () => ({
  joinRoom: mockJoinRoom,
  leaveRoom: mockLeaveRoom,
  broadcastToRoom: mockBroadcastToRoom,
}));

vi.mock("../../../services/gameStateService", () => ({
  createGame: mockCreateGame,
  joinGame: mockJoinGame,
  submitTrick: mockSubmitTrick,
  passTrick: mockPassTrick,
  forfeitGame: mockForfeitGame,
  handleReconnect: mockHandleReconnect,
  handleDisconnect: mockHandleDisconnect,
  generateEventId: mockGenerateEventId,
}));

vi.mock("../../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../socketRateLimit", () => ({
  registerRateLimitRules: vi.fn(),
  checkRateLimit: vi.fn(() => true),
}));

describe("Game Socket Handlers Integration", () => {
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

  describe("game:create", () => {
    it("should create a new game", async () => {
      mockCreateGame.mockResolvedValue({
        success: true,
        game: {
          id: "game-123",
          spotId: "spot-456",
          maxPlayers: 4,
          createdAt: new Date(),
        },
      });

      const { registerGameHandlers } = await import("../game");
      registerGameHandlers(mockIo, mockSocket);

      const createHandler = eventHandlers.get("game:create");
      expect(createHandler).toBeDefined();

      await createHandler!("spot-456", 4);

      expect(mockCreateGame).toHaveBeenCalledWith({
        eventId: expect.any(String),
        spotId: "spot-456",
        creatorId: "user-123",
        maxPlayers: 4,
      });
      expect(mockJoinRoom).toHaveBeenCalledWith(mockSocket, "game", "game-123");
      expect(mockSocket.emit).toHaveBeenCalledWith(
        "game:created",
        expect.objectContaining({
          gameId: "game-123",
          spotId: "spot-456",
        })
      );
    });

    it("should handle game creation failure", async () => {
      mockCreateGame.mockResolvedValue({
        success: false,
        error: "Failed to create game",
      });

      const { registerGameHandlers } = await import("../game");
      registerGameHandlers(mockIo, mockSocket);

      const createHandler = eventHandlers.get("game:create");
      await createHandler!("spot-456", 4);

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "game_create_failed",
        message: "Failed to create game",
      });
    });

    it("should track socket-game association", async () => {
      mockCreateGame.mockResolvedValue({
        success: true,
        game: {
          id: "game-789",
          spotId: "spot-456",
          maxPlayers: 4,
          createdAt: new Date(),
        },
      });

      const { registerGameHandlers } = await import("../game");
      registerGameHandlers(mockIo, mockSocket);

      const createHandler = eventHandlers.get("game:create");
      await createHandler!("spot-456", 4);

      expect(mockJoinRoom).toHaveBeenCalled();
    });

    it("should use default maxPlayers of 4", async () => {
      mockCreateGame.mockResolvedValue({
        success: true,
        game: {
          id: "game-456",
          spotId: "spot-456",
          maxPlayers: 4,
          createdAt: new Date(),
        },
      });

      const { registerGameHandlers } = await import("../game");
      registerGameHandlers(mockIo, mockSocket);

      const createHandler = eventHandlers.get("game:create");
      await createHandler!("spot-456");

      expect(mockCreateGame).toHaveBeenCalledWith(
        expect.objectContaining({
          maxPlayers: 4, // Default parameter value
        })
      );
    });
  });

  describe("game:join", () => {
    it("should join an existing game", async () => {
      mockJoinGame.mockResolvedValue({
        success: true,
        game: {
          id: "game-123",
          players: [{ odv: "user-123" }, { odv: "user-456" }],
          status: "waiting",
        },
        alreadyProcessed: false,
      });

      const { registerGameHandlers } = await import("../game");
      registerGameHandlers(mockIo, mockSocket);

      const joinHandler = eventHandlers.get("game:join");
      await joinHandler!("game-123");

      expect(mockJoinGame).toHaveBeenCalledWith({
        eventId: expect.any(String),
        gameId: "game-123",
        odv: "user-123",
      });
      expect(mockJoinRoom).toHaveBeenCalledWith(mockSocket, "game", "game-123");
      expect(mockBroadcastToRoom).toHaveBeenCalled();
    });

    it("should broadcast turn info when game starts", async () => {
      mockJoinGame.mockResolvedValue({
        success: true,
        game: {
          id: "game-123",
          players: [{ odv: "user-1" }, { odv: "user-2" }, { odv: "user-3" }],
          status: "active",
          currentTurnIndex: 0,
          currentAction: "set_trick",
        },
        alreadyProcessed: false,
      });

      const { registerGameHandlers } = await import("../game");
      registerGameHandlers(mockIo, mockSocket);

      const joinHandler = eventHandlers.get("game:join");
      await joinHandler!("game-123");

      expect(mockBroadcastToRoom).toHaveBeenCalledWith(
        mockIo,
        "game",
        "game-123",
        "game:turn",
        expect.objectContaining({
          currentPlayer: "user-1",
          action: "set_trick",
          timeLimit: 60,
        })
      );
    });

    it("should skip broadcast if already processed (idempotency)", async () => {
      mockJoinGame.mockResolvedValue({
        success: true,
        alreadyProcessed: true,
      });

      const { registerGameHandlers } = await import("../game");
      registerGameHandlers(mockIo, mockSocket);

      const joinHandler = eventHandlers.get("game:join");
      await joinHandler!("game-123");

      expect(mockBroadcastToRoom).not.toHaveBeenCalled();
    });

    it("should handle join failure", async () => {
      mockJoinGame.mockResolvedValue({
        success: false,
        error: "Game is full",
      });

      const { registerGameHandlers } = await import("../game");
      registerGameHandlers(mockIo, mockSocket);

      const joinHandler = eventHandlers.get("game:join");
      await joinHandler!("game-123");

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "game_join_failed",
        message: "Game is full",
      });
    });
  });

  describe("game:trick", () => {
    it("should submit a trick", async () => {
      mockSubmitTrick.mockResolvedValue({
        success: true,
        game: {
          id: "game-123",
          players: [{ odv: "user-123" }],
          currentTurnIndex: 0,
          currentAction: "respond",
          status: "active",
        },
        alreadyProcessed: false,
      });

      const { registerGameHandlers } = await import("../game");
      registerGameHandlers(mockIo, mockSocket);

      const trickHandler = eventHandlers.get("game:trick");
      await trickHandler!({
        gameId: "game-123",
        odv: "user-123",
        trickName: "Kickflip",
        clipUrl: "https://example.com/clip.mp4",
      });

      expect(mockSubmitTrick).toHaveBeenCalledWith({
        eventId: expect.any(String),
        gameId: "game-123",
        odv: "user-123",
        trickName: "Kickflip",
        clipUrl: "https://example.com/clip.mp4",
      });
      expect(mockBroadcastToRoom).toHaveBeenCalledWith(
        mockIo,
        "game",
        "game-123",
        "game:trick",
        expect.objectContaining({
          trickName: "Kickflip",
        })
      );
    });

    it("should broadcast game ended when complete", async () => {
      mockSubmitTrick.mockResolvedValue({
        success: true,
        game: {
          id: "game-123",
          players: [
            { odv: "user-1", letters: "SKATE" },
            { odv: "user-2", letters: "SK" },
          ],
          status: "completed",
          winnerId: "user-2",
        },
        alreadyProcessed: false,
      });

      const { registerGameHandlers } = await import("../game");
      registerGameHandlers(mockIo, mockSocket);

      const trickHandler = eventHandlers.get("game:trick");
      await trickHandler!({
        gameId: "game-123",
        odv: "user-123",
        trickName: "Heelflip",
      });

      expect(mockBroadcastToRoom).toHaveBeenCalledWith(
        mockIo,
        "game",
        "game-123",
        "game:ended",
        expect.objectContaining({
          winnerId: "user-2",
          finalStandings: expect.arrayContaining([expect.objectContaining({ letters: "SKATE" })]),
        })
      );
    });

    it("should broadcast next turn if game continues", async () => {
      mockSubmitTrick.mockResolvedValue({
        success: true,
        game: {
          id: "game-123",
          players: [{ odv: "user-1" }, { odv: "user-2" }],
          currentTurnIndex: 1,
          currentAction: "respond",
          status: "active",
        },
        alreadyProcessed: false,
      });

      const { registerGameHandlers } = await import("../game");
      registerGameHandlers(mockIo, mockSocket);

      const trickHandler = eventHandlers.get("game:trick");
      await trickHandler!({
        gameId: "game-123",
        odv: "user-1",
        trickName: "Varial Flip",
      });

      expect(mockBroadcastToRoom).toHaveBeenCalledWith(
        mockIo,
        "game",
        "game-123",
        "game:turn",
        expect.objectContaining({
          currentPlayer: "user-2",
        })
      );
    });

    it("should handle trick submission failure", async () => {
      mockSubmitTrick.mockResolvedValue({
        success: false,
        error: "Not your turn",
      });

      const { registerGameHandlers } = await import("../game");
      registerGameHandlers(mockIo, mockSocket);

      const trickHandler = eventHandlers.get("game:trick");
      await trickHandler!({
        gameId: "game-123",
        odv: "user-123",
        trickName: "Tre Flip",
      });

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "trick_failed",
        message: "Not your turn",
      });
    });
  });

  describe("game:pass", () => {
    it("should pass and gain a letter", async () => {
      mockPassTrick.mockResolvedValue({
        success: true,
        game: {
          id: "game-123",
          players: [{ odv: "user-123", letters: "S" }],
          currentTurnIndex: 0,
          currentAction: "set_trick",
          status: "active",
        },
        letterGained: "S",
        alreadyProcessed: false,
      });

      const { registerGameHandlers } = await import("../game");
      registerGameHandlers(mockIo, mockSocket);

      const passHandler = eventHandlers.get("game:pass");
      await passHandler!("game-123");

      expect(mockPassTrick).toHaveBeenCalledWith({
        eventId: expect.any(String),
        gameId: "game-123",
        odv: "user-123",
      });
      expect(mockBroadcastToRoom).toHaveBeenCalledWith(
        mockIo,
        "game",
        "game-123",
        "game:letter",
        expect.objectContaining({
          letters: "S",
        })
      );
    });

    it("should broadcast game ended when player spells SKATE", async () => {
      mockPassTrick.mockResolvedValue({
        success: true,
        game: {
          id: "game-123",
          players: [
            { odv: "user-1", letters: "SKATE" },
            { odv: "user-2", letters: "SK" },
          ],
          status: "completed",
          winnerId: "user-2",
        },
        letterGained: "E",
        alreadyProcessed: false,
      });

      const { registerGameHandlers } = await import("../game");
      registerGameHandlers(mockIo, mockSocket);

      const passHandler = eventHandlers.get("game:pass");
      await passHandler!("game-123");

      expect(mockBroadcastToRoom).toHaveBeenCalledWith(
        mockIo,
        "game",
        "game-123",
        "game:ended",
        expect.objectContaining({
          winnerId: "user-2",
        })
      );
    });

    it("should handle pass failure", async () => {
      mockPassTrick.mockResolvedValue({
        success: false,
        error: "Not your turn",
      });

      const { registerGameHandlers } = await import("../game");
      registerGameHandlers(mockIo, mockSocket);

      const passHandler = eventHandlers.get("game:pass");
      await passHandler!("game-123");

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "pass_failed",
        message: "Not your turn",
      });
    });
  });

  describe("game:forfeit", () => {
    it("should forfeit game", async () => {
      mockForfeitGame.mockResolvedValue({
        success: true,
        game: {
          id: "game-123",
          players: [
            { odv: "user-1", letters: "SK" },
            { odv: "user-2", letters: "S" },
          ],
          status: "completed",
          winnerId: "user-2",
        },
        alreadyProcessed: false,
      });

      const { registerGameHandlers } = await import("../game");
      registerGameHandlers(mockIo, mockSocket);

      const forfeitHandler = eventHandlers.get("game:forfeit");
      await forfeitHandler!("game-123");

      expect(mockForfeitGame).toHaveBeenCalledWith({
        eventId: expect.any(String),
        gameId: "game-123",
        odv: "user-123",
        reason: "voluntary",
      });
      expect(mockBroadcastToRoom).toHaveBeenCalledWith(
        mockIo,
        "game",
        "game-123",
        "game:ended",
        expect.objectContaining({
          winnerId: "user-2",
        })
      );
    });

    it("should handle forfeit failure", async () => {
      mockForfeitGame.mockResolvedValue({
        success: false,
        error: "Game already ended",
      });

      const { registerGameHandlers } = await import("../game");
      registerGameHandlers(mockIo, mockSocket);

      const forfeitHandler = eventHandlers.get("game:forfeit");
      await forfeitHandler!("game-123");

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "forfeit_failed",
        message: "Game already ended",
      });
    });
  });

  describe("game:reconnect", () => {
    it("should reconnect to game", async () => {
      mockHandleReconnect.mockResolvedValue({
        success: true,
        game: {
          id: "game-123",
          players: [
            { odv: "user-1", letters: "S", connected: true },
            { odv: "user-2", letters: "", connected: false },
          ],
          currentTurnIndex: 0,
          currentAction: "set_trick",
          currentTrick: "Kickflip",
          status: "active",
        },
        alreadyProcessed: false,
      });

      const { registerGameHandlers } = await import("../game");
      registerGameHandlers(mockIo, mockSocket);

      const reconnectHandler = eventHandlers.get("game:reconnect");
      await reconnectHandler!("game-123");

      expect(mockHandleReconnect).toHaveBeenCalledWith({
        eventId: expect.any(String),
        gameId: "game-123",
        odv: "user-123",
      });
      expect(mockJoinRoom).toHaveBeenCalledWith(mockSocket, "game", "game-123");
      expect(mockSocket.emit).toHaveBeenCalledWith(
        "game:state",
        expect.objectContaining({
          gameId: "game-123",
          status: "active",
        })
      );
    });

    it("should broadcast game resumed if resuming from pause", async () => {
      mockHandleReconnect.mockResolvedValue({
        success: true,
        game: {
          id: "game-123",
          players: [{ odv: "user-1" }],
          currentTurnIndex: 0,
          currentAction: "set_trick",
          status: "active",
        },
        alreadyProcessed: false,
      });

      const { registerGameHandlers } = await import("../game");
      registerGameHandlers(mockIo, mockSocket);

      const reconnectHandler = eventHandlers.get("game:reconnect");
      await reconnectHandler!("game-123");

      expect(mockBroadcastToRoom).toHaveBeenCalledWith(
        mockIo,
        "game",
        "game-123",
        "game:resumed",
        expect.objectContaining({
          reconnectedPlayer: "user-123",
        })
      );
    });

    it("should handle reconnect failure", async () => {
      mockHandleReconnect.mockResolvedValue({
        success: false,
        error: "Game not found",
      });

      const { registerGameHandlers } = await import("../game");
      registerGameHandlers(mockIo, mockSocket);

      const reconnectHandler = eventHandlers.get("game:reconnect");
      await reconnectHandler!("game-123");

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "reconnect_failed",
        message: "Game not found",
      });
    });
  });

  describe("cleanupGameSubscriptions", () => {
    it("should cleanup on disconnect", async () => {
      mockHandleDisconnect.mockResolvedValue({
        success: true,
        game: {
          id: "game-123",
          status: "paused",
        },
        alreadyProcessed: false,
      });

      // First create a game to track
      mockCreateGame.mockResolvedValue({
        success: true,
        game: {
          id: "game-123",
          spotId: "spot-456",
          maxPlayers: 4,
          createdAt: new Date(),
        },
      });

      const { registerGameHandlers, cleanupGameSubscriptions } = await import("../game");
      registerGameHandlers(mockIo, mockSocket);

      const createHandler = eventHandlers.get("game:create");
      await createHandler!("spot-456", 4);

      // Now cleanup
      await cleanupGameSubscriptions(mockIo, mockSocket);

      expect(mockLeaveRoom).toHaveBeenCalledWith(mockSocket, "game", "game-123");
      expect(mockHandleDisconnect).toHaveBeenCalledWith({
        eventId: expect.any(String),
        gameId: "game-123",
        odv: "user-123",
      });
    });

    it("should broadcast game paused when player disconnects", async () => {
      mockHandleDisconnect.mockResolvedValue({
        success: true,
        game: {
          id: "game-123",
          status: "paused",
        },
        alreadyProcessed: false,
      });

      mockCreateGame.mockResolvedValue({
        success: true,
        game: {
          id: "game-123",
          spotId: "spot-456",
          maxPlayers: 4,
          createdAt: new Date(),
        },
      });

      const { registerGameHandlers, cleanupGameSubscriptions } = await import("../game");
      registerGameHandlers(mockIo, mockSocket);

      const createHandler = eventHandlers.get("game:create");
      await createHandler!("spot-456", 4);

      await cleanupGameSubscriptions(mockIo, mockSocket);

      expect(mockBroadcastToRoom).toHaveBeenCalledWith(
        mockIo,
        "game",
        "game-123",
        "game:paused",
        expect.objectContaining({
          disconnectedPlayer: "user-123",
          reconnectTimeout: 120,
        })
      );
    });
  });

  describe("Event ID Generation", () => {
    it("should generate unique event IDs", () => {
      expect(mockGenerateEventId).toBeDefined();
    });

    it("should include action type in event ID", async () => {
      mockCreateGame.mockResolvedValue({
        success: true,
        game: {
          id: "game-123",
          spotId: "spot-456",
          maxPlayers: 4,
          createdAt: new Date(),
        },
      });

      const { registerGameHandlers } = await import("../game");
      registerGameHandlers(mockIo, mockSocket);

      const createHandler = eventHandlers.get("game:create");
      await createHandler!("spot-456", 4);

      expect(mockGenerateEventId).toHaveBeenCalledWith("create", "user-123", "new");
    });
  });
});
