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

vi.mock("../../db", () => ({
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

vi.mock("../../services/game/constants", () => ({
  MAX_PROCESSED_EVENTS: 100,
  RECONNECT_WINDOW_MS: 60000,
  TURN_TIMEOUT_MS: 120000,
}));

vi.mock("../../services/game/helpers", () => ({
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
vi.mock("../../services/game/forfeit", () => ({
  forfeitGame: (...args: any[]) => mockForfeitGame(...args),
}));

const { processTimeouts } = await import("../../services/game/timeouts");

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

  it("should skip attempt timeout when fresh game is no longer active", async () => {
    const now = new Date();
    const expiredGame = {
      id: "game-stale",
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
      // Fresh game is now completed (status changed between outer query and transaction)
      const freshGame = { ...expiredGame, status: "completed" };
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
    // Transaction called but no update because status is no longer active
    expect(mockTransaction).toHaveBeenCalled();
  });

  it("should skip attempt timeout when deadline no longer expired", async () => {
    const now = new Date();
    const expiredGame = {
      id: "game-deadline-reset",
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
      // Deadline was reset to a future time
      const freshGame = {
        ...expiredGame,
        turnDeadlineAt: new Date(Date.now() + 60000),
      };
      const tx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              for: vi.fn().mockResolvedValue([freshGame]),
            }),
          }),
        }),
      };
      await fn(tx);
    });

    await processTimeouts();
    expect(mockTransaction).toHaveBeenCalled();
  });

  it("should skip attempt timeout when event already processed (dedup)", async () => {
    const now = new Date();
    const deadline = new Date(now.getTime() - 1000);
    const expiredGame = {
      id: "game-dedup",
      status: "active",
      currentAction: "attempt",
      currentTurnIndex: 0,
      setterId: "player-A",
      turnDeadlineAt: deadline,
      players: [
        { odv: "player-A", letters: "", connected: true },
        { odv: "player-B", letters: "", connected: true },
      ],
      // Event already processed
      processedEventIds: [`event_timeout_player-A_game-dedup_deadline-${deadline.toISOString()}`],
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
      const tx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              for: vi.fn().mockResolvedValue([expiredGame]),
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

  it("should skip attempt timeout when fresh game not found in transaction", async () => {
    const now = new Date();
    const expiredGame = {
      id: "game-deleted",
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
      const tx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              for: vi.fn().mockResolvedValue([]), // Game not found
            }),
          }),
        }),
      };
      await fn(tx);
    });

    await processTimeouts();
    expect(mockTransaction).toHaveBeenCalled();
  });

  it("should skip set timeout when fresh game not found in transaction", async () => {
    const now = new Date();
    const expiredGame = {
      id: "game-set-deleted",
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
      const tx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              for: vi.fn().mockResolvedValue([]), // Game deleted
            }),
          }),
        }),
      };
      return await fn(tx);
    });

    await processTimeouts();
    expect(mockForfeitGame).not.toHaveBeenCalled();
  });

  it("should skip set timeout when event already processed (dedup)", async () => {
    const now = new Date();
    const deadline = new Date(now.getTime() - 1000);
    const expiredGame = {
      id: "game-set-dedup",
      status: "active",
      currentAction: "set",
      currentTurnIndex: 0,
      setterId: null,
      turnDeadlineAt: deadline,
      players: [
        { odv: "player-A", letters: "", connected: true },
        { odv: "player-B", letters: "", connected: true },
      ],
      processedEventIds: [
        `event_timeout_player-A_game-set-dedup_deadline-${deadline.toISOString()}`,
      ],
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
      const tx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              for: vi.fn().mockResolvedValue([expiredGame]),
            }),
          }),
        }),
      };
      return await fn(tx);
    });

    await processTimeouts();
    expect(mockForfeitGame).not.toHaveBeenCalled();
  });

  it("should skip reconnect timeout when player reconnected", async () => {
    const now = new Date();
    const pausedGame = {
      id: "game-reconnected",
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
      // Player has reconnected in the meantime
      const freshGame = {
        ...pausedGame,
        players: [
          { odv: "player-A", letters: "", connected: true, disconnectedAt: null },
          { odv: "player-B", letters: "", connected: true },
        ],
      };
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
    expect(mockForfeitGame).not.toHaveBeenCalled();
  });

  it("should skip reconnect timeout when event already processed (dedup)", async () => {
    const now = new Date();
    const disconnectedAt = new Date(now.getTime() - 120000).toISOString();
    const pausedGame = {
      id: "game-reconn-dedup",
      status: "paused",
      currentAction: "set",
      currentTurnIndex: 0,
      players: [
        {
          odv: "player-A",
          letters: "",
          connected: false,
          disconnectedAt,
        },
        { odv: "player-B", letters: "", connected: true },
      ],
      processedEventIds: [
        `event_disconnect_timeout_player-A_game-reconn-dedup_disconnected-${disconnectedAt}`,
      ],
    };

    let selectCallCount = 0;
    mockDbChain.then = (resolve: any) => {
      selectCallCount++;
      if (selectCallCount === 1) return Promise.resolve([]).then(resolve);
      if (selectCallCount === 2) return Promise.resolve([pausedGame]).then(resolve);
      return Promise.resolve([]).then(resolve);
    };

    mockTransaction.mockImplementation(async (fn: any) => {
      const tx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              for: vi.fn().mockResolvedValue([pausedGame]),
            }),
          }),
        }),
      };
      return await fn(tx);
    });

    await processTimeouts();
    expect(mockForfeitGame).not.toHaveBeenCalled();
  });

  it("should skip reconnect timeout when fresh game not found", async () => {
    const now = new Date();
    const pausedGame = {
      id: "game-reconn-gone",
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
      const tx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              for: vi.fn().mockResolvedValue([]), // Game deleted
            }),
          }),
        }),
      };
      return await fn(tx);
    });

    await processTimeouts();
    expect(mockForfeitGame).not.toHaveBeenCalled();
  });

  it("should skip attempt timeout when action changed to set in fresh game", async () => {
    const now = new Date();
    const expiredGame = {
      id: "game-action-changed",
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
      // Action changed to "set" between outer query and transaction
      const freshGame = { ...expiredGame, currentAction: "set" };
      const tx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              for: vi.fn().mockResolvedValue([freshGame]),
            }),
          }),
        }),
      };
      await fn(tx);
    });

    await processTimeouts();
    expect(mockTransaction).toHaveBeenCalled();
  });

  it("should rotate setter past eliminated players on attempt timeout", async () => {
    const now = new Date();
    const expiredGame = {
      id: "game-rotate-elim",
      status: "active",
      currentAction: "attempt",
      currentTurnIndex: 0,
      setterId: "player-A",
      turnDeadlineAt: new Date(now.getTime() - 1000),
      players: [
        { odv: "player-A", letters: "", connected: true },
        { odv: "player-B", letters: "SKATE", connected: true }, // Eliminated
        { odv: "player-C", letters: "", connected: true },
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

    const mockUpdate = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    mockTransaction.mockImplementation(async (fn: any) => {
      const tx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              for: vi.fn().mockResolvedValue([expiredGame]),
            }),
          }),
        }),
        update: mockUpdate,
      };
      await fn(tx);
    });

    await processTimeouts();
    expect(mockUpdate).toHaveBeenCalled();
  });

  // =====================================================================
  // Additional branch coverage tests
  // =====================================================================

  it("should skip attempt timeout when freshPlayer is undefined (line 51)", async () => {
    const now = new Date();
    const expiredGame = {
      id: "game-bad-index-attempt",
      status: "active",
      currentAction: "attempt",
      currentTurnIndex: 5, // Out of bounds
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
      // Fresh game also has out-of-bounds currentTurnIndex
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
    // No update should occur because freshPlayer is undefined
  });

  it("should skip set timeout when deadline is no longer expired (line 102)", async () => {
    const now = new Date();
    const expiredGame = {
      id: "game-set-deadline-reset",
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
      // Deadline was reset to a future time in the set phase
      const freshGame = {
        ...expiredGame,
        turnDeadlineAt: new Date(Date.now() + 60000),
      };
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
    expect(mockForfeitGame).not.toHaveBeenCalled();
  });

  it("should skip set timeout when action changed from set (line 103)", async () => {
    const now = new Date();
    const expiredGame = {
      id: "game-set-action-changed",
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
      // Action changed from "set" to "attempt" between outer query and transaction
      const freshGame = { ...expiredGame, currentAction: "attempt" };
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
    expect(mockForfeitGame).not.toHaveBeenCalled();
  });

  it("should skip set timeout when freshPlayer is undefined (lines 105-106)", async () => {
    const now = new Date();
    const expiredGame = {
      id: "game-set-bad-index",
      status: "active",
      currentAction: "set",
      currentTurnIndex: 10, // Out of bounds
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
      // Fresh game also has out-of-bounds currentTurnIndex
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
    expect(mockForfeitGame).not.toHaveBeenCalled();
  });

  it("should skip paused player whose disconnect is within reconnect window (line 141 false branch)", async () => {
    const now = new Date();
    const pausedGame = {
      id: "game-within-window",
      status: "paused",
      currentAction: "set",
      currentTurnIndex: 0,
      players: [
        {
          odv: "player-A",
          letters: "",
          connected: false,
          // Disconnected only 10 seconds ago — well within the 60s mock window
          disconnectedAt: new Date(now.getTime() - 10000).toISOString(),
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

    await processTimeouts();
    // Transaction should NOT be called because elapsed < RECONNECT_WINDOW_MS
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockForfeitGame).not.toHaveBeenCalled();
  });

  it("should skip set timeout when status no longer active (line 101)", async () => {
    const now = new Date();
    const expiredGame = {
      id: "game-set-completed",
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
      // Status changed to completed between outer query and transaction
      const freshGame = { ...expiredGame, status: "completed" };
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
    expect(mockForfeitGame).not.toHaveBeenCalled();
  });

  it("should skip set timeout when turnDeadlineAt is null (line 102 null branch)", async () => {
    const now = new Date();
    const expiredGame = {
      id: "game-set-null-deadline",
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
      // turnDeadlineAt was cleared (set to null)
      const freshGame = { ...expiredGame, turnDeadlineAt: null };
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
    expect(mockForfeitGame).not.toHaveBeenCalled();
  });
});
