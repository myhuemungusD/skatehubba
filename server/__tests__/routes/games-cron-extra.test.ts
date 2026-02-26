/**
 * @fileoverview Coverage test for games-cron.ts line 178
 *
 * Covers the branch in forfeitStalledGames where p2Count > p1Count,
 * meaning player2 has more letters (closer to losing) and is assigned as the loser.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks (same pattern as games-cron.test.ts)
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

const { forfeitStalledGames } = await import("../../routes/games-cron");

// ============================================================================
// Tests
// ============================================================================

describe("Games Cron – extra coverage", () => {
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
  // Line 178: p2Count > p1Count → loserId = fresh.player2Id
  // --------------------------------------------------------------------------
  describe("forfeitStalledGames – player2 has more letters (line 178)", () => {
    it("should forfeit game where player2 has more letters (player2 loses)", async () => {
      const now = new Date();
      const stalledGame = {
        id: "game-p2-loses",
        status: "active",
        createdAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
        currentTurn: "player-1",
        player1Id: "player-1",
        player2Id: "player-2",
        player1Letters: "S", // 1 letter
        player2Letters: "SKAT", // 4 letters — closer to losing
      };

      let selectCallCount = 0;
      mockDbChain.then = (resolve: any) => {
        selectCallCount++;
        if (selectCallCount <= 2) {
          return Promise.resolve([stalledGame]).then(resolve);
        }
        return Promise.resolve(undefined).then(resolve);
      };

      const result = await forfeitStalledGames();
      expect(result).toEqual({ forfeited: 1 });

      // player2 has more letters so player2 loses, player1 wins
      expect(mockDbChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "forfeited",
          winnerId: "player-1",
        })
      );
    });

    it("should notify both players when player2 loses due to more letters", async () => {
      const now = new Date();
      const stalledGame = {
        id: "game-p2-loses-notify",
        status: "active",
        createdAt: new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000),
        currentTurn: "player-2",
        player1Id: "player-1",
        player2Id: "player-2",
        player1Letters: "SK", // 2 letters
        player2Letters: "SKATE", // 5 letters — player2 loses
      };

      let selectCallCount = 0;
      mockDbChain.then = (resolve: any) => {
        selectCallCount++;
        if (selectCallCount <= 2) {
          return Promise.resolve([stalledGame]).then(resolve);
        }
        return Promise.resolve(undefined).then(resolve);
      };

      const result = await forfeitStalledGames();
      expect(result).toEqual({ forfeited: 1 });

      // Both players should be notified
      expect(mockSendNotification).toHaveBeenCalledTimes(2);
      expect(mockSendNotification).toHaveBeenCalledWith(
        "player-1",
        "game_forfeited_timeout",
        expect.objectContaining({ gameId: "game-p2-loses-notify" })
      );
      expect(mockSendNotification).toHaveBeenCalledWith(
        "player-2",
        "game_forfeited_timeout",
        expect.objectContaining({ gameId: "game-p2-loses-notify" })
      );
    });
  });
});
