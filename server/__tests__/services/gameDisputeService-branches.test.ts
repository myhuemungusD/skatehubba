/**
 * @fileoverview Full branch coverage tests for gameDisputeService
 *
 * Covers every conditional branch in both fileDispute and resolveDispute,
 * including:
 *   fileDispute:
 *     - game not found
 *     - player not in game
 *     - game not active
 *     - dispute already used (player1 and player2 paths)
 *     - turn not found
 *     - happy path as player1 (ternary branches for disputeField, opponentId)
 *     - happy path as player2 (ternary branches for disputeField, opponentId)
 *   resolveDispute:
 *     - dispute not found
 *     - dispute already resolved
 *     - wrong player resolving
 *     - game not found
 *     - game no longer active
 *     - finalResult "missed" (penalty goes to disputedBy, no letter reversal)
 *     - finalResult "landed" with defender as player1, with letters
 *     - finalResult "landed" with defender as player2, with letters
 *     - finalResult "landed" with null letters (|| "" fallback)
 *     - finalResult "landed" with empty string letters (length === 0 branch)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

vi.mock("@shared/schema", () => ({
  games: { _table: "games", id: "games.id" },
  gameTurns: { _table: "gameTurns", id: "gameTurns.id" },
  gameDisputes: { _table: "gameDisputes", id: "gameDisputes.id" },
  userProfiles: {
    _table: "userProfiles",
    id: "userProfiles.id",
    disputePenalties: "disputePenalties",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col, val) => ({ _eq: true, val })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ..._values: unknown[]) => ({
      _sql: true,
      strings,
    }),
    { raw: (s: string) => ({ _sql: true, raw: s }) }
  ),
}));

vi.mock("../../routes/games-shared", () => ({
  TURN_DEADLINE_MS: 24 * 60 * 60 * 1000,
}));

const { fileDispute, resolveDispute } = await import(
  "../../services/gameDisputeService"
);

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build a mock transaction that returns specified data for sequential
 * select().from().where().limit() calls.
 *
 * Also tracks update/insert calls for assertions.
 */
function createMockTx(selectResults: unknown[][]) {
  let selectCallIndex = 0;

  const updateCalls: { table: unknown; data: unknown; where: unknown }[] = [];

  const tx: Record<string, unknown> = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockImplementation(() => {
      const resultIndex = selectCallIndex++;
      const results = selectResults[resultIndex] ?? [];
      const chain: Record<string, unknown> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(results);
      return chain;
    }),
    insert: vi.fn().mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.values = vi.fn().mockReturnValue(chain);
      chain.returning = vi.fn().mockResolvedValue([{ id: 1, gameId: "game-1" }]);
      return chain;
    }),
    update: vi.fn().mockImplementation((table: unknown) => {
      const entry: { table: unknown; data: unknown; where: unknown } = {
        table,
        data: null,
        where: null,
      };
      updateCalls.push(entry);

      const chain: Record<string, unknown> = {};
      chain.set = vi.fn().mockImplementation((data: unknown) => {
        entry.data = data;
        return chain;
      });
      chain.where = vi.fn().mockImplementation((w: unknown) => {
        entry.where = w;
        return Promise.resolve(undefined);
      });
      return chain;
    }),
    _updateCalls: updateCalls,
  };

  return tx;
}

// ============================================================================
// fileDispute tests
// ============================================================================

