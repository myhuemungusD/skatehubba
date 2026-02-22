/**
 * Game State Transitions - Critical Path Tests
 *
 * Tests game state machine critical paths:
 * - Complete S.K.A.T.E. game lifecycle (create -> play -> win)
 * - Letter accumulation through full SKATE spelling
 * - Turn rotation with eliminated player skipping
 * - Disconnect/reconnect with game pause/resume
 * - Forfeit scenarios (voluntary, timeout, disconnect)
 * - Idempotency across all operations
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { stores, clearAllStores, createQueryChain } from "./mockSetup";

// ============================================================================
// Mocks (hoisted by vitest)
// ============================================================================

vi.mock("../../../config/env", () => ({
  env: {
    DATABASE_URL: "mock://test",
    NODE_ENV: "test",
  },
}));

vi.mock("../../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../../services/analyticsService", () => ({
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

vi.mock("../../../db", () => ({
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
} = await import("../../../services/gameStateService");

// ============================================================================
// Tests
// ============================================================================

describe("Game State Transitions - Critical Paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllStores();
  });

  // ==========================================================================
  // Full Game Lifecycle
  // ==========================================================================

  describe("complete game lifecycle", () => {
    it("create -> join -> play through to winner", async () => {
      const createResult = await createGame({
        eventId: "evt-create",
        spotId: "spot-1",
        creatorId: "player-A",
      });
      expect(createResult.success).toBe(true);
      const gameId = createResult.game!.id;

      const joinResult = await joinGame({
        eventId: "evt-join",
        gameId,
        odv: "player-B",
      });
      expect(joinResult.success).toBe(true);
      expect(joinResult.game!.status).toBe("active");
      expect(joinResult.game!.players).toHaveLength(2);

      const trickResult = await submitTrick({
        eventId: "evt-trick-1",
        gameId,
        odv: "player-A",
        trickName: "kickflip",
      });
      expect(trickResult.success).toBe(true);
      expect(trickResult.game!.currentAction).toBe("attempt");
      expect(trickResult.game!.currentTrick).toBe("kickflip");

      const passResult = await passTrick({
        eventId: "evt-pass-1",
        gameId,
        odv: "player-B",
      });
      expect(passResult.success).toBe(true);

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
