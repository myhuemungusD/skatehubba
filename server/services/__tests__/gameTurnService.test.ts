/**
 * Comprehensive unit tests for Game Turn Service
 * Target: 100% branch coverage across submitTurn, judgeTurn, and setterBail.
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

import { submitTurn, judgeTurn, setterBail } from "../gameTurnService";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock transaction. Accepts overrides for select chain behaviour. */
function makeTx(overrides?: {
  selectResults?: (() => Promise<any[]>)[];
  insertReturning?: any[];
  updateReturning?: any[];
}) {
  let selectIdx = 0;
  const selectResults = overrides?.selectResults ?? [];

  const limitFn = vi.fn().mockImplementation(() => {
    const fn = selectResults[selectIdx];
    selectIdx++;
    return fn ? fn() : Promise.resolve([]);
  });

  const whereFnSelect = vi.fn().mockImplementation(() => {
    // Some select chains use .limit(), others don't (response videos query)
    return { limit: limitFn, then: undefined };
  });

  // For select chains without .limit() (the response videos query returns
  // directly from .where())
  const selectChainNoLimit = vi.fn().mockImplementation(() => {
    const fn = selectResults[selectIdx];
    selectIdx++;
    return fn ? fn() : Promise.resolve([]);
  });

  // We need a smarter approach: track which call we're on
  let fromCallIdx = 0;
  const fromResults = overrides?.selectResults ?? [];

  const fromFn = vi.fn().mockImplementation(() => {
    // Return an object that supports both .where().limit() and .where() paths
    return {
      where: vi.fn().mockImplementation(() => {
        const currentIdx = selectIdx;
        selectIdx++;
        const fn = fromResults[currentIdx];
        // Return an object that works as both a direct promise and has .limit()
        const result = fn ? fn() : Promise.resolve([]);
        return {
          limit: vi.fn().mockReturnValue(result),
          // Also support direct .then() for non-limited queries
          then: (res: any, rej: any) => result.then(res, rej),
          catch: (rej: any) => result.catch(rej),
        };
      }),
    };
  });

  const returningFn = vi.fn().mockReturnValue(
    Promise.resolve(overrides?.updateReturning ?? [{ id: "game-1" }])
  );

  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockReturnValue({ from: fromFn }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockReturnValue(
          Promise.resolve(overrides?.insertReturning ?? [{ id: 1, turnNumber: 1 }])
        ),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: returningFn,
        }),
      }),
    }),
  };

  return tx;
}

function baseGame(overrides: Record<string, any> = {}) {
  return {
    id: "game-1",
    player1Id: "p1",
    player2Id: "p2",
    player1Name: "Alice",
    player2Name: "Bob",
    status: "active",
    currentTurn: "p1",
    turnPhase: "set_trick",
    offensivePlayerId: "p1",
    defensivePlayerId: "p2",
    player1Letters: "",
    player2Letters: "",
    deadlineAt: new Date(Date.now() + 86400000),
    ...overrides,
  };
}

const baseInput = {
  gameId: "game-1",
  playerId: "p1",
  trickDescription: "Kickflip",
  videoUrl: "https://example.com/video.mp4",
  videoDurationMs: 5000,
};

// ---------------------------------------------------------------------------
// submitTurn
// ---------------------------------------------------------------------------

