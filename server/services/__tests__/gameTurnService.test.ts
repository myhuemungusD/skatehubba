/**
 * Unit tests for Game Turn Service - covering uncovered lines:
 * - Line 100: "Only the offensive player can set a trick" (wrong player in set_trick phase)
 * - Line 104: "Only the defensive player can respond" (wrong player in respond_trick phase)
 * - Line 252: "Turn has already been judged" (race condition: already judged turn)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@shared/schema", () => ({
  games: { id: { name: "id" } },
  gameTurns: {
    id: { name: "id" },
    gameId: { name: "gameId" },
    playerId: { name: "playerId" },
    turnType: { name: "turnType" },
    turnNumber: { name: "turnNumber" },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ _op: "eq", col, val }),
  and: (...args: any[]) => ({ _op: "and", args }),
  sql: (strings: TemplateStringsArray, ...vals: any[]) => ({
    _sql: true,
    strings,
    vals,
  }),
}));

vi.mock("../../routes/games-shared", () => ({
  TURN_DEADLINE_MS: 24 * 60 * 60 * 1000,
  SKATE_LETTERS: "SKATE",
  isGameOver: (p1: string, p2: string) => {
    if (p1.length >= 5) return { over: true, loserId: "player1" };
    if (p2.length >= 5) return { over: true, loserId: "player2" };
    return { over: false, loserId: null };
  },
}));

import { submitTurn, judgeTurn } from "../gameTurnService";

describe("gameTurnService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // submitTurn — Line 100: wrong player sets trick
  // ==========================================================================

  describe("submitTurn - wrong player checks", () => {
    /**
     * Line 99-100: When turnPhase is "set_trick" and the submitting player
     * is NOT the offensivePlayerId, return error.
     */
    it("rejects when non-offensive player tries to set a trick (line 100)", async () => {
      const game = {
        id: "game-1",
        player1Id: "p1",
        player2Id: "p2",
        status: "active",
        currentTurn: "p2", // It's p2's turn
        turnPhase: "set_trick",
        offensivePlayerId: "p1", // But p1 is the offensive player
        defensivePlayerId: "p2",
        deadlineAt: new Date(Date.now() + 86400000),
      };

      const limitFn = vi.fn().mockResolvedValue([game]);
      const tx = {
        execute: vi.fn().mockResolvedValue(undefined),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ limit: limitFn }),
          }),
        }),
        update: vi.fn(),
        insert: vi.fn(),
      };

      // p2 is the currentTurn but tries to set_trick when offensivePlayerId is p1
      const result = await submitTurn(tx as any, {
        gameId: "game-1",
        playerId: "p2",
        trickDescription: "Kickflip",
        videoUrl: "https://example.com/video.mp4",
        videoDurationMs: 5000,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(result.error).toBe("Only the offensive player can set a trick");
      }
    });

    /**
     * Line 103-104: When turnPhase is "respond_trick" and the submitting player
     * is NOT the defensivePlayerId, return error.
     */
    it("rejects when non-defensive player tries to respond (line 104)", async () => {
      const game = {
        id: "game-1",
        player1Id: "p1",
        player2Id: "p2",
        status: "active",
        currentTurn: "p1", // It's p1's turn
        turnPhase: "respond_trick",
        offensivePlayerId: "p1",
        defensivePlayerId: "p2", // But p2 is the defensive player
        deadlineAt: new Date(Date.now() + 86400000),
      };

      const limitFn = vi.fn().mockResolvedValue([game]);
      const tx = {
        execute: vi.fn().mockResolvedValue(undefined),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ limit: limitFn }),
          }),
        }),
        update: vi.fn(),
        insert: vi.fn(),
      };

      // p1 is currentTurn but tries to respond_trick when defensivePlayerId is p2
      const result = await submitTurn(tx as any, {
        gameId: "game-1",
        playerId: "p1",
        trickDescription: "Kickflip response",
        videoUrl: "https://example.com/response.mp4",
        videoDurationMs: 5000,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(result.error).toBe("Only the defensive player can respond");
      }
    });

    it("rejects submission for unknown turn phase", async () => {
      const game = {
        id: "game-1",
        player1Id: "p1",
        player2Id: "p2",
        status: "active",
        currentTurn: "p1",
        turnPhase: "judge", // Judge phase doesn't accept video submissions
        offensivePlayerId: "p1",
        defensivePlayerId: "p2",
        deadlineAt: new Date(Date.now() + 86400000),
      };

      const limitFn = vi.fn().mockResolvedValue([game]);
      const tx = {
        execute: vi.fn().mockResolvedValue(undefined),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ limit: limitFn }),
          }),
        }),
        update: vi.fn(),
        insert: vi.fn(),
      };

      const result = await submitTurn(tx as any, {
        gameId: "game-1",
        playerId: "p1",
        trickDescription: "Kickflip",
        videoUrl: "https://example.com/video.mp4",
        videoDurationMs: 5000,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(result.error).toBe("Current phase does not accept video submissions");
      }
    });
  });

  // ==========================================================================
  // judgeTurn — Line 252: already-judged race condition
  // ==========================================================================

  describe("judgeTurn - already-judged race condition", () => {
    /**
     * Lines 211-213: Re-check inside transaction finds turn already judged
     * (result !== "pending"), preventing double-judge.
     */
    it("rejects judging when turn has already been judged (line 252)", async () => {
      const game = {
        id: "game-1",
        player1Id: "p1",
        player2Id: "p2",
        status: "active",
        turnPhase: "judge",
        currentTurn: "p2",
        offensivePlayerId: "p1",
        defensivePlayerId: "p2",
        player1Letters: "",
        player2Letters: "",
      };

      // The turn passed as parameter (from outside the transaction)
      const turnParam = {
        id: 5,
        gameId: "game-1",
        playerId: "p1",
        turnNumber: 1,
        turnType: "set" as const,
        trickDescription: "Kickflip",
        result: "pending",
      };

      // Inside the transaction, re-read turn shows it's already been judged
      const alreadyJudgedTurn = {
        ...turnParam,
        result: "landed", // Already judged!
        judgedBy: "p2",
      };

      let selectCallCount = 0;
      const limitFn = vi.fn().mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) return Promise.resolve([game]);
        // Second select is the re-check of the turn inside transaction
        if (selectCallCount === 2) return Promise.resolve([alreadyJudgedTurn]);
        return Promise.resolve([]);
      });

      const tx = {
        execute: vi.fn().mockResolvedValue(undefined),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: limitFn,
            }),
          }),
        }),
        update: vi.fn(),
        insert: vi.fn(),
      };

      const result = await judgeTurn(tx as any, 5, "p2", "landed", turnParam as any);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(result.error).toBe("Turn has already been judged");
      }
    });

    /**
     * When the re-read of the turn returns null (deleted race condition)
     */
    it("rejects judging when turn is not found in re-check", async () => {
      const game = {
        id: "game-1",
        player1Id: "p1",
        player2Id: "p2",
        status: "active",
        turnPhase: "judge",
        currentTurn: "p2",
        offensivePlayerId: "p1",
        defensivePlayerId: "p2",
      };

      const turnParam = {
        id: 5,
        gameId: "game-1",
        playerId: "p1",
        turnNumber: 1,
        result: "pending",
      };

      let selectCallCount = 0;
      const limitFn = vi.fn().mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) return Promise.resolve([game]);
        // Turn not found on re-read
        if (selectCallCount === 2) return Promise.resolve([]);
        return Promise.resolve([]);
      });

      const tx = {
        execute: vi.fn().mockResolvedValue(undefined),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: limitFn,
            }),
          }),
        }),
        update: vi.fn(),
        insert: vi.fn(),
      };

      const result = await judgeTurn(tx as any, 5, "p2", "landed", turnParam as any);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(result.error).toBe("Turn has already been judged");
      }
    });

    it("rejects when non-defensive player tries to judge", async () => {
      const game = {
        id: "game-1",
        player1Id: "p1",
        player2Id: "p2",
        status: "active",
        turnPhase: "judge",
        currentTurn: "p1",
        offensivePlayerId: "p1",
        defensivePlayerId: "p2",
      };

      const turnParam = {
        id: 5,
        gameId: "game-1",
        playerId: "p1",
        result: "pending",
      };

      const limitFn = vi.fn().mockResolvedValue([game]);
      const tx = {
        execute: vi.fn().mockResolvedValue(undefined),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ limit: limitFn }),
          }),
        }),
        update: vi.fn(),
        insert: vi.fn(),
      };

      // p1 tries to judge but defensivePlayerId is p2
      const result = await judgeTurn(tx as any, 5, "p1", "landed", turnParam as any);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(403);
        expect(result.error).toBe("Only the defending player can judge");
      }
    });
  });
});
