/**
 * Tests for gameDisputeService.ts — additional branch coverage
 * Covers fileDispute branches (lines 67-93) and resolveDispute branches
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@shared/schema", () => ({
  games: {
    id: { name: "id" },
    player1Id: "player1Id",
    player2Id: "player2Id",
    status: "status",
    player1DisputeUsed: "player1DisputeUsed",
    player2DisputeUsed: "player2DisputeUsed",
    player1Letters: "player1Letters",
    player2Letters: "player2Letters",
    offensivePlayerId: "offensivePlayerId",
    defensivePlayerId: "defensivePlayerId",
    currentTurn: "currentTurn",
    turnPhase: "turnPhase",
    deadlineAt: "deadlineAt",
    updatedAt: "updatedAt",
  },
  gameTurns: {
    id: { name: "id" },
    gameId: "gameId",
    playerId: "playerId",
    result: "result",
    judgedBy: "judgedBy",
  },
  gameDisputes: {
    id: { name: "id" },
    gameId: "gameId",
    turnId: "turnId",
    disputedBy: "disputedBy",
    againstPlayerId: "againstPlayerId",
    originalResult: "originalResult",
    finalResult: "finalResult",
    resolvedBy: "resolvedBy",
    resolvedAt: "resolvedAt",
    penaltyAppliedTo: "penaltyAppliedTo",
  },
  userProfiles: {
    id: { name: "id" },
    disputePenalties: "disputePenalties",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  sql: Object.assign(
    (strings: TemplateStringsArray, ..._values: unknown[]) => ({ _sql: true, strings }),
    { raw: (s: string) => ({ _sql: true, raw: s }) }
  ),
}));

vi.mock("../../routes/games-shared", () => ({
  TURN_DEADLINE_MS: 24 * 60 * 60 * 1000,
}));

import { fileDispute, resolveDispute } from "../../services/gameDisputeService";

describe("fileDispute", () => {
  function createMockTx(options: {
    game?: Record<string, unknown> | null;
    turn?: Record<string, unknown> | null;
    insertResult?: Record<string, unknown>[];
  }) {
    const { game, turn, insertResult = [{ id: 1 }] } = options;
    let selectCount = 0;

    return {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              selectCount++;
              if (selectCount === 1) return Promise.resolve(game ? [game] : []);
              return Promise.resolve(turn ? [turn] : []);
            }),
          }),
        }),
      })),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(insertResult),
        }),
      }),
    };
  }

  it("returns 404 when game is not found", async () => {
    const tx = createMockTx({ game: null });
    const result = await fileDispute(tx as never, "game-1", "p1", 1);
    expect(result).toEqual({ ok: false, status: 404, error: "Game not found" });
  });

  it("returns 403 when player is not in the game", async () => {
    const tx = createMockTx({
      game: { player1Id: "p1", player2Id: "p2", status: "active" },
    });
    const result = await fileDispute(tx as never, "game-1", "stranger", 1);
    expect(result).toEqual({ ok: false, status: 403, error: "You are not a player in this game" });
  });

  it("returns 400 when game is not active", async () => {
    const tx = createMockTx({
      game: { player1Id: "p1", player2Id: "p2", status: "completed" },
    });
    const result = await fileDispute(tx as never, "game-1", "p1", 1);
    expect(result).toEqual({ ok: false, status: 400, error: "Game is not active" });
  });

  it("returns 400 when player already used their dispute", async () => {
    const tx = createMockTx({
      game: {
        player1Id: "p1",
        player2Id: "p2",
        status: "active",
        player1DisputeUsed: true,
        player2DisputeUsed: false,
      },
    });
    const result = await fileDispute(tx as never, "game-1", "p1", 1);
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "You have already used your dispute for this game",
    });
  });

  it("returns 404 when turn is not found", async () => {
    const tx = createMockTx({
      game: {
        player1Id: "p1",
        player2Id: "p2",
        status: "active",
        player1DisputeUsed: false,
        player2DisputeUsed: false,
      },
      turn: null,
    });
    const result = await fileDispute(tx as never, "game-1", "p1", 999);
    expect(result).toEqual({ ok: false, status: 404, error: "Turn not found" });
  });

  it("returns 400 when turn does not belong to this game", async () => {
    const tx = createMockTx({
      game: {
        player1Id: "p1",
        player2Id: "p2",
        status: "active",
        player1DisputeUsed: false,
      },
      turn: {
        id: 1,
        gameId: "other-game",
        playerId: "p1",
        result: "missed",
        judgedBy: "p2",
      },
    });
    const result = await fileDispute(tx as never, "game-1", "p1", 1);
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Turn does not belong to this game",
    });
  });

  it("returns 400 when turn result is not missed (can only dispute BAIL)", async () => {
    const tx = createMockTx({
      game: {
        player1Id: "p1",
        player2Id: "p2",
        status: "active",
        player1DisputeUsed: false,
      },
      turn: {
        id: 1,
        gameId: "game-1",
        playerId: "p1",
        result: "landed",
        judgedBy: "p2",
      },
    });
    const result = await fileDispute(tx as never, "game-1", "p1", 1);
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Can only dispute a BAIL judgment",
    });
  });

  it("returns 400 when disputing someone else's trick", async () => {
    const tx = createMockTx({
      game: {
        player1Id: "p1",
        player2Id: "p2",
        status: "active",
        player1DisputeUsed: false,
      },
      turn: {
        id: 1,
        gameId: "game-1",
        playerId: "p2",
        result: "missed",
        judgedBy: "p1",
      },
    });
    const result = await fileDispute(tx as never, "game-1", "p1", 1);
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "You can only dispute judgments on your own tricks",
    });
  });

  it("returns 400 when turn has not been judged yet", async () => {
    const tx = createMockTx({
      game: {
        player1Id: "p1",
        player2Id: "p2",
        status: "active",
        player1DisputeUsed: false,
      },
      turn: {
        id: 1,
        gameId: "game-1",
        playerId: "p1",
        result: "missed",
        judgedBy: null,
      },
    });
    const result = await fileDispute(tx as never, "game-1", "p1", 1);
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Turn has not been judged yet",
    });
  });

  it("succeeds and returns dispute with opponentId for player1", async () => {
    const dispute = {
      id: 1,
      gameId: "game-1",
      turnId: 1,
      disputedBy: "p1",
      againstPlayerId: "p2",
      originalResult: "missed",
    };
    const tx = createMockTx({
      game: {
        player1Id: "p1",
        player2Id: "p2",
        status: "active",
        player1DisputeUsed: false,
        player2DisputeUsed: false,
      },
      turn: {
        id: 1,
        gameId: "game-1",
        playerId: "p1",
        result: "missed",
        judgedBy: "p2",
      },
      insertResult: [dispute],
    });

    const result = await fileDispute(tx as never, "game-1", "p1", 1);

    expect(result).toEqual({
      ok: true,
      dispute,
      opponentId: "p2",
    });
  });

  it("succeeds for player2 filing dispute", async () => {
    const dispute = {
      id: 2,
      gameId: "game-1",
      turnId: 2,
      disputedBy: "p2",
      againstPlayerId: "p1",
      originalResult: "missed",
    };
    const tx = createMockTx({
      game: {
        player1Id: "p1",
        player2Id: "p2",
        status: "active",
        player1DisputeUsed: false,
        player2DisputeUsed: false,
      },
      turn: {
        id: 2,
        gameId: "game-1",
        playerId: "p2",
        result: "missed",
        judgedBy: "p1",
      },
      insertResult: [dispute],
    });

    const result = await fileDispute(tx as never, "game-1", "p2", 2);

    expect(result).toEqual({
      ok: true,
      dispute,
      opponentId: "p1",
    });
  });
});

describe("resolveDispute", () => {
  function createResolveTx(options: {
    dispute?: Record<string, unknown> | null;
    game?: Record<string, unknown> | null;
  }) {
    const { dispute, game } = options;
    let selectCount = 0;

    return {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              selectCount++;
              if (selectCount === 1) return Promise.resolve(dispute ? [dispute] : []);
              return Promise.resolve(game ? [game] : []);
            }),
          }),
        }),
      })),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    };
  }

  it("returns 404 when dispute is not found", async () => {
    const tx = createResolveTx({ dispute: null });
    const result = await resolveDispute(tx as never, 999, "admin", "landed");
    expect(result).toEqual({ ok: false, status: 404, error: "Dispute not found" });
  });

  it("returns 400 when dispute is already resolved", async () => {
    const tx = createResolveTx({
      dispute: { id: 1, finalResult: "landed", againstPlayerId: "p2", gameId: "g1" },
    });
    const result = await resolveDispute(tx as never, 1, "p2", "landed");
    expect(result).toEqual({ ok: false, status: 400, error: "Dispute already resolved" });
  });

  it("returns 403 when resolver is not the judging player", async () => {
    const tx = createResolveTx({
      dispute: { id: 1, finalResult: null, againstPlayerId: "p2", gameId: "g1" },
    });
    const result = await resolveDispute(tx as never, 1, "stranger", "landed");
    expect(result).toEqual({
      ok: false,
      status: 403,
      error: "Only the judging player can resolve the dispute",
    });
  });

  it("returns 404 when game is not found", async () => {
    const tx = createResolveTx({
      dispute: { id: 1, finalResult: null, againstPlayerId: "p2", gameId: "g1", disputedBy: "p1" },
      game: null,
    });
    const result = await resolveDispute(tx as never, 1, "p2", "landed");
    expect(result).toEqual({ ok: false, status: 404, error: "Game not found" });
  });

  it("returns 400 when game is no longer active", async () => {
    const tx = createResolveTx({
      dispute: { id: 1, finalResult: null, againstPlayerId: "p2", gameId: "g1", disputedBy: "p1" },
      game: { id: "g1", status: "completed", player1Id: "p1", player2Id: "p2" },
    });
    const result = await resolveDispute(tx as never, 1, "p2", "landed");
    expect(result).toEqual({ ok: false, status: 400, error: "Game is no longer active" });
  });

  it("resolves dispute as landed — overturns BAIL, removes letter, swaps roles", async () => {
    const tx = createResolveTx({
      dispute: {
        id: 1,
        finalResult: null,
        againstPlayerId: "p2",
        gameId: "g1",
        disputedBy: "p1",
        turnId: 10,
        originalResult: "missed",
      },
      game: {
        id: "g1",
        status: "active",
        player1Id: "p1",
        player2Id: "p2",
        player1Letters: "SK",
        player2Letters: "S",
      },
    });

    const result = await resolveDispute(tx as never, 1, "p2", "landed");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.penaltyTarget).toBe("p2");
      expect(result.dispute.finalResult).toBe("landed");
    }
  });

  it("resolves dispute as missed — penalty goes to disputer", async () => {
    const tx = createResolveTx({
      dispute: {
        id: 2,
        finalResult: null,
        againstPlayerId: "p2",
        gameId: "g1",
        disputedBy: "p1",
        turnId: 11,
        originalResult: "missed",
      },
      game: {
        id: "g1",
        status: "active",
        player1Id: "p1",
        player2Id: "p2",
        player1Letters: "SKA",
        player2Letters: "SK",
      },
    });

    const result = await resolveDispute(tx as never, 2, "p2", "missed");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.penaltyTarget).toBe("p1"); // Disputer gets penalty
    }
  });
});
