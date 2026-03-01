/**
 * @fileoverview Branch coverage tests for server/routes/games-cron.ts
 *
 * Targets every uncovered branch identified via v8 coverage:
 *
 * forfeitExpiredGames:
 *   - Line 41: fresh game not found or status !== "active" inside transaction → return null
 *   - Line 42: fresh.deadlineAt is null OR deadline >= now inside transaction → return null
 *   - Line 45: ternary false branch — loser is player2 (currentTurn === player2Id)
 *   - Line 55: transaction returns null → continue (skip notification)
 *   - Line 61: result.loserId is falsy → falls through to `undefined`
 *
 * forfeitStalledGames:
 *   - Line 168: fresh game not found or status !== "active" inside transaction → return null
 *   - Line 169: fresh.player1Id or fresh.player2Id is null inside transaction → return null
 *   - Line 171: fresh.player1Letters is null/undefined → fallback to ""
 *   - Line 172: fresh.player2Letters is null/undefined → fallback to ""
 *   - Line 180: fresh.currentTurn is falsy → fallback to fresh.player1Id (tie-break)
 *   - Line 192: transaction returns null → continue (skip notification)
 *   - Line 195: playerId is null in notification loop → continue
 *   - Line 198: result.loserId is falsy → falls through to `undefined`
 *   - Line 199: result.winnerId is falsy → falls through to `undefined`
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
    { raw: (s: string) => ({ _sql: true, raw: s }) },
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
// Helpers
// ============================================================================

function resetMockDbChain() {
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
}

/**
 * Build a transaction mock that returns specific data for the inner re-read.
 * The tx.select()...from()...where()...limit() chain resolves to `freshRows`.
 * The tx.update()...set()...where() chain resolves to undefined.
 */
function buildTxReturning(freshRows: any[]) {
  return vi.fn().mockImplementation(async (cb: any) => {
    const tx: any = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(freshRows),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    };
    return cb(tx);
  });
}

// ============================================================================
// Tests
// ============================================================================