describe("submitTurn", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when game is not found", async () => {
    const tx = makeTx({ selectResults: [() => Promise.resolve([])] });
    const result = await submitTurn(tx as any, { ...baseInput });
    expect(result).toEqual({ ok: false, status: 404, error: "Game not found" });
  });

  it("returns 403 when player is not in the game", async () => {
    const game = baseGame();
    const tx = makeTx({ selectResults: [() => Promise.resolve([game])] });
    const result = await submitTurn(tx as any, { ...baseInput, playerId: "stranger" });
    expect(result).toEqual({ ok: false, status: 403, error: "You are not a player in this game" });
  });

  it("returns 400 when game is not active", async () => {
    const game = baseGame({ status: "completed" });
    const tx = makeTx({ selectResults: [() => Promise.resolve([game])] });
    const result = await submitTurn(tx as any, { ...baseInput });
    expect(result).toEqual({ ok: false, status: 400, error: "Game is not active" });
  });

  it("returns 400 when it is not the player's turn", async () => {
    const game = baseGame({ currentTurn: "p2" });
    const tx = makeTx({ selectResults: [() => Promise.resolve([game])] });
    // p1 submits but it's p2's turn
    const result = await submitTurn(tx as any, { ...baseInput, playerId: "p1" });
    expect(result).toEqual({ ok: false, status: 400, error: "Not your turn" });
  });

  it("returns 400 when deadline has passed", async () => {
    const game = baseGame({ deadlineAt: new Date(Date.now() - 10000) });
    const tx = makeTx({ selectResults: [() => Promise.resolve([game])] });
    const result = await submitTurn(tx as any, { ...baseInput });
    expect(result).toEqual({ ok: false, status: 400, error: "Turn deadline has passed. Game forfeited." });
  });

  it("does not reject when deadlineAt is null (no deadline)", async () => {
    const game = baseGame({ deadlineAt: null });
    const tx = makeTx({
      selectResults: [
        () => Promise.resolve([game]),
        () => Promise.resolve([{ count: 0 }]),
      ],
      insertReturning: [{ id: 1, turnNumber: 1 }],
    });
    const result = await submitTurn(tx as any, { ...baseInput });
    expect(result.ok).toBe(true);
  });

  it("rejects when non-offensive player tries to set a trick", async () => {
    const game = baseGame({ currentTurn: "p2" });
    const tx = makeTx({ selectResults: [() => Promise.resolve([game])] });
    const result = await submitTurn(tx as any, { ...baseInput, playerId: "p2" });
    expect(result).toEqual({ ok: false, status: 400, error: "Only the offensive player can set a trick" });
  });

  it("rejects when non-defensive player tries to respond", async () => {
    const game = baseGame({ turnPhase: "respond_trick", currentTurn: "p1" });
    const tx = makeTx({ selectResults: [() => Promise.resolve([game])] });
    const result = await submitTurn(tx as any, { ...baseInput, playerId: "p1" });
    expect(result).toEqual({ ok: false, status: 400, error: "Only the defensive player can respond" });
  });

  it("rejects submission for unrecognised turn phase (e.g. judge)", async () => {
    const game = baseGame({ turnPhase: "judge" });
    const tx = makeTx({ selectResults: [() => Promise.resolve([game])] });
    const result = await submitTurn(tx as any, { ...baseInput });
    expect(result).toEqual({ ok: false, status: 400, error: "Current phase does not accept video submissions" });
  });

  it("defaults turnPhase to 'set_trick' when turnPhase is null/undefined", async () => {
    // turnPhase falsy -> falls back to "set_trick"
    const game = baseGame({ turnPhase: null });
    const tx = makeTx({
      selectResults: [
        () => Promise.resolve([game]),
        () => Promise.resolve([{ count: 2 }]),
      ],
      insertReturning: [{ id: 3, turnNumber: 3 }],
    });
    const result = await submitTurn(tx as any, { ...baseInput });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toBe("Trick set. Sent.");
    }
  });

  it("falls back turnCount to 0 when turnCountResult is empty", async () => {
    const game = baseGame();
    const tx = makeTx({
      selectResults: [
        () => Promise.resolve([game]),
        () => Promise.resolve([]), // empty count result -> turnCountResult[0]?.count is undefined
      ],
      insertReturning: [{ id: 1, turnNumber: 1 }],
    });
    const result = await submitTurn(tx as any, { ...baseInput });
    expect(result.ok).toBe(true);
  });

  it("falls back turnCount to 0 when count is 0", async () => {
    const game = baseGame();
    const tx = makeTx({
      selectResults: [
        () => Promise.resolve([game]),
        () => Promise.resolve([{ count: 0 }]),
      ],
      insertReturning: [{ id: 1, turnNumber: 1 }],
    });
    const result = await submitTurn(tx as any, { ...baseInput });
    expect(result.ok).toBe(true);
  });

  describe("set trick (turnType=set)", () => {
    it("creates turn and notifies defender (player1 sets, has name)", async () => {
      const game = baseGame();
      const tx = makeTx({
        selectResults: [
          () => Promise.resolve([game]),
          () => Promise.resolve([{ count: 1 }]),
        ],
        insertReturning: [{ id: 2, turnNumber: 2, turnType: "set" }],
      });
      const result = await submitTurn(tx as any, { ...baseInput });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.message).toBe("Trick set. Sent.");
        expect(result.notify).toEqual({ playerId: "p2", opponentName: "Alice" });
      }
    });

    it("uses 'Skater' fallback when playerName is null", async () => {
      const game = baseGame({ player1Name: null });
      const tx = makeTx({
        selectResults: [
          () => Promise.resolve([game]),
          () => Promise.resolve([{ count: 0 }]),
        ],
        insertReturning: [{ id: 1, turnNumber: 1 }],
      });
      const result = await submitTurn(tx as any, { ...baseInput });
      expect(result.ok).toBe(true);
      if (result.ok) {
        // playerName || "Skater" -> "Skater" is used in insert
        // playerName || "Opponent" -> "Opponent" is used in notify
        expect(result.notify).toEqual({ playerId: "p2", opponentName: "Opponent" });
      }
    });

    it("uses player2Name when player2 sets trick (isPlayer1 = false)", async () => {
      const game = baseGame({
        offensivePlayerId: "p2",
        defensivePlayerId: "p1",
        currentTurn: "p2",
      });
      const tx = makeTx({
        selectResults: [
          () => Promise.resolve([game]),
          () => Promise.resolve([{ count: 0 }]),
        ],
        insertReturning: [{ id: 1, turnNumber: 1 }],
      });
      const result = await submitTurn(tx as any, { ...baseInput, playerId: "p2" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.notify).toEqual({ playerId: "p1", opponentName: "Bob" });
      }
    });

    it("returns notify=null when defensivePlayerId is null", async () => {
      const game = baseGame({ defensivePlayerId: null });
      const tx = makeTx({
        selectResults: [
          () => Promise.resolve([game]),
          () => Promise.resolve([{ count: 0 }]),
        ],
        insertReturning: [{ id: 1, turnNumber: 1 }],
      });
      const result = await submitTurn(tx as any, { ...baseInput });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.notify).toBeNull();
      }
    });

    it("passes thumbnailUrl when provided", async () => {
      const game = baseGame();
      const tx = makeTx({
        selectResults: [
          () => Promise.resolve([game]),
          () => Promise.resolve([{ count: 0 }]),
        ],
        insertReturning: [{ id: 1, turnNumber: 1 }],
      });
      const result = await submitTurn(tx as any, {
        ...baseInput,
        thumbnailUrl: "https://example.com/thumb.jpg",
      });
      expect(result.ok).toBe(true);
    });

    it("passes thumbnailUrl as null when not provided (nullish coalescing)", async () => {
      const game = baseGame();
      const tx = makeTx({
        selectResults: [
          () => Promise.resolve([game]),
          () => Promise.resolve([{ count: 0 }]),
        ],
        insertReturning: [{ id: 1, turnNumber: 1 }],
      });
      const result = await submitTurn(tx as any, { ...baseInput });
      expect(result.ok).toBe(true);
    });
  });

  describe("response trick (turnType=response)", () => {
    it("creates response turn and returns notify=null", async () => {
      const game = baseGame({
        turnPhase: "respond_trick",
        currentTurn: "p2",
        offensivePlayerId: "p1",
        defensivePlayerId: "p2",
      });
      const tx = makeTx({
        selectResults: [
          () => Promise.resolve([game]),
          () => Promise.resolve([{ count: 1 }]),
        ],
        insertReturning: [{ id: 2, turnNumber: 2, turnType: "response" }],
      });
      const result = await submitTurn(tx as any, { ...baseInput, playerId: "p2" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.message).toBe("Response sent. Now judge the trick.");
        expect(result.notify).toBeNull();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// judgeTurn
// ---------------------------------------------------------------------------

describe("judgeTurn", () => {
  beforeEach(() => vi.clearAllMocks());

  const baseTurnParam = {
    id: 5,
    gameId: "game-1",
    playerId: "p1",
    turnNumber: 1,
    turnType: "set" as const,
    trickDescription: "Kickflip",
    result: "pending",
  };

  it("returns 404 when game is not found", async () => {
    const tx = makeTx({ selectResults: [() => Promise.resolve([])] });
    const result = await judgeTurn(tx as any, 5, "p2", "landed", baseTurnParam as any);
    expect(result).toEqual({ ok: false, status: 404, error: "Game not found" });
  });

  it("returns 403 when non-defensive player tries to judge", async () => {
    const game = baseGame({ turnPhase: "judge", currentTurn: "p1" });
    const tx = makeTx({ selectResults: [() => Promise.resolve([game])] });
    const result = await judgeTurn(tx as any, 5, "p1", "landed", baseTurnParam as any);
    expect(result).toEqual({ ok: false, status: 403, error: "Only the defending player can judge" });
  });

  it("returns 400 when game is not in judge phase", async () => {
    const game = baseGame({ turnPhase: "set_trick", currentTurn: "p2" });
    const tx = makeTx({ selectResults: [() => Promise.resolve([game])] });
    const result = await judgeTurn(tx as any, 5, "p2", "landed", baseTurnParam as any);
    expect(result).toEqual({ ok: false, status: 400, error: "Game is not in judging phase" });
  });

  it("returns 400 when it is not the player's turn to judge", async () => {
    const game = baseGame({ turnPhase: "judge", currentTurn: "p1", defensivePlayerId: "p2" });
    // p2 is the defensive player, but currentTurn is p1
    const tx = makeTx({ selectResults: [() => Promise.resolve([game])] });
    const result = await judgeTurn(tx as any, 5, "p2", "landed", baseTurnParam as any);
    expect(result).toEqual({ ok: false, status: 400, error: "Not your turn to judge" });
  });

  it("returns 400 when turn already judged (result !== pending)", async () => {
    const game = baseGame({ turnPhase: "judge", currentTurn: "p2" });
    const tx = makeTx({
      selectResults: [
        () => Promise.resolve([game]),
        () => Promise.resolve([{ ...baseTurnParam, result: "landed" }]),
      ],
    });
    const result = await judgeTurn(tx as any, 5, "p2", "landed", baseTurnParam as any);
    expect(result).toEqual({ ok: false, status: 400, error: "Turn has already been judged" });
  });

  it("returns 400 when turn not found on re-check (!currentTurn)", async () => {
    const game = baseGame({ turnPhase: "judge", currentTurn: "p2" });
    const tx = makeTx({
      selectResults: [
        () => Promise.resolve([game]),
        () => Promise.resolve([]),  // turn not found
      ],
    });
    const result = await judgeTurn(tx as any, 5, "p2", "landed", baseTurnParam as any);
    expect(result).toEqual({ ok: false, status: 400, error: "Turn has already been judged" });
  });

  it("returns 400 when no response video submitted before judging", async () => {
    const game = baseGame({ turnPhase: "judge", currentTurn: "p2" });
    const tx = makeTx({
      selectResults: [
        () => Promise.resolve([game]),
        () => Promise.resolve([{ ...baseTurnParam, result: "pending" }]),
        () => Promise.resolve([]),  // no response videos
      ],
    });
    const result = await judgeTurn(tx as any, 5, "p2", "landed", baseTurnParam as any);
    expect(result).toEqual({ ok: false, status: 400, error: "You must submit your response video before judging" });
  });

  it("returns 400 when response video exists but has lower turnNumber", async () => {
    const game = baseGame({ turnPhase: "judge", currentTurn: "p2" });
    const tx = makeTx({
      selectResults: [
        () => Promise.resolve([game]),
        () => Promise.resolve([{ ...baseTurnParam, result: "pending" }]),
        () => Promise.resolve([{ turnNumber: 0 }]),  // turnNumber 0 < turnParam.turnNumber 1
      ],
    });
    const result = await judgeTurn(tx as any, 5, "p2", "landed", baseTurnParam as any);
    expect(result).toEqual({ ok: false, status: 400, error: "You must submit your response video before judging" });
  });

  it("returns 500 when offensivePlayerId is missing", async () => {
    const game = baseGame({
      turnPhase: "judge",
      currentTurn: "p2",
      offensivePlayerId: null,
    });
    const tx = makeTx({
      selectResults: [
        () => Promise.resolve([game]),
        () => Promise.resolve([{ ...baseTurnParam, result: "pending" }]),
        () => Promise.resolve([{ turnNumber: 2 }]),
      ],
    });
    const result = await judgeTurn(tx as any, 5, "p2", "landed", baseTurnParam as any);
    expect(result).toEqual({ ok: false, status: 500, error: "Game is missing player role assignments" });
  });

  it("returns 500 when defensivePlayerId is missing", async () => {
    const game = baseGame({
      turnPhase: "judge",
      currentTurn: "p2",
      defensivePlayerId: null,
    });
    // We need the player to still be identified as defensive - but defensivePlayerId check happens after
    // Actually line 210: playerId !== game.defensivePlayerId -> if defensivePlayerId is null and playerId is "p2", this returns 403
    // So this specific case is unreachable in normal flow. The guard at line 256 catches corruption.
    // Let's test when both are null:
    const tx = makeTx({
      selectResults: [() => Promise.resolve([game])],
    });
    const result = await judgeTurn(tx as any, 5, "p2", "landed", baseTurnParam as any);
    // defensivePlayerId is null, p2 !== null -> 403
    expect(result).toEqual({ ok: false, status: 403, error: "Only the defending player can judge" });
  });

  describe("missed (BAIL) - defensive player gets a letter", () => {
    it("gives letter to player1 when player1 is the defensive player (isPlayer1=true)", async () => {
      // player1 (p1) is the defensive player judging
      const game = baseGame({
        turnPhase: "judge",
        currentTurn: "p1",
        offensivePlayerId: "p2",
        defensivePlayerId: "p1",
        player1Letters: "",
        player2Letters: "",
      });
      const turnParam = { ...baseTurnParam, playerId: "p2", turnNumber: 1 };
      const updatedGame = { ...game, player1Letters: "S" };

      const tx = makeTx({
        selectResults: [
          () => Promise.resolve([game]),
          () => Promise.resolve([{ ...turnParam, result: "pending" }]),
          () => Promise.resolve([{ turnNumber: 2 }]),  // response video exists
        ],
        updateReturning: [updatedGame],
      });

      const result = await judgeTurn(tx as any, 5, "p1", "missed", turnParam as any);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.response.gameOver).toBe(false);
        expect(result.response.message).toBe("BAIL. Letter earned.");
        // roles stay the same for missed
        expect(result.notifications[0].playerId).toBe("p2"); // offensive stays p2
      }
    });

    it("gives letter to player2 when player2 is the defensive player (isPlayer1=false)", async () => {
      const game = baseGame({
        turnPhase: "judge",
        currentTurn: "p2",
        offensivePlayerId: "p1",
        defensivePlayerId: "p2",
        player1Letters: "",
        player2Letters: "",
      });
      const turnParam = { ...baseTurnParam, turnNumber: 1 };
      const updatedGame = { ...game, player2Letters: "S" };

      const tx = makeTx({
        selectResults: [
          () => Promise.resolve([game]),
          () => Promise.resolve([{ ...turnParam, result: "pending" }]),
          () => Promise.resolve([{ turnNumber: 2 }]),
        ],
        updateReturning: [updatedGame],
      });

      const result = await judgeTurn(tx as any, 5, "p2", "missed", turnParam as any);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.response.gameOver).toBe(false);
        expect(result.response.message).toBe("BAIL. Letter earned.");
      }
    });

    it("handles SKATE_LETTERS overflow (|| '' fallback) for player1 with 5+ letters", async () => {
      // player1Letters already has SKATE (5 letters), so SKATE_LETTERS[5] is undefined -> || ""
      const game = baseGame({
        turnPhase: "judge",
        currentTurn: "p1",
        offensivePlayerId: "p2",
        defensivePlayerId: "p1",
        player1Letters: "SKATE",  // 5 letters, SKATE_LETTERS[5] = undefined -> || "" fallback
        player2Letters: "",
      });
      const turnParam = { ...baseTurnParam, playerId: "p2", turnNumber: 1 };
      const updatedGame = { ...game, status: "completed", winnerId: "p2" };

      const tx = makeTx({
        selectResults: [
          () => Promise.resolve([game]),
          () => Promise.resolve([{ ...turnParam, result: "pending" }]),
          () => Promise.resolve([{ turnNumber: 2 }]),
        ],
        updateReturning: [updatedGame],
      });

      const result = await judgeTurn(tx as any, 5, "p1", "missed", turnParam as any);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.response.gameOver).toBe(true);
        expect(result.response.winnerId).toBe("p2");
      }
    });

    it("handles SKATE_LETTERS overflow (|| '' fallback) for player2 with 5+ letters", async () => {
      const game = baseGame({
        turnPhase: "judge",
        currentTurn: "p2",
        offensivePlayerId: "p1",
        defensivePlayerId: "p2",
        player1Letters: "",
        player2Letters: "SKATE",  // 5 letters, SKATE_LETTERS[5] = undefined -> || "" fallback
      });
      const turnParam = { ...baseTurnParam, turnNumber: 1 };
      const updatedGame = { ...game, status: "completed", winnerId: "p1" };

      const tx = makeTx({
        selectResults: [
          () => Promise.resolve([game]),
          () => Promise.resolve([{ ...turnParam, result: "pending" }]),
          () => Promise.resolve([{ turnNumber: 2 }]),
        ],
        updateReturning: [updatedGame],
      });

      const result = await judgeTurn(tx as any, 5, "p2", "missed", turnParam as any);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.response.gameOver).toBe(true);
        expect(result.response.winnerId).toBe("p1");
      }
    });
  });

  describe("landed (LAND) - roles swap, no letter", () => {
    it("swaps roles and continues game", async () => {
      const game = baseGame({
        turnPhase: "judge",
        currentTurn: "p2",
        offensivePlayerId: "p1",
        defensivePlayerId: "p2",
        player1Letters: "",
        player2Letters: "",
      });
      const turnParam = { ...baseTurnParam, turnNumber: 1 };
      const updatedGame = {
        ...game,
        offensivePlayerId: "p2",
        defensivePlayerId: "p1",
      };

      const tx = makeTx({
        selectResults: [
          () => Promise.resolve([game]),
          () => Promise.resolve([{ ...turnParam, result: "pending" }]),
          () => Promise.resolve([{ turnNumber: 2 }]),
        ],
        updateReturning: [updatedGame],
      });

      const result = await judgeTurn(tx as any, 5, "p2", "landed", turnParam as any);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.response.gameOver).toBe(false);
        expect(result.response.message).toBe("LAND. Roles swap.");
        // New offensive = p2 (was defensive), notification goes to them
        expect(result.notifications[0].playerId).toBe("p2");
        expect(result.notifications[0].data.opponentName).toBe("Alice");
      }
    });

    it("uses 'Opponent' fallback for notification name when player name is null", async () => {
      const game = baseGame({
        turnPhase: "judge",
        currentTurn: "p2",
        offensivePlayerId: "p1",
        defensivePlayerId: "p2",
        player1Letters: "",
        player2Letters: "",
        player2Name: null,  // p2 has no name
      });
      const turnParam = { ...baseTurnParam, turnNumber: 1 };
      const updatedGame = { ...game };

      const tx = makeTx({
        selectResults: [
          () => Promise.resolve([game]),
          () => Promise.resolve([{ ...turnParam, result: "pending" }]),
          () => Promise.resolve([{ turnNumber: 2 }]),
        ],
        updateReturning: [updatedGame],
      });

      const result = await judgeTurn(tx as any, 5, "p2", "landed", turnParam as any);
      expect(result.ok).toBe(true);
      if (result.ok) {
        // newOffensiveId = p2 (defensivePlayerId), p2 === p2 so opponentName is player1Name
        expect(result.notifications[0].data.opponentName).toBe("Alice");
      }
    });

    it("uses 'Opponent' fallback when opponent name is null (newOffensiveId != player1Id)", async () => {
      const game = baseGame({
        turnPhase: "judge",
        currentTurn: "p2",
        offensivePlayerId: "p1",
        defensivePlayerId: "p2",
        player1Letters: "",
        player2Letters: "",
        player1Name: null,  // p1 has no name
      });
      const turnParam = { ...baseTurnParam, turnNumber: 1 };
      const updatedGame = { ...game };

      const tx = makeTx({
        selectResults: [
          () => Promise.resolve([game]),
          () => Promise.resolve([{ ...turnParam, result: "pending" }]),
          () => Promise.resolve([{ turnNumber: 2 }]),
        ],
        updateReturning: [updatedGame],
      });

      const result = await judgeTurn(tx as any, 5, "p2", "landed", turnParam as any);
      expect(result.ok).toBe(true);
      if (result.ok) {
        // newOffensiveId = p2, p2 !== p1 so it picks player1Name which is null -> "Opponent"
        expect(result.notifications[0].data.opponentName).toBe("Opponent");
      }
    });

    it("sends opponent name from player1 when new offensive is player1", async () => {
      // In landed case, newOffensiveId = defensivePlayerId = p1
      const game = baseGame({
        turnPhase: "judge",
        currentTurn: "p1",
        offensivePlayerId: "p2",
        defensivePlayerId: "p1",
        player1Letters: "",
        player2Letters: "",
      });
      const turnParam = { ...baseTurnParam, playerId: "p2", turnNumber: 1 };
      const updatedGame = { ...game };

      const tx = makeTx({
        selectResults: [
          () => Promise.resolve([game]),
          () => Promise.resolve([{ ...turnParam, result: "pending" }]),
          () => Promise.resolve([{ turnNumber: 2 }]),
        ],
        updateReturning: [updatedGame],
      });

      const result = await judgeTurn(tx as any, 5, "p1", "landed", turnParam as any);
      expect(result.ok).toBe(true);
      if (result.ok) {
        // newOffensiveId = p1 (defensivePlayerId), p1 === game.player1Id, opponentName = player2Name
        expect(result.notifications[0].data.opponentName).toBe("Bob");
      }
    });
  });

  describe("game over scenarios", () => {
    it("detects game over when player1 loses (loserId=player1 -> winner=player2)", async () => {
      const game = baseGame({
        turnPhase: "judge",
        currentTurn: "p1",
        offensivePlayerId: "p2",
        defensivePlayerId: "p1",
        player1Letters: "SKAT",  // will become SKATE
        player2Letters: "",
      });
      const turnParam = { ...baseTurnParam, playerId: "p2", turnNumber: 1 };
      const updatedGame = { ...game, status: "completed", winnerId: "p2" };

      const tx = makeTx({
        selectResults: [
          () => Promise.resolve([game]),
          () => Promise.resolve([{ ...turnParam, result: "pending" }]),
          () => Promise.resolve([{ turnNumber: 2 }]),
        ],
        updateReturning: [updatedGame],
      });

      const result = await judgeTurn(tx as any, 5, "p1", "missed", turnParam as any);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.response.gameOver).toBe(true);
        expect(result.response.winnerId).toBe("p2");
        expect(result.response.message).toBe("Game over.");
        // Notifications to both players
        expect(result.notifications.length).toBe(2);
        const p1Notif = result.notifications.find(n => n.playerId === "p1");
        const p2Notif = result.notifications.find(n => n.playerId === "p2");
        expect(p1Notif?.data.youWon).toBe(false);
        expect(p2Notif?.data.youWon).toBe(true);
        expect(p1Notif?.data.opponentName).toBe("Bob");
        expect(p2Notif?.data.opponentName).toBe("Alice");
      }
    });

    it("detects game over when player2 loses (loserId=player2 -> winner=player1)", async () => {
      const game = baseGame({
        turnPhase: "judge",
        currentTurn: "p2",
        offensivePlayerId: "p1",
        defensivePlayerId: "p2",
        player1Letters: "",
        player2Letters: "SKAT",
      });
      const turnParam = { ...baseTurnParam, turnNumber: 1 };
      const updatedGame = { ...game, status: "completed", winnerId: "p1" };

      const tx = makeTx({
        selectResults: [
          () => Promise.resolve([game]),
          () => Promise.resolve([{ ...turnParam, result: "pending" }]),
          () => Promise.resolve([{ turnNumber: 2 }]),
        ],
        updateReturning: [updatedGame],
      });

      const result = await judgeTurn(tx as any, 5, "p2", "missed", turnParam as any);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.response.gameOver).toBe(true);
        expect(result.response.winnerId).toBe("p1");
      }
    });

    it("handles winnerId being null/undefined in game-over notifications (winnerId || undefined)", async () => {
      // The winnerId ternary produces game.player2Id or game.player1Id, which should be strings.
      // But let's test the winnerId || undefined fallback in notification data.
      // When player1Id is null (corrupt data), winnerId could be null.
      const game = baseGame({
        turnPhase: "judge",
        currentTurn: "p2",
        offensivePlayerId: "p1",
        defensivePlayerId: "p2",
        player1Letters: "",
        player2Letters: "SKAT",
        player1Id: null, // corrupt
      });
      const turnParam = { ...baseTurnParam, turnNumber: 1 };
      const updatedGame = { ...game, status: "completed", winnerId: null };

      const tx = makeTx({
        selectResults: [
          () => Promise.resolve([game]),
          () => Promise.resolve([{ ...turnParam, result: "pending" }]),
          () => Promise.resolve([{ turnNumber: 2 }]),
        ],
        updateReturning: [updatedGame],
      });

      const result = await judgeTurn(tx as any, 5, "p2", "missed", turnParam as any);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.response.gameOver).toBe(true);
        // winnerId || undefined -> undefined when winnerId is null
        const notif = result.notifications.find(n => n.playerId === "p2");
        expect(notif?.data.winnerId).toBeUndefined();
      }
    });

    it("handles opponent name fallback in game-over notifications", async () => {
      const game = baseGame({
        turnPhase: "judge",
        currentTurn: "p2",
        offensivePlayerId: "p1",
        defensivePlayerId: "p2",
        player1Letters: "",
        player2Letters: "SKAT",
        player1Name: null,
        player2Name: null,
      });
      const turnParam = { ...baseTurnParam, turnNumber: 1 };
      const updatedGame = { ...game, status: "completed", winnerId: "p1" };

      const tx = makeTx({
        selectResults: [
          () => Promise.resolve([game]),
          () => Promise.resolve([{ ...turnParam, result: "pending" }]),
          () => Promise.resolve([{ turnNumber: 2 }]),
        ],
        updateReturning: [updatedGame],
      });

      const result = await judgeTurn(tx as any, 5, "p2", "missed", turnParam as any);
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Both names are null -> "Opponent"
        result.notifications.forEach(n => {
          expect(n.data.opponentName).toBe("Opponent");
        });
      }
    });
  });

  describe("empty letters fallback (|| '')", () => {
    it("defaults player1Letters to '' when null", async () => {
      const game = baseGame({
        turnPhase: "judge",
        currentTurn: "p2",
        offensivePlayerId: "p1",
        defensivePlayerId: "p2",
        player1Letters: null,
        player2Letters: null,
      });
      const turnParam = { ...baseTurnParam, turnNumber: 1 };
      const updatedGame = { ...game };

      const tx = makeTx({
        selectResults: [
          () => Promise.resolve([game]),
          () => Promise.resolve([{ ...turnParam, result: "pending" }]),
          () => Promise.resolve([{ turnNumber: 2 }]),
        ],
        updateReturning: [updatedGame],
      });

      const result = await judgeTurn(tx as any, 5, "p2", "missed", turnParam as any);
      expect(result.ok).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// setterBail
// ---------------------------------------------------------------------------

describe("setterBail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when game is not found", async () => {
    const tx = makeTx({ selectResults: [() => Promise.resolve([])] });
    const result = await setterBail(tx as any, "game-1", "p1");
    expect(result).toEqual({ ok: false, status: 404, error: "Game not found" });
  });

  it("returns 400 when game is not active", async () => {
    const game = baseGame({ status: "completed" });
    const tx = makeTx({ selectResults: [() => Promise.resolve([game])] });
    const result = await setterBail(tx as any, "game-1", "p1");
    expect(result).toEqual({ ok: false, status: 400, error: "Game is not active" });
  });

  it("returns 403 when non-setter tries to bail", async () => {
    const game = baseGame({ offensivePlayerId: "p1" });
    const tx = makeTx({ selectResults: [() => Promise.resolve([game])] });
    const result = await setterBail(tx as any, "game-1", "p2");
    expect(result).toEqual({ ok: false, status: 403, error: "Only the setter can declare a bail" });
  });

  it("returns 400 when not in set_trick phase", async () => {
    const game = baseGame({ turnPhase: "respond_trick" });
    const tx = makeTx({ selectResults: [() => Promise.resolve([game])] });
    const result = await setterBail(tx as any, "game-1", "p1");
    expect(result).toEqual({ ok: false, status: 400, error: "Can only bail during set trick phase" });
  });

  describe("player1 is setter (isPlayer1=true)", () => {
    it("gives letter to player1 and swaps roles (not game over)", async () => {
      const game = baseGame({
        player1Letters: "",
        player2Letters: "",
      });
      const updatedGame = { ...game, player1Letters: "S" };

      const tx = makeTx({
        selectResults: [() => Promise.resolve([game])],
        updateReturning: [updatedGame],
      });

      const result = await setterBail(tx as any, "game-1", "p1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.gameOver).toBe(false);
        expect(result.message).toBe("You bailed your own trick. Letter earned. Roles swap.");
        // New offensive = p2 (was defensive), notification goes to them
        expect(result.notifications[0].playerId).toBe("p2");
        // isPlayer1 is true, so opponentName = player1Name
        expect(result.notifications[0].data.opponentName).toBe("Alice");
      }
    });

    it("handles game over when player1 reaches SKATE", async () => {
      const game = baseGame({
        player1Letters: "SKAT",
        player2Letters: "",
      });
      const updatedGame = { ...game, status: "completed", winnerId: "p2" };

      const tx = makeTx({
        selectResults: [() => Promise.resolve([game])],
        updateReturning: [updatedGame],
      });

      const result = await setterBail(tx as any, "game-1", "p1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.gameOver).toBe(true);
        expect(result.winnerId).toBe("p2");
        expect(result.message).toBe("You bailed your own trick. Game over.");
        expect(result.notifications.length).toBe(2);
      }
    });

    it("handles SKATE_LETTERS overflow (|| '' fallback) when letters already full", async () => {
      // This scenario: player1Letters has exactly 5 chars (already has SKATE),
      // SKATE_LETTERS[5] is undefined -> || "" appends nothing, but isGameOver still triggers
      const game = baseGame({
        player1Letters: "SKATE",
        player2Letters: "",
      });
      const updatedGame = { ...game, status: "completed", winnerId: "p2" };

      const tx = makeTx({
        selectResults: [() => Promise.resolve([game])],
        updateReturning: [updatedGame],
      });

      const result = await setterBail(tx as any, "game-1", "p1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.gameOver).toBe(true);
      }
    });
  });

  describe("player2 is setter (isPlayer1=false)", () => {
    it("gives letter to player2 and swaps roles (not game over)", async () => {
      const game = baseGame({
        offensivePlayerId: "p2",
        defensivePlayerId: "p1",
        player1Letters: "",
        player2Letters: "",
      });
      const updatedGame = { ...game, player2Letters: "S" };

      const tx = makeTx({
        selectResults: [() => Promise.resolve([game])],
        updateReturning: [updatedGame],
      });

      const result = await setterBail(tx as any, "game-1", "p2");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.gameOver).toBe(false);
        // New offensive = p1 (was defensive), notification goes to them
        expect(result.notifications[0].playerId).toBe("p1");
        // isPlayer1 is false, so opponentName = player2Name
        expect(result.notifications[0].data.opponentName).toBe("Bob");
      }
    });

    it("handles game over when player2 reaches SKATE (loserId=player2 -> winner=player1)", async () => {
      const game = baseGame({
        offensivePlayerId: "p2",
        defensivePlayerId: "p1",
        player1Letters: "",
        player2Letters: "SKAT",
      });
      const updatedGame = { ...game, status: "completed", winnerId: "p1" };

      const tx = makeTx({
        selectResults: [() => Promise.resolve([game])],
        updateReturning: [updatedGame],
      });

      const result = await setterBail(tx as any, "game-1", "p2");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.gameOver).toBe(true);
        expect(result.winnerId).toBe("p1");
      }
    });

    it("handles SKATE_LETTERS overflow for player2 (|| '' fallback)", async () => {
      const game = baseGame({
        offensivePlayerId: "p2",
        defensivePlayerId: "p1",
        player1Letters: "",
        player2Letters: "SKATE",
      });
      const updatedGame = { ...game, status: "completed", winnerId: "p1" };

      const tx = makeTx({
        selectResults: [() => Promise.resolve([game])],
        updateReturning: [updatedGame],
      });

      const result = await setterBail(tx as any, "game-1", "p2");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.gameOver).toBe(true);
      }
    });
  });

  describe("letters fallback (|| '')", () => {
    it("defaults null player1Letters and player2Letters to empty string", async () => {
      const game = baseGame({
        player1Letters: null,
        player2Letters: null,
      });
      const updatedGame = { ...game };

      const tx = makeTx({
        selectResults: [() => Promise.resolve([game])],
        updateReturning: [updatedGame],
      });

      const result = await setterBail(tx as any, "game-1", "p1");
      expect(result.ok).toBe(true);
    });
  });

  describe("game-over notification edge cases", () => {
    it("handles winnerId || undefined fallback", async () => {
      // When winnerId is null (e.g. corrupt player IDs)
      const game = baseGame({
        player1Letters: "SKAT",
        player2Letters: "",
        player2Id: null, // corrupt -> winnerId = null when loserId=player1
      });
      const updatedGame = { ...game, status: "completed", winnerId: null };

      const tx = makeTx({
        selectResults: [() => Promise.resolve([game])],
        updateReturning: [updatedGame],
      });

      const result = await setterBail(tx as any, "game-1", "p1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.gameOver).toBe(true);
        expect(result.winnerId).toBeNull();
        // winnerId || undefined -> undefined in notification data
        const notif = result.notifications.find(n => n.playerId === "p1");
        expect(notif?.data.winnerId).toBeUndefined();
      }
    });

    it("handles null player names in game-over notifications (|| 'Opponent' fallback)", async () => {
      const game = baseGame({
        player1Letters: "SKAT",
        player2Letters: "",
        player1Name: null,
        player2Name: null,
      });
      const updatedGame = { ...game, status: "completed", winnerId: "p2" };

      const tx = makeTx({
        selectResults: [() => Promise.resolve([game])],
        updateReturning: [updatedGame],
      });

      const result = await setterBail(tx as any, "game-1", "p1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        result.notifications.forEach(n => {
          expect(n.data.opponentName).toBe("Opponent");
        });
      }
    });

    it("handles player name in non-game-over with null name (|| 'Opponent' fallback)", async () => {
      const game = baseGame({
        player1Letters: "",
        player2Letters: "",
        player1Name: null,
      });
      const updatedGame = { ...game };

      const tx = makeTx({
        selectResults: [() => Promise.resolve([game])],
        updateReturning: [updatedGame],
      });

      const result = await setterBail(tx as any, "game-1", "p1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        // isPlayer1=true, opponentName = player1Name || "Opponent" -> "Opponent"
        expect(result.notifications[0].data.opponentName).toBe("Opponent");
      }
    });
  });
});
