/**
 * @fileoverview Coverage gap tests for gameDisputeService.fileDispute
 * Covers:
 *   - Line 71: turn.gameId !== gameId (turn does not belong to this game)
 *   - Line 73: turn.result !== "missed" (can only dispute BAIL)
 *   - Line 75: turn.playerId !== playerId (can only dispute own tricks)
 *   - Also: turn.judgedBy is null (turn has not been judged yet)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

vi.mock("@shared/schema", () => ({
  games: { _table: "games" },
  gameTurns: { _table: "gameTurns" },
  gameDisputes: { _table: "gameDisputes" },
  userProfiles: {
    _table: "userProfiles",
    disputePenalties: "disputePenalties",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  sql: Object.assign(
    (strings: TemplateStringsArray, ..._values: any[]) => ({
      _sql: true,
      strings,
    }),
    { raw: (s: string) => ({ _sql: true, raw: s }) }
  ),
}));

vi.mock("../../routes/games-shared", () => ({
  TURN_DEADLINE_MS: 24 * 60 * 60 * 1000,
}));

const { fileDispute } = await import("../../services/gameDisputeService");

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build a mock transaction that returns specified data for sequential
 * select().from().where().limit() calls (games lookup, then turns lookup).
 */
function createMockTx(selectResults: any[][]) {
  let selectCallIndex = 0;

  const tx: any = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockImplementation(() => {
      const resultIndex = selectCallIndex++;
      const results = selectResults[resultIndex] ?? [];
      const chain: any = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(results);
      return chain;
    }),
    insert: vi.fn().mockImplementation(() => {
      const chain: any = {};
      chain.values = vi.fn().mockReturnValue(chain);
      chain.returning = vi.fn().mockResolvedValue([{ id: 1 }]);
      return chain;
    }),
    update: vi.fn().mockImplementation(() => {
      const chain: any = {};
      chain.set = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockResolvedValue(undefined);
      return chain;
    }),
  };

  return tx;
}

// ============================================================================
// Tests
// ============================================================================

describe("gameDisputeService.fileDispute – coverage gaps", () => {
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

  // --------------------------------------------------------------------------
  // Line 71: turn.gameId !== gameId
  // --------------------------------------------------------------------------
  it("should reject when turn does not belong to this game", async () => {
    const turn = {
      id: 10,
      gameId: "different-game",
      result: "missed",
      playerId: "player-A",
      judgedBy: "player-B",
    };

    const tx = createMockTx([[baseGame], [turn]]);

    const result = await fileDispute(tx, "game-1", "player-A", 10);

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Turn does not belong to this game",
    });
  });

  // --------------------------------------------------------------------------
  // Line 73: turn.result !== "missed"
  // --------------------------------------------------------------------------
  it("should reject when turn result is not missed (can only dispute BAIL)", async () => {
    const turn = {
      id: 11,
      gameId: "game-1",
      result: "landed",
      playerId: "player-A",
      judgedBy: "player-B",
    };

    const tx = createMockTx([[baseGame], [turn]]);

    const result = await fileDispute(tx, "game-1", "player-A", 11);

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Can only dispute a BAIL judgment",
    });
  });

  // --------------------------------------------------------------------------
  // Line 75: turn.playerId !== playerId
  // --------------------------------------------------------------------------
  it("should reject when turn belongs to a different player", async () => {
    const turn = {
      id: 12,
      gameId: "game-1",
      result: "missed",
      playerId: "player-B", // not the disputing player
      judgedBy: "player-A",
    };

    const tx = createMockTx([[baseGame], [turn]]);

    const result = await fileDispute(tx, "game-1", "player-A", 12);

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "You can only dispute judgments on your own tricks",
    });
  });

  // --------------------------------------------------------------------------
  // turn.judgedBy is null (turn has not been judged yet)
  // --------------------------------------------------------------------------
  it("should reject when turn has not been judged yet", async () => {
    const turn = {
      id: 13,
      gameId: "game-1",
      result: "missed",
      playerId: "player-A",
      judgedBy: null,
    };

    const tx = createMockTx([[baseGame], [turn]]);

    const result = await fileDispute(tx, "game-1", "player-A", 13);

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Turn has not been judged yet",
    });
  });
});
