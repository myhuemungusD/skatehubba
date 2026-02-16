/**
 * @fileoverview Extended unit tests for BattleStateService
 * @module server/__tests__/battleStateService-extended.test
 *
 * Covers gaps not addressed by the original test file:
 * - processVoteTimeouts() (lines 410-497)
 * - castVoteLegacy() fallback path (lines 298-365)
 * - getBattleVoteState() (lines 503-527)
 * - castVote edge case: voting deadline passed
 * - Error/catch block paths
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock environment
vi.mock("../config/env", () => ({
  env: {
    DATABASE_URL: "mock://test",
    NODE_ENV: "test",
  },
}));

// Mock logger
vi.mock("../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock analytics
vi.mock("../services/analyticsService", () => ({
  logServerEvent: vi.fn().mockResolvedValue(undefined),
}));

// Mock drizzle-orm operators to return inspectable objects
vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ _op: "eq", col, val }),
  and: (...conditions: any[]) => ({ _op: "and", conditions }),
  lt: (col: any, val: any) => ({ _op: "lt", col, val }),
}));

// Mock schema table references
vi.mock("@shared/schema", () => ({
  battleVoteState: {
    _table: "battleVoteState",
    battleId: { name: "battleId", _isPrimary: true },
    status: { name: "status" },
    voteDeadlineAt: { name: "voteDeadlineAt" },
  },
  battles: {
    _table: "battles",
    id: { name: "id", _isPrimary: true },
    status: { name: "status" },
  },
  battleVotes: {
    _table: "battleVotes",
    battleId: { name: "battleId", _isPrimary: true },
    odv: { name: "odv" },
  },
}));

// ============================================================================
// In-memory Drizzle mock (multi-table)
// ============================================================================

const stores: Record<string, Map<string, any>> = {
  battleVoteState: new Map(),
  battles: new Map(),
  battleVotes: new Map(),
};

function extractPrimaryId(where: any): string | null {
  if (!where) return null;
  if (where._op === "eq" && where.col?._isPrimary) return where.val;
  if (where._op === "and") {
    for (const c of where.conditions) {
      const id = extractPrimaryId(c);
      if (id) return id;
    }
  }
  return null;
}

function getStore(tableName: string): Map<string, any> {
  if (!stores[tableName]) stores[tableName] = new Map();
  return stores[tableName];
}

function createQueryChain() {
  let op = "select";
  let currentTable = "";
  let setData: any = null;
  let insertData: any = null;
  let whereClause: any = null;
  let hasReturning = false;

  const resolve = () => {
    const store = getStore(currentTable);

    if (op === "select") {
      const id = extractPrimaryId(whereClause);
      if (id) {
        // For battleVotes, keys are composite (battleId:odv), so filter by prefix
        if (currentTable === "battleVotes") {
          const results: any[] = [];
          for (const [key, val] of store.entries()) {
            if (key === id || key.startsWith(id + ":")) {
              results.push(val);
            }
          }
          return results;
        }
        const row = store.get(id);
        return row ? [row] : [];
      }
      return Array.from(store.values());
    }
    if (op === "insert") {
      let id: string;
      if (currentTable === "battleVotes" && insertData?.battleId && insertData?.odv) {
        id = `${insertData.battleId}:${insertData.odv}`;
      } else {
        id = insertData?.id ?? insertData?.battleId ?? `auto-${Date.now()}`;
      }
      store.set(id, { ...insertData });
      return hasReturning ? [{ ...insertData }] : undefined;
    }
    if (op === "update") {
      const id = extractPrimaryId(whereClause);
      if (id && store.has(id)) {
        const updated = { ...store.get(id), ...setData };
        store.set(id, updated);
        return hasReturning ? [{ ...updated }] : undefined;
      }
      return hasReturning ? [] : undefined;
    }
    return undefined;
  };

  const chain: any = {};
  const reset = (newOp: string, table?: string) => {
    op = newOp;
    if (table !== undefined) currentTable = table;
    setData = null;
    insertData = null;
    whereClause = null;
    hasReturning = false;
  };

  chain.select = vi.fn(() => {
    reset("select");
    return chain;
  });
  chain.from = vi.fn((table: any) => {
    currentTable = table?._table || "";
    return chain;
  });
  chain.where = vi.fn((condition: any) => {
    whereClause = condition;
    return chain;
  });
  chain.for = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.insert = vi.fn((table: any) => {
    reset("insert", table?._table || "");
    return chain;
  });
  chain.values = vi.fn((data: any) => {
    insertData = data;
    return chain;
  });
  chain.update = vi.fn((table: any) => {
    reset("update", table?._table || "");
    return chain;
  });
  chain.set = vi.fn((data: any) => {
    setData = data;
    return chain;
  });
  chain.returning = vi.fn(() => {
    hasReturning = true;
    return chain;
  });
  chain.onConflictDoUpdate = vi.fn(() => chain);
  chain.target = vi.fn(() => chain);

  chain.then = (onFulfilled: any, onRejected?: any) => {
    try {
      return Promise.resolve(resolve()).then(onFulfilled, onRejected);
    } catch (e) {
      return onRejected ? Promise.reject(e).catch(onRejected) : Promise.reject(e);
    }
  };

  return chain;
}

const mockChain = createQueryChain();

vi.mock("../db", () => ({
  getDb: () => ({
    ...mockChain,
    transaction: vi.fn(async (callback: any) => callback(mockChain)),
  }),
}));

// Import after mocking
const { initializeVoting, castVote, getBattleVoteState, processVoteTimeouts } =
  await import("../services/battleStateService");

import logger from "../logger";

describe("BattleStateService - Extended Coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const store of Object.values(stores)) {
      store.clear();
    }
  });

  // =============================================================================
  // processVoteTimeouts TESTS
  // =============================================================================

  describe("processVoteTimeouts", () => {
    it("should process timeout when creator voted but opponent did not (opponent_timeout)", async () => {
      const pastDeadline = new Date(Date.now() - 10000);
      stores.battleVoteState.set("timeout-battle-1", {
        battleId: "timeout-battle-1",
        creatorId: "player-1",
        opponentId: "player-2",
        status: "voting",
        votes: [{ odv: "player-1", vote: "clean", votedAt: new Date().toISOString() }],
        votingStartedAt: new Date(Date.now() - 70000),
        voteDeadlineAt: pastDeadline,
        winnerId: null,
        processedEventIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Also add to battles store so the update works
      stores.battles.set("timeout-battle-1", {
        id: "timeout-battle-1",
        creatorId: "player-1",
        opponentId: "player-2",
        status: "voting",
      });

      await processVoteTimeouts();

      const state = stores.battleVoteState.get("timeout-battle-1");
      expect(state.status).toBe("completed");
      expect(state.winnerId).toBe("player-1");
    });

    it("should process timeout when opponent voted but creator did not (creator_timeout)", async () => {
      const pastDeadline = new Date(Date.now() - 10000);
      stores.battleVoteState.set("timeout-battle-2", {
        battleId: "timeout-battle-2",
        creatorId: "player-1",
        opponentId: "player-2",
        status: "voting",
        votes: [{ odv: "player-2", vote: "clean", votedAt: new Date().toISOString() }],
        votingStartedAt: new Date(Date.now() - 70000),
        voteDeadlineAt: pastDeadline,
        winnerId: null,
        processedEventIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      stores.battles.set("timeout-battle-2", {
        id: "timeout-battle-2",
        creatorId: "player-1",
        opponentId: "player-2",
        status: "voting",
      });

      await processVoteTimeouts();

      const state = stores.battleVoteState.get("timeout-battle-2");
      expect(state.status).toBe("completed");
      expect(state.winnerId).toBe("player-2");
    });

    it("should process timeout when neither player voted (both_timeout, creator wins)", async () => {
      const pastDeadline = new Date(Date.now() - 10000);
      stores.battleVoteState.set("timeout-battle-3", {
        battleId: "timeout-battle-3",
        creatorId: "player-1",
        opponentId: "player-2",
        status: "voting",
        votes: [],
        votingStartedAt: new Date(Date.now() - 70000),
        voteDeadlineAt: pastDeadline,
        winnerId: null,
        processedEventIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      stores.battles.set("timeout-battle-3", {
        id: "timeout-battle-3",
        creatorId: "player-1",
        opponentId: "player-2",
        status: "voting",
      });

      await processVoteTimeouts();

      const state = stores.battleVoteState.get("timeout-battle-3");
      expect(state.status).toBe("completed");
      expect(state.winnerId).toBe("player-1");
    });

    it("should be idempotent - skip already processed timeout events", async () => {
      const pastDeadline = new Date(Date.now() - 10000);
      const sequenceKey = `deadline-${pastDeadline.toISOString()}`;
      // Pre-compute the eventId that processVoteTimeouts will generate
      const expectedEventId = `timeout-timeout-battle-4-timeout-battle-4-${sequenceKey}`;

      stores.battleVoteState.set("timeout-battle-4", {
        battleId: "timeout-battle-4",
        creatorId: "player-1",
        opponentId: "player-2",
        status: "voting",
        votes: [],
        votingStartedAt: new Date(Date.now() - 70000),
        voteDeadlineAt: pastDeadline,
        winnerId: null,
        processedEventIds: [expectedEventId],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      stores.battles.set("timeout-battle-4", {
        id: "timeout-battle-4",
        creatorId: "player-1",
        opponentId: "player-2",
        status: "voting",
      });

      await processVoteTimeouts();

      // Status should remain "voting" because the event was already processed
      // and the function returned false (skipped), so no update occurred
      const state = stores.battleVoteState.get("timeout-battle-4");
      expect(state.status).toBe("voting");
    });

    it("should skip states that are no longer in voting status", async () => {
      const pastDeadline = new Date(Date.now() - 10000);
      stores.battleVoteState.set("timeout-battle-5", {
        battleId: "timeout-battle-5",
        creatorId: "player-1",
        opponentId: "player-2",
        status: "voting", // Initial query picks this up
        votes: [],
        votingStartedAt: new Date(Date.now() - 70000),
        voteDeadlineAt: pastDeadline,
        winnerId: null,
        processedEventIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Simulate a race condition: between the initial select and the
      // transaction, the status was changed to "completed"
      // Since our mock re-reads from the store in the transaction,
      // we change it after setup. We'll intercept the transaction call.
      const origStatus = stores.battleVoteState.get("timeout-battle-5");
      // Change status to completed before processVoteTimeouts processes it inside transaction
      origStatus.status = "completed";

      await processVoteTimeouts();

      // Should remain completed, not re-processed
      const state = stores.battleVoteState.get("timeout-battle-5");
      expect(state.status).toBe("completed");
      // winnerId should not have been set by timeout processing
      expect(state.winnerId).toBeNull();
    });

    it("should handle no expired states gracefully", async () => {
      // Store is empty - no expired states
      await processVoteTimeouts();
      // Should not throw
      expect(true).toBe(true);
    });

    it("should handle errors gracefully and log them", async () => {
      // We test the outer catch block by putting something that will
      // cause the initial select to fail. We can do this by temporarily
      // breaking the mock chain's resolve.
      const originalThen = mockChain.then;
      let callCount = 0;
      mockChain.then = (onFulfilled: any, onRejected?: any) => {
        callCount++;
        if (callCount === 1) {
          // First .then call (the initial select) throws
          return Promise.reject(new Error("DB connection failed")).catch(
            onRejected ||
              ((e: any) => {
                throw e;
              })
          );
        }
        return originalThen(onFulfilled, onRejected);
      };

      await processVoteTimeouts();

      // Restore
      mockChain.then = originalThen;

      expect(logger.error).toHaveBeenCalledWith(
        "[BattleState] Failed to process vote timeouts",
        expect.objectContaining({ error: expect.any(Error) })
      );
    });
  });

  // =============================================================================
  // castVoteLegacy TESTS (via castVote when no vote state row exists)
  // =============================================================================

  describe("castVoteLegacy (fallback path)", () => {
    it("should cast vote via legacy path when no vote state exists", async () => {
      // No battleVoteState row, but battle exists
      stores.battles.set("legacy-battle-1", {
        id: "legacy-battle-1",
        creatorId: "player-1",
        opponentId: "player-2",
        status: "active",
      });

      const result = await castVote({
        eventId: "legacy-vote-1",
        battleId: "legacy-battle-1",
        odv: "player-1",
        vote: "clean",
      });

      expect(result.success).toBe(true);
      expect(result.battleComplete).toBe(false);
    });

    it("should return battle not found error when battle doesn't exist", async () => {
      // No battleVoteState row and no battle row
      const result = await castVote({
        eventId: "legacy-vote-2",
        battleId: "nonexistent-battle",
        odv: "player-1",
        vote: "clean",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Battle not found");
    });

    it("should reject non-participant in legacy path", async () => {
      stores.battles.set("legacy-battle-2", {
        id: "legacy-battle-2",
        creatorId: "player-1",
        opponentId: "player-2",
        status: "active",
      });

      const result = await castVote({
        eventId: "legacy-vote-3",
        battleId: "legacy-battle-2",
        odv: "player-99", // Not a participant
        vote: "clean",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Not a participant");
    });

    it("should complete battle when both players vote via legacy path", async () => {
      stores.battles.set("legacy-battle-3", {
        id: "legacy-battle-3",
        creatorId: "player-1",
        opponentId: "player-2",
        status: "active",
      });

      // First vote (from player-1)
      const result1 = await castVote({
        eventId: "legacy-vote-4a",
        battleId: "legacy-battle-3",
        odv: "player-1",
        vote: "clean",
      });

      expect(result1.success).toBe(true);
      expect(result1.battleComplete).toBe(false);

      // Second vote (from player-2)
      const result2 = await castVote({
        eventId: "legacy-vote-4b",
        battleId: "legacy-battle-3",
        odv: "player-2",
        vote: "sketch",
      });

      expect(result2.success).toBe(true);
      expect(result2.battleComplete).toBe(true);
      expect(result2.winnerId).toBeDefined();
      expect(result2.finalScore).toBeDefined();
      // Player 1 voted clean (gives point to player-2's opponent = player-2 gets 1)
      // Player 2 voted sketch (no points)
      // player-2 wins with score 1 vs 0
      expect(result2.winnerId).toBe("player-2");
      expect(result2.finalScore!["player-2"]).toBe(1);
      expect(result2.finalScore!["player-1"]).toBe(0);
    });
  });

  // =============================================================================
  // getBattleVoteState TESTS
  // =============================================================================

  describe("getBattleVoteState", () => {
    it("should return state data when found", async () => {
      const now = new Date();
      stores.battleVoteState.set("state-battle-1", {
        battleId: "state-battle-1",
        creatorId: "player-1",
        opponentId: "player-2",
        status: "voting",
        votes: [{ odv: "player-1", vote: "clean", votedAt: now.toISOString() }],
        votingStartedAt: now,
        voteDeadlineAt: new Date(now.getTime() + 60000),
        winnerId: null,
        processedEventIds: ["event-1"],
        createdAt: now,
        updatedAt: now,
      });

      const result = await getBattleVoteState("state-battle-1");

      expect(result).not.toBeNull();
      expect(result!.battleId).toBe("state-battle-1");
      expect(result!.creatorId).toBe("player-1");
      expect(result!.opponentId).toBe("player-2");
      expect(result!.status).toBe("voting");
      expect(result!.votes).toHaveLength(1);
      expect(result!.votes[0].odv).toBe("player-1");
      expect(result!.votes[0].vote).toBe("clean");
      expect(result!.votingStartedAt).toBeDefined();
      expect(result!.voteDeadlineAt).toBeDefined();
      expect(result!.winnerId).toBeUndefined();
      expect(result!.processedEventIds).toContain("event-1");
    });

    it("should return null when state is not found", async () => {
      const result = await getBattleVoteState("nonexistent-battle");
      expect(result).toBeNull();
    });

    it("should return state with winnerId when battle is completed", async () => {
      const now = new Date();
      stores.battleVoteState.set("state-battle-2", {
        battleId: "state-battle-2",
        creatorId: "player-1",
        opponentId: "player-2",
        status: "completed",
        votes: [
          { odv: "player-1", vote: "clean", votedAt: now.toISOString() },
          { odv: "player-2", vote: "sketch", votedAt: now.toISOString() },
        ],
        votingStartedAt: now,
        voteDeadlineAt: new Date(now.getTime() + 60000),
        winnerId: "player-2",
        processedEventIds: ["event-1", "event-2"],
        createdAt: now,
        updatedAt: now,
      });

      const result = await getBattleVoteState("state-battle-2");

      expect(result).not.toBeNull();
      expect(result!.status).toBe("completed");
      expect(result!.winnerId).toBe("player-2");
      expect(result!.votes).toHaveLength(2);
    });

    it("should return null on error and log the error", async () => {
      // Temporarily break the chain to simulate DB error
      const originalThen = mockChain.then;
      let callCount = 0;
      mockChain.then = (onFulfilled: any, onRejected?: any) => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("DB error")).catch(
            onRejected ||
              ((e: any) => {
                throw e;
              })
          );
        }
        return originalThen(onFulfilled, onRejected);
      };

      const result = await getBattleVoteState("error-battle");

      // Restore
      mockChain.then = originalThen;

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        "[BattleState] Failed to get vote state",
        expect.objectContaining({
          error: expect.any(Error),
          battleId: "error-battle",
        })
      );
    });
  });

  // =============================================================================
  // castVote EDGE CASES
  // =============================================================================

  describe("castVote edge cases", () => {
    it("should reject vote when voting deadline has passed", async () => {
      const now = new Date();
      stores.battleVoteState.set("expired-battle", {
        battleId: "expired-battle",
        creatorId: "player-1",
        opponentId: "player-2",
        status: "voting",
        votes: [],
        votingStartedAt: new Date(now.getTime() - 120000),
        voteDeadlineAt: new Date(now.getTime() - 10000), // Deadline in the past
        winnerId: null,
        processedEventIds: [],
        createdAt: now,
        updatedAt: now,
      });

      const result = await castVote({
        eventId: "late-vote-1",
        battleId: "expired-battle",
        odv: "player-1",
        vote: "clean",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Voting deadline has passed");
    });

    it("should handle error in castVote and return failure", async () => {
      // Temporarily break the chain to simulate DB error in transaction
      const originalThen = mockChain.then;
      let callCount = 0;
      mockChain.then = (onFulfilled: any, onRejected?: any) => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("Transaction failed")).catch(
            onRejected ||
              ((e: any) => {
                throw e;
              })
          );
        }
        return originalThen(onFulfilled, onRejected);
      };

      const result = await castVote({
        eventId: "error-vote-1",
        battleId: "any-battle",
        odv: "player-1",
        vote: "clean",
      });

      // Restore
      mockChain.then = originalThen;

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to cast vote");
      expect(logger.error).toHaveBeenCalledWith(
        "[BattleState] Failed to cast vote",
        expect.objectContaining({
          error: expect.any(Error),
          battleId: "any-battle",
          odv: "player-1",
        })
      );
    });
  });

  // =============================================================================
  // initializeVoting ERROR PATH
  // =============================================================================

  describe("initializeVoting error path", () => {
    it("should handle error and return failure", async () => {
      const originalThen = mockChain.then;
      let callCount = 0;
      mockChain.then = (onFulfilled: any, onRejected?: any) => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("Init failed")).catch(
            onRejected ||
              ((e: any) => {
                throw e;
              })
          );
        }
        return originalThen(onFulfilled, onRejected);
      };

      const result = await initializeVoting({
        eventId: "error-init-1",
        battleId: "error-battle",
        creatorId: "player-1",
        opponentId: "player-2",
      });

      // Restore
      mockChain.then = originalThen;

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to initialize voting");
      expect(logger.error).toHaveBeenCalledWith(
        "[BattleState] Failed to initialize voting",
        expect.objectContaining({
          error: expect.any(Error),
          battleId: "error-battle",
        })
      );
    });
  });
});
