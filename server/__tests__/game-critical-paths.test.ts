/**
 * @fileoverview Critical path tests for Game State Transitions
 *
 * Tests game state machine critical paths:
 * - Complete S.K.A.T.E. game lifecycle (create -> play -> win)
 * - Letter accumulation through full SKATE spelling
 * - Multi-player elimination sequences
 * - Disconnect/reconnect with game pause/resume
 * - Forfeit scenarios (voluntary, timeout, disconnect)
 * - Idempotency across all operations
 * - Turn rotation with eliminated player skipping
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

// ============================================================================
// Mocks - Game State
// ============================================================================

vi.mock("../config/env", () => ({
  env: {
    DATABASE_URL: "mock://test",
    NODE_ENV: "test",
  },
}));

vi.mock("../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../services/analyticsService", () => ({
  logServerEvent: vi.fn().mockResolvedValue(undefined),
}));

// In-memory Firestore mock for game states
const mockGameStates = new Map<string, any>();

const mockTransaction = {
  get: vi.fn().mockImplementation(async (ref: any) => {
    const data = mockGameStates.get(ref.id);
    return { exists: !!data, data: () => data };
  }),
  update: vi.fn().mockImplementation((ref: any, updates: any) => {
    const current = mockGameStates.get(ref.id) || {};
    mockGameStates.set(ref.id, { ...current, ...updates });
  }),
  set: vi.fn().mockImplementation((ref: any, data: any) => {
    mockGameStates.set(ref.id, data);
  }),
};

const mockDocRef = (id: string) => ({
  id,
  get: vi.fn().mockImplementation(async () => {
    const data = mockGameStates.get(id);
    return { exists: !!data, data: () => data };
  }),
  set: vi.fn().mockImplementation(async (data: any) => {
    mockGameStates.set(id, data);
  }),
  update: vi.fn().mockImplementation(async (updates: any) => {
    const current = mockGameStates.get(id) || {};
    mockGameStates.set(id, { ...current, ...updates });
  }),
  delete: vi.fn().mockImplementation(async () => {
    mockGameStates.delete(id);
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
    gameSessions: "game_sessions",
  },
}));

// Mock for battleStateService (and shared schema)
vi.mock("../../packages/shared/schema", () => ({
  battles: { id: "id" },
  battleVotes: { battleId: "battleId", odv: "odv" },
}));

vi.mock("../db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
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
  },
  getDb: () => null,
  isDatabaseAvailable: () => false,
}));

// ============================================================================
// Imports after mocks
// ============================================================================

const {
  createGame,
  joinGame,
  submitTrick,
  passTrick,
  handleDisconnect,
  handleReconnect,
  forfeitGame,
  getGameState,
  deleteGame,
  generateEventId,
} = await import("../services/gameStateService");

const { initializeVoting, castVote, getBattleVoteState } =
  await import("../services/battleStateService");

// ============================================================================
// Tests - Game State Transitions
// ============================================================================

describe("Game State Transitions - Critical Paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGameStates.clear();
  });

  // ==========================================================================
  // Full Game Lifecycle
  // ==========================================================================

  describe("complete game lifecycle", () => {
    it("create -> join -> play through to winner", async () => {
      // Step 1: Create game
      const createResult = await createGame({
        eventId: "evt-create",
        spotId: "spot-1",
        creatorId: "player-A",
      });
      expect(createResult.success).toBe(true);
      const gameId = createResult.game!.id;

      // Step 2: Join game (starts it)
      const joinResult = await joinGame({
        eventId: "evt-join",
        gameId,
        odv: "player-B",
      });
      expect(joinResult.success).toBe(true);
      expect(joinResult.game!.status).toBe("active");
      expect(joinResult.game!.players).toHaveLength(2);

      // Step 3: Player A sets a trick
      const trickResult = await submitTrick({
        eventId: "evt-trick-1",
        gameId,
        odv: "player-A",
        trickName: "kickflip",
      });
      expect(trickResult.success).toBe(true);
      expect(trickResult.game!.currentAction).toBe("attempt");
      expect(trickResult.game!.currentTrick).toBe("kickflip");

      // Step 4: Player B passes (gets S)
      const passResult = await passTrick({
        eventId: "evt-pass-1",
        gameId,
        odv: "player-B",
      });
      expect(passResult.success).toBe(true);

      // Verify letter accumulated
      const gameAfterPass = mockGameStates.get(gameId);
      const playerB = gameAfterPass.players.find((p: any) => p.odv === "player-B");
      expect(playerB.letters).toBe("S");
    });

    it("player accumulates all SKATE letters and loses", async () => {
      // Set up game in mid-progress
      const gameId = "game-skate";
      mockGameStates.set(gameId, {
        id: gameId,
        spotId: "spot-1",
        creatorId: "player-A",
        players: [
          { odv: "player-A", letters: "", connected: true },
          { odv: "player-B", letters: "SKAT", connected: true }, // One letter from SKATE
        ],
        maxPlayers: 4,
        currentTurnIndex: 1, // Player B's turn
        currentAction: "attempt",
        currentTrick: "heelflip",
        setterId: "player-A",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        processedEventIds: [],
      });

      // Player B passes -> gets final E -> eliminated -> Player A wins
      const result = await passTrick({
        eventId: "evt-final-pass",
        gameId,
        odv: "player-B",
      });

      expect(result.success).toBe(true);
      expect(result.game!.status).toBe("completed");
      expect(result.game!.winnerId).toBe("player-A");
    });
  });

  // ==========================================================================
  // Turn Rotation & Eliminated Player Skipping
  // ==========================================================================

  describe("turn rotation", () => {
    it("skips eliminated players when advancing turn", async () => {
      const gameId = "game-3player";
      mockGameStates.set(gameId, {
        id: gameId,
        spotId: "spot-1",
        creatorId: "player-A",
        players: [
          { odv: "player-A", letters: "", connected: true },
          { odv: "player-B", letters: "SKATE", connected: true }, // Eliminated
          { odv: "player-C", letters: "SK", connected: true },
        ],
        maxPlayers: 4,
        currentTurnIndex: 0, // Player A's turn
        currentAction: "attempt",
        currentTrick: "kickflip",
        setterId: "player-C",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        processedEventIds: [],
      });

      // Player A lands the trick, next turn should skip eliminated Player B
      const result = await submitTrick({
        eventId: "evt-land",
        gameId,
        odv: "player-A",
        trickName: "kickflip",
      });

      expect(result.success).toBe(true);
      // Should skip player-B (index 1, eliminated) and go to player-C (index 2)
      // Or wrap around depending on setter logic
      const game = result.game!;
      const currentPlayer = game.players[game.currentTurnIndex];
      expect(currentPlayer.letters).not.toBe("SKATE"); // Not the eliminated player
    });
  });

  // ==========================================================================
  // Disconnect / Reconnect
  // ==========================================================================

  describe("disconnect and reconnect flow", () => {
    it("disconnect pauses an active game", async () => {
      const gameId = "game-disconnect";
      mockGameStates.set(gameId, {
        id: gameId,
        spotId: "spot-1",
        creatorId: "player-A",
        players: [
          { odv: "player-A", letters: "", connected: true },
          { odv: "player-B", letters: "", connected: true },
        ],
        maxPlayers: 4,
        currentTurnIndex: 0,
        currentAction: "set",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        processedEventIds: [],
      });

      const result = await handleDisconnect({
        eventId: "evt-dc",
        gameId,
        odv: "player-B",
      });

      expect(result.success).toBe(true);
      expect(result.game!.status).toBe("paused");
      const playerB = result.game!.players.find((p: any) => p.odv === "player-B");
      expect(playerB.connected).toBe(false);
      expect(playerB.disconnectedAt).toBeDefined();
    });

    it("reconnect resumes a paused game when all players back", async () => {
      const gameId = "game-reconnect";
      mockGameStates.set(gameId, {
        id: gameId,
        spotId: "spot-1",
        creatorId: "player-A",
        players: [
          { odv: "player-A", letters: "", connected: true },
          {
            odv: "player-B",
            letters: "",
            connected: false,
            disconnectedAt: new Date().toISOString(),
          },
        ],
        maxPlayers: 4,
        currentTurnIndex: 0,
        currentAction: "set",
        status: "paused",
        pausedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        processedEventIds: [],
      });

      const result = await handleReconnect({
        eventId: "evt-rc",
        gameId,
        odv: "player-B",
      });

      expect(result.success).toBe(true);
      expect(result.game!.status).toBe("active");
      const playerB = result.game!.players.find((p: any) => p.odv === "player-B");
      expect(playerB.connected).toBe(true);
    });

    it("reconnect keeps game paused if other players still disconnected", async () => {
      const gameId = "game-partial-rc";
      mockGameStates.set(gameId, {
        id: gameId,
        spotId: "spot-1",
        creatorId: "player-A",
        players: [
          {
            odv: "player-A",
            letters: "",
            connected: false,
            disconnectedAt: new Date().toISOString(),
          },
          {
            odv: "player-B",
            letters: "",
            connected: false,
            disconnectedAt: new Date().toISOString(),
          },
        ],
        maxPlayers: 4,
        currentTurnIndex: 0,
        currentAction: "set",
        status: "paused",
        pausedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        processedEventIds: [],
      });

      const result = await handleReconnect({
        eventId: "evt-rc-partial",
        gameId,
        odv: "player-B",
      });

      expect(result.success).toBe(true);
      expect(result.game!.status).toBe("paused"); // Still paused - player A disconnected
    });

    it("disconnect of non-existent player fails", async () => {
      const gameId = "game-dc-unknown";
      mockGameStates.set(gameId, {
        id: gameId,
        spotId: "spot-1",
        creatorId: "player-A",
        players: [{ odv: "player-A", letters: "", connected: true }],
        status: "active",
        processedEventIds: [],
      });

      const result = await handleDisconnect({
        eventId: "evt-dc-unknown",
        gameId,
        odv: "player-unknown",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not in game");
    });
  });

  // ==========================================================================
  // Forfeit Scenarios
  // ==========================================================================

  describe("forfeit game", () => {
    it("voluntary forfeit ends game with opponent as winner", async () => {
      const gameId = "game-forfeit";
      mockGameStates.set(gameId, {
        id: gameId,
        spotId: "spot-1",
        creatorId: "player-A",
        players: [
          { odv: "player-A", letters: "SK", connected: true },
          { odv: "player-B", letters: "S", connected: true },
        ],
        maxPlayers: 4,
        currentTurnIndex: 0,
        currentAction: "set",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        processedEventIds: [],
      });

      const result = await forfeitGame({
        eventId: "evt-forfeit",
        gameId,
        odv: "player-A",
        reason: "voluntary",
      });

      expect(result.success).toBe(true);
      expect(result.game!.status).toBe("completed");
      expect(result.game!.winnerId).toBe("player-B");
    });

    it("forfeit of completed game fails", async () => {
      const gameId = "game-already-done";
      mockGameStates.set(gameId, {
        id: gameId,
        players: [{ odv: "player-A", letters: "" }],
        status: "completed",
        processedEventIds: [],
      });

      const result = await forfeitGame({
        eventId: "evt-forfeit-late",
        gameId,
        odv: "player-A",
        reason: "voluntary",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("already completed");
    });

    it("forfeit from non-participant fails", async () => {
      const gameId = "game-forfeit-stranger";
      mockGameStates.set(gameId, {
        id: gameId,
        players: [
          { odv: "player-A", letters: "" },
          { odv: "player-B", letters: "" },
        ],
        status: "active",
        processedEventIds: [],
      });

      const result = await forfeitGame({
        eventId: "evt-forfeit-stranger",
        gameId,
        odv: "player-C", // Not in game
        reason: "voluntary",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not in game");
    });
  });

  // ==========================================================================
  // Idempotency
  // ==========================================================================

  describe("idempotency", () => {
    it("duplicate join event is safely ignored", async () => {
      const gameId = "game-idempotent";
      mockGameStates.set(gameId, {
        id: gameId,
        spotId: "spot-1",
        creatorId: "player-A",
        players: [
          { odv: "player-A", letters: "", connected: true },
          { odv: "player-B", letters: "", connected: true },
        ],
        maxPlayers: 4,
        currentTurnIndex: 0,
        currentAction: "set",
        status: "active",
        processedEventIds: ["evt-join-dup"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await joinGame({
        eventId: "evt-join-dup",
        gameId,
        odv: "player-B",
      });

      expect(result.success).toBe(true);
      expect(result.alreadyProcessed).toBe(true);
    });

    it("duplicate trick submission is safely ignored", async () => {
      const gameId = "game-idempotent-trick";
      mockGameStates.set(gameId, {
        id: gameId,
        spotId: "spot-1",
        creatorId: "player-A",
        players: [
          { odv: "player-A", letters: "", connected: true },
          { odv: "player-B", letters: "", connected: true },
        ],
        maxPlayers: 4,
        currentTurnIndex: 0,
        currentAction: "set",
        status: "active",
        processedEventIds: ["evt-trick-dup"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await submitTrick({
        eventId: "evt-trick-dup",
        gameId,
        odv: "player-A",
        trickName: "kickflip",
      });

      expect(result.success).toBe(true);
      expect(result.alreadyProcessed).toBe(true);
    });

    it("duplicate pass is safely ignored", async () => {
      const gameId = "game-idempotent-pass";
      mockGameStates.set(gameId, {
        id: gameId,
        spotId: "spot-1",
        creatorId: "player-A",
        players: [
          { odv: "player-A", letters: "", connected: true },
          { odv: "player-B", letters: "S", connected: true },
        ],
        maxPlayers: 4,
        currentTurnIndex: 1,
        currentAction: "attempt",
        currentTrick: "kickflip",
        setterId: "player-A",
        status: "active",
        processedEventIds: ["evt-pass-dup"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await passTrick({
        eventId: "evt-pass-dup",
        gameId,
        odv: "player-B",
      });

      expect(result.success).toBe(true);
      expect(result.alreadyProcessed).toBe(true);
    });

    it("duplicate forfeit is safely ignored", async () => {
      const gameId = "game-idempotent-forfeit";
      mockGameStates.set(gameId, {
        id: gameId,
        players: [
          { odv: "player-A", letters: "" },
          { odv: "player-B", letters: "" },
        ],
        status: "active",
        processedEventIds: ["evt-forfeit-dup"],
      });

      const result = await forfeitGame({
        eventId: "evt-forfeit-dup",
        gameId,
        odv: "player-A",
        reason: "voluntary",
      });

      expect(result.success).toBe(true);
      expect(result.alreadyProcessed).toBe(true);
    });
  });

  // ==========================================================================
  // Edge Cases & Error Handling
  // ==========================================================================

  describe("edge cases", () => {
    it("game not found returns error", async () => {
      const result = await joinGame({
        eventId: "evt-no-game",
        gameId: "nonexistent",
        odv: "player-A",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("cannot join a game that already started", async () => {
      const gameId = "game-started";
      mockGameStates.set(gameId, {
        id: gameId,
        players: [
          { odv: "player-A", letters: "", connected: true },
          { odv: "player-B", letters: "", connected: true },
        ],
        maxPlayers: 4,
        status: "active",
        processedEventIds: [],
      });

      const result = await joinGame({
        eventId: "evt-late-join",
        gameId,
        odv: "player-C",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("already started");
    });

    it("cannot join a full game", async () => {
      const gameId = "game-full";
      mockGameStates.set(gameId, {
        id: gameId,
        players: [
          { odv: "p1", letters: "", connected: true },
          { odv: "p2", letters: "", connected: true },
        ],
        maxPlayers: 2,
        status: "waiting",
        processedEventIds: [],
      });

      const result = await joinGame({
        eventId: "evt-full",
        gameId,
        odv: "player-C",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("full");
    });

    it("cannot submit trick when not your turn", async () => {
      const gameId = "game-wrong-turn";
      mockGameStates.set(gameId, {
        id: gameId,
        players: [
          { odv: "player-A", letters: "", connected: true },
          { odv: "player-B", letters: "", connected: true },
        ],
        currentTurnIndex: 0, // Player A's turn
        currentAction: "set",
        status: "active",
        processedEventIds: [],
      });

      const result = await submitTrick({
        eventId: "evt-wrong-turn",
        gameId,
        odv: "player-B", // Not their turn
        trickName: "kickflip",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Not your turn");
    });

    it("cannot pass during set phase", async () => {
      const gameId = "game-wrong-phase";
      mockGameStates.set(gameId, {
        id: gameId,
        players: [
          { odv: "player-A", letters: "", connected: true },
          { odv: "player-B", letters: "", connected: true },
        ],
        currentTurnIndex: 0,
        currentAction: "set", // Set phase, not attempt
        status: "active",
        processedEventIds: [],
      });

      const result = await passTrick({
        eventId: "evt-wrong-phase",
        gameId,
        odv: "player-A",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("attempt phase");
    });

    it("cannot play on inactive game", async () => {
      const gameId = "game-completed";
      mockGameStates.set(gameId, {
        id: gameId,
        players: [
          { odv: "player-A", letters: "", connected: true },
          { odv: "player-B", letters: "SKATE", connected: true },
        ],
        currentTurnIndex: 0,
        currentAction: "set",
        status: "completed",
        processedEventIds: [],
      });

      const result = await submitTrick({
        eventId: "evt-on-completed",
        gameId,
        odv: "player-A",
        trickName: "ollie",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not active");
    });

    it("createGame caps max players at 8", async () => {
      const result = await createGame({
        eventId: "evt-maxplayers",
        spotId: "spot-1",
        creatorId: "player-A",
        maxPlayers: 100,
      });

      expect(result.success).toBe(true);
      expect(result.game!.maxPlayers).toBe(8);
    });

    it("game deletion removes game from store", async () => {
      const gameId = "game-delete-me";
      mockGameStates.set(gameId, {
        id: gameId,
        status: "completed",
      });

      const deleted = await deleteGame(gameId);
      expect(deleted).toBe(true);
      expect(mockGameStates.has(gameId)).toBe(false);
    });

    it("getGameState returns null for nonexistent game", async () => {
      const state = await getGameState("nonexistent");
      expect(state).toBeNull();
    });
  });

  // ==========================================================================
  // Event ID Generation
  // ==========================================================================

  describe("generateEventId", () => {
    it("generates deterministic IDs with sequence key", () => {
      const id1 = generateEventId("trick", "player-1", "game-1", "turn-5");
      const id2 = generateEventId("trick", "player-1", "game-1", "turn-5");
      expect(id1).toBe(id2);
    });

    it("generates different IDs for different sequence keys", () => {
      const id1 = generateEventId("trick", "player-1", "game-1", "turn-5");
      const id2 = generateEventId("trick", "player-1", "game-1", "turn-6");
      expect(id1).not.toBe(id2);
    });

    it("generates unique IDs without sequence key", () => {
      const id1 = generateEventId("trick", "player-1", "game-1");
      const id2 = generateEventId("trick", "player-1", "game-1");
      // Without sequence key, includes timestamp + random - very likely different
      expect(id1).not.toBe(id2);
    });

    it("includes type, game, and player in the ID", () => {
      const id = generateEventId("timeout", "player-X", "game-Y", "seq-1");
      expect(id).toContain("timeout");
      expect(id).toContain("game-Y");
      expect(id).toContain("player-X");
    });
  });
});

// ============================================================================
// Battle State Tests - using real battleStateService code
// ============================================================================

describe("Battle State Transitions - Critical Paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGameStates.clear();
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

      const state = mockGameStates.get("battle-1");
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
      // Creator voted clean → opponent gets 1 point
      // Opponent voted sketch → creator gets 0 points
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
      // Both voted clean: score is 1-1 → tie → creator wins
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
      // First vote: clean
      await castVote({
        eventId: "evt-vote-1",
        battleId: "battle-1",
        odv: "creator-1",
        vote: "clean",
      });

      // Change mind to sketch
      await castVote({
        eventId: "evt-vote-1b",
        battleId: "battle-1",
        odv: "creator-1",
        vote: "sketch",
      });

      // Complete with opponent vote
      const result = await castVote({
        eventId: "evt-vote-2",
        battleId: "battle-1",
        odv: "opponent-1",
        vote: "clean",
      });

      expect(result.battleComplete).toBe(true);
      // Creator changed to sketch → opponent gets 0 points
      // Opponent voted clean → creator gets 1 point
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
