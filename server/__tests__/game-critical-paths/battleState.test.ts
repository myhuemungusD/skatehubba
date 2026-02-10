/**
 * Battle State Transitions - Critical Path Tests
 *
 * Battle voting critical paths:
 * - Vote casting with completion detection
 * - Tie-breaking (creator wins as challenger)
 * - Scoring: clean votes = points for other player
 * - Double-vote protection (update allowed)
 * - Non-participant rejection
 * - Idempotency for votes
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { stores, clearAllStores, createQueryChain } from "./mockSetup";

// ============================================================================
// Mocks (hoisted by vitest)
// ============================================================================

vi.mock("../../config/env", () => ({
  env: {
    DATABASE_URL: "mock://test",
    NODE_ENV: "test",
  },
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

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ _op: "eq", col, val }),
  and: (...conditions: any[]) => ({ _op: "and", conditions }),
  lt: (col: any, val: any) => ({ _op: "lt", col, val }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ..._values: any[]) => ({ _sql: true, strings }),
    { raw: (s: string) => ({ _sql: true, raw: s }) }
  ),
}));

vi.mock("@shared/schema", () => ({
  gameSessions: {
    _table: "gameSessions",
    id: { name: "id", _isPrimary: true },
    status: { name: "status" },
    turnDeadlineAt: { name: "turnDeadlineAt" },
  },
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

const mockChain = createQueryChain();

vi.mock("../../db", () => ({
  getDb: () => ({
    ...mockChain,
    transaction: vi.fn(async (callback: any) => callback(mockChain)),
  }),
}));

// ============================================================================
// Imports after mocks
// ============================================================================

const { initializeVoting, castVote, getBattleVoteState } =
  await import("../../services/battleStateService");

// ============================================================================
// Tests
// ============================================================================

describe("Battle State Transitions - Critical Paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllStores();
  });

  describe("initializeVoting", () => {
    it("creates voting state for a new battle", async () => {
      const result = await initializeVoting({
        eventId: "evt-init",
        battleId: "battle-1",
        creatorId: "creator-1",
        opponentId: "opponent-1",
      });

      expect(result.success).toBe(true);
      expect(result.alreadyInitialized).toBe(false);

      const state = stores.battleVoteState.get("battle-1");
      expect(state).toBeDefined();
      expect(state.status).toBe("voting");
      expect(state.creatorId).toBe("creator-1");
      expect(state.opponentId).toBe("opponent-1");
      expect(state.votes).toHaveLength(0);
    });

    it("is idempotent for duplicate initialization", async () => {
      await initializeVoting({
        eventId: "evt-init",
        battleId: "battle-1",
        creatorId: "creator-1",
        opponentId: "opponent-1",
      });

      const result = await initializeVoting({
        eventId: "evt-init",
        battleId: "battle-1",
        creatorId: "creator-1",
        opponentId: "opponent-1",
      });

      expect(result.success).toBe(true);
      expect(result.alreadyInitialized).toBe(true);
    });
  });

  describe("castVote", () => {
    beforeEach(async () => {
      await initializeVoting({
        eventId: "evt-init",
        battleId: "battle-1",
        creatorId: "creator-1",
        opponentId: "opponent-1",
      });
    });

    it("records first vote without completing battle", async () => {
      const result = await castVote({
        eventId: "evt-vote-1",
        battleId: "battle-1",
        odv: "creator-1",
        vote: "clean",
      });

      expect(result.success).toBe(true);
      expect(result.battleComplete).toBe(false);
    });

    it("clean vote gives point to OTHER player (opponent wins 1-0)", async () => {
      await castVote({
        eventId: "evt-vote-1",
        battleId: "battle-1",
        odv: "creator-1",
        vote: "clean",
      });

      const result = await castVote({
        eventId: "evt-vote-2",
        battleId: "battle-1",
        odv: "opponent-1",
        vote: "sketch",
      });

      expect(result.success).toBe(true);
      expect(result.battleComplete).toBe(true);
      expect(result.winnerId).toBe("opponent-1");
      expect(result.finalScore).toEqual({ "creator-1": 0, "opponent-1": 1 });
    });

    it("tie goes to creator (challenger advantage)", async () => {
      await castVote({
        eventId: "evt-vote-1",
        battleId: "battle-1",
        odv: "creator-1",
        vote: "clean",
      });

      const result = await castVote({
        eventId: "evt-vote-2",
        battleId: "battle-1",
        odv: "opponent-1",
        vote: "clean",
      });

      expect(result.battleComplete).toBe(true);
      expect(result.winnerId).toBe("creator-1");
      expect(result.finalScore).toEqual({ "creator-1": 1, "opponent-1": 1 });
    });

    it("both sketch = 0-0 tie, creator wins", async () => {
      await castVote({
        eventId: "evt-vote-1",
        battleId: "battle-1",
        odv: "creator-1",
        vote: "sketch",
      });

      const result = await castVote({
        eventId: "evt-vote-2",
        battleId: "battle-1",
        odv: "opponent-1",
        vote: "sketch",
      });

      expect(result.battleComplete).toBe(true);
      expect(result.winnerId).toBe("creator-1");
      expect(result.finalScore).toEqual({ "creator-1": 0, "opponent-1": 0 });
    });

    it("rejects non-participant votes", async () => {
      const result = await castVote({
        eventId: "evt-vote-stranger",
        battleId: "battle-1",
        odv: "stranger",
        vote: "clean",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Not a participant");
    });

    it("allows vote update (double vote replaces existing)", async () => {
      await castVote({
        eventId: "evt-vote-1",
        battleId: "battle-1",
        odv: "creator-1",
        vote: "clean",
      });

      await castVote({
        eventId: "evt-vote-1b",
        battleId: "battle-1",
        odv: "creator-1",
        vote: "sketch",
      });

      const result = await castVote({
        eventId: "evt-vote-2",
        battleId: "battle-1",
        odv: "opponent-1",
        vote: "clean",
      });

      expect(result.battleComplete).toBe(true);
      expect(result.winnerId).toBe("creator-1");
    });

    it("deduplicates votes with same eventId", async () => {
      await castVote({
        eventId: "evt-vote-1",
        battleId: "battle-1",
        odv: "creator-1",
        vote: "clean",
      });

      const result = await castVote({
        eventId: "evt-vote-1",
        battleId: "battle-1",
        odv: "creator-1",
        vote: "clean",
      });

      expect(result.success).toBe(true);
      expect(result.alreadyProcessed).toBe(true);
    });
  });

  describe("getBattleVoteState", () => {
    it("returns null for nonexistent battle", async () => {
      const state = await getBattleVoteState("nonexistent");
      expect(state).toBeNull();
    });

    it("returns vote state after initialization", async () => {
      await initializeVoting({
        eventId: "evt-init",
        battleId: "battle-1",
        creatorId: "creator-1",
        opponentId: "opponent-1",
      });

      const state = await getBattleVoteState("battle-1");
      expect(state).not.toBeNull();
      expect(state!.battleId).toBe("battle-1");
      expect(state!.status).toBe("voting");
    });
  });
});