describe("gameDisputeService.fileDispute – full branch coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseGame = {
    id: "game-1",
    status: "active",
    player1Id: "player-A",
    player2Id: "player-B",
    player1DisputeUsed: false,
    player2DisputeUsed: false,
  };

  const baseTurn = {
    id: 10,
    gameId: "game-1",
    result: "missed",
    playerId: "player-A",
    judgedBy: "player-B",
  };

  // --- Error branches ---

  it("should return 404 when game is not found", async () => {
    const tx = createMockTx([[]]);
    const result = await fileDispute(tx as never, "game-1", "player-A", 10);
    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "Game not found",
    });
  });

  it("should return 403 when player is not in the game", async () => {
    const tx = createMockTx([[baseGame]]);
    const result = await fileDispute(tx as never, "game-1", "stranger", 10);
    expect(result).toEqual({
      ok: false,
      status: 403,
      error: "You are not a player in this game",
    });
  });

  it("should return 400 when game is not active", async () => {
    const tx = createMockTx([[{ ...baseGame, status: "completed" }]]);
    const result = await fileDispute(tx as never, "game-1", "player-A", 10);
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Game is not active",
    });
  });

  it("should return 400 when player1 dispute is already used", async () => {
    const tx = createMockTx([
      [{ ...baseGame, player1DisputeUsed: true }],
    ]);
    const result = await fileDispute(tx as never, "game-1", "player-A", 10);
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "You have already used your dispute for this game",
    });
  });

  it("should return 400 when player2 dispute is already used", async () => {
    const tx = createMockTx([
      [{ ...baseGame, player2DisputeUsed: true }],
    ]);
    const result = await fileDispute(tx as never, "game-1", "player-B", 10);
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "You have already used your dispute for this game",
    });
  });

  it("should return 404 when turn is not found", async () => {
    const tx = createMockTx([[baseGame], []]);
    const result = await fileDispute(tx as never, "game-1", "player-A", 999);
    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "Turn not found",
    });
  });

  // --- Happy path branches ---

  it("should succeed as player1 and return player2 as opponent", async () => {
    const tx = createMockTx([[baseGame], [baseTurn]]);
    const result = await fileDispute(tx as never, "game-1", "player-A", 10);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.opponentId).toBe("player-B");
    }
    // Verify update was called (marks dispute as used)
    expect(tx.update).toHaveBeenCalled();
    // Verify insert was called (creates dispute record)
    expect(tx.insert).toHaveBeenCalled();
  });

  it("should succeed as player2 and return player1 as opponent", async () => {
    const turnAsPlayer2 = {
      ...baseTurn,
      playerId: "player-B",
      judgedBy: "player-A",
    };
    const tx = createMockTx([[baseGame], [turnAsPlayer2]]);
    const result = await fileDispute(tx as never, "game-1", "player-B", 10);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.opponentId).toBe("player-A");
    }
  });
});

// ============================================================================
// resolveDispute tests
// ============================================================================

