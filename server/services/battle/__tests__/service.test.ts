/**
 * Unit tests for server/services/battle/service.ts
 *
 * Tests initializeVoting, castVote, and getBattleVoteState.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock("../../../logger", () => ({ default: mockLogger }));
vi.mock("../../analyticsService", () => ({
  logServerEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@shared/schema", () => ({
  battles: { id: { name: "id" } },
  battleVotes: {
    battleId: { name: "battleId" },
    odv: { name: "odv" },
  },
  battleVoteState: {
    battleId: { name: "battleId" },
    status: { name: "status" },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ _op: "eq", col, val }),
}));

vi.mock("../idempotency", () => ({
  MAX_PROCESSED_EVENTS: 50,
}));

vi.mock("../calculation", () => ({
  calculateWinner: vi.fn().mockReturnValue({
    winnerId: "creator1",
    scores: { creator1: 1, opponent1: 0 },
  }),
}));

// ============================================================================
// DB mock factory
// ============================================================================

function createTxMock(opts: { existingState?: unknown; forUpdateResult?: unknown[] }) {
  const whereFn = vi.fn();
  const setFn = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  const updateFn = vi.fn().mockReturnValue({ set: setFn });

  if (opts.forUpdateResult !== undefined) {
    whereFn.mockReturnValue({
      for: vi.fn().mockResolvedValue(opts.forUpdateResult),
    });
  } else if (opts.existingState) {
    whereFn.mockReturnValue({
      for: vi.fn().mockResolvedValue([opts.existingState]),
    });
  } else {
    whereFn.mockReturnValue({
      for: vi.fn().mockResolvedValue([]),
    });
  }

  const insertValuesFn = vi.fn().mockResolvedValue(undefined);
  const insertFn = vi.fn().mockReturnValue({ values: insertValuesFn });

  const tx = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({ where: whereFn }),
    }),
    insert: insertFn,
    update: updateFn,
    _setFn: setFn,
    _insertValuesFn: insertValuesFn,
    _whereFn: whereFn,
  };

  return tx;
}

type TxFn = (tx: unknown) => Promise<unknown>;

function createDbMock(
  opts: {
    txCallback?: (cb: TxFn) => Promise<unknown>;
    voteState?: unknown;
    battle?: unknown;
  } = {}
) {
  const onConflictDoUpdateFn = vi.fn().mockResolvedValue(undefined);
  const insertValuesFn = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictDoUpdateFn });
  const insertFn = vi.fn().mockReturnValue({ values: insertValuesFn });

  const dbSetFn = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  const dbUpdateFn = vi.fn().mockReturnValue({ set: dbSetFn });

  const transactionFn = vi
    .fn()
    .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      if (opts.txCallback) return opts.txCallback(cb);
      const tx = createTxMock({});
      return cb(tx);
    });

  const selectWhereFn = vi.fn();
  if (opts.voteState !== undefined) {
    selectWhereFn.mockResolvedValue(opts.voteState ? [opts.voteState] : []);
  } else {
    selectWhereFn.mockResolvedValue([]);
  }

  const db = {
    transaction: transactionFn,
    insert: insertFn,
    update: dbUpdateFn,
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: selectWhereFn,
      }),
    }),
    _dbUpdateFn: dbUpdateFn,
    _dbSetFn: dbSetFn,
  };

  return db;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock container requires flexible typing
const dbContainer = vi.hoisted(() => ({ current: null as Record<string, any> | null }));

vi.mock("../../../db", () => ({
  getDb: () => dbContainer.current,
}));

import { initializeVoting, castVote, getBattleVoteState } from "../service";

describe("initializeVoting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates new voting state when none exists", async () => {
    const tx = createTxMock({});
    dbContainer.current = createDbMock({
      txCallback: async (cb) => cb(tx),
    });

    const result = await initializeVoting({
      eventId: "e1",
      battleId: "b1",
      creatorId: "creator1",
      opponentId: "opponent1",
    });

    expect(result.success).toBe(true);
    expect(result.alreadyInitialized).toBe(false);
    expect(tx._insertValuesFn).toHaveBeenCalled();
  });

  it("returns alreadyInitialized when state exists and eventId was processed", async () => {
    const existing = {
      status: "voting",
      processedEventIds: ["e1"],
    };
    const tx = createTxMock({ existingState: existing });
    dbContainer.current = createDbMock({
      txCallback: async (cb) => cb(tx),
    });

    const result = await initializeVoting({
      eventId: "e1",
      battleId: "b1",
      creatorId: "creator1",
      opponentId: "opponent1",
    });

    expect(result.success).toBe(true);
    expect(result.alreadyInitialized).toBe(true);
  });

  it("returns alreadyInitialized when state exists with different eventId", async () => {
    const existing = {
      status: "voting",
      processedEventIds: ["other-event"],
    };
    const tx = createTxMock({ existingState: existing });
    dbContainer.current = createDbMock({
      txCallback: async (cb) => cb(tx),
    });

    const result = await initializeVoting({
      eventId: "e1",
      battleId: "b1",
      creatorId: "creator1",
      opponentId: "opponent1",
    });

    expect(result.success).toBe(true);
    expect(result.alreadyInitialized).toBe(true);
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it("returns error when DB throws", async () => {
    dbContainer.current = createDbMock({
      txCallback: async () => {
        throw new Error("DB error");
      },
    });

    const result = await initializeVoting({
      eventId: "e1",
      battleId: "b1",
      creatorId: "creator1",
      opponentId: "opponent1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to initialize voting");
    expect(mockLogger.error).toHaveBeenCalled();
  });
});

describe("castVote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to legacy when no vote state exists", async () => {
    // castVoteLegacy uses getDb() (not tx) to look up the battle
    const battle = {
      id: "b1",
      creatorId: "creator1",
      opponentId: "opponent1",
    };

    // The tx inside the transaction returns [] for FOR UPDATE (no vote state)
    // Then castVoteLegacy calls getDb() again for battle + votes lookups
    const tx = createTxMock({ forUpdateResult: [] });

    let outerSelectCount = 0;
    const onConflictDoUpdateFn = vi.fn().mockResolvedValue(undefined);
    const outerInsertValuesFn = vi
      .fn()
      .mockReturnValue({ onConflictDoUpdate: onConflictDoUpdateFn });
    const outerInsertFn = vi.fn().mockReturnValue({ values: outerInsertValuesFn });

    const db = {
      transaction: vi
        .fn()
        .mockImplementation(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
      insert: outerInsertFn,
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            outerSelectCount++;
            // 1st outer select: battle lookup
            if (outerSelectCount === 1) return Promise.resolve([battle]);
            // 2nd outer select: votes lookup (only creator voted)
            return Promise.resolve([{ odv: "creator1", vote: "clean", createdAt: new Date() }]);
          }),
        }),
      }),
    };

    dbContainer.current = db;

    const result = await castVote({
      eventId: "e1",
      battleId: "b1",
      odv: "creator1",
      vote: "clean",
    });

    expect(result.success).toBe(true);
    expect(result.battleComplete).toBe(false);
  });

  it("returns alreadyProcessed for duplicate eventId", async () => {
    const state = {
      battleId: "b1",
      creatorId: "creator1",
      opponentId: "opponent1",
      status: "completed",
      processedEventIds: ["e1"],
      votes: [],
      winnerId: "creator1",
    };
    const tx = createTxMock({ existingState: state });
    dbContainer.current = createDbMock({
      txCallback: async (cb) => cb(tx),
    });

    const result = await castVote({
      eventId: "e1",
      battleId: "b1",
      odv: "creator1",
      vote: "clean",
    });

    expect(result.success).toBe(true);
    expect(result.alreadyProcessed).toBe(true);
    expect(result.battleComplete).toBe(true);
    expect(result.winnerId).toBe("creator1");
  });

  it("returns error when voting is not active", async () => {
    const state = {
      battleId: "b1",
      creatorId: "creator1",
      opponentId: "opponent1",
      status: "completed",
      processedEventIds: [],
      votes: [],
    };
    const tx = createTxMock({ existingState: state });
    dbContainer.current = createDbMock({
      txCallback: async (cb) => cb(tx),
    });

    const result = await castVote({
      eventId: "e1",
      battleId: "b1",
      odv: "creator1",
      vote: "clean",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Voting is not active");
  });

  it("returns error when deadline has passed", async () => {
    const state = {
      battleId: "b1",
      creatorId: "creator1",
      opponentId: "opponent1",
      status: "voting",
      processedEventIds: [],
      votes: [],
      voteDeadlineAt: new Date("2020-01-01"),
    };
    const tx = createTxMock({ existingState: state });
    dbContainer.current = createDbMock({
      txCallback: async (cb) => cb(tx),
    });

    const result = await castVote({
      eventId: "e1",
      battleId: "b1",
      odv: "creator1",
      vote: "clean",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Voting deadline has passed");
  });

  it("returns error when user is not a participant", async () => {
    const state = {
      battleId: "b1",
      creatorId: "creator1",
      opponentId: "opponent1",
      status: "voting",
      processedEventIds: [],
      votes: [],
      voteDeadlineAt: new Date(Date.now() + 60000),
    };
    const tx = createTxMock({ existingState: state });
    dbContainer.current = createDbMock({
      txCallback: async (cb) => cb(tx),
    });

    const result = await castVote({
      eventId: "e1",
      battleId: "b1",
      odv: "stranger",
      vote: "clean",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Not a participant in this battle");
  });

  it("records first vote without completing battle", async () => {
    const state = {
      battleId: "b1",
      creatorId: "creator1",
      opponentId: "opponent1",
      status: "voting",
      processedEventIds: [],
      votes: [],
      voteDeadlineAt: new Date(Date.now() + 60000),
    };
    const tx = createTxMock({ existingState: state });
    dbContainer.current = createDbMock({
      txCallback: async (cb) => cb(tx),
    });

    const result = await castVote({
      eventId: "e1",
      battleId: "b1",
      odv: "creator1",
      vote: "clean",
    });

    expect(result.success).toBe(true);
    expect(result.battleComplete).toBe(false);
  });

  it("completes battle when both players have voted", async () => {
    const state = {
      battleId: "b1",
      creatorId: "creator1",
      opponentId: "opponent1",
      status: "voting",
      processedEventIds: [],
      votes: [{ odv: "creator1", vote: "clean", votedAt: "2024-01-01" }],
      voteDeadlineAt: new Date(Date.now() + 60000),
    };
    const tx = createTxMock({ existingState: state });
    dbContainer.current = createDbMock({
      txCallback: async (cb) => cb(tx),
    });

    const result = await castVote({
      eventId: "e2",
      battleId: "b1",
      odv: "opponent1",
      vote: "sketch",
    });

    expect(result.success).toBe(true);
    expect(result.battleComplete).toBe(true);
    expect(result.winnerId).toBe("creator1");
  });

  it("updates existing vote (double-vote handling)", async () => {
    const state = {
      battleId: "b1",
      creatorId: "creator1",
      opponentId: "opponent1",
      status: "voting",
      processedEventIds: [],
      votes: [{ odv: "creator1", vote: "sketch", votedAt: "2024-01-01" }],
      voteDeadlineAt: new Date(Date.now() + 60000),
    };
    const tx = createTxMock({ existingState: state });
    dbContainer.current = createDbMock({
      txCallback: async (cb) => cb(tx),
    });

    const result = await castVote({
      eventId: "e2",
      battleId: "b1",
      odv: "creator1",
      vote: "clean",
    });

    expect(result.success).toBe(true);
    expect(result.battleComplete).toBe(false);
    expect(mockLogger.info).toHaveBeenCalledWith(
      "[BattleState] Vote updated",
      expect.objectContaining({ odv: "creator1", vote: "clean" })
    );
  });

  it("returns error when DB throws", async () => {
    dbContainer.current = createDbMock({
      txCallback: async () => {
        throw new Error("DB error");
      },
    });

    const result = await castVote({
      eventId: "e1",
      battleId: "b1",
      odv: "creator1",
      vote: "clean",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to cast vote");
    expect(mockLogger.error).toHaveBeenCalled();
  });
});

describe("getBattleVoteState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no state exists", async () => {
    dbContainer.current = createDbMock({ voteState: undefined });

    const result = await getBattleVoteState("b1");
    expect(result).toBeNull();
  });

  it("returns mapped state data when row exists", async () => {
    const row = {
      battleId: "b1",
      creatorId: "creator1",
      opponentId: "opponent1",
      status: "voting",
      votes: [{ odv: "creator1", vote: "clean", votedAt: "2024-01-01" }],
      votingStartedAt: new Date("2024-01-01"),
      voteDeadlineAt: new Date("2024-01-02"),
      winnerId: null,
      processedEventIds: ["e1"],
    };
    dbContainer.current = createDbMock({ voteState: row });

    const result = await getBattleVoteState("b1");

    expect(result).not.toBeNull();
    expect(result!.battleId).toBe("b1");
    expect(result!.status).toBe("voting");
    expect(result!.winnerId).toBeUndefined();
  });

  it("returns null and logs error when DB throws", async () => {
    dbContainer.current = createDbMock();
    dbContainer.current.select = vi.fn().mockImplementation(() => {
      throw new Error("DB error");
    });

    const result = await getBattleVoteState("b1");

    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
