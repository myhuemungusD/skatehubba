/**
 * @fileoverview Tests for abandonGame Cloud Function
 *
 * Covers: auth checks, input validation, status guards, permission checks,
 * server-side winner determination, vote deadline cleanup, and natural idempotency.
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

const { abandonGame } = await import("../abandonGame");

// ============================================================================
// Helpers
// ============================================================================

function makeContext(uid: string): any {
  return { auth: { uid } };
}

const activeGame = (overrides: Record<string, any> = {}) => ({
  player1Id: "p1",
  player2Id: "p2",
  status: "active",
  currentTurn: "p1",
  currentAttacker: "p1",
  turnPhase: "attacker_recording",
  roundNumber: 2,
  winnerId: null,
  voteDeadline: null,
  voteReminderSent: null,
  ...overrides,
});

// ============================================================================
// Tests
// ============================================================================

describe("abandonGame", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runTransaction.mockImplementation(async (fn: any) => fn(mocks.transaction));
    mocks.checkRateLimitFn.mockResolvedValue(undefined);
  });

  describe("authentication", () => {
    it("rejects unauthenticated calls", async () => {
      const ctx = { auth: null };
      await expect((abandonGame as any)({ gameId: "g1" }, ctx)).rejects.toThrow("Not logged in");
    });

    it("rejects calls with no auth context", async () => {
      const ctx = {};
      await expect((abandonGame as any)({ gameId: "g1" }, ctx)).rejects.toThrow("Not logged in");
    });
  });

  describe("input validation", () => {
    it("rejects missing gameId", async () => {
      const ctx = makeContext("p1");
      await expect((abandonGame as any)({}, ctx)).rejects.toThrow("Missing gameId");
    });

    it("rejects empty gameId", async () => {
      const ctx = makeContext("p1");
      await expect((abandonGame as any)({ gameId: "" }, ctx)).rejects.toThrow("Missing gameId");
    });
  });

  describe("game validation", () => {
    it("rejects if game does not exist", async () => {
      mocks.transaction.get.mockResolvedValue({ exists: false });
      const ctx = makeContext("p1");
      await expect((abandonGame as any)({ gameId: "g1" }, ctx)).rejects.toThrow("Game not found");
    });

    it("rejects if game is in waiting status", async () => {
      const game = activeGame({ status: "waiting" });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext("p1");
      await expect((abandonGame as any)({ gameId: "g1" }, ctx)).rejects.toThrow(
        "Game is not active"
      );
    });
  });

  describe("permission checks", () => {
    it("rejects if caller is not a participant", async () => {
      const game = activeGame();
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext("random-user");
      await expect((abandonGame as any)({ gameId: "g1" }, ctx)).rejects.toThrow(
        "Not a participant in this game"
      );
    });
  });

  describe("successful abandon", () => {
    it("sets opponent as winner when player1 forfeits", async () => {
      const game = activeGame();
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext("p1");

      const result = await (abandonGame as any)({ gameId: "g1" }, ctx);

      expect(result).toEqual({ success: true });
      expect(mocks.transaction.update).toHaveBeenCalledTimes(1);

      const update = mocks.transaction.update.mock.calls[0][1];
      expect(update.status).toBe("abandoned");
      expect(update.winnerId).toBe("p2");
      expect(update.completedAt).toBe("SERVER_TIMESTAMP");
      expect(update.updatedAt).toBe("SERVER_TIMESTAMP");
    });

    it("sets opponent as winner when player2 forfeits", async () => {
      const game = activeGame();
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext("p2");

      await (abandonGame as any)({ gameId: "g1" }, ctx);

      const update = mocks.transaction.update.mock.calls[0][1];
      expect(update.winnerId).toBe("p1");
    });

    it("clears voteDeadline on abandon", async () => {
      const game = activeGame({
        voteDeadline: { toMillis: () => Date.now() + 30000 },
        voteReminderSent: false,
      });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext("p1");

      await (abandonGame as any)({ gameId: "g1" }, ctx);

      const update = mocks.transaction.update.mock.calls[0][1];
      expect(update.voteDeadline).toBeNull();
      expect(update.voteReminderSent).toBeNull();
    });

    it("calls checkRateLimit with the caller uid", async () => {
      const game = activeGame();
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext("p1");

      await (abandonGame as any)({ gameId: "g1" }, ctx);

      expect(mocks.checkRateLimitFn).toHaveBeenCalledWith("p1");
    });
  });

  describe("natural idempotency", () => {
    it("returns success if game is already abandoned and caller is player1", async () => {
      const game = activeGame({ status: "abandoned", winnerId: "p2" });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext("p1");

      const result = await (abandonGame as any)({ gameId: "g1" }, ctx);

      expect(result).toEqual({ success: true });
      expect(mocks.transaction.update).not.toHaveBeenCalled();
    });

    it("returns success if game is already abandoned and caller is player2", async () => {
      const game = activeGame({ status: "abandoned", winnerId: "p1" });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext("p2");

      const result = await (abandonGame as any)({ gameId: "g1" }, ctx);

      expect(result).toEqual({ success: true });
      expect(mocks.transaction.update).not.toHaveBeenCalled();
    });

    it("returns success if game is already completed and caller is a participant", async () => {
      const game = activeGame({ status: "completed", winnerId: "p1" });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext("p2");

      const result = await (abandonGame as any)({ gameId: "g1" }, ctx);

      expect(result).toEqual({ success: true });
      expect(mocks.transaction.update).not.toHaveBeenCalled();
    });

    it("rejects if game is already abandoned but caller is not a participant", async () => {
      const game = activeGame({ status: "abandoned", winnerId: "p2" });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext("random-user");

      await expect((abandonGame as any)({ gameId: "g1" }, ctx)).rejects.toThrow(
        "Game is not active"
      );
    });
  });
});