describe("gameDisputeService.resolveDispute – full branch coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseDispute = {
    id: 1,
    gameId: "game-1",
    turnId: 10,
    disputedBy: "player-A",
    againstPlayerId: "player-B",
    originalResult: "missed",
    finalResult: null,
    resolvedBy: null,
    resolvedAt: null,
    penaltyAppliedTo: null,
  };

  const baseGame = {
    id: "game-1",
    status: "active",
    player1Id: "player-A",
    player2Id: "player-B",
    player1Letters: "SK",
    player2Letters: "S",
    offensivePlayerId: "player-A",
    defensivePlayerId: "player-B",
    currentTurn: "player-A",
  };

  // --- Error branches ---

  it("should return 404 when dispute is not found", async () => {
    const tx = createMockTx([[]]);
    const result = await resolveDispute(tx as never, 999, "player-B", "landed");
    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "Dispute not found",
    });
  });

  it("should return 400 when dispute is already resolved", async () => {
    const tx = createMockTx([
      [{ ...baseDispute, finalResult: "missed" }],
    ]);
    const result = await resolveDispute(tx as never, 1, "player-B", "landed");
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Dispute already resolved",
    });
  });

  it("should return 403 when resolver is not the judging player", async () => {
    const tx = createMockTx([[baseDispute]]);
    const result = await resolveDispute(tx as never, 1, "player-A", "landed");
    expect(result).toEqual({
      ok: false,
      status: 403,
      error: "Only the judging player can resolve the dispute",
    });
  });

  it("should return 404 when game is not found during resolve", async () => {
    // First select: dispute, Second select: game (empty)
    const tx = createMockTx([[baseDispute], []]);
    const result = await resolveDispute(tx as never, 1, "player-B", "landed");
    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "Game not found",
    });
  });

  it("should return 400 when game is no longer active during resolve", async () => {
    const tx = createMockTx([
      [baseDispute],
      [{ ...baseGame, status: "completed" }],
    ]);
    const result = await resolveDispute(tx as never, 1, "player-B", "landed");
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Game is no longer active",
    });
  });

  // --- finalResult "missed" branch (no letter reversal) ---

  it("should resolve as missed – penalty goes to disputedBy, no letter reversal", async () => {
    const tx = createMockTx([[baseDispute], [baseGame]]);
    const result = await resolveDispute(tx as never, 1, "player-B", "missed");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.penaltyTarget).toBe("player-A"); // disputedBy gets penalty
      expect(result.dispute.finalResult).toBe("missed");
    }

    // Should have 2 update calls: gameDisputes + userProfiles (no games update for roles)
    const updateCalls = (tx as Record<string, unknown>)._updateCalls as unknown[];
    expect(updateCalls).toHaveLength(2);
  });

  // --- finalResult "landed" branch (letter reversal + role swap) ---

  it("should resolve as landed – penalty goes to againstPlayerId, defender is player1 with letters", async () => {
    // disputedBy is player-A who is player1
    const tx = createMockTx([[baseDispute], [baseGame]]);
    const result = await resolveDispute(tx as never, 1, "player-B", "landed");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.penaltyTarget).toBe("player-B"); // againstPlayerId gets penalty
      expect(result.dispute.finalResult).toBe("landed");
    }

    // Should have 4 update calls: gameDisputes + userProfiles + games (role swap) + gameTurns
    const updateCalls = (tx as Record<string, unknown>)._updateCalls as unknown[];
    expect(updateCalls).toHaveLength(4);
  });

  it("should resolve as landed – defender is player2 with letters", async () => {
    // disputedBy is player-B who is player2
    const disputeAsP2 = {
      ...baseDispute,
      disputedBy: "player-B",
      againstPlayerId: "player-A",
    };
    const tx = createMockTx([[disputeAsP2], [baseGame]]);
    const result = await resolveDispute(tx as never, 1, "player-A", "landed");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.penaltyTarget).toBe("player-A"); // againstPlayerId
    }

    // 4 update calls: gameDisputes + userProfiles + games + gameTurns
    const updateCalls = (tx as Record<string, unknown>)._updateCalls as unknown[];
    expect(updateCalls).toHaveLength(4);
  });

  it("should resolve as landed – defender is player1 with null letters (|| fallback)", async () => {
    const gameNullLetters = {
      ...baseGame,
      player1Letters: null,
      player2Letters: null,
    };
    const tx = createMockTx([[baseDispute], [gameNullLetters]]);
    const result = await resolveDispute(tx as never, 1, "player-B", "landed");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.penaltyTarget).toBe("player-B");
    }

    // Still 4 update calls — letter is empty so slice returns ""
    const updateCalls = (tx as Record<string, unknown>)._updateCalls as unknown[];
    expect(updateCalls).toHaveLength(4);
  });

  it("should resolve as landed – defender is player2 with null letters (|| fallback)", async () => {
    const disputeAsP2 = {
      ...baseDispute,
      disputedBy: "player-B",
      againstPlayerId: "player-A",
    };
    const gameNullLetters = {
      ...baseGame,
      player1Letters: null,
      player2Letters: null,
    };
    const tx = createMockTx([[disputeAsP2], [gameNullLetters]]);
    const result = await resolveDispute(tx as never, 1, "player-A", "landed");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.penaltyTarget).toBe("player-A");
    }

    const updateCalls = (tx as Record<string, unknown>)._updateCalls as unknown[];
    expect(updateCalls).toHaveLength(4);
  });

  it("should resolve as landed – defender is player1 with empty string letters (length === 0)", async () => {
    const gameEmptyLetters = {
      ...baseGame,
      player1Letters: "",
      player2Letters: "",
    };
    const tx = createMockTx([[baseDispute], [gameEmptyLetters]]);
    const result = await resolveDispute(tx as never, 1, "player-B", "landed");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.penaltyTarget).toBe("player-B");
    }

    const updateCalls = (tx as Record<string, unknown>)._updateCalls as unknown[];
    expect(updateCalls).toHaveLength(4);
  });

  it("should resolve as landed – defender is player2 with empty string letters (length === 0)", async () => {
    const disputeAsP2 = {
      ...baseDispute,
      disputedBy: "player-B",
      againstPlayerId: "player-A",
    };
    const gameEmptyLetters = {
      ...baseGame,
      player1Letters: "",
      player2Letters: "",
    };
    const tx = createMockTx([[disputeAsP2], [gameEmptyLetters]]);
    const result = await resolveDispute(tx as never, 1, "player-A", "landed");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.penaltyTarget).toBe("player-A");
    }

    const updateCalls = (tx as Record<string, unknown>)._updateCalls as unknown[];
    expect(updateCalls).toHaveLength(4);
  });
});