describe("games-cron branch coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeadlineWarningsSent.clear();
    resetMockDbChain();
  });

  // ==========================================================================
  // forfeitExpiredGames
  // ==========================================================================

  describe("forfeitExpiredGames — transaction re-check branches", () => {
    it("skips when fresh game is not found inside transaction (line 41 — !fresh)", async () => {
      const now = new Date();
      const expiredGame = {
        id: "game-gone",
        status: "active",
        deadlineAt: new Date(now.getTime() - 5000),
        currentTurn: "p1",
        player1Id: "p1",
        player2Id: "p2",
      };

      // Outer select returns one expired game
      mockDbChain.then = (resolve: any) =>
        Promise.resolve([expiredGame]).then(resolve);

      // Transaction inner select returns empty array (game deleted concurrently)
      mockDbChain.transaction = buildTxReturning([]);

      const result = await forfeitExpiredGames();
      expect(result).toEqual({ forfeited: 0 });
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("skips when fresh game status is no longer active inside transaction (line 41 — status !== active)", async () => {
      const now = new Date();
      const expiredGame = {
        id: "game-resolved",
        status: "active",
        deadlineAt: new Date(now.getTime() - 5000),
        currentTurn: "p1",
        player1Id: "p1",
        player2Id: "p2",
      };

      mockDbChain.then = (resolve: any) =>
        Promise.resolve([expiredGame]).then(resolve);

      // Transaction re-read: game status changed to "completed"
      mockDbChain.transaction = buildTxReturning([
        { ...expiredGame, status: "completed" },
      ]);

      const result = await forfeitExpiredGames();
      expect(result).toEqual({ forfeited: 0 });
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("skips when fresh deadlineAt is null inside transaction (line 42 — !fresh.deadlineAt)", async () => {
      const now = new Date();
      const expiredGame = {
        id: "game-deadline-cleared",
        status: "active",
        deadlineAt: new Date(now.getTime() - 5000),
        currentTurn: "p1",
        player1Id: "p1",
        player2Id: "p2",
      };

      mockDbChain.then = (resolve: any) =>
        Promise.resolve([expiredGame]).then(resolve);

      // Transaction re-read: deadlineAt was set to null concurrently
      mockDbChain.transaction = buildTxReturning([
        { ...expiredGame, deadlineAt: null },
      ]);

      const result = await forfeitExpiredGames();
      expect(result).toEqual({ forfeited: 0 });
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("skips when fresh deadline is in the future inside transaction (line 42 — deadline >= now)", async () => {
      const now = new Date();
      const expiredGame = {
        id: "game-deadline-reset",
        status: "active",
        deadlineAt: new Date(now.getTime() - 5000),
        currentTurn: "p1",
        player1Id: "p1",
        player2Id: "p2",
      };

      mockDbChain.then = (resolve: any) =>
        Promise.resolve([expiredGame]).then(resolve);

      // Transaction re-read: deadline was extended to the future
      mockDbChain.transaction = buildTxReturning([
        { ...expiredGame, deadlineAt: new Date(Date.now() + 60 * 60 * 1000) },
      ]);

      const result = await forfeitExpiredGames();
      expect(result).toEqual({ forfeited: 0 });
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("assigns player2 as winner when currentTurn is player2 (line 45 — ternary false branch)", async () => {
      const now = new Date();
      // currentTurn is player2Id, so loser = player2Id and winner should be player1Id
      const expiredGame = {
        id: "game-p2-loses",
        status: "active",
        deadlineAt: new Date(now.getTime() - 5000),
        currentTurn: "player-2",
        player1Id: "player-1",
        player2Id: "player-2",
      };

      mockDbChain.then = (resolve: any) =>
        Promise.resolve([expiredGame]).then(resolve);

      const mockTxSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      mockDbChain.transaction = vi.fn().mockImplementation(async (cb: any) => {
        const tx: any = {
          execute: vi.fn().mockResolvedValue(undefined),
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([expiredGame]),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: mockTxSet,
          }),
        };
        return cb(tx);
      });

      const result = await forfeitExpiredGames();
      expect(result).toEqual({ forfeited: 1 });

      // Verify winner is player-1 (the non-current-turn player)
      expect(mockTxSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "forfeited",
          winnerId: "player-1",
        }),
      );
    });

    it("continues without notification when transaction returns null (line 55)", async () => {
      const now = new Date();
      const game1 = {
        id: "game-null-result",
        status: "active",
        deadlineAt: new Date(now.getTime() - 5000),
        currentTurn: "p1",
        player1Id: "p1",
        player2Id: "p2",
      };

      mockDbChain.then = (resolve: any) =>
        Promise.resolve([game1]).then(resolve);

      // Transaction returns null explicitly (simulating the re-check returning null)
      mockDbChain.transaction = vi.fn().mockResolvedValue(null);

      const result = await forfeitExpiredGames();
      expect(result).toEqual({ forfeited: 0 });
      expect(mockSendNotification).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("passes undefined for loserId when result.loserId is falsy (line 61)", async () => {
      const now = new Date();
      const expiredGame = {
        id: "game-null-loser",
        status: "active",
        deadlineAt: new Date(now.getTime() - 5000),
        currentTurn: null, // null currentTurn → loserId will be null
        player1Id: "player-1",
        player2Id: "player-2",
      };

      mockDbChain.then = (resolve: any) =>
        Promise.resolve([expiredGame]).then(resolve);

      // Transaction callback that returns result with loserId = null
      mockDbChain.transaction = vi.fn().mockResolvedValue({
        loserId: null,
        winnerId: "player-1",
        player1Id: "player-1",
        player2Id: "player-2",
      });

      const result = await forfeitExpiredGames();
      expect(result).toEqual({ forfeited: 1 });

      // Verify that loserId: undefined is passed (null || undefined === undefined)
      expect(mockSendNotification).toHaveBeenCalledWith(
        "player-1",
        "game_forfeited_timeout",
        expect.objectContaining({
          gameId: "game-null-loser",
          loserId: undefined,
        }),
      );
    });
  });

  // ==========================================================================
  // forfeitStalledGames
  // ==========================================================================

  describe("forfeitStalledGames — transaction re-check branches", () => {
    const eightDaysAgo = () =>
      new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

    it("skips when fresh game is not found inside transaction (line 168 — !fresh)", async () => {
      const stalledGame = {
        id: "stale-gone",
        status: "active",
        createdAt: eightDaysAgo(),
        currentTurn: "p1",
        player1Id: "p1",
        player2Id: "p2",
        player1Letters: "S",
        player2Letters: "SK",
      };

      mockDbChain.then = (resolve: any) =>
        Promise.resolve([stalledGame]).then(resolve);

      // Transaction re-read: game not found
      mockDbChain.transaction = buildTxReturning([]);

      const result = await forfeitStalledGames();
      expect(result).toEqual({ forfeited: 0 });
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("skips when fresh game status is not active inside transaction (line 168 — status !== active)", async () => {
      const stalledGame = {
        id: "stale-resolved",
        status: "active",
        createdAt: eightDaysAgo(),
        currentTurn: "p1",
        player1Id: "p1",
        player2Id: "p2",
        player1Letters: "S",
        player2Letters: "",
      };

      mockDbChain.then = (resolve: any) =>
        Promise.resolve([stalledGame]).then(resolve);

      mockDbChain.transaction = buildTxReturning([
        { ...stalledGame, status: "forfeited" },
      ]);

      const result = await forfeitStalledGames();
      expect(result).toEqual({ forfeited: 0 });
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("skips when fresh player1Id is null inside transaction (line 169)", async () => {
      const stalledGame = {
        id: "stale-no-p1",
        status: "active",
        createdAt: eightDaysAgo(),
        currentTurn: "p2",
        player1Id: "p1",
        player2Id: "p2",
        player1Letters: "S",
        player2Letters: "",
      };

      mockDbChain.then = (resolve: any) =>
        Promise.resolve([stalledGame]).then(resolve);

      // Transaction re-read: player1Id cleared concurrently
      mockDbChain.transaction = buildTxReturning([
        { ...stalledGame, player1Id: null },
      ]);

      const result = await forfeitStalledGames();
      expect(result).toEqual({ forfeited: 0 });
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("skips when fresh player2Id is null inside transaction (line 169)", async () => {
      const stalledGame = {
        id: "stale-no-p2",
        status: "active",
        createdAt: eightDaysAgo(),
        currentTurn: "p1",
        player1Id: "p1",
        player2Id: "p2",
        player1Letters: "",
        player2Letters: "S",
      };

      mockDbChain.then = (resolve: any) =>
        Promise.resolve([stalledGame]).then(resolve);

      mockDbChain.transaction = buildTxReturning([
        { ...stalledGame, player2Id: null },
      ]);

      const result = await forfeitStalledGames();
      expect(result).toEqual({ forfeited: 0 });
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("handles null player1Letters falling back to empty string (line 171)", async () => {
      const stalledGame = {
        id: "stale-null-letters-p1",
        status: "active",
        createdAt: eightDaysAgo(),
        currentTurn: "p2",
        player1Id: "p1",
        player2Id: "p2",
        player1Letters: null, // null → fallback to ""
        player2Letters: "SK", // 2 letters — p2 loses
      };

      mockDbChain.then = (resolve: any) =>
        Promise.resolve([stalledGame]).then(resolve);

      const mockTxSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      mockDbChain.transaction = vi.fn().mockImplementation(async (cb: any) => {
        const tx: any = {
          execute: vi.fn().mockResolvedValue(undefined),
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([stalledGame]),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: mockTxSet,
          }),
        };
        return cb(tx);
      });

      const result = await forfeitStalledGames();
      expect(result).toEqual({ forfeited: 1 });

      // p1Letters is null → 0 length, p2Letters "SK" → 2 length
      // p2 has more letters so p2 loses, p1 wins
      expect(mockTxSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "forfeited",
          winnerId: "p1",
        }),
      );
    });

    it("handles null player2Letters falling back to empty string (line 172)", async () => {
      const stalledGame = {
        id: "stale-null-letters-p2",
        status: "active",
        createdAt: eightDaysAgo(),
        currentTurn: "p1",
        player1Id: "p1",
        player2Id: "p2",
        player1Letters: "SKA", // 3 letters — p1 loses
        player2Letters: null, // null → fallback to ""
      };

      mockDbChain.then = (resolve: any) =>
        Promise.resolve([stalledGame]).then(resolve);

      const mockTxSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      mockDbChain.transaction = vi.fn().mockImplementation(async (cb: any) => {
        const tx: any = {
          execute: vi.fn().mockResolvedValue(undefined),
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([stalledGame]),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: mockTxSet,
          }),
        };
        return cb(tx);
      });

      const result = await forfeitStalledGames();
      expect(result).toEqual({ forfeited: 1 });

      // p1Letters "SKA" → 3, p2Letters null → 0
      // p1 has more letters so p1 loses, p2 wins
      expect(mockTxSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "forfeited",
          winnerId: "p2",
        }),
      );
    });

    it("uses player1Id as loser when currentTurn is null in tie scenario (line 180)", async () => {
      const stalledGame = {
        id: "stale-tie-null-turn",
        status: "active",
        createdAt: eightDaysAgo(),
        currentTurn: null, // null → fallback to player1Id
        player1Id: "p1",
        player2Id: "p2",
        player1Letters: "SK", // tied
        player2Letters: "SK", // tied
      };

      mockDbChain.then = (resolve: any) =>
        Promise.resolve([stalledGame]).then(resolve);

      const mockTxSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      mockDbChain.transaction = vi.fn().mockImplementation(async (cb: any) => {
        const tx: any = {
          execute: vi.fn().mockResolvedValue(undefined),
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([stalledGame]),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: mockTxSet,
          }),
        };
        return cb(tx);
      });

      const result = await forfeitStalledGames();
      expect(result).toEqual({ forfeited: 1 });

      // Tie + currentTurn null → fallback to player1Id as loser → winner is p2
      expect(mockTxSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "forfeited",
          winnerId: "p2",
        }),
      );
    });

    it("continues without notification when transaction returns null (line 192)", async () => {
      const stalledGame = {
        id: "stale-null-result",
        status: "active",
        createdAt: eightDaysAgo(),
        currentTurn: "p1",
        player1Id: "p1",
        player2Id: "p2",
        player1Letters: "S",
        player2Letters: "",
      };

      mockDbChain.then = (resolve: any) =>
        Promise.resolve([stalledGame]).then(resolve);

      // Transaction returns null (e.g., re-check inside returned null)
      mockDbChain.transaction = vi.fn().mockResolvedValue(null);

      const result = await forfeitStalledGames();
      expect(result).toEqual({ forfeited: 0 });
      expect(mockSendNotification).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("skips null playerId in notification loop (line 195)", async () => {
      const stalledGame = {
        id: "stale-null-player-notif",
        status: "active",
        createdAt: eightDaysAgo(),
        currentTurn: "p1",
        player1Id: "p1",
        player2Id: "p2",
        player1Letters: "S",
        player2Letters: "SKA",
      };

      mockDbChain.then = (resolve: any) =>
        Promise.resolve([stalledGame]).then(resolve);

      // Transaction returns result where one player ID is null
      mockDbChain.transaction = vi.fn().mockResolvedValue({
        loserId: "p2",
        winnerId: "p1",
        player1Id: null, // null playerId — should be skipped
        player2Id: "p2",
      });

      const result = await forfeitStalledGames();
      expect(result).toEqual({ forfeited: 1 });

      // Only 1 notification (player1Id is null, skipped)
      expect(mockSendNotification).toHaveBeenCalledTimes(1);
      expect(mockSendNotification).toHaveBeenCalledWith(
        "p2",
        "game_forfeited_timeout",
        expect.objectContaining({ gameId: "stale-null-player-notif" }),
      );
    });

    it("passes undefined for loserId and winnerId when they are falsy (lines 198-199)", async () => {
      const stalledGame = {
        id: "stale-falsy-ids",
        status: "active",
        createdAt: eightDaysAgo(),
        currentTurn: "p1",
        player1Id: "p1",
        player2Id: "p2",
        player1Letters: "S",
        player2Letters: "",
      };

      mockDbChain.then = (resolve: any) =>
        Promise.resolve([stalledGame]).then(resolve);

      // Transaction returns result with falsy loserId and winnerId
      mockDbChain.transaction = vi.fn().mockResolvedValue({
        loserId: null,
        winnerId: null,
        player1Id: "p1",
        player2Id: "p2",
      });

      const result = await forfeitStalledGames();
      expect(result).toEqual({ forfeited: 1 });

      // Both notifications should have undefined for loserId and winnerId
      expect(mockSendNotification).toHaveBeenCalledTimes(2);
      expect(mockSendNotification).toHaveBeenCalledWith(
        "p1",
        "game_forfeited_timeout",
        expect.objectContaining({
          gameId: "stale-falsy-ids",
          loserId: undefined,
          winnerId: undefined,
        }),
      );
      expect(mockSendNotification).toHaveBeenCalledWith(
        "p2",
        "game_forfeited_timeout",
        expect.objectContaining({
          gameId: "stale-falsy-ids",
          loserId: undefined,
          winnerId: undefined,
        }),
      );
    });
  });

  // ==========================================================================
  // Additional: both null letters in forfeitStalledGames (both branches of ||)
  // ==========================================================================

  describe("forfeitStalledGames — both player letters null", () => {
    it("handles both player1Letters and player2Letters being null (lines 171-172 combined)", async () => {
      const stalledGame = {
        id: "stale-both-null-letters",
        status: "active",
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        currentTurn: "p1",
        player1Id: "p1",
        player2Id: "p2",
        player1Letters: null,
        player2Letters: null,
      };

      mockDbChain.then = (resolve: any) =>
        Promise.resolve([stalledGame]).then(resolve);

      const mockTxSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      mockDbChain.transaction = vi.fn().mockImplementation(async (cb: any) => {
        const tx: any = {
          execute: vi.fn().mockResolvedValue(undefined),
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([stalledGame]),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: mockTxSet,
          }),
        };
        return cb(tx);
      });

      const result = await forfeitStalledGames();
      expect(result).toEqual({ forfeited: 1 });

      // Both null → both fallback to "" → 0 === 0 (tie)
      // currentTurn is "p1" so p1 loses → winner is p2
      expect(mockTxSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "forfeited",
          winnerId: "p2",
        }),
      );
    });
  });
});
