/**
 * @fileoverview Unit tests for games-cron (auto-forfeit and deadline warnings)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const mockDbChain: any = {};
mockDbChain.select = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.from = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.where = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.update = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.set = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);

let shouldGetDbThrow = false;

class MockDatabaseUnavailableError extends Error {
  constructor() {
    super("Database not configured");
    this.name = "DatabaseUnavailableError";
  }
}

vi.mock("../../db", () => ({
  getDb: () => {
    if (shouldGetDbThrow) throw new MockDatabaseUnavailableError();
    return mockDbChain;
  },
  DatabaseUnavailableError: MockDatabaseUnavailableError,
}));

vi.mock("@shared/schema", () => ({
  games: {
    _table: "games",
    status: "status",
    deadlineAt: "deadlineAt",
    id: "id",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  lt: vi.fn(),
}));

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

const mockSendNotification = vi.fn().mockResolvedValue(undefined);
vi.mock("../../services/gameNotificationService", () => ({
  sendGameNotificationToUser: (...args: any[]) => mockSendNotification(...args),
}));

const mockDeadlineWarningsSent = new Map<string, number>();
vi.mock("../../routes/games-shared", () => ({
  deadlineWarningsSent: mockDeadlineWarningsSent,
  DEADLINE_WARNING_COOLDOWN_MS: 30 * 60 * 1000,
  TURN_DEADLINE_MS: 24 * 60 * 60 * 1000,
}));

const { forfeitExpiredGames, notifyDeadlineWarnings } = await import("../../routes/games-cron");

// ============================================================================
// Tests
// ============================================================================

describe("Games Cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeadlineWarningsSent.clear();
    shouldGetDbThrow = false;
  });

  describe("forfeitExpiredGames", () => {
    it("should throw when db is unavailable", async () => {
      shouldGetDbThrow = true;
      await expect(forfeitExpiredGames()).rejects.toThrow("Database not configured");
    });

    it("should return { forfeited: 0 } when no expired games", async () => {
      mockDbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);
      const result = await forfeitExpiredGames();
      expect(result).toEqual({ forfeited: 0 });
    });

    it("should forfeit expired games and notify players", async () => {
      const now = new Date();
      const expiredGame = {
        id: "game-1",
        status: "active",
        deadlineAt: new Date(now.getTime() - 1000),
        currentTurn: "player-1",
        player1Id: "player-1",
        player2Id: "player-2",
      };

      // First call is select (returns expired games), subsequent is update chain
      let selectCallCount = 0;
      mockDbChain.then = (resolve: any) => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return Promise.resolve([expiredGame]).then(resolve);
        }
        return Promise.resolve(undefined).then(resolve);
      };

      const result = await forfeitExpiredGames();
      expect(result).toEqual({ forfeited: 1 });
      expect(mockSendNotification).toHaveBeenCalledTimes(2);
      expect(mockSendNotification).toHaveBeenCalledWith(
        "player-1",
        "game_forfeited_timeout",
        expect.objectContaining({ gameId: "game-1" })
      );
      expect(mockSendNotification).toHaveBeenCalledWith(
        "player-2",
        "game_forfeited_timeout",
        expect.objectContaining({ gameId: "game-1" })
      );
    });

    it("should return { forfeited: 0 } on error", async () => {
      mockDbChain.select = vi.fn(() => {
        throw new Error("DB error");
      });
      const result = await forfeitExpiredGames();
      expect(result).toEqual({ forfeited: 0 });
      mockDbChain.select = vi.fn().mockReturnValue(mockDbChain);
    });

    it("should skip players with null IDs", async () => {
      const expiredGame = {
        id: "game-2",
        status: "active",
        deadlineAt: new Date(Date.now() - 1000),
        currentTurn: "player-1",
        player1Id: "player-1",
        player2Id: null,
      };

      let selectCallCount = 0;
      mockDbChain.then = (resolve: any) => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return Promise.resolve([expiredGame]).then(resolve);
        }
        return Promise.resolve(undefined).then(resolve);
      };

      const result = await forfeitExpiredGames();
      expect(result).toEqual({ forfeited: 1 });
      // Only 1 notification (player2Id is null)
      expect(mockSendNotification).toHaveBeenCalledTimes(1);
    });
  });

  describe("notifyDeadlineWarnings", () => {
    it("should throw when db is unavailable", async () => {
      shouldGetDbThrow = true;
      await expect(notifyDeadlineWarnings()).rejects.toThrow("Database not configured");
    });

    it("should return { notified: 0 } when no urgent games", async () => {
      mockDbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);
      const result = await notifyDeadlineWarnings();
      expect(result).toEqual({ notified: 0 });
    });

    it("should notify players with deadline within 1 hour", async () => {
      const now = new Date();
      const urgentGame = {
        id: "game-3",
        status: "active",
        currentTurn: "player-1",
        deadlineAt: new Date(now.getTime() + 30 * 60 * 1000), // 30 mins from now
      };

      mockDbChain.then = (resolve: any) => Promise.resolve([urgentGame]).then(resolve);

      const result = await notifyDeadlineWarnings();
      expect(result).toEqual({ notified: 1 });
      expect(mockSendNotification).toHaveBeenCalledWith(
        "player-1",
        "deadline_warning",
        expect.objectContaining({ gameId: "game-3" })
      );
    });

    it("should skip games with expired deadlines", async () => {
      const urgentGame = {
        id: "game-4",
        status: "active",
        currentTurn: "player-1",
        deadlineAt: new Date(Date.now() - 1000), // Already expired
      };

      mockDbChain.then = (resolve: any) => Promise.resolve([urgentGame]).then(resolve);

      const result = await notifyDeadlineWarnings();
      expect(result).toEqual({ notified: 0 });
    });

    it("should skip games without currentTurn or deadlineAt", async () => {
      const game = {
        id: "game-5",
        status: "active",
        currentTurn: null,
        deadlineAt: new Date(Date.now() + 30 * 60 * 1000),
      };

      mockDbChain.then = (resolve: any) => Promise.resolve([game]).then(resolve);

      const result = await notifyDeadlineWarnings();
      expect(result).toEqual({ notified: 0 });
    });

    it("should skip games already warned within cooldown", async () => {
      const urgentGame = {
        id: "game-6",
        status: "active",
        currentTurn: "player-1",
        deadlineAt: new Date(Date.now() + 30 * 60 * 1000),
      };

      // Set recent warning
      mockDeadlineWarningsSent.set("game-6", Date.now() - 5 * 60 * 1000);

      mockDbChain.then = (resolve: any) => Promise.resolve([urgentGame]).then(resolve);

      const result = await notifyDeadlineWarnings();
      expect(result).toEqual({ notified: 0 });
    });

    it("should clean up old dedup entries", async () => {
      // Add old entry
      mockDeadlineWarningsSent.set("old-game", Date.now() - 25 * 60 * 60 * 1000);

      mockDbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);

      await notifyDeadlineWarnings();
      expect(mockDeadlineWarningsSent.has("old-game")).toBe(false);
    });

    it("should return { notified: 0 } on error", async () => {
      mockDbChain.select = vi.fn(() => {
        throw new Error("fail");
      });
      const result = await notifyDeadlineWarnings();
      expect(result).toEqual({ notified: 0 });
      mockDbChain.select = vi.fn().mockReturnValue(mockDbChain);
    });
  });
});
