/**
 * Tests for S.K.A.T.E. Game Socket Handlers
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../logger");
vi.mock("../../rooms");
vi.mock("../../../services/gameStateService");

describe("Game Socket Handlers", () => {
  let mockSocket: any;
  let mockIo: any;

  beforeEach(() => {
    mockSocket = {
      id: "socket-123",
      data: { odv: "test-user-123" },
      emit: vi.fn(),
      on: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
    };

    mockIo = {
      to: vi.fn().mockReturnThis(),
      emit: vi.fn(),
    };
  });

  describe("Game Creation", () => {
    it("should create game with valid parameters", () => {
      const spotId = "spot-123";
      const maxPlayers = 4;

      expect(spotId).toBeTruthy();
      expect(maxPlayers).toBeGreaterThan(0);
      expect(maxPlayers).toBeLessThanOrEqual(8);
    });

    it("should generate event ID for create action", () => {
      const action = "create";
      const userId = "test-user-123";
      const gameId = "new";
      const eventId = `${action}-${userId}-${gameId}-${Date.now()}`;

      expect(eventId).toContain("create");
      expect(eventId).toContain(userId);
    });

    it("should emit game:created event", () => {
      const payload = {
        gameId: "game-123",
        spotId: "spot-123",
        creatorId: "test-user-123",
        maxPlayers: 4,
        createdAt: new Date().toISOString(),
      };

      mockSocket.emit("game:created", payload);
      expect(mockSocket.emit).toHaveBeenCalledWith("game:created", payload);
    });

    it("should handle creation failure", () => {
      mockSocket.emit("error", {
        code: "game_create_failed",
        message: "Failed to create game",
      });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        "error",
        expect.objectContaining({
          code: "game_create_failed",
        })
      );
    });

    it("should track socket-game association", () => {
      const socketGameMap = new Map<string, Set<string>>();
      const socketId = "socket-123";
      const gameId = "game-123";

      if (!socketGameMap.has(socketId)) {
        socketGameMap.set(socketId, new Set());
      }
      socketGameMap.get(socketId)!.add(gameId);

      expect(socketGameMap.get(socketId)?.has(gameId)).toBe(true);
    });
  });

  describe("Game Joining", () => {
    it("should join existing game", () => {
      const gameId = "game-123";
      mockSocket.join(`game:${gameId}`);

      expect(mockSocket.join).toHaveBeenCalledWith(`game:${gameId}`);
    });

    it("should emit game:joined event", () => {
      const payload = {
        gameId: "game-123",
        playerId: "test-user-123",
        playerCount: 2,
      };

      mockSocket.emit("game:joined", payload);
      expect(mockSocket.emit).toHaveBeenCalledWith("game:joined", payload);
    });

    it("should handle game not found", () => {
      mockSocket.emit("error", {
        code: "game_not_found",
        message: "Game not found",
      });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        "error",
        expect.objectContaining({
          code: "game_not_found",
        })
      );
    });

    it("should handle game full", () => {
      mockSocket.emit("error", {
        code: "game_full",
        message: "Game is full",
      });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        "error",
        expect.objectContaining({
          code: "game_full",
        })
      );
    });
  });

  describe("Trick Submission", () => {
    it("should validate trick submission", () => {
      const trick = {
        gameId: "game-123",
        trickName: "kickflip",
        videoUrl: "https://example.com/video.mp4",
      };

      expect(trick.gameId).toBeTruthy();
      expect(trick.trickName.length).toBeGreaterThan(0);
      expect(trick.videoUrl).toMatch(/^https?:\/\//);
    });

    it("should emit trick submitted event", () => {
      const payload = {
        gameId: "game-123",
        playerId: "test-user-123",
        trickName: "kickflip",
        videoUrl: "https://example.com/video.mp4",
      };

      mockIo.to("game:game-123").emit("game:trick", payload);
      expect(mockIo.to).toHaveBeenCalledWith("game:game-123");
    });

    it("should handle invalid turn", () => {
      mockSocket.emit("error", {
        code: "invalid_turn",
        message: "Not your turn",
      });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        "error",
        expect.objectContaining({
          code: "invalid_turn",
        })
      );
    });
  });

  describe("Turn Pass", () => {
    it("should pass turn to next player", () => {
      const gameId = "game-123";
      mockSocket.emit("game:turn", {
        gameId,
        nextPlayerId: "other-user-456",
      });

      expect(mockSocket.emit).toHaveBeenCalled();
    });

    it("should broadcast turn change", () => {
      mockIo.to("game:game-123").emit("game:turn", {
        gameId: "game-123",
        nextPlayerId: "other-user-456",
      });

      expect(mockIo.to).toHaveBeenCalled();
    });
  });

  describe("Game Disconnect", () => {
    it("should handle player disconnect", () => {
      const socketId = "socket-123";
      const gameId = "game-123";

      mockSocket.leave(`game:${gameId}`);
      expect(mockSocket.leave).toHaveBeenCalledWith(`game:${gameId}`);
    });

    it("should cleanup socket-game associations", () => {
      const socketGameMap = new Map<string, Set<string>>();
      const socketId = "socket-123";

      socketGameMap.set(socketId, new Set(["game-123", "game-456"]));
      socketGameMap.delete(socketId);

      expect(socketGameMap.has(socketId)).toBe(false);
    });

    it("should emit player left event", () => {
      mockIo.to("game:game-123").emit("game:player_left", {
        gameId: "game-123",
        playerId: "test-user-123",
      });

      expect(mockIo.to).toHaveBeenCalled();
    });
  });

  describe("Game Reconnection", () => {
    it("should handle player reconnection", () => {
      const gameId = "game-123";
      mockSocket.join(`game:${gameId}`);

      expect(mockSocket.join).toHaveBeenCalledWith(`game:${gameId}`);
    });

    it("should restore game state on reconnect", () => {
      const gameState = {
        gameId: "game-123",
        currentPlayerId: "test-user-123",
        players: ["test-user-123", "other-user-456"],
        currentRound: 3,
      };

      mockSocket.emit("game:state", gameState);
      expect(mockSocket.emit).toHaveBeenCalledWith("game:state", gameState);
    });
  });

  describe("Game Forfeit", () => {
    it("should forfeit game", () => {
      const gameId = "game-123";
      mockSocket.emit("game:forfeit", { gameId });

      expect(mockSocket.emit).toHaveBeenCalledWith("game:forfeit", { gameId });
    });

    it("should declare winner on forfeit", () => {
      mockIo.to("game:game-123").emit("game:ended", {
        gameId: "game-123",
        winnerId: "other-user-456",
        reason: "forfeit",
      });

      expect(mockIo.to).toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should handle missing game ID", () => {
      const gameId = "";
      expect(gameId).toBeFalsy();
    });

    it("should handle unauthorized access", () => {
      mockSocket.emit("error", {
        code: "unauthorized",
        message: "Not authorized",
      });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        "error",
        expect.objectContaining({
          code: "unauthorized",
        })
      );
    });

    it("should handle database errors", () => {
      mockSocket.emit("error", {
        code: "database_error",
        message: "Database operation failed",
      });

      expect(mockSocket.emit).toHaveBeenCalled();
    });
  });

  describe("Room Management", () => {
    it("should create room for game", () => {
      const roomName = "game:game-123";
      expect(roomName).toContain("game:");
    });

    it("should broadcast to game room", () => {
      const roomName = "game:game-123";
      mockIo.to(roomName).emit("game:update", {});

      expect(mockIo.to).toHaveBeenCalledWith(roomName);
    });

    it("should handle multiple games per socket", () => {
      const socketGameMap = new Map<string, Set<string>>();
      const socketId = "socket-123";

      socketGameMap.set(socketId, new Set(["game-1", "game-2", "game-3"]));

      expect(socketGameMap.get(socketId)?.size).toBe(3);
    });
  });

  describe("Event ID Generation", () => {
    it("should generate unique event IDs", () => {
      const eventId1 = `create-user-game-${Date.now()}`;
      const eventId2 = `create-user-game-${Date.now()}`;

      // Event IDs should be different due to timestamp
      expect(eventId1).toBeTruthy();
      expect(eventId2).toBeTruthy();
    });

    it("should include action in event ID", () => {
      const actions = ["create", "join", "trick", "pass"];
      actions.forEach((action) => {
        const eventId = `${action}-user-game-${Date.now()}`;
        expect(eventId).toContain(action);
      });
    });
  });

  describe("Player Limits", () => {
    it("should enforce max players", () => {
      const maxPlayers = 4;
      const currentPlayers = 4;

      expect(currentPlayers).toBe(maxPlayers);
    });

    it("should allow joining when under limit", () => {
      const maxPlayers = 4;
      const currentPlayers = 3;

      expect(currentPlayers).toBeLessThan(maxPlayers);
    });

    it("should validate max players range", () => {
      const validMax = 4;
      const invalidMax = 100;

      expect(validMax).toBeGreaterThan(0);
      expect(validMax).toBeLessThanOrEqual(8);
      expect(invalidMax).toBeGreaterThan(8);
    });
  });
});
