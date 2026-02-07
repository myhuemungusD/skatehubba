/**
 * @fileoverview Unit tests for BattleStateService
 * @module server/__tests__/battleStateService.test
 *
 * Tests battle voting with PostgreSQL transactions:
 * - Vote timeouts
 * - Tie handling
 * - Double-vote protection
 * - Participant validation
 * - Idempotency
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
        const row = store.get(id);
        return row ? [row] : [];
      }
      return Array.from(store.values());
    }
    if (op === "insert") {
      const id = insertData?.id ?? insertData?.battleId ?? `auto-${Date.now()}`;
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
const { initializeVoting, castVote, getBattleVoteState, generateEventId } =
  await import("../services/battleStateService");

describe("BattleStateService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const store of Object.values(stores)) {
      store.clear();
    }
  });

  // =============================================================================
  // INITIALIZE VOTING TESTS
  // =============================================================================

  describe("initializeVoting", () => {
    it("should initialize voting state with deadline", async () => {
      const result = await initializeVoting({
        eventId: "init-event-1",
        battleId: "battle-123",
        creatorId: "player-1",
        opponentId: "player-2",
      });

      expect(result.success).toBe(true);

      const state = stores.battleVoteState.get("battle-123");
      expect(state).toBeDefined();
      expect(state.status).toBe("voting");
      expect(state.creatorId).toBe("player-1");
      expect(state.opponentId).toBe("player-2");
      expect(state.votes).toHaveLength(0);
      expect(state.voteDeadlineAt).toBeDefined();
      expect(state.votingStartedAt).toBeDefined();
    });

    it("should not overwrite existing votes when called multiple times", async () => {
      // First call - initialize voting
      const result1 = await initializeVoting({
        eventId: "init-event-1",
        battleId: "battle-456",
        creatorId: "player-1",
        opponentId: "player-2",
      });

      expect(result1.success).toBe(true);
      expect(result1.alreadyInitialized).toBeFalsy();

      // Simulate some votes being cast
      const state = stores.battleVoteState.get("battle-456");
      state.votes = [{ odv: "player-1", vote: "clean", votedAt: new Date().toISOString() }];
      state.processedEventIds.push("vote-event-1");

      // Second call - should not overwrite existing state
      const result2 = await initializeVoting({
        eventId: "init-event-2",
        battleId: "battle-456",
        creatorId: "player-1",
        opponentId: "player-2",
      });

      expect(result2.success).toBe(true);
      expect(result2.alreadyInitialized).toBe(true);

      // Verify votes and processedEventIds were not cleared
      const finalState = stores.battleVoteState.get("battle-456");
      expect(finalState.votes).toHaveLength(1);
      expect(finalState.votes[0].odv).toBe("player-1");
      expect(finalState.processedEventIds).toContain("vote-event-1");
      expect(finalState.processedEventIds).not.toContain("init-event-2");
    });
  });

  // =============================================================================
  // CAST VOTE TESTS
  // =============================================================================

  describe("castVote", () => {
    beforeEach(() => {
      // Setup: Voting state
      const now = new Date();
      stores.battleVoteState.set("voting-battle", {
        battleId: "voting-battle",
        creatorId: "player-1",
        opponentId: "player-2",
        status: "voting",
        votes: [],
        votingStartedAt: now,
        voteDeadlineAt: new Date(now.getTime() + 60000),
        winnerId: null,
        processedEventIds: [],
        createdAt: now,
        updatedAt: now,
      });
    });

    it("should record a vote from participant", async () => {
      const result = await castVote({
        eventId: "vote-event-1",
        battleId: "voting-battle",
        odv: "player-1",
        vote: "clean",
      });

      expect(result.success).toBe(true);
      expect(result.battleComplete).toBe(false);
    });

    it("should complete battle when both players vote", async () => {
      // First vote
      await castVote({
        eventId: "vote-event-2",
        battleId: "voting-battle",
        odv: "player-1",
        vote: "clean",
      });

      // Second vote
      const result = await castVote({
        eventId: "vote-event-3",
        battleId: "voting-battle",
        odv: "player-2",
        vote: "clean",
      });

      expect(result.success).toBe(true);
      expect(result.battleComplete).toBe(true);
      expect(result.winnerId).toBeDefined();
      expect(result.finalScore).toBeDefined();
    });

    it("should handle tie by awarding win to creator", async () => {
      // Both vote sketch (no points) - tie
      await castVote({
        eventId: "vote-event-4a",
        battleId: "voting-battle",
        odv: "player-1",
        vote: "sketch",
      });

      const result = await castVote({
        eventId: "vote-event-4b",
        battleId: "voting-battle",
        odv: "player-2",
        vote: "sketch",
      });

      expect(result.success).toBe(true);
      expect(result.battleComplete).toBe(true);
      // Creator wins on tie
      expect(result.winnerId).toBe("player-1");
    });

    it("should allow updating existing vote (double-vote protection)", async () => {
      // First vote
      await castVote({
        eventId: "vote-event-5a",
        battleId: "voting-battle",
        odv: "player-1",
        vote: "sketch",
      });

      // Same player votes again - should update not duplicate
      const result = await castVote({
        eventId: "vote-event-5b",
        battleId: "voting-battle",
        odv: "player-1",
        vote: "clean", // Changed vote
      });

      expect(result.success).toBe(true);
      // Vote should be updated, not added - still waiting for player-2
      expect(result.battleComplete).toBe(false);
    });

    it("should reject vote from non-participant", async () => {
      const result = await castVote({
        eventId: "vote-event-6",
        battleId: "voting-battle",
        odv: "player-3", // Not in battle
        vote: "clean",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Not a participant in this battle");
    });

    it("should reject vote when voting is not active", async () => {
      const state = stores.battleVoteState.get("voting-battle");
      state.status = "completed";

      const result = await castVote({
        eventId: "vote-event-7",
        battleId: "voting-battle",
        odv: "player-1",
        vote: "clean",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Voting is not active");
    });

    it("should handle idempotent votes", async () => {
      const eventId = "duplicate-vote-event";
      const state = stores.battleVoteState.get("voting-battle");
      state.processedEventIds = [eventId];

      const result = await castVote({
        eventId,
        battleId: "voting-battle",
        odv: "player-1",
        vote: "clean",
      });

      expect(result.success).toBe(true);
      expect(result.alreadyProcessed).toBe(true);
    });
  });

  // =============================================================================
  // SCORING TESTS
  // =============================================================================

  describe("scoring logic", () => {
    beforeEach(() => {
      const now = new Date();
      stores.battleVoteState.set("score-battle", {
        battleId: "score-battle",
        creatorId: "player-1",
        opponentId: "player-2",
        status: "voting",
        votes: [],
        votingStartedAt: now,
        voteDeadlineAt: new Date(now.getTime() + 60000),
        winnerId: null,
        processedEventIds: [],
        createdAt: now,
        updatedAt: now,
      });
    });

    it("should award point to opponent when voting clean", async () => {
      // Player 1 votes clean on player 2's trick
      await castVote({
        eventId: "score-event-1a",
        battleId: "score-battle",
        odv: "player-1",
        vote: "clean",
      });

      // Player 2 votes sketch on player 1's trick
      const result = await castVote({
        eventId: "score-event-1b",
        battleId: "score-battle",
        odv: "player-2",
        vote: "sketch",
      });

      expect(result.success).toBe(true);
      expect(result.battleComplete).toBe(true);
      // Player 2 got a clean vote, player 1 got sketch
      // Player 2 should win with 1 point vs 0
      expect(result.winnerId).toBe("player-2");
      expect(result.finalScore!["player-2"]).toBe(1);
      expect(result.finalScore!["player-1"]).toBe(0);
    });

    it("should correctly handle both clean votes", async () => {
      await castVote({
        eventId: "score-event-2a",
        battleId: "score-battle",
        odv: "player-1",
        vote: "clean",
      });

      const result = await castVote({
        eventId: "score-event-2b",
        battleId: "score-battle",
        odv: "player-2",
        vote: "clean",
      });

      expect(result.success).toBe(true);
      expect(result.battleComplete).toBe(true);
      // Both voted clean - tie, creator wins
      expect(result.finalScore!["player-1"]).toBe(1);
      expect(result.finalScore!["player-2"]).toBe(1);
      expect(result.winnerId).toBe("player-1"); // Tie-breaker
    });
  });

  // =============================================================================
  // EVENT ID GENERATION
  // =============================================================================

  describe("generateEventId", () => {
    it("should generate unique event IDs", () => {
      const id1 = generateEventId("vote", "player-1", "battle-1");
      const id2 = generateEventId("vote", "player-1", "battle-1");

      expect(id1).not.toBe(id2);
      expect(id1).toContain("vote");
      expect(id1).toContain("battle-1");
      expect(id1).toContain("player-1");
    });
  });
});
