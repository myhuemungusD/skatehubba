/**
 * Tests for battle/service.ts — castVoteLegacy path
 * Covers lines 271 (battle not found), 275 (not participant),
 * 294-317 (both voted, winner calculation)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetDb = vi.hoisted(() => vi.fn());

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("@shared/schema", () => ({
  battles: {
    id: { name: "id" },
    creatorId: "creatorId",
    opponentId: "opponentId",
    status: "status",
    winnerId: "winnerId",
    completedAt: "completedAt",
    updatedAt: "updatedAt",
  },
  battleVotes: {
    battleId: { name: "battleId" },
    odv: { name: "odv" },
    vote: "vote",
    createdAt: "createdAt",
  },
  battleVoteState: {
    battleId: "battleId",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ _op: "eq", col, val })),
}));

vi.mock("../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../services/analyticsService", () => ({
  logServerEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/battle/calculation", () => ({
  calculateWinner: vi.fn().mockReturnValue({
    winnerId: "creator-1",
    scores: { "creator-1": 2, "opponent-1": 1 },
  }),
}));

vi.mock("../../services/battle/idempotency", () => ({
  MAX_PROCESSED_EVENTS: 100,
}));

import { castVote } from "../../services/battle/service";
import { logServerEvent } from "../../services/analyticsService";

describe("castVote — legacy path (no vote state row)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Sets up the mock DB for the castVote flow:
   * 1. Transaction wraps everything
   * 2. Inside tx: select from battleVoteState → empty (triggers legacy path)
   * 3. Legacy path calls getDb() again for battle lookup, vote insert, vote query
   */
  function setupMockDb(options: {
    battleRow?: Record<string, unknown>;
    votesAfterInsert?: Record<string, unknown>[];
  }) {
    const { battleRow, votesAfterInsert = [] } = options;

    // The legacy path calls getDb() separately — we need a mock for that inner db
    let legacySelectCount = 0;
    const legacyDb: Record<string, ReturnType<typeof vi.fn>> = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            legacySelectCount++;
            if (legacySelectCount === 1) return Promise.resolve(battleRow ? [battleRow] : []);
            return Promise.resolve(votesAfterInsert);
          }),
        }),
      })),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    };

    // The outer db wraps in a transaction and does a vote state lookup
    const outerDb: Record<string, ReturnType<typeof vi.fn>> = {
      transaction: vi
        .fn()
        .mockImplementation(
          async (cb: (tx: Record<string, ReturnType<typeof vi.fn>>) => Promise<unknown>) => {
            const tx = {
              select: vi.fn().mockImplementation(() => ({
                from: vi.fn().mockReturnValue({
                  where: vi.fn().mockReturnValue({
                    // .for("update") → returns [] (no vote state row → legacy path)
                    for: vi.fn().mockResolvedValue([]),
                  }),
                }),
              })),
              update: vi.fn().mockReturnValue({
                set: vi.fn().mockReturnValue({
                  where: vi.fn().mockResolvedValue(undefined),
                }),
              }),
            };
            return cb(tx);
          }
        ),
      // After the transaction, castVote persists vote to battleVotes
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    };

    // getDb() is called twice: once for the outer flow, once inside castVoteLegacy
    let getDbCallCount = 0;
    mockGetDb.mockImplementation(() => {
      getDbCallCount++;
      if (getDbCallCount === 1) return outerDb;
      return legacyDb;
    });

    return { outerDb, legacyDb };
  }

  it("returns error when battle is not found (line 271)", async () => {
    setupMockDb({ battleRow: undefined });

    const result = await castVote({
      eventId: "evt-1",
      battleId: "nonexistent",
      odv: "user-1",
      vote: "clean",
    });

    expect(result).toEqual({ success: false, error: "Battle not found" });
  });

  it("returns error when voter is not a participant (line 275)", async () => {
    setupMockDb({
      battleRow: {
        id: "battle-1",
        creatorId: "creator-1",
        opponentId: "opponent-1",
        status: "active",
      },
    });

    const result = await castVote({
      eventId: "evt-2",
      battleId: "battle-1",
      odv: "stranger",
      vote: "clean",
    });

    expect(result).toEqual({ success: false, error: "Not a participant" });
  });

  it("completes battle when both players have voted (lines 294-317)", async () => {
    const now = new Date();
    setupMockDb({
      battleRow: {
        id: "battle-1",
        creatorId: "creator-1",
        opponentId: "opponent-1",
        status: "active",
      },
      votesAfterInsert: [
        { odv: "creator-1", vote: "clean", createdAt: now },
        { odv: "opponent-1", vote: "sketch", createdAt: now },
      ],
    });

    const result = await castVote({
      eventId: "evt-3",
      battleId: "battle-1",
      odv: "creator-1",
      vote: "clean",
    });

    expect(result.success).toBe(true);
    expect(result.battleComplete).toBe(true);
    expect(result.winnerId).toBe("creator-1");
    expect(result.finalScore).toEqual({ "creator-1": 2, "opponent-1": 1 });
    expect(logServerEvent).toHaveBeenCalledWith("creator-1", "battle_completed", {
      battle_id: "battle-1",
      winner_id: "creator-1",
    });
  });

  it("returns battleComplete false when only one player voted", async () => {
    const now = new Date();
    setupMockDb({
      battleRow: {
        id: "battle-1",
        creatorId: "creator-1",
        opponentId: "opponent-1",
        status: "active",
      },
      votesAfterInsert: [{ odv: "creator-1", vote: "clean", createdAt: now }],
    });

    const result = await castVote({
      eventId: "evt-4",
      battleId: "battle-1",
      odv: "creator-1",
      vote: "clean",
    });

    expect(result.success).toBe(true);
    expect(result.battleComplete).toBe(false);
  });

  it("uses fallback timestamp when vote createdAt is null (line 297)", async () => {
    setupMockDb({
      battleRow: {
        id: "battle-1",
        creatorId: "creator-1",
        opponentId: "opponent-1",
        status: "active",
      },
      votesAfterInsert: [
        { odv: "creator-1", vote: "clean", createdAt: null },
        { odv: "opponent-1", vote: "sketch", createdAt: null },
      ],
    });

    const result = await castVote({
      eventId: "evt-5",
      battleId: "battle-1",
      odv: "creator-1",
      vote: "clean",
    });

    expect(result.success).toBe(true);
    expect(result.battleComplete).toBe(true);
  });
});
