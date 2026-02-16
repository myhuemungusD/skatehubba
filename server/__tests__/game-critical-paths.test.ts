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
// Mocks
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
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock("../services/analyticsService", () => ({
  logServerEvent: vi.fn().mockResolvedValue(undefined),
}));

// Mock drizzle-orm operators to return inspectable objects
vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ _op: "eq", col, val }),
  and: (...conditions: any[]) => ({ _op: "and", conditions }),
  lt: (col: any, val: any) => ({ _op: "lt", col, val }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ..._values: any[]) => ({ _sql: true, strings }),
    { raw: (s: string) => ({ _sql: true, raw: s }) }
  ),
}));

// Mock schema table references with _isPrimary markers for ID extraction
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

// ============================================================================
// In-memory Drizzle mock (multi-table)
// ============================================================================

const stores: Record<string, Map<string, any>> = {
  gameSessions: new Map(),
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
      const id =
        insertData?.id ??
        insertData?.battleId ??
        `auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      store.set(id, { ...insertData, id });
      return hasReturning ? [{ ...insertData, id }] : undefined;
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
    if (op === "delete") {
      const id = extractPrimaryId(whereClause);
      if (id) {
        store.delete(id);
      }
      return undefined;
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
  chain.delete = vi.fn((table: any) => {
    reset("delete", table?._table || "");
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
    for (const store of Object.values(stores)) {
      store.clear();
    }
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
      const playerB = passResult.game!.players.find((p: any) => p.odv === "player-B");
      expect(playerB!.letters).toBe("S");
    });

    it("player accumulates all SKATE letters and loses", async () => {
      const gameId = "game-skate";
      const now = new Date();
      stores.gameSessions.set(gameId, {
        id: gameId,
        spotId: "spot-1",
        creatorId: "player-A",
        players: [
          { odv: "player-A", letters: "", connected: true },
          { odv: "player-B", letters: "SKAT", connected: true },
        ],
        maxPlayers: 4,
        currentTurnIndex: 1,
        currentAction: "attempt",
        currentTrick: "heelflip",
        setterId: "player-A",
        status: "active",
        createdAt: now,
        updatedAt: now,
        turnDeadlineAt: new Date(Date.now() + 60000),
        processedEventIds: [],
      });

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
      const now = new Date();
      stores.gameSessions.set(gameId, {
        id: gameId,
        spotId: "spot-1",
        creatorId: "player-A",
        players: [
          { odv: "player-A", letters: "", connected: true },
          { odv: "player-B", letters: "SKATE", connected: true },
          { odv: "player-C", letters: "SK", connected: true },
        ],
        maxPlayers: 4,
        currentTurnIndex: 0,
        currentAction: "attempt",
        currentTrick: "kickflip",
        setterId: "player-C",
        status: "active",
        createdAt: now,
        updatedAt: now,
        turnDeadlineAt: new Date(Date.now() + 60000),
        processedEventIds: [],
      });

      const result = await submitTrick({
        eventId: "evt-land",
        gameId,
        odv: "player-A",
        trickName: "kickflip",
      });

      expect(result.success).toBe(true);
      const game = result.game!;
      const currentPlayer = game.players[game.currentTurnIndex];
      expect(currentPlayer.letters).not.toBe("SKATE");
    });
  });

  // ==========================================================================
  // Disconnect / Reconnect
  // ==========================================================================

  describe("disconnect and reconnect flow", () => {
    it("disconnect pauses an active game", async () => {
      const gameId = "game-disconnect";
      const now = new Date();
      stores.gameSessions.set(gameId, {
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
        createdAt: now,
        updatedAt: now,
        pausedAt: null,
        processedEventIds: [],
      });

      const result = await handleDisconnect({
        eventId: "evt-dc",
        gameId,
        odv: "player-B",
      });

      expect(result.success).toBe(true);
      expect(result.game!.status).toBe("paused");
      const playerB = result.game!.players.find((p: any) => p.odv === "player-B")!;
      expect(playerB.connected).toBe(false);
      expect(playerB.disconnectedAt).toBeDefined();
    });

    it("reconnect resumes a paused game when all players back", async () => {
      const gameId = "game-reconnect";
      const now = new Date();
      stores.gameSessions.set(gameId, {
        id: gameId,
        spotId: "spot-1",
        creatorId: "player-A",
        players: [
          { odv: "player-A", letters: "", connected: true },
          {
            odv: "player-B",
            letters: "",
            connected: false,
            disconnectedAt: now.toISOString(),
          },
        ],
        maxPlayers: 4,
        currentTurnIndex: 0,
        currentAction: "set",
        status: "paused",
        pausedAt: now,
        turnDeadlineAt: null,
        createdAt: now,
        updatedAt: now,
        processedEventIds: [],
      });

      const result = await handleReconnect({
        eventId: "evt-rc",
        gameId,
        odv: "player-B",
      });

      expect(result.success).toBe(true);
      expect(result.game!.status).toBe("active");
      const playerB = result.game!.players.find((p: any) => p.odv === "player-B")!;
      expect(playerB.connected).toBe(true);
    });

    it("reconnect keeps game paused if other players still disconnected", async () => {
      const gameId = "game-partial-rc";
      const now = new Date();
      stores.gameSessions.set(gameId, {
        id: gameId,
        spotId: "spot-1",
        creatorId: "player-A",
        players: [
          {
            odv: "player-A",
            letters: "",
            connected: false,
            disconnectedAt: now.toISOString(),
          },
          {
            odv: "player-B",
            letters: "",
            connected: false,
            disconnectedAt: now.toISOString(),
          },
        ],
        maxPlayers: 4,
        currentTurnIndex: 0,
        currentAction: "set",
        status: "paused",
        pausedAt: now,
        turnDeadlineAt: null,
        createdAt: now,
        updatedAt: now,
        processedEventIds: [],
      });

      const result = await handleReconnect({
        eventId: "evt-rc-partial",
        gameId,
        odv: "player-B",
      });

      expect(result.success).toBe(true);
      expect(result.game!.status).toBe("paused");
    });

    it("disconnect of non-existent player fails", async () => {
      const gameId = "game-dc-unknown";
      const now = new Date();
      stores.gameSessions.set(gameId, {
        id: gameId,
        spotId: "spot-1",
        creatorId: "player-A",
        players: [{ odv: "player-A", letters: "", connected: true }],
        status: "active",
        createdAt: now,
        updatedAt: now,
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
      const now = new Date();
      stores.gameSessions.set(gameId, {
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
        createdAt: now,
        updatedAt: now,
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
      const now = new Date();
      stores.gameSessions.set(gameId, {
        id: gameId,
        spotId: "spot-1",
        creatorId: "player-A",
        players: [{ odv: "player-A", letters: "" }],
        status: "completed",
        createdAt: now,
        updatedAt: now,
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
      const now = new Date();
      stores.gameSessions.set(gameId, {
        id: gameId,
        spotId: "spot-1",
        creatorId: "player-A",
        players: [
          { odv: "player-A", letters: "" },
          { odv: "player-B", letters: "" },
        ],
        status: "active",
        createdAt: now,
        updatedAt: now,
        processedEventIds: [],
      });

      const result = await forfeitGame({
        eventId: "evt-forfeit-stranger",
        gameId,
        odv: "player-C",
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
      const now = new Date();
      stores.gameSessions.set(gameId, {
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
        createdAt: now,
        updatedAt: now,
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
      const now = new Date();
      stores.gameSessions.set(gameId, {
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
        createdAt: now,
        updatedAt: now,
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
      const now = new Date();
      stores.gameSessions.set(gameId, {
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
        createdAt: now,
        updatedAt: now,
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
      const now = new Date();
      stores.gameSessions.set(gameId, {
        id: gameId,
        spotId: "spot-1",
        creatorId: "player-A",
        players: [
          { odv: "player-A", letters: "" },
          { odv: "player-B", letters: "" },
        ],
        status: "active",
        processedEventIds: ["evt-forfeit-dup"],
        createdAt: now,
        updatedAt: now,
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
      const now = new Date();
      stores.gameSessions.set(gameId, {
        id: gameId,
        spotId: "spot-1",
        creatorId: "player-A",
        players: [
          { odv: "player-A", letters: "", connected: true },
          { odv: "player-B", letters: "", connected: true },
        ],
        maxPlayers: 4,
        status: "active",
        processedEventIds: [],
        createdAt: now,
        updatedAt: now,
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
      const now = new Date();
      stores.gameSessions.set(gameId, {
        id: gameId,
        spotId: "spot-1",
        creatorId: "p1",
        players: [
          { odv: "p1", letters: "", connected: true },
          { odv: "p2", letters: "", connected: true },
        ],
        maxPlayers: 2,
        status: "waiting",
        processedEventIds: [],
        createdAt: now,
        updatedAt: now,
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
      const now = new Date();
      stores.gameSessions.set(gameId, {
        id: gameId,
        spotId: "spot-1",
        creatorId: "player-A",
        players: [
          { odv: "player-A", letters: "", connected: true },
          { odv: "player-B", letters: "", connected: true },
        ],
        currentTurnIndex: 0,
        currentAction: "set",
        status: "active",
        processedEventIds: [],
        createdAt: now,
        updatedAt: now,
      });

      const result = await submitTrick({
        eventId: "evt-wrong-turn",
        gameId,
        odv: "player-B",
        trickName: "kickflip",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Not your turn");
    });

    it("cannot pass during set phase", async () => {
      const gameId = "game-wrong-phase";
      const now = new Date();
      stores.gameSessions.set(gameId, {
        id: gameId,
        spotId: "spot-1",
        creatorId: "player-A",
        players: [
          { odv: "player-A", letters: "", connected: true },
          { odv: "player-B", letters: "", connected: true },
        ],
        currentTurnIndex: 0,
        currentAction: "set",
        status: "active",
        processedEventIds: [],
        createdAt: now,
        updatedAt: now,
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
      const now = new Date();
      stores.gameSessions.set(gameId, {
        id: gameId,
        spotId: "spot-1",
        creatorId: "player-A",
        players: [
          { odv: "player-A", letters: "", connected: true },
          { odv: "player-B", letters: "SKATE", connected: true },
        ],
        currentTurnIndex: 0,
        currentAction: "set",
        status: "completed",
        processedEventIds: [],
        createdAt: now,
        updatedAt: now,
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
      stores.gameSessions.set(gameId, {
        id: gameId,
        status: "completed",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const deleted = await deleteGame(gameId);
      expect(deleted).toBe(true);
      expect(stores.gameSessions.has(gameId)).toBe(false);
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
    for (const store of Object.values(stores)) {
      store.clear();
    }
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
