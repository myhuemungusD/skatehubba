/**
 * Branch coverage tests for server/socket/handlers/battle.ts
 * Covers lines 307, 332, 419
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

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
const mockGetDb = vi.fn();

vi.mock("../../socket/rooms", () => ({
  joinRoom: mockJoinRoom,
  leaveRoom: mockLeaveRoom,
  broadcastToRoom: mockBroadcastToRoom,
  sendToUser: mockSendToUser,
  getRoomInfo: mockGetRoomInfo,
}));

vi.mock("../../services/battleService", () => ({
  createBattle: mockCreateBattle,
  joinBattle: mockJoinBattle,
  getBattle: mockGetBattle,
}));

vi.mock("../../services/battleStateService", () => ({
  initializeVoting: mockInitializeVoting,
  castVote: mockCastVote,
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

vi.mock("../../db", () => ({
  getDb: (...args: any[]) => mockGetDb(...args),
}));

vi.mock("@shared/schema", () => ({
  customUsers: { id: "id", isActive: "isActive" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: any, b: any) => ({ field: a, value: b })),
}));

describe("Battle Socket Handlers — Branch Coverage", () => {
  let mockSocket: any;
  let mockIo: any;
  let eventHandlers: Map<string, Function>;

  beforeEach(() => {
    vi.clearAllMocks();
    eventHandlers = new Map();

    mockSocket = {
      id: "socket-999",
      data: { odv: "user-999" },
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

    mockGetRoomInfo.mockReturnValue({ members: new Set(["socket-999"]) });

    const mockDbChain: any = {};
    mockDbChain.select = vi.fn(() => mockDbChain);
    mockDbChain.from = vi.fn(() => mockDbChain);
    mockDbChain.where = vi.fn(() => mockDbChain);
    mockDbChain.limit = vi.fn().mockResolvedValue([{ id: "user-456", isActive: true }]);
    mockGetDb.mockReturnValue(mockDbChain);
  });

  describe("Line 307: vote error fallback message", () => {
    it("should use fallback message when result.error is undefined", async () => {
      // castVote returns success: false but no error field
      mockCastVote.mockResolvedValue({
        success: false,
        // no error property
      });

      const { registerBattleHandlers } = await import("../../socket/handlers/battle");
      registerBattleHandlers(mockIo, mockSocket);

      const voteHandler = eventHandlers.get("battle:vote");
      await voteHandler!({
        battleId: "battle-123",
        odv: "user-999",
        vote: "clean",
      });

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "battle_vote_failed",
        message: "Failed to cast vote",
      });
    });

    it("should use result.error when provided", async () => {
      mockCastVote.mockResolvedValue({
        success: false,
        error: "Custom error message",
      });

      const { registerBattleHandlers } = await import("../../socket/handlers/battle");
      registerBattleHandlers(mockIo, mockSocket);

      const voteHandler = eventHandlers.get("battle:vote");
      await voteHandler!({
        battleId: "battle-123",
        odv: "user-999",
        vote: "clean",
      });

      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        code: "battle_vote_failed",
        message: "Custom error message",
      });
    });
  });

  describe("Line 332: finalScore fallback", () => {
    it("should use empty object when result.finalScore is undefined", async () => {
      mockCastVote.mockResolvedValue({
        success: true,
        alreadyProcessed: false,
        battleComplete: true,
        winnerId: "user-456",
        // no finalScore
      });

      const { registerBattleHandlers } = await import("../../socket/handlers/battle");
      registerBattleHandlers(mockIo, mockSocket);

      const voteHandler = eventHandlers.get("battle:vote");
      await voteHandler!({
        battleId: "battle-123",
        odv: "user-999",
        vote: "clean",
      });

      expect(mockBroadcastToRoom).toHaveBeenCalledWith(
        mockIo,
        "battle",
        "battle-123",
        "battle:completed",
        expect.objectContaining({
          winnerId: "user-456",
          finalScore: {},
        })
      );
    });
  });

  describe("Line 419: cleanupBattleSubscriptions with no tracked battles", () => {
    it("should handle cleanup for socket with no tracked battles", async () => {
      const { cleanupBattleSubscriptions } = await import("../../socket/handlers/battle");

      // Socket that has never created/joined a battle
      const freshSocket = {
        id: "socket-fresh",
        data: { odv: "user-fresh" },
      } as any;

      // Should not throw — gracefully handles missing socketBattleMap entry
      await expect(cleanupBattleSubscriptions(freshSocket)).resolves.not.toThrow();
      expect(mockLeaveRoom).not.toHaveBeenCalled();
    });
  });
});
