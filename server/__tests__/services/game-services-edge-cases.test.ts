/**
 * @fileoverview Additional coverage tests for game service files
 *
 * Targets specific uncovered lines in:
 * - server/services/game/connection.ts (lines 80, 105, 151-152)
 * - server/services/game/createJoin.ts (lines 56-57, 134-135)
 * - server/services/game/forfeit.ts (lines 84-85)
 * - server/services/game/queries.ts (lines 24-25, 39-40)
 * - server/services/game/timeouts.ts (lines 65-66, 158)
 * - server/services/game/tricks.ts (lines 227-228, 289-290)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Shared mocks and helpers
// ============================================================================

vi.mock("../../logger", () => ({
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

vi.mock("../../services/analyticsService", () => ({
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

// ============================================================================
// In-memory Drizzle mock (same pattern as gameStateService.test.ts)
// ============================================================================

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

/** Flag to force next DB operation to throw */
let forceDbError = false;
let forceTransactionError = false;

function createQueryChain() {
  let op = "select";
  let setData: any = null;
  let insertData: any = null;
  let whereClause: any = null;
  let hasReturning = false;

  const resolve = () => {
    if (forceDbError) {
      throw new Error("Database connection failed");
    }

    if (op === "select") {
      const id = extractPrimaryId(whereClause);
      if (id) {
        const row = gameStore.get(id);
        return row ? [row] : [];
      }
      return Array.from(gameStore.values());
    }
    if (op === "insert") {
      const id = insertData?.id ?? `auto-${Date.now()}`;
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

vi.mock("../../db", () => ({
  getDb: () => ({
    ...mockChain,
    transaction: vi.fn(async (callback: any) => {
      if (forceTransactionError) {
        throw new Error("Transaction failed");
      }
      return callback(mockChain);
    }),
  }),
}));

// ============================================================================
// Imports after mocks
// ============================================================================

const { handleDisconnect, handleReconnect } = await import("../../services/game/connection");
const { createGame, joinGame } = await import("../../services/game/createJoin");
const { forfeitGame } = await import("../../services/game/forfeit");
const { getGameState, deleteGame } = await import("../../services/game/queries");
const { processTimeouts } = await import("../../services/game/timeouts");
const { submitTrick, passTrick } = await import("../../services/game/tricks");
const logger = (await import("../../logger")).default;

// ============================================================================
// Tests
// ============================================================================

describe("Game Services — Coverage for Error Catch Paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gameStore.clear();
    forceDbError = false;
    forceTransactionError = false;
  });

  afterEach(() => {
    forceDbError = false;
    forceTransactionError = false;
  });

  // ===========================================================================
  // connection.ts — error catches (lines 80, 105, 151-152)
  // ===========================================================================

  describe("connection.ts — handleDisconnect error catch (line 80)", () => {
    it("returns failure when transaction throws", async () => {
      forceTransactionError = true;

      const result = await handleDisconnect({
        eventId: "disconnect-err-1",
        gameId: "nonexistent",
        odv: "player-1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to handle disconnect");
      expect(logger.error).toHaveBeenCalledWith(
        "[GameState] Failed to handle disconnect",
        expect.objectContaining({ gameId: "nonexistent", odv: "player-1" })
      );
    });
  });

  describe("connection.ts — handleReconnect game not found (line 105)", () => {
    it("returns failure when game does not exist", async () => {
      const result = await handleReconnect({
        eventId: "reconnect-notfound-1",
        gameId: "missing-game",
        odv: "player-1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Game not found");
    });
  });

  describe("connection.ts — handleReconnect error catch (lines 151-152)", () => {
    it("returns failure when transaction throws", async () => {
      forceTransactionError = true;

      const result = await handleReconnect({
        eventId: "reconnect-err-1",
        gameId: "some-game",
        odv: "player-1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to handle reconnect");
      expect(logger.error).toHaveBeenCalledWith(
        "[GameState] Failed to handle reconnect",
        expect.objectContaining({ gameId: "some-game", odv: "player-1" })
      );
    });
  });

  // ===========================================================================
  // createJoin.ts — error catches (lines 56-57, 134-135)
  // ===========================================================================

  describe("createJoin.ts — createGame error catch (lines 56-57)", () => {
    it("returns failure when db insert throws", async () => {
      forceDbError = true;

      const result = await createGame({
        eventId: "create-err-1",
        spotId: "spot-err",
        creatorId: "player-err",
        maxPlayers: 4,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to create game");
      expect(logger.error).toHaveBeenCalledWith(
        "[GameState] Failed to create game",
        expect.objectContaining({ creatorId: "player-err", spotId: "spot-err" })
      );
    });
  });

  describe("createJoin.ts — joinGame error catch (lines 134-135)", () => {
    it("returns failure when transaction throws", async () => {
      forceTransactionError = true;

      const result = await joinGame({
        eventId: "join-err-1",
        gameId: "some-game",
        odv: "player-err",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to join game");
      expect(logger.error).toHaveBeenCalledWith(
        "[GameState] Failed to join game",
        expect.objectContaining({ gameId: "some-game", odv: "player-err" })
      );
    });
  });

  // ===========================================================================
  // forfeit.ts — error catch (lines 84-85)
  // ===========================================================================

  describe("forfeit.ts — forfeitGame error catch (lines 84-85)", () => {
    it("returns failure when transaction throws", async () => {
      forceTransactionError = true;

      const result = await forfeitGame({
        eventId: "forfeit-err-1",
        gameId: "some-game",
        odv: "player-err",
        reason: "voluntary",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to forfeit game");
      expect(logger.error).toHaveBeenCalledWith(
        "[GameState] Failed to forfeit game",
        expect.objectContaining({ gameId: "some-game", odv: "player-err" })
      );
    });
  });

  // ===========================================================================
  // queries.ts — error catches (lines 24-25, 39-40)
  // ===========================================================================

  describe("queries.ts — getGameState error catch (lines 24-25)", () => {
    it("returns null when db query throws", async () => {
      forceDbError = true;

      const result = await getGameState("err-game-id");

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        "[GameState] Failed to get game state",
        expect.objectContaining({ gameId: "err-game-id" })
      );
    });
  });

  describe("queries.ts — deleteGame error catch (lines 39-40)", () => {
    it("returns false when db delete throws", async () => {
      forceDbError = true;

      const result = await deleteGame("err-game-id");

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        "[GameState] Failed to delete game",
        expect.objectContaining({ gameId: "err-game-id" })
      );
    });
  });

  // ===========================================================================
  // timeouts.ts — edge cases (lines 65-66, 158)
  // ===========================================================================

  describe("timeouts.ts — attempt phase timeout with multi-skip loop (lines 65-66)", () => {
    it("skips eliminated players when finding new setter after attempt timeout", async () => {
      const pastDeadline = new Date(Date.now() - 10_000);

      gameStore.set("timeout-attempt-game", {
        id: "timeout-attempt-game",
        spotId: "spot-1",
        creatorId: "player-1",
        players: [
          { odv: "player-1", letters: "", connected: true },
          { odv: "player-2", letters: "SKATE", connected: true }, // Eliminated
          { odv: "player-3", letters: "S", connected: true },
        ],
        maxPlayers: 4,
        currentTurnIndex: 2, // player-3 is attempting
        currentAction: "attempt",
        currentTrick: "Kickflip",
        setterId: "player-1",
        status: "active",
        turnDeadlineAt: pastDeadline,
        pausedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        processedEventIds: [],
      });

      await processTimeouts();

      // The timeout handler should have processed the game
      const updated = gameStore.get("timeout-attempt-game");
      // New setter should skip eliminated player-2 (index 1)
      expect(updated.currentAction).toBe("set");
      expect(updated.currentTurnIndex).toBe(2); // player-3 becomes new setter (skip player-2)
    });
  });

  describe("timeouts.ts — disconnect timeout processing (line 158)", () => {
    it("processes paused games with expired reconnect window", async () => {
      const longAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min ago

      gameStore.set("timeout-paused-game", {
        id: "timeout-paused-game",
        spotId: "spot-1",
        creatorId: "player-1",
        players: [
          { odv: "player-1", letters: "", connected: false, disconnectedAt: longAgo },
          { odv: "player-2", letters: "", connected: true },
        ],
        maxPlayers: 4,
        currentTurnIndex: 0,
        currentAction: "set",
        status: "paused",
        turnDeadlineAt: null,
        pausedAt: new Date(Date.now() - 5 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
        processedEventIds: [],
      });

      await processTimeouts();

      // The game should have been forfeited due to disconnect timeout
      const updated = gameStore.get("timeout-paused-game");
      expect(updated.status).toBe("completed");
      expect(updated.winnerId).toBe("player-2");
    });
  });

  describe("timeouts.ts — top-level error catch", () => {
    it("catches errors at the top level and logs", async () => {
      // Make the initial query throw
      forceDbError = true;

      await processTimeouts(); // Should not throw

      expect(logger.error).toHaveBeenCalledWith(
        "[GameState] Failed to process timeouts",
        expect.any(Object)
      );
    });
  });

  // ===========================================================================
  // tricks.ts — multi-skip loop in submitTrick (lines 227-228)
  // ===========================================================================

  describe("tricks.ts — submitTrick multi-skip in attempt phase (lines 227-228)", () => {
    it("skips multiple eliminated players when advancing turn in attempt phase", async () => {
      gameStore.set("trick-multiskip-game", {
        id: "trick-multiskip-game",
        spotId: "spot-1",
        creatorId: "player-1",
        players: [
          { odv: "player-1", letters: "", connected: true }, // setter
          { odv: "player-2", letters: "SKATE", connected: true }, // eliminated
          { odv: "player-3", letters: "SKATE", connected: true }, // eliminated
          { odv: "player-4", letters: "S", connected: true }, // active
        ],
        maxPlayers: 4,
        currentTurnIndex: 3, // player-4 is attempting
        currentAction: "attempt",
        currentTrick: "Kickflip",
        setterId: "player-1",
        status: "active",
        turnDeadlineAt: null,
        pausedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        processedEventIds: [],
      });

      const result = await submitTrick({
        eventId: "trick-multiskip-1",
        gameId: "trick-multiskip-game",
        odv: "player-4",
        trickName: "Kickflip",
      });

      expect(result.success).toBe(true);
      // After player-4 attempts, next is player-1 (index 0) which is the setter
      // so it should rotate to a new setter. The new setter should skip
      // eliminated players 2 and 3.
      expect(result.game!.currentAction).toBe("set");
    });
  });

  // ===========================================================================
  // tricks.ts — passTrick error catch (lines 289-290)
  // ===========================================================================

  describe("tricks.ts — passTrick error catch (lines 289-290)", () => {
    it("returns failure when transaction throws", async () => {
      forceTransactionError = true;

      const result = await passTrick({
        eventId: "pass-err-1",
        gameId: "some-game",
        odv: "player-err",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to pass trick");
      expect(logger.error).toHaveBeenCalledWith(
        "[GameState] Failed to pass trick",
        expect.objectContaining({ gameId: "some-game", odv: "player-err" })
      );
    });
  });

  // ===========================================================================
  // tricks.ts — passTrick multi-skip loop (lines 227-228 in pass context)
  // ===========================================================================

  describe("tricks.ts — passTrick multi-skip during turn advance", () => {
    it("skips eliminated players when advancing to next attempter after pass", async () => {
      gameStore.set("pass-multiskip-game", {
        id: "pass-multiskip-game",
        spotId: "spot-1",
        creatorId: "player-1",
        players: [
          { odv: "player-1", letters: "", connected: true }, // setter (index 0)
          { odv: "player-2", letters: "", connected: true }, // current attempter (index 1)
          { odv: "player-3", letters: "SKATE", connected: true }, // eliminated (index 2)
          { odv: "player-4", letters: "SKATE", connected: true }, // eliminated (index 3)
        ],
        maxPlayers: 4,
        currentTurnIndex: 1, // player-2's turn to attempt
        currentAction: "attempt",
        currentTrick: "Kickflip",
        setterId: "player-1",
        status: "active",
        turnDeadlineAt: null,
        pausedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        processedEventIds: [],
      });

      const result = await passTrick({
        eventId: "pass-multiskip-1",
        gameId: "pass-multiskip-game",
        odv: "player-2",
      });

      expect(result.success).toBe(true);
      expect(result.letterGained).toBe("S");
      // Next turn should skip eliminated players 3 and 4
      // and wrap around to player-1 (setter), triggering new setter rotation
      expect(result.game!.currentAction).toBe("set");
    });

    it("ends game when only one player remains after pass", async () => {
      gameStore.set("pass-endgame", {
        id: "pass-endgame",
        spotId: "spot-1",
        creatorId: "player-1",
        players: [
          { odv: "player-1", letters: "", connected: true }, // setter
          { odv: "player-2", letters: "SKAT", connected: true }, // will be eliminated
        ],
        maxPlayers: 4,
        currentTurnIndex: 1,
        currentAction: "attempt",
        currentTrick: "Kickflip",
        setterId: "player-1",
        status: "active",
        turnDeadlineAt: null,
        pausedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        processedEventIds: [],
      });

      const result = await passTrick({
        eventId: "pass-end-1",
        gameId: "pass-endgame",
        odv: "player-2",
      });

      expect(result.success).toBe(true);
      expect(result.isEliminated).toBe(true);
      expect(result.game!.status).toBe("completed");
      expect(result.game!.winnerId).toBe("player-1");
    });
  });

  // ===========================================================================
  // tricks.ts — submitTrick error catch (implicit from lines around 147-149)
  // ===========================================================================

  describe("tricks.ts — submitTrick error catch", () => {
    it("returns failure when transaction throws", async () => {
      forceTransactionError = true;

      const result = await submitTrick({
        eventId: "trick-err-1",
        gameId: "some-game",
        odv: "player-err",
        trickName: "Kickflip",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to submit trick");
      expect(logger.error).toHaveBeenCalledWith(
        "[GameState] Failed to submit trick",
        expect.objectContaining({ gameId: "some-game", odv: "player-err" })
      );
    });
  });

  // ===========================================================================
  // connection.ts — handleDisconnect game not found
  // ===========================================================================

  describe("connection.ts — handleDisconnect returns not found for missing game", () => {
    it("returns game not found", async () => {
      const result = await handleDisconnect({
        eventId: "dc-notfound-1",
        gameId: "missing-game",
        odv: "player-1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Game not found");
    });
  });

  // ===========================================================================
  // connection.ts — handleDisconnect player not in game
  // ===========================================================================

  describe("connection.ts — handleDisconnect player not in game", () => {
    it("returns player not in game error", async () => {
      gameStore.set("dc-noplayer-game", {
        id: "dc-noplayer-game",
        spotId: "spot-1",
        creatorId: "player-1",
        players: [{ odv: "player-1", letters: "", connected: true }],
        maxPlayers: 4,
        currentTurnIndex: 0,
        currentAction: "set",
        status: "active",
        turnDeadlineAt: null,
        pausedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        processedEventIds: [],
      });

      const result = await handleDisconnect({
        eventId: "dc-noplayer-1",
        gameId: "dc-noplayer-game",
        odv: "unknown-player",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Player not in game");
    });
  });

  // ===========================================================================
  // connection.ts — handleReconnect player not in game
  // ===========================================================================

  describe("connection.ts — handleReconnect player not in game", () => {
    it("returns player not in game error", async () => {
      gameStore.set("rc-noplayer-game", {
        id: "rc-noplayer-game",
        spotId: "spot-1",
        creatorId: "player-1",
        players: [{ odv: "player-1", letters: "", connected: true }],
        maxPlayers: 4,
        currentTurnIndex: 0,
        currentAction: "set",
        status: "paused",
        turnDeadlineAt: null,
        pausedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        processedEventIds: [],
      });

      const result = await handleReconnect({
        eventId: "rc-noplayer-1",
        gameId: "rc-noplayer-game",
        odv: "unknown-player",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Player not in game");
    });
  });

  // ===========================================================================
  // timeouts.ts — set phase timeout (forfeit)
  // ===========================================================================

  describe("timeouts.ts — set phase timeout triggers forfeit", () => {
    it("forfeits game when setter times out during set phase", async () => {
      const pastDeadline = new Date(Date.now() - 10_000);

      gameStore.set("timeout-set-game", {
        id: "timeout-set-game",
        spotId: "spot-1",
        creatorId: "player-1",
        players: [
          { odv: "player-1", letters: "", connected: true },
          { odv: "player-2", letters: "", connected: true },
        ],
        maxPlayers: 4,
        currentTurnIndex: 0,
        currentAction: "set",
        status: "active",
        turnDeadlineAt: pastDeadline,
        pausedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        processedEventIds: [],
      });

      await processTimeouts();

      const updated = gameStore.get("timeout-set-game");
      expect(updated.status).toBe("completed");
      expect(updated.winnerId).toBe("player-2");
    });
  });

  // ===========================================================================
  // tricks.ts — passTrick game not found (line 174)
  // ===========================================================================

  describe("tricks.ts — passTrick game not found (line 174)", () => {
    it("returns failure when game does not exist", async () => {
      const result = await passTrick({
        eventId: "pass-notfound-1",
        gameId: "missing-game",
        odv: "player-1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Game not found");
    });
  });

  // ===========================================================================
  // tricks.ts — submitTrick mid-round attempt branch (line 117)
  // ===========================================================================

  describe("tricks.ts — submitTrick mid-round next attempter (line 117)", () => {
    it("advances to next attempter when not back to setter", async () => {
      // 3-player game: player-1 is setter, player-2 is current attempter,
      // player-3 still needs to attempt. After player-2 submits, the turn
      // should go to player-3 (the else branch at line 117).
      gameStore.set("trick-midround-game", {
        id: "trick-midround-game",
        spotId: "spot-1",
        creatorId: "player-1",
        players: [
          { odv: "player-1", letters: "", connected: true }, // setter (index 0)
          { odv: "player-2", letters: "", connected: true }, // current attempter (index 1)
          { odv: "player-3", letters: "", connected: true }, // next attempter (index 2)
        ],
        maxPlayers: 4,
        currentTurnIndex: 1, // player-2's turn to attempt
        currentAction: "attempt",
        currentTrick: "Kickflip",
        setterId: "player-1",
        status: "active",
        turnDeadlineAt: null,
        pausedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        processedEventIds: [],
      });

      const result = await submitTrick({
        eventId: "trick-midround-1",
        gameId: "trick-midround-game",
        odv: "player-2",
        trickName: "Kickflip",
      });

      expect(result.success).toBe(true);
      expect(result.game!.currentAction).toBe("attempt");
      expect(result.game!.currentTrick).toBe("Kickflip");
      // Should advance to player-3 (index 2), not back to setter
      expect(result.game!.players[result.game!.currentTurnIndex].odv).toBe("player-3");
    });
  });
});
