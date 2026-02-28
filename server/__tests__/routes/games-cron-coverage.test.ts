/**
 * @fileoverview Coverage gap tests for games-cron
 * Covers:
 *   - Line 74: per-game error in forfeitExpiredGames (transaction throws for one game)
 *   - Line 178: deadlineAt is null in notifyDeadlineWarnings
 *   - Line 213: per-game error in forfeitStalledGames (transaction throws for one game)
 *   - forfeitStalledGames: game with null player1Id/player2Id (continue branch)
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
mockDbChain.limit = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);
mockDbChain.transaction = vi.fn().mockImplementation(async (cb: any) => {
  const tx = Object.create(mockDbChain);
  tx.execute = vi.fn().mockResolvedValue(undefined);
  return cb(tx);
});

class MockDatabaseUnavailableError extends Error {
  constructor() {
    super("Database not configured");
    this.name = "DatabaseUnavailableError";
  }
}

vi.mock("../../db", () => ({
  getDb: () => mockDbChain,
  DatabaseUnavailableError: MockDatabaseUnavailableError,
}));

vi.mock("@shared/schema", () => ({
  games: {
    _table: "games",
    status: "status",
    deadlineAt: "deadlineAt",
    createdAt: "createdAt",
    id: "id",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  lt: vi.fn(),
  sql: Object.assign(
    (strings: TemplateStringsArray, ..._values: any[]) => ({
      _sql: true,
      strings,
    }),
    { raw: (s: string) => ({ _sql: true, raw: s }) }
  ),
}));

vi.mock("../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
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
  GAME_HARD_CAP_MS: 7 * 24 * 60 * 60 * 1000,
}));

const { forfeitExpiredGames, notifyDeadlineWarnings, forfeitStalledGames } =
  await import("../../routes/games-cron");

import logger from "../../logger";

// ============================================================================
// Tests
// ============================================================================

describe("Games Cron – coverage gaps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeadlineWarningsSent.clear();
    // Reset chain methods to defaults
    mockDbChain.select = vi.fn().mockReturnValue(mockDbChain);
    mockDbChain.from = vi.fn().mockReturnValue(mockDbChain);
    mockDbChain.where = vi.fn().mockReturnValue(mockDbChain);
    mockDbChain.update = vi.fn().mockReturnValue(mockDbChain);
    mockDbChain.set = vi.fn().mockReturnValue(mockDbChain);
    mockDbChain.limit = vi.fn().mockReturnValue(mockDbChain);
    mockDbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);
    mockDbChain.transaction = vi.fn().mockImplementation(async (cb: any) => {
      const tx = Object.create(mockDbChain);
      tx.execute = vi.fn().mockResolvedValue(undefined);
      return cb(tx);
    });
  });

  // --------------------------------------------------------------------------
  // Line 74: forfeitExpiredGames – per-game transaction error
  // --------------------------------------------------------------------------
  describe("forfeitExpiredGames – per-game error handling (line 74)", () => {
    it("should log error and continue when transaction throws for one game", async () => {
      const now = new Date();
      const game1 = {
        id: "game-err-1",
        status: "active",
        deadlineAt: new Date(now.getTime() - 2000),
        currentTurn: "p1",
        player1Id: "p1",
        player2Id: "p2",
      };
      const game2 = {
        id: "game-err-2",
        status: "active",
        deadlineAt: new Date(now.getTime() - 1000),
        currentTurn: "p3",
        player1Id: "p3",
        player2Id: "p4",
      };

      // Outer select returns two expired games
      let selectCallCount = 0;
      mockDbChain.then = (resolve: any) => {
        selectCallCount++;
        // Call 1: outer select returning both games
        if (selectCallCount === 1) {
          return Promise.resolve([game1, game2]).then(resolve);
        }
        // Call 2+: inner re-reads inside transaction return the game being processed
        // (game2 on second transaction call)
        return Promise.resolve([game2]).then(resolve);
      };

      // First transaction call throws, second succeeds
      let txCallCount = 0;
      mockDbChain.transaction = vi.fn().mockImplementation(async (cb: any) => {
        txCallCount++;
        if (txCallCount === 1) throw new Error("DB error for game 1");
        const tx = Object.create(mockDbChain);
        tx.execute = vi.fn().mockResolvedValue(undefined);
        return cb(tx);
      });

      const result = await forfeitExpiredGames();

      // Only the second game was forfeited successfully
      expect(result).toEqual({ forfeited: 1 });

      // The error for game 1 was logged
      expect(logger.error).toHaveBeenCalledWith(
        "[Games] Failed to forfeit expired game",
        expect.objectContaining({ gameId: "game-err-1" })
      );

      // Notifications sent for game 2 only (2 players)
      expect(mockSendNotification).toHaveBeenCalledTimes(2);
    });
  });

  // --------------------------------------------------------------------------
  // Line 178: notifyDeadlineWarnings – deadlineAt is null
  // --------------------------------------------------------------------------
  describe("notifyDeadlineWarnings – null deadlineAt (line 178)", () => {
    it("should skip game when deadlineAt is null", async () => {
      const gameNoDeadline = {
        id: "game-no-deadline",
        status: "active",
        currentTurn: "player-1",
        deadlineAt: null,
      };

      mockDbChain.then = (resolve: any) => Promise.resolve([gameNoDeadline]).then(resolve);

      const result = await notifyDeadlineWarnings();

      expect(result).toEqual({ notified: 0 });
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("should skip game with null deadlineAt but notify game with valid deadline", async () => {
      const now = new Date();
      const gameNoDeadline = {
        id: "game-null-dl",
        status: "active",
        currentTurn: "player-1",
        deadlineAt: null,
      };
      const gameWithDeadline = {
        id: "game-valid-dl",
        status: "active",
        currentTurn: "player-2",
        deadlineAt: new Date(now.getTime() + 30 * 60 * 1000), // 30 mins from now
      };

      mockDbChain.then = (resolve: any) =>
        Promise.resolve([gameNoDeadline, gameWithDeadline]).then(resolve);

      const result = await notifyDeadlineWarnings();

      expect(result).toEqual({ notified: 1 });
      expect(mockSendNotification).toHaveBeenCalledTimes(1);
      expect(mockSendNotification).toHaveBeenCalledWith(
        "player-2",
        "deadline_warning",
        expect.objectContaining({ gameId: "game-valid-dl" })
      );
    });
  });

  // --------------------------------------------------------------------------
  // Line 213: forfeitStalledGames – per-game transaction error
  // --------------------------------------------------------------------------
  describe("forfeitStalledGames – per-game error handling (line 213)", () => {
    it("should log error and continue when transaction throws for one stalled game", async () => {
      const now = new Date();
      const game1 = {
        id: "stale-err-1",
        status: "active",
        createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
        currentTurn: "p1",
        player1Id: "p1",
        player2Id: "p2",
        player1Letters: "SK",
        player2Letters: "S",
      };
      const game2 = {
        id: "stale-err-2",
        status: "active",
        createdAt: new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000),
        currentTurn: "p3",
        player1Id: "p3",
        player2Id: "p4",
        player1Letters: "SKA",
        player2Letters: "S",
      };

      // Outer select returns both stalled games
      let selectCallCount = 0;
      mockDbChain.then = (resolve: any) => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return Promise.resolve([game1, game2]).then(resolve);
        }
        return Promise.resolve([game2]).then(resolve);
      };

      // First transaction throws, second succeeds
      let txCallCount = 0;
      mockDbChain.transaction = vi.fn().mockImplementation(async (cb: any) => {
        txCallCount++;
        if (txCallCount === 1) throw new Error("DB error for stalled game 1");
        const tx = Object.create(mockDbChain);
        tx.execute = vi.fn().mockResolvedValue(undefined);
        return cb(tx);
      });

      const result = await forfeitStalledGames();

      // Only the second game was forfeited
      expect(result).toEqual({ forfeited: 1 });

      // Error logged for game 1
      expect(logger.error).toHaveBeenCalledWith(
        "[Games] Failed to forfeit stalled game",
        expect.objectContaining({ gameId: "stale-err-1" })
      );

      // Notifications sent for game 2 only (2 players)
      expect(mockSendNotification).toHaveBeenCalledTimes(2);
    });
  });

  // --------------------------------------------------------------------------
  // forfeitStalledGames – null player1Id/player2Id (continue branch)
  // --------------------------------------------------------------------------
  describe("forfeitStalledGames – null player IDs", () => {
    it("should skip game with null player1Id", async () => {
      const now = new Date();
      const gameNullPlayer = {
        id: "stale-null-p1",
        status: "active",
        createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
        currentTurn: "p2",
        player1Id: null,
        player2Id: "p2",
        player1Letters: "",
        player2Letters: "S",
      };

      mockDbChain.then = (resolve: any) => Promise.resolve([gameNullPlayer]).then(resolve);

      const result = await forfeitStalledGames();

      expect(result).toEqual({ forfeited: 0 });
      expect(mockDbChain.transaction).not.toHaveBeenCalled();
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("should skip game with null player2Id", async () => {
      const now = new Date();
      const gameNullPlayer = {
        id: "stale-null-p2",
        status: "active",
        createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
        currentTurn: "p1",
        player1Id: "p1",
        player2Id: null,
        player1Letters: "S",
        player2Letters: "",
      };

      mockDbChain.then = (resolve: any) => Promise.resolve([gameNullPlayer]).then(resolve);

      const result = await forfeitStalledGames();

      expect(result).toEqual({ forfeited: 0 });
      expect(mockDbChain.transaction).not.toHaveBeenCalled();
      expect(mockSendNotification).not.toHaveBeenCalled();
    });
  });
});
