/**
 * @fileoverview Unit tests for game timeout processing
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const mockDbChain: any = {};
mockDbChain.select = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.from = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.where = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.for = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.update = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.set = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);

const mockTransaction = vi.fn();

vi.mock("../db", () => ({
  getDb: () => ({
    ...mockDbChain,
    transaction: mockTransaction,
  }),
}));

vi.mock("@shared/schema", () => ({
  gameSessions: {
    _table: "game_sessions",
    id: "id",
    status: "status",
    turnDeadlineAt: "turnDeadlineAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  lt: vi.fn(),
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

vi.mock("../services/game/constants", () => ({
  MAX_PROCESSED_EVENTS: 100,
  RECONNECT_WINDOW_MS: 60000,
  TURN_TIMEOUT_MS: 120000,
}));

vi.mock("../services/game/helpers", () => ({
  generateEventId: (...args: any[]) => `event_${args.join("_")}`,
  isEliminated: (letters: string) => letters.length >= 5,
  rowToGameState: (row: any) => ({
    ...row,
    id: row.id,
    status: row.status,
    currentAction: row.currentAction || "set",
    currentTurnIndex: row.currentTurnIndex || 0,
    setterId: row.setterId,
    players: row.players || [],
    processedEventIds: row.processedEventIds || [],
  }),
}));

const mockForfeitGame = vi.fn().mockResolvedValue(undefined);
vi.mock("../services/game/forfeit", () => ({
  forfeitGame: (...args: any[]) => mockForfeitGame(...args),
}));

const { processTimeouts } = await import("../services/game/timeouts");

// ============================================================================
// Tests
// ============================================================================

describe("Game Timeouts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);
    mockDbChain.select = vi.fn().mockReturnValue(mockDbChain);
  });

  it("should handle no active games with expired deadlines", async () => {
    mockDbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);
    await processTimeouts();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("should process attempt phase timeout (rotate setter)", async () => {
    const now = new Date();
    const expiredGame = {
      id: "game-1",
      status: "active",
      currentAction: "attempt",
      currentTurnIndex: 0,
      setterId: "player-A",
      turnDeadlineAt: new Date(now.getTime() - 1000),
      players: [
        { odv: "player-A", letters: "", connected: true },
        { odv: "player-B", letters: "", connected: true },
      ],
      processedEventIds: [],
    };

    let selectCallCount = 0;
    mockDbChain.then = (resolve: any) => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return Promise.resolve([expiredGame]).then(resolve);
      }
      return Promise.resolve([]).then(resolve);
    };

    mockTransaction.mockImplementation(async (fn: any) => {
      const freshGame = { ...expiredGame };
      const tx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              for: vi.fn().mockResolvedValue([freshGame]),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      };
      await fn(tx);
    });

    await processTimeouts();
    expect(mockTransaction).toHaveBeenCalled();
  });

  it("should forfeit on set phase timeout", async () => {
    const now = new Date();
    const expiredGame = {
      id: "game-2",
      status: "active",
      currentAction: "set",
      currentTurnIndex: 0,
      setterId: null,
      turnDeadlineAt: new Date(now.getTime() - 1000),
      players: [
        { odv: "player-A", letters: "", connected: true },
        { odv: "player-B", letters: "", connected: true },
      ],
      processedEventIds: [],
    };

    let selectCallCount = 0;
    mockDbChain.then = (resolve: any) => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return Promise.resolve([expiredGame]).then(resolve);
      }
      return Promise.resolve([]).then(resolve);
    };

    mockTransaction.mockImplementation(async (fn: any) => {
      const freshGame = { ...expiredGame };
      const tx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              for: vi.fn().mockResolvedValue([freshGame]),
            }),
          }),
        }),
      };
      return await fn(tx);
    });

    await processTimeouts();
    expect(mockForfeitGame).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: "game-2",
        reason: "turn_timeout",
      })
    );
  });

  it("should forfeit paused game with disconnected player past window", async () => {
    const now = new Date();
    const pausedGame = {
      id: "game-3",
      status: "paused",
      currentAction: "set",
      currentTurnIndex: 0,
      players: [
        {
          odv: "player-A",
          letters: "",
          connected: false,
          disconnectedAt: new Date(now.getTime() - 120000).toISOString(),
        },
        { odv: "player-B", letters: "", connected: true },
      ],
      processedEventIds: [],
    };

    let selectCallCount = 0;
    mockDbChain.then = (resolve: any) => {
      selectCallCount++;
      if (selectCallCount === 1) return Promise.resolve([]).then(resolve);
      if (selectCallCount === 2) return Promise.resolve([pausedGame]).then(resolve);
      return Promise.resolve([]).then(resolve);
    };

    mockTransaction.mockImplementation(async (fn: any) => {
      const freshGame = { ...pausedGame };
      const tx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              for: vi.fn().mockResolvedValue([freshGame]),
            }),
          }),
        }),
      };
      return await fn(tx);
    });

    await processTimeouts();
    expect(mockForfeitGame).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: "game-3",
        reason: "disconnect_timeout",
      })
    );
  });

  it("should handle errors gracefully", async () => {
    mockDbChain.select = vi.fn(() => {
      throw new Error("DB error");
    });
    await processTimeouts();
    // Should not throw
    mockDbChain.select = vi.fn().mockReturnValue(mockDbChain);
  });
});
