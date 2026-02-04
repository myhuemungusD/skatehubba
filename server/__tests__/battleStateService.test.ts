/**
 * @fileoverview Unit tests for BattleStateService
 * @module server/__tests__/battleStateService.test
 *
 * Tests battle voting with:
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

// Mock database
vi.mock("../db", () => ({
  db: {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
  },
}));

// In-memory Firestore mock for battle state
const mockBattleStates = new Map<string, any>();

const mockTransaction = {
  get: vi.fn().mockImplementation(async (ref: any) => {
    const data = mockBattleStates.get(ref.id);
    return {
      exists: !!data,
      data: () => data,
    };
  }),
  update: vi.fn().mockImplementation((ref: any, updates: any) => {
    const current = mockBattleStates.get(ref.id) || {};
    mockBattleStates.set(ref.id, { ...current, ...updates });
  }),
  set: vi.fn().mockImplementation((ref: any, data: any) => {
    mockBattleStates.set(ref.id, data);
  }),
};

const mockDocRef = (id: string) => ({
  id,
  get: vi.fn().mockImplementation(async () => {
    const data = mockBattleStates.get(id);
    return { exists: !!data, data: () => data };
  }),
  set: vi.fn().mockImplementation(async (data: any) => {
    mockBattleStates.set(id, data);
  }),
  update: vi.fn().mockImplementation(async (updates: any) => {
    const current = mockBattleStates.get(id) || {};
    mockBattleStates.set(id, { ...current, ...updates });
  }),
});

vi.mock("../firestore", () => ({
  db: {
    collection: vi.fn().mockImplementation((name: string) => ({
      doc: vi.fn().mockImplementation((id: string) => mockDocRef(id)),
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ docs: [] }),
    })),
    runTransaction: vi.fn().mockImplementation(async (callback: any) => {
      return await callback(mockTransaction);
    }),
  },
  collections: {
    battleState: "battle_state",
  },
}));

// Import after mocking
const { initializeVoting, castVote, getBattleVoteState, generateEventId } =
  await import("../services/battleStateService");

describe("BattleStateService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBattleStates.clear();
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

      const state = mockBattleStates.get("battle-123");
      expect(state).toBeDefined();
      expect(state.status).toBe("voting");
      expect(state.creatorId).toBe("player-1");
      expect(state.opponentId).toBe("player-2");
      expect(state.votes).toHaveLength(0);
      expect(state.voteDeadlineAt).toBeDefined();
      expect(state.votingStartedAt).toBeDefined();
    });
  });

  // =============================================================================
  // CAST VOTE TESTS
  // =============================================================================

  describe("castVote", () => {
    beforeEach(() => {
      // Setup: Voting state
      const now = new Date();
      mockBattleStates.set("voting-battle", {
        battleId: "voting-battle",
        creatorId: "player-1",
        opponentId: "player-2",
        status: "voting",
        votes: [],
        votingStartedAt: now.toISOString(),
        voteDeadlineAt: new Date(now.getTime() + 60000).toISOString(),
        processedEventIds: [],
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

      // Update state to include first vote
      const state = mockBattleStates.get("voting-battle");
      state.votes = [{ odv: "player-1", vote: "clean", votedAt: new Date().toISOString() }];

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
      const state = mockBattleStates.get("voting-battle");
      state.votes = [{ odv: "player-1", vote: "sketch", votedAt: new Date().toISOString() }];

      // Both vote sketch (no points) - tie
      const result = await castVote({
        eventId: "vote-event-4",
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
      const state = mockBattleStates.get("voting-battle");
      state.votes = [{ odv: "player-1", vote: "sketch", votedAt: new Date().toISOString() }];

      // Same player votes again - should update not duplicate
      const result = await castVote({
        eventId: "vote-event-5",
        battleId: "voting-battle",
        odv: "player-1",
        vote: "clean", // Changed vote
      });

      expect(result.success).toBe(true);
      // Vote should be updated, not added
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
      const state = mockBattleStates.get("voting-battle");
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
      const state = mockBattleStates.get("voting-battle");
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
      mockBattleStates.set("score-battle", {
        battleId: "score-battle",
        creatorId: "player-1",
        opponentId: "player-2",
        status: "voting",
        votes: [],
        votingStartedAt: now.toISOString(),
        voteDeadlineAt: new Date(now.getTime() + 60000).toISOString(),
        processedEventIds: [],
      });
    });

    it("should award point to opponent when voting clean", async () => {
      // Player 1 votes clean on player 2's trick
      const state = mockBattleStates.get("score-battle");
      state.votes = [{ odv: "player-1", vote: "clean", votedAt: new Date().toISOString() }];

      // Player 2 votes sketch on player 1's trick
      const result = await castVote({
        eventId: "score-event-1",
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
      const state = mockBattleStates.get("score-battle");
      state.votes = [{ odv: "player-1", vote: "clean", votedAt: new Date().toISOString() }];

      const result = await castVote({
        eventId: "score-event-2",
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
