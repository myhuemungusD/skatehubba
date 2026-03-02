/**
 * @fileoverview Tests for joinGame Cloud Function
 *
 * Covers: auth checks, input validation, status guards, permission checks,
 * successful join flow, and natural idempotency.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Hoisted mock state
// ============================================================================

const mocks = vi.hoisted(() => {
  const transaction = {
    get: vi.fn(),
    update: vi.fn(),
    set: vi.fn(),
  };

  const runTransaction = vi.fn(async (fn: any) => fn(transaction));

  const docRef: Record<string, any> = {
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
  };

  const firestoreInstance = {
    collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(docRef) }),
    doc: vi.fn().mockReturnValue(docRef),
    runTransaction,
  };

  const checkRateLimitFn = vi.fn().mockResolvedValue(undefined);

  const logger = {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  return {
    transaction,
    runTransaction,
    docRef,
    firestoreInstance,
    checkRateLimitFn,
    logger,
  };
});

// ============================================================================
// Module mocks
// ============================================================================

vi.mock("firebase-functions", () => ({
  https: {
    HttpsError: class HttpsError extends Error {
      code: string;
      constructor(code: string, message: string) {
        super(message);
        this.code = code;
      }
    },
    onCall: vi.fn((handler: any) => handler),
  },
  config: () => ({}),
  logger: mocks.logger,
}));

vi.mock("firebase-admin", () => {
  const firestoreFn = Object.assign(
    vi.fn(() => mocks.firestoreInstance),
    {
      FieldValue: {
        serverTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
        arrayUnion: vi.fn((...args: any[]) => args),
      },
      Timestamp: {
        fromDate: vi.fn((date: Date) => ({ toMillis: () => date.getTime() })),
        now: vi.fn(() => ({ toMillis: () => Date.now() })),
      },
    }
  );

  const mod = {
    apps: [{ name: "mock" }],
    initializeApp: vi.fn(),
    firestore: firestoreFn,
  };

  return { ...mod, default: mod };
});

vi.mock("../../shared/rateLimit", () => ({
  checkRateLimit: (...args: any[]) => mocks.checkRateLimitFn(...args),
}));

// ============================================================================
// Import after mocks
// ============================================================================

const { joinGame } = await import("../joinGame");

// ============================================================================
// Helpers
// ============================================================================

function makeContext(uid: string): any {
  return { auth: { uid } };
}

const waitingGame = (overrides: Record<string, any> = {}) => ({
  player1Id: "p1",
  player2Id: "p2",
  player1DisplayName: "Alice",
  player2DisplayName: "Bob",
  status: "waiting",
  currentTurn: null,
  currentAttacker: null,
  turnPhase: null,
  roundNumber: 0,
  winnerId: null,
  ...overrides,
});

// ============================================================================
// Tests
// ============================================================================

describe("joinGame", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runTransaction.mockImplementation(async (fn: any) => fn(mocks.transaction));
    mocks.checkRateLimitFn.mockResolvedValue(undefined);
  });

  describe("authentication", () => {
    it("rejects unauthenticated calls", async () => {
      const ctx = { auth: null };
      await expect((joinGame as any)({ gameId: "g1" }, ctx)).rejects.toThrow("Not logged in");
    });

    it("rejects calls with no auth context", async () => {
      const ctx = {};
      await expect((joinGame as any)({ gameId: "g1" }, ctx)).rejects.toThrow("Not logged in");
    });
  });

  describe("input validation", () => {
    it("rejects missing gameId", async () => {
      const ctx = makeContext("p2");
      await expect((joinGame as any)({}, ctx)).rejects.toThrow("Missing gameId");
    });

    it("rejects empty gameId", async () => {
      const ctx = makeContext("p2");
      await expect((joinGame as any)({ gameId: "" }, ctx)).rejects.toThrow("Missing gameId");
    });
  });

  describe("game validation", () => {
    it("rejects if game does not exist", async () => {
      mocks.transaction.get.mockResolvedValue({ exists: false });
      const ctx = makeContext("p2");
      await expect((joinGame as any)({ gameId: "g1" }, ctx)).rejects.toThrow("Game not found");
    });

    it("rejects if game is already completed", async () => {
      const game = waitingGame({ status: "completed" });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext("p2");
      await expect((joinGame as any)({ gameId: "g1" }, ctx)).rejects.toThrow(
        "Game is not waiting for a player"
      );
    });

    it("rejects if game is abandoned", async () => {
      const game = waitingGame({ status: "abandoned" });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext("p2");
      await expect((joinGame as any)({ gameId: "g1" }, ctx)).rejects.toThrow(
        "Game is not waiting for a player"
      );
    });
  });

  describe("permission checks", () => {
    it("rejects if caller is player1 (cannot join own game)", async () => {
      const game = waitingGame();
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext("p1");
      await expect((joinGame as any)({ gameId: "g1" }, ctx)).rejects.toThrow(
        "You are not the invited player"
      );
    });

    it("rejects if caller is a random user", async () => {
      const game = waitingGame();
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext("random-user");
      await expect((joinGame as any)({ gameId: "g1" }, ctx)).rejects.toThrow(
        "You are not the invited player"
      );
    });
  });

  describe("successful join", () => {
    it("transitions game from waiting to active", async () => {
      const game = waitingGame();
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext("p2");

      const result = await (joinGame as any)({ gameId: "g1" }, ctx);

      expect(result).toEqual({ success: true });
      expect(mocks.transaction.update).toHaveBeenCalledTimes(1);

      const update = mocks.transaction.update.mock.calls[0][1];
      expect(update.status).toBe("active");
      expect(update.currentTurn).toBe("p1");
      expect(update.currentAttacker).toBe("p1");
      expect(update.turnPhase).toBe("attacker_recording");
      expect(update.roundNumber).toBe(1);
      expect(update.updatedAt).toBe("SERVER_TIMESTAMP");
    });

    it("sets challenger (player1) as first attacker", async () => {
      const game = waitingGame({ player1Id: "alice", player2Id: "bob" });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext("bob");

      await (joinGame as any)({ gameId: "g1" }, ctx);

      const update = mocks.transaction.update.mock.calls[0][1];
      expect(update.currentAttacker).toBe("alice");
      expect(update.currentTurn).toBe("alice");
    });

    it("calls checkRateLimit with the caller uid", async () => {
      const game = waitingGame();
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext("p2");

      await (joinGame as any)({ gameId: "g1" }, ctx);

      expect(mocks.checkRateLimitFn).toHaveBeenCalledWith("p2");
    });
  });

  describe("natural idempotency", () => {
    it("returns success if game is already active and caller is player2", async () => {
      const game = waitingGame({ status: "active", player2Id: "p2" });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext("p2");

      const result = await (joinGame as any)({ gameId: "g1" }, ctx);

      expect(result).toEqual({ success: true });
      // Should NOT call update — game is already in the desired state
      expect(mocks.transaction.update).not.toHaveBeenCalled();
    });

    it("rejects if game is active but caller is not player2", async () => {
      const game = waitingGame({ status: "active", player2Id: "p2" });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext("random-user");

      await expect((joinGame as any)({ gameId: "g1" }, ctx)).rejects.toThrow(
        "Game is not waiting for a player"
      );
    });
  });
});
