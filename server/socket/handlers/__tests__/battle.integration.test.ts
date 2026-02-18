/**
 * Production-level integration tests for Battle Socket Handlers
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock dependencies
const mockJoinRoom = vi.fn().mockResolvedValue(undefined);
const mockLeaveRoom = vi.fn().mockResolvedValue(undefined);
const mockBroadcastToRoom = vi.fn();
const mockSendToUser = vi.fn();
const mockGetRoomInfo = vi.fn();

const mockCreateBattle = vi.fn();
const mockJoinBattle = vi.fn();
const mockGetBattle = vi.fn();
const mockInitializeVoting = vi.fn();
const mockCastVote = vi.fn();
const mockGenerateEventId = vi.fn(() => "event-123");

vi.mock("../../rooms", () => ({
  joinRoom: mockJoinRoom,
  leaveRoom: mockLeaveRoom,
  broadcastToRoom: mockBroadcastToRoom,
  sendToUser: mockSendToUser,
  getRoomInfo: mockGetRoomInfo,
}));

vi.mock("../../../services/battleService", () => ({
  createBattle: mockCreateBattle,
  joinBattle: mockJoinBattle,
  getBattle: mockGetBattle,
}));

vi.mock("../../../services/battleStateService", () => ({
  initializeVoting: mockInitializeVoting,
  castVote: mockCastVote,
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

describe("Battle Socket Handlers Integration", () => {
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

  describe("battle:create", () => {
    it("should create open matchmaking battle", async () => {
      mockCreateBattle.mockResolvedValue({
        battleId: "battle-123",
      });

      const { registerBattleHandlers } = await import("../battle");
      registerBattleHandlers(mockIo, mockSocket);

      const createHandler = eventHandlers.get("battle:create");
      await createHandler!({ matchmaking: "open" });

      expect(mockCreateBattle).toHaveBeenCalledWith({
        creatorId: "user-123",
        matchmaking: "open",
        opponentId: undefined,
      });
      expect(mockJoinRoom).toHaveBeenCalledWith(mockSocket, "battle", "battle-123");
      expect(mockSocket.emit).toHaveBeenCalledWith(
        "battle:created",
        expect.objectContaining({
          battleId: "battle-123",
          matchmaking: "open",
        })
      );
    });

    it("should create direct challenge battle", async () => {
      mockCreateBattle.mockResolvedValue({
        battleId: "battle-456",
      });

      const { registerBattleHandlers } = await import("../battle");
      registerBattleHandlers(mockIo, mockSocket);

      const createHandler = eventHandlers.get("battle:create");
      await createHandler!({ matchmaking: "direct", opponentId: "user-456" });

      expect(mockCreateBattle).toHaveBeenCalledWith({
        creatorId: "user-123",
        matchmaking: "direct",
        opponentId: "user-456",
      });
      expect(mockSendToUser).toHaveBeenCalledWith(
        mockIo,
        "user-456",
        "notification",
        expect.objectContaining({
          type: "challenge",
        })
      );
    });

    it("should track socket-battle association", async () => {
      mockCreateBattle.mockResolvedValue({
        battleId: "battle-789",
      });

      const { registerBattleHandlers } = await import("../battle");
      registerBattleHandlers(mockIo, mockSocket);

      const createHandler = eventHandlers.get("battle:create");
      await createHandler!({ matchmaking: "open" });

      expect(mockJoinRoom).toHaveBeenCalledWith(mockSocket, "battle", "battle-789");
    });

    it("should handle creation errors", async () => {
      mockCreateBattle.mockRejectedValue(new Error("Database error"));

      const { registerBattleHandlers } = await import("../battle");
      registerBattleHandlers(mockIo, mockSocket);

      const createHandler = eventHandlers.get("battle:create");
      await createHandler!({ matchmaking: "open" });

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "battle_create_failed",
        message: "Failed to create battle",
      });
    });
  });

  describe("battle:join", () => {
    it("should join an existing battle", async () => {
      mockGetRoomInfo.mockReturnValue({
        members: new Set(["socket-1"]),
      });

      const { registerBattleHandlers } = await import("../battle");
      registerBattleHandlers(mockIo, mockSocket);

      const joinHandler = eventHandlers.get("battle:join");
      await joinHandler!("battle-123");

      expect(mockJoinBattle).toHaveBeenCalledWith("user-123", "battle-123");
      expect(mockJoinRoom).toHaveBeenCalledWith(mockSocket, "battle", "battle-123");
      expect(mockBroadcastToRoom).toHaveBeenCalledWith(
        mockIo,
        "battle",
        "battle-123",
        "battle:joined",
        expect.objectContaining({
          odv: "user-123",
        })
      );
    });

    it("should reject join when battle is full", async () => {
      mockGetRoomInfo.mockReturnValue({
        members: new Set(["socket-1", "socket-2"]),
      });

      const { registerBattleHandlers } = await import("../battle");
      registerBattleHandlers(mockIo, mockSocket);

      const joinHandler = eventHandlers.get("battle:join");
      await joinHandler!("battle-123");

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "battle_full",
        message: "This battle already has two players",
      });
    });

    it("should broadcast active state when second player joins", async () => {
      mockGetRoomInfo.mockReturnValue({
        members: new Set(["socket-1"]),
      });

      const { registerBattleHandlers } = await import("../battle");
      registerBattleHandlers(mockIo, mockSocket);

      const joinHandler = eventHandlers.get("battle:join");
      await joinHandler!("battle-123");

      expect(mockBroadcastToRoom).toHaveBeenCalledWith(
        mockIo,
        "battle",
        "battle-123",
        "battle:update",
        expect.objectContaining({
          state: "active",
        })
      );
    });

    it("should handle join errors", async () => {
      mockGetRoomInfo.mockReturnValue({ members: new Set() });
      mockJoinBattle.mockRejectedValue(new Error("Battle not found"));

      const { registerBattleHandlers } = await import("../battle");
      registerBattleHandlers(mockIo, mockSocket);

      const joinHandler = eventHandlers.get("battle:join");
      await joinHandler!("battle-123");

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "battle_join_failed",
        message: "Failed to join battle",
      });
    });
  });

  describe("battle:startVoting", () => {
    it("should start voting phase", async () => {
      mockGetBattle.mockResolvedValue({
        id: "battle-123",
        creatorId: "user-123",
        opponentId: "user-456",
      });

      const { registerBattleHandlers } = await import("../battle");
      registerBattleHandlers(mockIo, mockSocket);

      const startVotingHandler = eventHandlers.get("battle:startVoting");
      await startVotingHandler!("battle-123");

      expect(mockInitializeVoting).toHaveBeenCalledWith({
        eventId: expect.any(String),
        battleId: "battle-123",
        creatorId: "user-123",
        opponentId: "user-456",
      });
      expect(mockBroadcastToRoom).toHaveBeenCalledWith(
        mockIo,
        "battle",
        "battle-123",
        "battle:votingStarted",
        expect.objectContaining({
          timeoutSeconds: 60,
        })
      );
    });

    it("should reject if battle not found", async () => {
      mockGetBattle.mockResolvedValue(null);

      const { registerBattleHandlers } = await import("../battle");
      registerBattleHandlers(mockIo, mockSocket);

      const startVotingHandler = eventHandlers.get("battle:startVoting");
      await startVotingHandler!("battle-123");

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "battle_not_found",
        message: "Battle not found",
      });
    });

    it("should reject if opponent not joined yet", async () => {
      mockGetBattle.mockResolvedValue({
        id: "battle-123",
        creatorId: "user-123",
        opponentId: null,
      });

      const { registerBattleHandlers } = await import("../battle");
      registerBattleHandlers(mockIo, mockSocket);

      const startVotingHandler = eventHandlers.get("battle:startVoting");
      await startVotingHandler!("battle-123");

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "battle_not_ready",
        message: "Battle needs two players to start voting",
      });
    });

    it("should reject if non-participant tries to start voting", async () => {
      mockGetBattle.mockResolvedValue({
        id: "battle-123",
        creatorId: "user-456",
        opponentId: "user-789",
      });

      const { registerBattleHandlers } = await import("../battle");
      registerBattleHandlers(mockIo, mockSocket);

      const startVotingHandler = eventHandlers.get("battle:startVoting");
      await startVotingHandler!("battle-123");

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "not_participant",
        message: "Only battle participants can start voting",
      });
    });
  });

  describe("battle:vote", () => {
    it("should cast vote successfully", async () => {
      mockCastVote.mockResolvedValue({
        success: true,
        alreadyProcessed: false,
        battleComplete: false,
      });

      const { registerBattleHandlers } = await import("../battle");
      registerBattleHandlers(mockIo, mockSocket);

      const voteHandler = eventHandlers.get("battle:vote");
      await voteHandler!({
        battleId: "battle-123",
        odv: "user-123",
        vote: "clean",
      });

      expect(mockCastVote).toHaveBeenCalledWith({
        eventId: expect.any(String),
        battleId: "battle-123",
        odv: "user-123",
        vote: "clean",
      });
      expect(mockBroadcastToRoom).toHaveBeenCalledWith(
        mockIo,
        "battle",
        "battle-123",
        "battle:voted",
        expect.objectContaining({
          vote: "clean",
        })
      );
    });

    it("should accept sketch vote", async () => {
      mockCastVote.mockResolvedValue({
        success: true,
        alreadyProcessed: false,
        battleComplete: false,
      });

      const { registerBattleHandlers } = await import("../battle");
      registerBattleHandlers(mockIo, mockSocket);

      const voteHandler = eventHandlers.get("battle:vote");
      await voteHandler!({
        battleId: "battle-123",
        odv: "user-123",
        vote: "sketch",
      });

      expect(mockCastVote).toHaveBeenCalledWith(
        expect.objectContaining({
          vote: "sketch",
        })
      );
    });

    it("should accept redo vote", async () => {
      mockCastVote.mockResolvedValue({
        success: true,
        alreadyProcessed: false,
        battleComplete: false,
      });

      const { registerBattleHandlers } = await import("../battle");
      registerBattleHandlers(mockIo, mockSocket);

      const voteHandler = eventHandlers.get("battle:vote");
      await voteHandler!({
        battleId: "battle-123",
        odv: "user-123",
        vote: "redo",
      });

      expect(mockCastVote).toHaveBeenCalledWith(
        expect.objectContaining({
          vote: "redo",
        })
      );
    });

    it("should broadcast completion when battle ends", async () => {
      mockCastVote.mockResolvedValue({
        success: true,
        alreadyProcessed: false,
        battleComplete: true,
        winnerId: "user-456",
        finalScore: {
          creator: 2,
          opponent: 3,
        },
      });

      const { registerBattleHandlers } = await import("../battle");
      registerBattleHandlers(mockIo, mockSocket);

      const voteHandler = eventHandlers.get("battle:vote");
      await voteHandler!({
        battleId: "battle-123",
        odv: "user-123",
        vote: "clean",
      });

      expect(mockBroadcastToRoom).toHaveBeenCalledWith(
        mockIo,
        "battle",
        "battle-123",
        "battle:completed",
        expect.objectContaining({
          winnerId: "user-456",
          finalScore: expect.any(Object),
        })
      );
    });

    it("should skip broadcast if already processed (idempotency)", async () => {
      mockCastVote.mockResolvedValue({
        success: true,
        alreadyProcessed: true,
        battleComplete: false,
      });

      const { registerBattleHandlers } = await import("../battle");
      registerBattleHandlers(mockIo, mockSocket);

      const voteHandler = eventHandlers.get("battle:vote");
      await voteHandler!({
        battleId: "battle-123",
        odv: "user-123",
        vote: "clean",
      });

      expect(mockBroadcastToRoom).not.toHaveBeenCalled();
    });

    it("should handle vote errors", async () => {
      mockCastVote.mockResolvedValue({
        success: false,
        error: "Not a participant",
      });

      const { registerBattleHandlers } = await import("../battle");
      registerBattleHandlers(mockIo, mockSocket);

      const voteHandler = eventHandlers.get("battle:vote");
      await voteHandler!({
        battleId: "battle-123",
        odv: "user-123",
        vote: "clean",
      });

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "battle_vote_failed",
        message: "Not a participant",
      });
    });

    it("should use authenticated odv, not input odv", async () => {
      mockCastVote.mockResolvedValue({
        success: true,
        alreadyProcessed: false,
        battleComplete: false,
      });

      const { registerBattleHandlers } = await import("../battle");
      registerBattleHandlers(mockIo, mockSocket);

      const voteHandler = eventHandlers.get("battle:vote");
      await voteHandler!({
        battleId: "battle-123",
        odv: "malicious-user",
        vote: "clean",
      });

      expect(mockCastVote).toHaveBeenCalledWith(
        expect.objectContaining({
          odv: "user-123", // Uses socket.data.odv, not input.odv
        })
      );
    });
  });

  describe("battle:ready", () => {
    it("should mark player as ready", async () => {
      const { registerBattleHandlers } = await import("../battle");
      registerBattleHandlers(mockIo, mockSocket);

      const readyHandler = eventHandlers.get("battle:ready");
      await readyHandler!("battle-123");

      expect(mockJoinRoom).toHaveBeenCalledWith(mockSocket, "battle", "battle-123");
      expect(mockBroadcastToRoom).toHaveBeenCalledWith(
        mockIo,
        "battle",
        "battle-123",
        "battle:update",
        expect.objectContaining({
          state: "waiting",
        }),
        mockSocket
      );
    });

    it("should track socket-battle association on ready", async () => {
      const { registerBattleHandlers } = await import("../battle");
      registerBattleHandlers(mockIo, mockSocket);

      const readyHandler = eventHandlers.get("battle:ready");
      await readyHandler!("battle-123");

      expect(mockJoinRoom).toHaveBeenCalledWith(mockSocket, "battle", "battle-123");
    });
  });

  describe("cleanupBattleSubscriptions", () => {
    it("should cleanup on disconnect", async () => {
      // First create a battle to track
      mockCreateBattle.mockResolvedValue({
        battleId: "battle-123",
      });

      const { registerBattleHandlers, cleanupBattleSubscriptions } = await import("../battle");
      registerBattleHandlers(mockIo, mockSocket);

      const createHandler = eventHandlers.get("battle:create");
      await createHandler!({ matchmaking: "open" });

      // Now cleanup
      await cleanupBattleSubscriptions(mockSocket);

      expect(mockLeaveRoom).toHaveBeenCalledWith(mockSocket, "battle", "battle-123");
    });

    it("should handle cleanup errors gracefully", async () => {
      mockLeaveRoom.mockRejectedValue(new Error("Room error"));

      mockCreateBattle.mockResolvedValue({
        battleId: "battle-123",
      });

      const { registerBattleHandlers, cleanupBattleSubscriptions } = await import("../battle");
      registerBattleHandlers(mockIo, mockSocket);

      const createHandler = eventHandlers.get("battle:create");
      await createHandler!({ matchmaking: "open" });

      // Should not throw
      await expect(cleanupBattleSubscriptions(mockSocket)).resolves.not.toThrow();
    });
  });

  describe("Double-vote Protection", () => {
    it("should update existing vote when voting twice", async () => {
      mockCastVote.mockResolvedValueOnce({
        success: true,
        alreadyProcessed: false,
        battleComplete: false,
      });

      const { registerBattleHandlers } = await import("../battle");
      registerBattleHandlers(mockIo, mockSocket);

      const voteHandler = eventHandlers.get("battle:vote");

      // First vote
      await voteHandler!({
        battleId: "battle-123",
        odv: "user-123",
        vote: "clean",
      });

      // Second vote (different choice)
      await voteHandler!({
        battleId: "battle-123",
        odv: "user-123",
        vote: "sketch",
      });

      expect(mockCastVote).toHaveBeenCalledTimes(2);
    });
  });

  describe("Tie Handling", () => {
    it("should declare creator as winner on tie", async () => {
      mockCastVote.mockResolvedValue({
        success: true,
        alreadyProcessed: false,
        battleComplete: true,
        winnerId: "user-123", // Creator wins tie
        finalScore: {
          creator: 3,
          opponent: 3,
        },
      });

      const { registerBattleHandlers } = await import("../battle");
      registerBattleHandlers(mockIo, mockSocket);

      const voteHandler = eventHandlers.get("battle:vote");
      await voteHandler!({
        battleId: "battle-123",
        odv: "user-123",
        vote: "clean",
      });

      expect(mockBroadcastToRoom).toHaveBeenCalledWith(
        mockIo,
        "battle",
        "battle-123",
        "battle:completed",
        expect.objectContaining({
          winnerId: "user-123",
        })
      );
    });
  });

  describe("Event ID Generation", () => {
    it("should generate event IDs for idempotency", async () => {
      mockCastVote.mockResolvedValue({
        success: true,
        alreadyProcessed: false,
        battleComplete: false,
      });

      const { registerBattleHandlers } = await import("../battle");
      registerBattleHandlers(mockIo, mockSocket);

      const voteHandler = eventHandlers.get("battle:vote");
      await voteHandler!({
        battleId: "battle-123",
        odv: "user-123",
        vote: "clean",
      });

      expect(mockGenerateEventId).toHaveBeenCalledWith("vote", "user-123", "battle-123");
    });
  });
});
