/**
 * Edge-case tests for games-cron.ts
 * Covers inner catch blocks (lines 74, 213) and player2-loses branch (line 178)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock chain requires dynamic property assignment
const mockDbChain: any = {};
mockDbChain.select = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.from = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.where = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.update = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.set = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.limit = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);

vi.mock("../../db", () => ({
  getDb: () => mockDbChain,
  DatabaseUnavailableError: class extends Error {
    constructor() {
      super("DB unavailable");
    }
  },
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
    (strings: TemplateStringsArray, ..._values: unknown[]) => ({ _sql: true, strings }),
    { raw: (s: string) => ({ _sql: true, raw: s }) }
  ),
}));

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock("../../logger", () => ({
  default: mockLogger,
  createChildLogger: vi.fn(() => mockLogger),
}));

const mockSendNotification = vi.fn().mockResolvedValue(undefined);
vi.mock("../../services/gameNotificationService", () => ({
  sendGameNotificationToUser: (...args: unknown[]) => mockSendNotification(...args),
}));

const mockDeadlineWarningsSent = new Map<string, number>();
vi.mock("../../routes/games-shared", () => ({
  deadlineWarningsSent: mockDeadlineWarningsSent,
  DEADLINE_WARNING_COOLDOWN_MS: 30 * 60 * 1000,
  TURN_DEADLINE_MS: 24 * 60 * 60 * 1000,
  GAME_HARD_CAP_MS: 7 * 24 * 60 * 60 * 1000,
}));

const { forfeitExpiredGames, forfeitStalledGames } = await import("../../routes/games-cron");

// ============================================================================
// Tests
// ============================================================================

describe("Games Cron — edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeadlineWarningsSent.clear();
    mockDbChain.select = vi.fn().mockReturnValue(mockDbChain);
    mockDbChain.from = vi.fn().mockReturnValue(mockDbChain);
    mockDbChain.where = vi.fn().mockReturnValue(mockDbChain);
    mockDbChain.update = vi.fn().mockReturnValue(mockDbChain);
    mockDbChain.set = vi.fn().mockReturnValue(mockDbChain);
    mockDbChain.limit = vi.fn().mockReturnValue(mockDbChain);
  });

  describe("forfeitExpiredGames — inner catch (line 74)", () => {
    it("logs error and continues when a single game forfeit fails", async () => {
      const now = new Date();
      const game1 = {
        id: "game-fail",
        status: "active",
        deadlineAt: new Date(now.getTime() - 1000),
        currentTurn: "p1",
        player1Id: "p1",
        player2Id: "p2",
      };

      // Return the game on outer select
      let outerSelectDone = false;
      mockDbChain.then = (resolve: any) => {
        if (!outerSelectDone) {
          outerSelectDone = true;
          return Promise.resolve([game1]).then(resolve);
        }
        return Promise.resolve([]).then(resolve);
      };

      // Make the transaction throw for the inner loop
      mockDbChain.transaction = vi.fn().mockRejectedValue(new Error("Lock timeout"));

      const result = await forfeitExpiredGames();

      // Should continue and return 0 forfeited (the error was caught)
      expect(result).toEqual({ forfeited: 0 });
      expect(mockLogger.error).toHaveBeenCalledWith(
        "[Games] Failed to forfeit expired game",
        expect.objectContaining({ gameId: "game-fail" })
      );
    });
  });

  describe("forfeitStalledGames — player2 loses (line 178)", () => {
    it("forfeits game where player2 has more letters (player2 loses)", async () => {
      const now = new Date();
      const stalledGame = {
        id: "game-p2-loses",
        status: "active",
        createdAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
        currentTurn: "p1",
        player1Id: "p1",
        player2Id: "p2",
        player1Letters: "S",
        player2Letters: "SKA", // player2 has more letters — should lose
      };

      let selectCallCount = 0;
      mockDbChain.then = (resolve: any) => {
        selectCallCount++;
        if (selectCallCount <= 2) {
          return Promise.resolve([stalledGame]).then(resolve);
        }
        return Promise.resolve(undefined).then(resolve);
      };

      mockDbChain.transaction = vi.fn().mockImplementation(async (cb: any) => {
        const tx = Object.create(mockDbChain);
        tx.execute = vi.fn().mockResolvedValue(undefined);
        return cb(tx);
      });

      const result = await forfeitStalledGames();
      expect(result).toEqual({ forfeited: 1 });

      // player2 has more letters so player2 loses, player1 wins
      expect(mockDbChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "forfeited",
          winnerId: "p1",
        })
      );
    });
  });

  describe("forfeitStalledGames — inner catch (line 213)", () => {
    it("logs error and continues when a single game forfeit fails", async () => {
      const now = new Date();
      const game = {
        id: "game-stalled-fail",
        status: "active",
        createdAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
        player1Id: "p1",
        player2Id: "p2",
        player1Letters: "SK",
        player2Letters: "S",
        currentTurn: "p1",
      };

      let outerSelectDone = false;
      mockDbChain.then = (resolve: any) => {
        if (!outerSelectDone) {
          outerSelectDone = true;
          return Promise.resolve([game]).then(resolve);
        }
        return Promise.resolve([]).then(resolve);
      };

      mockDbChain.transaction = vi.fn().mockRejectedValue(new Error("Deadlock detected"));

      const result = await forfeitStalledGames();

      expect(result).toEqual({ forfeited: 0 });
      expect(mockLogger.error).toHaveBeenCalledWith(
        "[Games] Failed to forfeit stalled game",
        expect.objectContaining({ gameId: "game-stalled-fail" })
      );
    });
  });

  describe("forfeitStalledGames — skips games without both players", () => {
    it("skips games where player2Id is null", async () => {
      const now = new Date();
      const game = {
        id: "game-no-p2",
        status: "active",
        createdAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
        player1Id: "p1",
        player2Id: null,
        player1Letters: "",
        player2Letters: "",
        currentTurn: "p1",
      };

      mockDbChain.then = (resolve: any) => Promise.resolve([game]).then(resolve);

      const result = await forfeitStalledGames();

      expect(result).toEqual({ forfeited: 0 });
    });
  });

  describe("forfeitExpiredGames — skips resolved games inside lock", () => {
    it("skips game that was resolved between outer select and lock acquisition", async () => {
      const now = new Date();
      const expiredGame = {
        id: "game-resolved",
        status: "active",
        deadlineAt: new Date(now.getTime() - 1000),
        currentTurn: "p1",
        player1Id: "p1",
        player2Id: "p2",
      };

      // Return game on outer select, but inside tx re-read returns completed status
      let selectCallCount = 0;
      mockDbChain.then = (resolve: any) => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return Promise.resolve([expiredGame]).then(resolve);
        }
        // Inside tx, game is now completed
        return Promise.resolve([{ ...expiredGame, status: "completed" }]).then(resolve);
      };

      mockDbChain.transaction = vi.fn().mockImplementation(async (cb: any) => {
        const tx = Object.create(mockDbChain);
        tx.execute = vi.fn().mockResolvedValue(undefined);
        return cb(tx);
      });

      const result = await forfeitExpiredGames();

      // Game should be skipped (returned null from tx)
      expect(result).toEqual({ forfeited: 0 });
    });
  });
});
