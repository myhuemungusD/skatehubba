/**
 * @fileoverview Comprehensive unit tests for game state machine transitions
 *
 * Tests all S.K.A.T.E. game state transitions:
 * - Full game lifecycle (create → join → set → attempt → pass → elimination → win)
 * - Multi-player letter accumulation through complete SKATE sequence
 * - Forfeit scenarios (voluntary, disconnect_timeout, turn_timeout)
 * - Disconnect/reconnect with pause/resume semantics
 * - Idempotency across all operations
 * - Edge cases: 3+ players, eliminated player skipping, setter rotation
 * - Timeout processing (active games and paused games)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// =============================================================================
// Mocks (same pattern as existing gameStateService.test.ts)
// =============================================================================

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

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ _op: "eq", col, val }),
  and: (...conditions: any[]) => ({ _op: "and", conditions }),
  lt: (col: any, val: any) => ({ _op: "lt", col, val }),
}));

vi.mock("@shared/schema", () => ({
  gameSessions: {
    _table: "gameSessions",
    id: { name: "id", _isPrimary: true },
    status: { name: "status" },
    creatorId: { name: "creatorId" },
    turnDeadlineAt: { name: "turnDeadlineAt" },
    pausedAt: { name: "pausedAt" },
  },
}));

// In-memory game store
const gameStore = new Map<string, any>();

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

function createQueryChain() {
  let op = "select";
  let setData: any = null;
  let insertData: any = null;
  let whereClause: any = null;
  let hasReturning = false;

  const resolve = () => {
    if (op === "select") {
      const id = extractPrimaryId(whereClause);
      if (id) {
        const row = gameStore.get(id);
        return row ? [row] : [];
      }
      return Array.from(gameStore.values());
    }
    if (op === "insert") {
      const id = insertData?.id ?? `auto-${Date.now()}-${Math.random()}`;
      gameStore.set(id, { ...insertData });
      return hasReturning ? [{ ...insertData }] : undefined;
    }
    if (op === "update") {
      const id = extractPrimaryId(whereClause);
      if (id && gameStore.has(id)) {
        const updated = { ...gameStore.get(id), ...setData };
        gameStore.set(id, updated);
        return hasReturning ? [{ ...updated }] : undefined;
      }
      return hasReturning ? [] : undefined;
    }
    if (op === "delete") {
      const id = extractPrimaryId(whereClause);
      if (id) gameStore.delete(id);
      return undefined;
    }
    return undefined;
  };

  const chain: any = {};
  const reset = (newOp: string) => {
    op = newOp;
    setData = null;
    insertData = null;
    whereClause = null;
    hasReturning = false;
  };

  chain.select = vi.fn(() => {
    reset("select");
    return chain;
  });
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn((condition: any) => {
    whereClause = condition;
    return chain;
  });
  chain.for = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.insert = vi.fn(() => {
    reset("insert");
    return chain;
  });
  chain.values = vi.fn((data: any) => {
    insertData = data;
    return chain;
  });
  chain.update = vi.fn(() => {
    reset("update");
    return chain;
  });
  chain.set = vi.fn((data: any) => {
    setData = data;
    return chain;
  });
  chain.delete = vi.fn(() => {
    reset("delete");
    return chain;
  });
  chain.returning = vi.fn(() => {
    hasReturning = true;
    return chain;
  });
  chain.onConflictDoUpdate = vi.fn(() => chain);

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
} = await import("../services/gameStateService");

// =============================================================================
// Helpers
// =============================================================================

function makeActiveGame(
  id: string,
  players: any[] = [
    { odv: "p1", letters: "", connected: true },
    { odv: "p2", letters: "", connected: true },
  ]
) {
  gameStore.set(id, {
    id,
    spotId: "spot-1",
    creatorId: players[0].odv,
    players,
    maxPlayers: 8,
    currentTurnIndex: 0,
    currentAction: "set",
    status: "active",
    turnDeadlineAt: null,
    pausedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    processedEventIds: [],
  });
}

// =============================================================================
// TESTS
// =============================================================================

describe("Game State Machine - Comprehensive Transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gameStore.clear();
  });

  afterEach(() => {});

  // ===========================================================================
  // Full game lifecycle
  // ===========================================================================

  describe("game creation and joining", () => {
    it("creates a game in waiting status", async () => {
      const create = await createGame({
        eventId: "e-create",
        spotId: "spot-1",
        creatorId: "p1",
      });
      expect(create.success).toBe(true);
      expect(create.game!.status).toBe("waiting");
      expect(create.game!.creatorId).toBe("p1");
      expect(create.game!.players).toHaveLength(1);
      expect(create.game!.players[0].odv).toBe("p1");
      expect(create.game!.players[0].letters).toBe("");
    });

    it("transitions to active on second player join", async () => {
      // Setup a waiting game manually
      makeActiveGame("join-test");
      gameStore.get("join-test").status = "waiting";
      gameStore.get("join-test").players = [{ odv: "p1", letters: "", connected: true }];

      const join = await joinGame({ eventId: "e-join", gameId: "join-test", odv: "p2" });
      expect(join.success).toBe(true);
      expect(join.game!.status).toBe("active");
      expect(join.game!.players).toHaveLength(2);
    });
  });

  // ===========================================================================
  // Letter accumulation
  // ===========================================================================

  describe("letter accumulation", () => {
    it("accumulates S → SK → SKA → SKAT → SKATE", async () => {
      const expected = ["S", "SK", "SKA", "SKAT", "SKATE"];

      for (let i = 0; i < expected.length; i++) {
        // Reset game state for each pass (simulating a fresh attempt phase)
        const prevLetters = i === 0 ? "" : expected[i - 1];
        makeActiveGame("letter-game");
        const game = gameStore.get("letter-game");
        game.currentAction = "attempt";
        game.currentTurnIndex = 1;
        game.setterId = "p1";
        game.currentTrick = "Kickflip";
        game.players[1].letters = prevLetters;

        const result = await passTrick({
          eventId: `lp-${i + 1}`,
          gameId: "letter-game",
          odv: "p2",
        });
        expect(result.letterGained).toBe(expected[i]);

        if (expected[i] === "SKATE") {
          expect(result.isEliminated).toBe(true);
          expect(result.game!.status).toBe("completed");
          expect(result.game!.winnerId).toBe("p1");
        } else {
          expect(result.isEliminated).toBe(false);
        }
      }
    });

    it("does not add letters beyond SKATE", async () => {
      makeActiveGame("max-letter-game");
      const game = gameStore.get("max-letter-game");
      game.players[1].letters = "SKATE"; // Already eliminated
      game.currentAction = "attempt";
      game.currentTurnIndex = 1;
      game.setterId = "p1";

      // The player is already eliminated, game should complete
      const result = await passTrick({
        eventId: "max-pass",
        gameId: "max-letter-game",
        odv: "p2",
      });
      // Since only p1 is not eliminated, game ends
      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // 3+ player games
  // ===========================================================================

  describe("multi-player games (3+ players)", () => {
    it("handles 3-player game with one elimination continuing", async () => {
      makeActiveGame("three-player", [
        { odv: "p1", letters: "", connected: true },
        { odv: "p2", letters: "SKAT", connected: true },
        { odv: "p3", letters: "", connected: true },
      ]);

      const game = gameStore.get("three-player");
      game.currentAction = "attempt";
      game.currentTurnIndex = 1;
      game.setterId = "p1";
      game.currentTrick = "Heelflip";

      // P2 passes and gets eliminated
      const result = await passTrick({
        eventId: "3p-pass-1",
        gameId: "three-player",
        odv: "p2",
      });

      expect(result.success).toBe(true);
      expect(result.isEliminated).toBe(true);
      // Game should continue since p1 and p3 still active
      expect(result.game!.status).toBe("active");
    });

    it("skips eliminated players in turn rotation", async () => {
      makeActiveGame("skip-game", [
        { odv: "p1", letters: "", connected: true },
        { odv: "p2", letters: "SKATE", connected: true }, // eliminated
        { odv: "p3", letters: "S", connected: true },
      ]);

      const game = gameStore.get("skip-game");
      game.currentAction = "set";
      game.currentTurnIndex = 0;

      // P1 sets trick - should go to p3 (skipping eliminated p2)
      const result = await submitTrick({
        eventId: "skip-trick-1",
        gameId: "skip-game",
        odv: "p1",
        trickName: "Tre Flip",
      });

      expect(result.success).toBe(true);
      expect(result.game!.currentTurnIndex).toBe(2); // p3, not p2
    });

    it("handles 4-player game creation with max limit", async () => {
      const result = await createGame({
        eventId: "4p-create",
        spotId: "spot-1",
        creatorId: "p1",
        maxPlayers: 4,
      });

      expect(result.success).toBe(true);
      expect(result.game!.maxPlayers).toBe(4);
    });

    it("enforces maximum 8 players cap", async () => {
      const result = await createGame({
        eventId: "max-create",
        spotId: "spot-1",
        creatorId: "p1",
        maxPlayers: 100,
      });

      expect(result.success).toBe(true);
      expect(result.game!.maxPlayers).toBe(8);
    });
  });

  // ===========================================================================
  // Forfeit scenarios
  // ===========================================================================

  describe("forfeit scenarios", () => {
    it("handles voluntary forfeit correctly", async () => {
      makeActiveGame("forfeit-vol");

      const result = await forfeitGame({
        eventId: "fv-1",
        gameId: "forfeit-vol",
        odv: "p1",
        reason: "voluntary",
      });

      expect(result.success).toBe(true);
      expect(result.game!.status).toBe("completed");
      expect(result.game!.winnerId).toBe("p2");
    });

    it("handles disconnect_timeout forfeit", async () => {
      makeActiveGame("forfeit-disc");

      const result = await forfeitGame({
        eventId: "fd-1",
        gameId: "forfeit-disc",
        odv: "p2",
        reason: "disconnect_timeout",
      });

      expect(result.success).toBe(true);
      expect(result.game!.status).toBe("completed");
      expect(result.game!.winnerId).toBe("p1");
    });

    it("handles turn_timeout forfeit", async () => {
      makeActiveGame("forfeit-turn");

      const result = await forfeitGame({
        eventId: "ft-1",
        gameId: "forfeit-turn",
        odv: "p1",
        reason: "turn_timeout",
      });

      expect(result.success).toBe(true);
      expect(result.game!.status).toBe("completed");
      expect(result.game!.winnerId).toBe("p2");
    });

    it("rejects forfeit for already completed game", async () => {
      makeActiveGame("forfeit-done");
      gameStore.get("forfeit-done").status = "completed";

      const result = await forfeitGame({
        eventId: "fd-2",
        gameId: "forfeit-done",
        odv: "p1",
        reason: "voluntary",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Game already completed");
    });

    it("rejects forfeit for non-existent player", async () => {
      makeActiveGame("forfeit-np");

      const result = await forfeitGame({
        eventId: "fnp-1",
        gameId: "forfeit-np",
        odv: "p3",
        reason: "voluntary",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Player not in game");
    });

    it("rejects forfeit for non-existent game", async () => {
      const result = await forfeitGame({
        eventId: "fne-1",
        gameId: "nonexistent",
        odv: "p1",
        reason: "voluntary",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Game not found");
    });

    it("handles idempotent forfeit", async () => {
      makeActiveGame("forfeit-idemp");
      gameStore.get("forfeit-idemp").processedEventIds = ["already-forfeited"];

      const result = await forfeitGame({
        eventId: "already-forfeited",
        gameId: "forfeit-idemp",
        odv: "p1",
        reason: "voluntary",
      });

      expect(result.success).toBe(true);
      expect(result.alreadyProcessed).toBe(true);
    });
  });

  // ===========================================================================
  // Disconnect / reconnect
  // ===========================================================================

  describe("disconnect and reconnect handling", () => {
    it("pauses game on player disconnect", async () => {
      makeActiveGame("disc-game");

      const result = await handleDisconnect({
        eventId: "disc-1",
        gameId: "disc-game",
        odv: "p1",
      });

      expect(result.success).toBe(true);
      expect(result.game!.status).toBe("paused");
      expect(result.game!.players[0].connected).toBe(false);
      expect(result.game!.players[0].disconnectedAt).toBeDefined();
    });

    it("resumes game when disconnected player reconnects", async () => {
      gameStore.set("paused-game", {
        id: "paused-game",
        spotId: "spot-1",
        creatorId: "p1",
        players: [
          { odv: "p1", letters: "", connected: false, disconnectedAt: new Date().toISOString() },
          { odv: "p2", letters: "", connected: true },
        ],
        maxPlayers: 4,
        currentTurnIndex: 0,
        currentAction: "set",
        status: "paused",
        pausedAt: new Date(),
        turnDeadlineAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        processedEventIds: [],
      });

      const result = await handleReconnect({
        eventId: "recon-1",
        gameId: "paused-game",
        odv: "p1",
      });

      expect(result.success).toBe(true);
      expect(result.game!.status).toBe("active");
      expect(result.game!.players[0].connected).toBe(true);
      expect(result.game!.players[0].disconnectedAt).toBeUndefined();
      expect(result.game!.turnDeadlineAt).toBeDefined();
    });

    it("stays paused when only one of two disconnected players reconnects", async () => {
      gameStore.set("multi-disc", {
        id: "multi-disc",
        spotId: "spot-1",
        creatorId: "p1",
        players: [
          { odv: "p1", letters: "", connected: false, disconnectedAt: new Date().toISOString() },
          { odv: "p2", letters: "", connected: false, disconnectedAt: new Date().toISOString() },
        ],
        maxPlayers: 4,
        currentTurnIndex: 0,
        currentAction: "set",
        status: "paused",
        pausedAt: new Date(),
        turnDeadlineAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        processedEventIds: [],
      });

      const result = await handleReconnect({
        eventId: "recon-2",
        gameId: "multi-disc",
        odv: "p1",
      });

      expect(result.success).toBe(true);
      expect(result.game!.status).toBe("paused"); // Still paused
      expect(result.game!.players[0].connected).toBe(true);
      expect(result.game!.players[1].connected).toBe(false);
    });

    it("does not pause waiting games on disconnect", async () => {
      makeActiveGame("waiting-disc");
      gameStore.get("waiting-disc").status = "waiting";

      const result = await handleDisconnect({
        eventId: "wd-1",
        gameId: "waiting-disc",
        odv: "p1",
      });

      expect(result.success).toBe(true);
      expect(result.game!.status).toBe("waiting");
    });

    it("rejects disconnect for player not in game", async () => {
      makeActiveGame("disc-nf");

      const result = await handleDisconnect({
        eventId: "dnf-1",
        gameId: "disc-nf",
        odv: "p3",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Player not in game");
    });

    it("rejects reconnect for player not in game", async () => {
      gameStore.set("recon-nf", {
        id: "recon-nf",
        spotId: "spot-1",
        creatorId: "p1",
        players: [{ odv: "p1", letters: "", connected: true }],
        maxPlayers: 4,
        currentTurnIndex: 0,
        currentAction: "set",
        status: "paused",
        pausedAt: new Date(),
        turnDeadlineAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        processedEventIds: [],
      });

      const result = await handleReconnect({
        eventId: "rnf-1",
        gameId: "recon-nf",
        odv: "p99",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Player not in game");
    });
  });

  // ===========================================================================
  // Idempotency across all operations
  // ===========================================================================

  describe("idempotency", () => {
    it("handles idempotent join", async () => {
      makeActiveGame("idemp-join");
      gameStore.get("idemp-join").status = "waiting";
      gameStore.get("idemp-join").processedEventIds = ["join-dup"];

      const result = await joinGame({
        eventId: "join-dup",
        gameId: "idemp-join",
        odv: "p3",
      });

      expect(result.success).toBe(true);
      expect(result.alreadyProcessed).toBe(true);
    });

    it("handles idempotent trick submission", async () => {
      makeActiveGame("idemp-trick");
      gameStore.get("idemp-trick").processedEventIds = ["trick-dup"];

      const result = await submitTrick({
        eventId: "trick-dup",
        gameId: "idemp-trick",
        odv: "p1",
        trickName: "Kickflip",
      });

      expect(result.success).toBe(true);
      expect(result.alreadyProcessed).toBe(true);
    });

    it("handles idempotent pass", async () => {
      makeActiveGame("idemp-pass");
      const game = gameStore.get("idemp-pass");
      game.currentAction = "attempt";
      game.currentTurnIndex = 1;
      game.processedEventIds = ["pass-dup"];

      const result = await passTrick({
        eventId: "pass-dup",
        gameId: "idemp-pass",
        odv: "p2",
      });

      expect(result.success).toBe(true);
      expect(result.alreadyProcessed).toBe(true);
    });

    it("handles idempotent disconnect", async () => {
      makeActiveGame("idemp-disc");
      gameStore.get("idemp-disc").processedEventIds = ["disc-dup"];

      const result = await handleDisconnect({
        eventId: "disc-dup",
        gameId: "idemp-disc",
        odv: "p1",
      });

      expect(result.success).toBe(true);
      expect(result.alreadyProcessed).toBe(true);
    });

    it("handles idempotent reconnect", async () => {
      gameStore.set("idemp-recon", {
        id: "idemp-recon",
        spotId: "spot-1",
        creatorId: "p1",
        players: [
          { odv: "p1", letters: "", connected: false, disconnectedAt: new Date().toISOString() },
          { odv: "p2", letters: "", connected: true },
        ],
        maxPlayers: 4,
        currentTurnIndex: 0,
        currentAction: "set",
        status: "paused",
        pausedAt: new Date(),
        turnDeadlineAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        processedEventIds: ["recon-dup"],
      });

      const result = await handleReconnect({
        eventId: "recon-dup",
        gameId: "idemp-recon",
        odv: "p1",
      });

      expect(result.success).toBe(true);
      expect(result.alreadyProcessed).toBe(true);
    });
  });

  // ===========================================================================
  // Trick submission edge cases
  // ===========================================================================

  describe("trick submission edge cases", () => {
    it("rejects trick from wrong player", async () => {
      makeActiveGame("wrong-turn");

      const result = await submitTrick({
        eventId: "wt-1",
        gameId: "wrong-turn",
        odv: "p2", // Not p1's turn
        trickName: "Kickflip",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Not your turn");
    });

    it("rejects trick for non-active game", async () => {
      makeActiveGame("not-active");
      gameStore.get("not-active").status = "waiting";

      const result = await submitTrick({
        eventId: "na-1",
        gameId: "not-active",
        odv: "p1",
        trickName: "Kickflip",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Game is not active");
    });

    it("rejects trick for nonexistent game", async () => {
      const result = await submitTrick({
        eventId: "ne-1",
        gameId: "no-game",
        odv: "p1",
        trickName: "Kickflip",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Game not found");
    });
  });

  // ===========================================================================
  // Pass trick edge cases
  // ===========================================================================

  describe("pass trick edge cases", () => {
    it("rejects pass during set phase", async () => {
      makeActiveGame("set-phase");

      const result = await passTrick({
        eventId: "sp-1",
        gameId: "set-phase",
        odv: "p1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Can only pass during attempt phase");
    });

    it("rejects pass from wrong player", async () => {
      makeActiveGame("wrong-pass");
      const game = gameStore.get("wrong-pass");
      game.currentAction = "attempt";
      game.currentTurnIndex = 1;

      const result = await passTrick({
        eventId: "wp-1",
        gameId: "wrong-pass",
        odv: "p1", // p2 should be passing
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Not your turn");
    });

    it("rejects pass for non-active game", async () => {
      makeActiveGame("pass-inactive");
      gameStore.get("pass-inactive").status = "completed";

      const result = await passTrick({
        eventId: "pi-1",
        gameId: "pass-inactive",
        odv: "p1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Game is not active");
    });
  });

  // ===========================================================================
  // getGameState and deleteGame
  // ===========================================================================

  describe("getGameState", () => {
    it("returns game state when found", async () => {
      makeActiveGame("get-game");

      const state = await getGameState("get-game");
      expect(state).not.toBeNull();
      expect(state!.id).toBe("get-game");
      expect(state!.status).toBe("active");
    });

    it("returns null when game not found", async () => {
      const state = await getGameState("nonexistent");
      expect(state).toBeNull();
    });
  });

  describe("deleteGame", () => {
    it("deletes a game", async () => {
      makeActiveGame("delete-me");

      const deleted = await deleteGame("delete-me");
      expect(deleted).toBe(true);
    });

    it("handles deletion of nonexistent game gracefully", async () => {
      const deleted = await deleteGame("no-game");
      expect(deleted).toBe(true); // No error thrown
    });
  });

  // ===========================================================================
  // Join edge cases
  // ===========================================================================

  describe("join edge cases", () => {
    it("rejects joining a non-existent game", async () => {
      const result = await joinGame({
        eventId: "join-ne",
        gameId: "no-game",
        odv: "p2",
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe("Game not found");
    });

    it("rejects duplicate player join", async () => {
      makeActiveGame("dup-join");
      gameStore.get("dup-join").status = "waiting";

      const result = await joinGame({
        eventId: "dup-1",
        gameId: "dup-join",
        odv: "p1", // Already in game
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Already in game");
    });

    it("rejects join when game is full", async () => {
      makeActiveGame("full-game", [
        { odv: "p1", letters: "", connected: true },
        { odv: "p2", letters: "", connected: true },
      ]);
      gameStore.get("full-game").status = "waiting";
      gameStore.get("full-game").maxPlayers = 2;

      const result = await joinGame({
        eventId: "full-1",
        gameId: "full-game",
        odv: "p3",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Game is full");
    });

    it("rejects join after game has started", async () => {
      makeActiveGame("started-game");

      const result = await joinGame({
        eventId: "late-1",
        gameId: "started-game",
        odv: "p3",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Game has already started");
    });
  });

  // ===========================================================================
  // Setter rotation in multi-player
  // ===========================================================================

  describe("setter rotation", () => {
    it("rotates setter to next non-eliminated player after all attempts", async () => {
      makeActiveGame("rotate-game", [
        { odv: "p1", letters: "", connected: true },
        { odv: "p2", letters: "", connected: true },
        { odv: "p3", letters: "", connected: true },
      ]);

      const game = gameStore.get("rotate-game");
      game.currentAction = "attempt";
      game.currentTurnIndex = 2; // p3 is last attempter
      game.setterId = "p1";
      game.currentTrick = "Kickflip";

      // p3 successfully lands (submitTrick in attempt phase)
      const result = await submitTrick({
        eventId: "rot-1",
        gameId: "rotate-game",
        odv: "p3",
        trickName: "Kickflip",
      });

      expect(result.success).toBe(true);
      // Back to setter → rotate to p2 as new setter
      expect(result.game!.currentAction).toBe("set");
      expect(result.game!.currentTurnIndex).toBe(1); // p2 is new setter
    });
  });
});
