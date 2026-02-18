/**
 * @fileoverview Coverage tests for socket/handlers/game.ts
 *
 * Targets uncovered lines in the game handler:
 *   - Lines 88-93:   game:create catch block (emits "game_create_failed")
 *   - Lines 110-114: game:join !result.success (emits "game_join_failed")
 *   - Lines 186-191: game:trick !result.success (emits "trick_failed")
 *   - Lines 210:     game:trick completed game broadcast (game:ended)
 *   - Lines 262-265: game:pass !result.success (emits "pass_failed")
 *   - Lines 310-313: game:pass catch block (emits "pass_failed")
 *   - Lines 332-336: game:forfeit !result.success (emits "forfeit_failed")
 *   - Lines 340:     game:forfeit alreadyProcessed early return
 *   - Lines 357-358: game:forfeit catch block
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks - declared before any application imports
// ============================================================================

vi.mock("../logger", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock("../socket/rooms", () => ({
  joinRoom: vi.fn(),
  leaveRoom: vi.fn(),
  broadcastToRoom: vi.fn(),
}));

vi.mock("../services/gameStateService", () => ({
  createGame: vi.fn(),
  joinGame: vi.fn(),
  submitTrick: vi.fn(),
  passTrick: vi.fn(),
  handleDisconnect: vi.fn(),
  handleReconnect: vi.fn(),
  forfeitGame: vi.fn(),
  generateEventId: vi.fn().mockReturnValue("test-event-id"),
}));

vi.mock("../socket/socketRateLimit", () => ({
  registerRateLimitRules: vi.fn(),
  checkRateLimit: vi.fn(() => true),
}));

// ============================================================================
// Imports (after mocks)
// ============================================================================

import {
  createGame,
  joinGame,
  submitTrick,
  passTrick,
  forfeitGame,
} from "../services/gameStateService";
import { broadcastToRoom } from "../socket/rooms";

// ============================================================================
// Helpers
// ============================================================================

function createMockSocketAndIo() {
  const handlers = new Map<string, Function>();
  const mockSocket: any = {
    id: "sock1",
    data: { odv: "user1" },
    emit: vi.fn(),
    on: vi.fn((event: string, handler: Function) => {
      handlers.set(event, handler);
    }),
  };
  const mockIo: any = {};
  return { handlers, mockSocket, mockIo };
}

function makeGameState(overrides: Record<string, unknown> = {}) {
  return {
    id: "g1",
    spotId: "spot1",
    creatorId: "user1",
    players: [
      { odv: "user1", letters: "", connected: true },
      { odv: "user2", letters: "", connected: true },
    ],
    maxPlayers: 4,
    currentTurnIndex: 0,
    currentAction: "set" as const,
    status: "active" as const,
    winnerId: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    processedEventIds: [],
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("socket/handlers/game — uncovered error paths", () => {
  let handlers: Map<string, Function>;
  let mockSocket: any;
  let mockIo: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const mocks = createMockSocketAndIo();
    handlers = mocks.handlers;
    mockSocket = mocks.mockSocket;
    mockIo = mocks.mockIo;

    const { registerGameHandlers } = await import("../socket/handlers/game");
    registerGameHandlers(mockIo, mockSocket);
  });

  // --------------------------------------------------------------------------
  // Lines 88-93: game:create catch block
  // --------------------------------------------------------------------------
  describe("game:create catch block (lines 88-93)", () => {
    it("emits error with code game_create_failed when createGame throws", async () => {
      vi.mocked(createGame).mockRejectedValueOnce(new Error("DB down"));

      const handler = handlers.get("game:create")!;
      await handler("spot1", 4);

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "game_create_failed",
        message: "Failed to create game",
      });
    });
  });

  // --------------------------------------------------------------------------
  // Lines 110-114: game:join !result.success
  // --------------------------------------------------------------------------
  describe("game:join failure path (lines 110-114)", () => {
    it("emits error with code game_join_failed when joinGame returns failure", async () => {
      vi.mocked(joinGame).mockResolvedValueOnce({
        success: false,
        error: "Game is full",
      });

      const handler = handlers.get("game:join")!;
      await handler("g1");

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "game_join_failed",
        message: "Game is full",
      });
    });

    it("uses default error message when result.error is undefined", async () => {
      vi.mocked(joinGame).mockResolvedValueOnce({
        success: false,
      });

      const handler = handlers.get("game:join")!;
      await handler("g1");

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "game_join_failed",
        message: "Failed to join game",
      });
    });
  });

  // --------------------------------------------------------------------------
  // Lines 186-191: game:trick !result.success
  // --------------------------------------------------------------------------
  describe("game:trick failure path (lines 186-191)", () => {
    it("emits error with code trick_failed when submitTrick returns failure", async () => {
      vi.mocked(submitTrick).mockResolvedValueOnce({
        success: false,
        error: "Not your turn",
      });

      const handler = handlers.get("game:trick")!;
      await handler({
        gameId: "g1",
        odv: "user1",
        trickName: "kickflip",
      });

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "trick_failed",
        message: "Not your turn",
      });
    });

    it("uses default message when result.error is undefined", async () => {
      vi.mocked(submitTrick).mockResolvedValueOnce({
        success: false,
      });

      const handler = handlers.get("game:trick")!;
      await handler({
        gameId: "g1",
        odv: "user1",
        trickName: "kickflip",
      });

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "trick_failed",
        message: "Failed to submit trick",
      });
    });
  });

  // --------------------------------------------------------------------------
  // Line 210: game:trick — completed game broadcast (game:ended)
  // --------------------------------------------------------------------------
  describe("game:trick completed game broadcast (line 210)", () => {
    it("broadcasts game:ended when game.status is completed and winnerId is set", async () => {
      vi.mocked(submitTrick).mockResolvedValueOnce({
        success: true,
        game: makeGameState({
          status: "completed",
          winnerId: "user1",
          players: [
            { odv: "user1", letters: "SKAT", connected: true },
            { odv: "user2", letters: "SKATE", connected: true },
          ],
        }),
      });

      const handler = handlers.get("game:trick")!;
      await handler({
        gameId: "g1",
        odv: "user1",
        trickName: "kickflip",
      });

      expect(broadcastToRoom).toHaveBeenCalledWith(mockIo, "game", "g1", "game:ended", {
        gameId: "g1",
        winnerId: "user1",
        finalStandings: [
          { odv: "user1", letters: "SKAT" },
          { odv: "user2", letters: "SKATE" },
        ],
      });
    });
  });

  // --------------------------------------------------------------------------
  // Lines 262-265: game:pass !result.success
  // --------------------------------------------------------------------------
  describe("game:pass failure path (lines 262-265)", () => {
    it("emits error with code pass_failed when passTrick returns failure", async () => {
      vi.mocked(passTrick).mockResolvedValueOnce({
        success: false,
        error: "Not your turn",
      });

      const handler = handlers.get("game:pass")!;
      await handler("g1");

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "pass_failed",
        message: "Not your turn",
      });
    });

    it("uses default message when result.error is undefined", async () => {
      vi.mocked(passTrick).mockResolvedValueOnce({
        success: false,
      });

      const handler = handlers.get("game:pass")!;
      await handler("g1");

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "pass_failed",
        message: "Failed to pass",
      });
    });
  });

  // --------------------------------------------------------------------------
  // Lines 310-313: game:pass catch block
  // --------------------------------------------------------------------------
  describe("game:pass catch block (lines 310-313)", () => {
    it("emits error with code pass_failed when passTrick throws", async () => {
      vi.mocked(passTrick).mockRejectedValueOnce(new Error("DB timeout"));

      const handler = handlers.get("game:pass")!;
      await handler("g1");

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "pass_failed",
        message: "Failed to pass",
      });
    });
  });

  // --------------------------------------------------------------------------
  // Lines 332-336: game:forfeit !result.success
  // --------------------------------------------------------------------------
  describe("game:forfeit failure path (lines 332-336)", () => {
    it("emits error with code forfeit_failed when forfeitGame returns failure", async () => {
      vi.mocked(forfeitGame).mockResolvedValueOnce({
        success: false,
        error: "Game not found",
      });

      const handler = handlers.get("game:forfeit")!;
      await handler("g1");

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "forfeit_failed",
        message: "Game not found",
      });
    });

    it("uses default message when result.error is undefined", async () => {
      vi.mocked(forfeitGame).mockResolvedValueOnce({
        success: false,
      });

      const handler = handlers.get("game:forfeit")!;
      await handler("g1");

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "forfeit_failed",
        message: "Failed to forfeit",
      });
    });
  });

  // --------------------------------------------------------------------------
  // Line 340: game:forfeit alreadyProcessed early return
  // --------------------------------------------------------------------------
  describe("game:forfeit alreadyProcessed early return (line 340)", () => {
    it("returns early without broadcasting when alreadyProcessed is true", async () => {
      vi.mocked(forfeitGame).mockResolvedValueOnce({
        success: true,
        alreadyProcessed: true,
      });

      const handler = handlers.get("game:forfeit")!;
      await handler("g1");

      // Should NOT emit error
      expect(mockSocket.emit).not.toHaveBeenCalled();
      // Should NOT broadcast game:ended
      expect(broadcastToRoom).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Lines 357-358: game:forfeit catch block
  // --------------------------------------------------------------------------
  describe("game:forfeit catch block (lines 357-358)", () => {
    it("emits error with code forfeit_failed when forfeitGame throws", async () => {
      vi.mocked(forfeitGame).mockRejectedValueOnce(new Error("Connection lost"));

      const handler = handlers.get("game:forfeit")!;
      await handler("g1");

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "forfeit_failed",
        message: "Failed to forfeit",
      });
    });
  });
});
