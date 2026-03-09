/**
 * Unit tests for server/services/battle/timeout.ts
 *
 * Tests processVoteTimeouts with mocked DB and logger.
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
  battleVoteState: {
    status: { name: "status" },
    voteDeadlineAt: { name: "voteDeadlineAt" },
    battleId: { name: "battleId" },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ _op: "eq", col, val }),
  and: (...args: unknown[]) => ({ _op: "and", args }),
  lt: (col: unknown, val: unknown) => ({ _op: "lt", col, val }),
}));

// Mock idempotency
vi.mock("../idempotency", () => ({
  generateEventId: (_type: string, _odv: string, _battleId: string, _seq: string) =>
    `timeout-${_battleId}-${_odv}-${_seq}`,
  MAX_PROCESSED_EVENTS: 50,
}));

// DB mock
const mockTxWhere = vi.fn();
const mockTxUpdate = vi.fn();
const mockTxSet = vi.fn();

const mockDbUpdate = vi.fn();
const mockDbSet = vi.fn();

function createMockDb(expiredStates: unknown[]) {
  // Main select for expired states
  const selectMock = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(expiredStates),
    }),
  });

  // Transaction mock
  const transactionFn = vi
    .fn()
    .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const txSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: mockTxWhere,
        }),
      });

      mockTxSet.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
      mockTxUpdate.mockReturnValue({ set: mockTxSet });

      const tx = {
        select: txSelect,
        update: mockTxUpdate,
      };

      return cb(tx);
    });

  // Outer DB update for battles table
  mockDbSet.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  mockDbUpdate.mockReturnValue({ set: mockDbSet });

  const db = {
    select: selectMock,
    transaction: transactionFn,
    update: mockDbUpdate,
  };

  return db;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock container requires flexible typing
const dbContainer = vi.hoisted(() => ({ current: null as Record<string, any> | null }));

vi.mock("../../../db", () => ({
  getDb: () => dbContainer.current,
}));

import { processVoteTimeouts } from "../timeout";

describe("processVoteTimeouts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when no expired states exist", async () => {
    dbContainer.current = createMockDb([]);
    await processVoteTimeouts();
    expect(dbContainer.current.transaction).not.toHaveBeenCalled();
  });

  it("processes expired state where creator voted and opponent did not", async () => {
    const state = {
      battleId: "b1",
      voteDeadlineAt: new Date("2020-01-01"),
      status: "voting",
    };
    dbContainer.current = createMockDb([state]);

    const fresh = {
      battleId: "b1",
      creatorId: "creator1",
      opponentId: "opponent1",
      status: "voting",
      processedEventIds: [],
      votes: [{ odv: "creator1", vote: "clean", votedAt: "2020-01-01" }],
      voteDeadlineAt: new Date("2020-01-01"),
    };

    mockTxWhere.mockReturnValue({ for: vi.fn().mockResolvedValue([fresh]) });

    await processVoteTimeouts();

    expect(dbContainer.current.transaction).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      "[BattleState] Vote timeout processed",
      expect.objectContaining({
        battleId: "b1",
        winnerId: "creator1",
        reason: "opponent_timeout",
      })
    );
  });

  it("processes expired state where opponent voted and creator did not", async () => {
    const state = {
      battleId: "b2",
      voteDeadlineAt: new Date("2020-01-01"),
      status: "voting",
    };
    dbContainer.current = createMockDb([state]);

    const fresh = {
      battleId: "b2",
      creatorId: "creator1",
      opponentId: "opponent1",
      status: "voting",
      processedEventIds: [],
      votes: [{ odv: "opponent1", vote: "clean", votedAt: "2020-01-01" }],
      voteDeadlineAt: new Date("2020-01-01"),
    };

    mockTxWhere.mockReturnValue({ for: vi.fn().mockResolvedValue([fresh]) });

    await processVoteTimeouts();

    expect(mockLogger.info).toHaveBeenCalledWith(
      "[BattleState] Vote timeout processed",
      expect.objectContaining({
        winnerId: "opponent1",
        reason: "creator_timeout",
      })
    );
  });

  it("processes expired state where neither voted (creator wins by default)", async () => {
    const state = {
      battleId: "b3",
      voteDeadlineAt: new Date("2020-01-01"),
      status: "voting",
    };
    dbContainer.current = createMockDb([state]);

    const fresh = {
      battleId: "b3",
      creatorId: "creator1",
      opponentId: "opponent1",
      status: "voting",
      processedEventIds: [],
      votes: [],
      voteDeadlineAt: new Date("2020-01-01"),
    };

    mockTxWhere.mockReturnValue({ for: vi.fn().mockResolvedValue([fresh]) });

    await processVoteTimeouts();

    expect(mockLogger.info).toHaveBeenCalledWith(
      "[BattleState] Vote timeout processed",
      expect.objectContaining({
        winnerId: "creator1",
        reason: "both_timeout",
      })
    );
  });

  it("skips when fresh state is not found (row deleted)", async () => {
    const state = { battleId: "b4", voteDeadlineAt: new Date("2020-01-01") };
    dbContainer.current = createMockDb([state]);

    mockTxWhere.mockReturnValue({ for: vi.fn().mockResolvedValue([]) });

    await processVoteTimeouts();

    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("skips already-processed events (idempotency)", async () => {
    const state = {
      battleId: "b5",
      voteDeadlineAt: new Date("2020-01-01"),
    };
    dbContainer.current = createMockDb([state]);

    const eventId = `timeout-b5-b5-deadline-${new Date("2020-01-01").toISOString()}`;
    const fresh = {
      battleId: "b5",
      creatorId: "c1",
      opponentId: "o1",
      status: "voting",
      processedEventIds: [eventId],
      votes: [],
      voteDeadlineAt: new Date("2020-01-01"),
    };

    mockTxWhere.mockReturnValue({ for: vi.fn().mockResolvedValue([fresh]) });

    await processVoteTimeouts();

    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("skips when status is no longer voting", async () => {
    const state = { battleId: "b6", voteDeadlineAt: new Date("2020-01-01") };
    dbContainer.current = createMockDb([state]);

    const fresh = {
      battleId: "b6",
      creatorId: "c1",
      opponentId: "o1",
      status: "completed",
      processedEventIds: [],
      votes: [],
      voteDeadlineAt: new Date("2020-01-01"),
    };

    mockTxWhere.mockReturnValue({ for: vi.fn().mockResolvedValue([fresh]) });

    await processVoteTimeouts();

    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("logs error and does not throw when DB fails", async () => {
    dbContainer.current = createMockDb([]);
    dbContainer.current.select = vi.fn().mockImplementation(() => {
      throw new Error("DB connection failed");
    });

    await processVoteTimeouts(); // Should not throw

    expect(mockLogger.error).toHaveBeenCalledWith(
      "[BattleState] Failed to process vote timeouts",
      expect.objectContaining({ error: expect.any(Error) })
    );
  });
});
