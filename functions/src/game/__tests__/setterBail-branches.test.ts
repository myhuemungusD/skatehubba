/**
 * @fileoverview Branch-coverage tests for setterBail.ts
 *
 * Targets the uncovered branches:
 * - Line 65: processedIdempotencyKeys || [] when processedIdempotencyKeys is undefined
 * - Line 101: game.player2Letters || [] when player2Letters is undefined
 * - Line 139: (game.roundNumber || 1) + 1 when roundNumber is undefined/falsy
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

const { setterBail } = await import("../setterBail");

// ============================================================================
// Helpers
// ============================================================================

function makeContext(uid: string): any {
  return { auth: { uid } };
}

const bailGame = (overrides: Record<string, any> = {}) => ({
  player1Id: "p1",
  player2Id: "p2",
  currentTurn: "p1",
  currentAttacker: "p1",
  turnPhase: "attacker_recording",
  roundNumber: 1,
  moves: [],
  processedIdempotencyKeys: [],
  currentSetMove: null,
  player1Letters: [],
  player2Letters: [],
  status: "active",
  winnerId: null,
  ...overrides,
});

// ============================================================================
// Tests
// ============================================================================

describe("setterBail — uncovered branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runTransaction.mockImplementation(async (fn: any) => fn(mocks.transaction));
    mocks.checkRateLimitFn.mockResolvedValue(undefined);
  });

  describe("line 65: processedIdempotencyKeys || [] fallback", () => {
    it("handles undefined processedIdempotencyKeys", async () => {
      const game = bailGame({ processedIdempotencyKeys: undefined });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext("p1");
      const res = await (setterBail as any)({ gameId: "g", idempotencyKey: "k1" }, ctx);
      expect(res.success).toBe(true);
      expect(res.duplicate).toBe(false);
    });
  });

  describe("line 101: player2Letters || [] fallback when player2 is setter", () => {
    it("handles undefined player2Letters when player2 is the setter", async () => {
      const game = bailGame({
        currentAttacker: "p2",
        currentTurn: "p2",
        player2Letters: undefined,
      });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext("p2");
      const res = await (setterBail as any)({ gameId: "g", idempotencyKey: "k-p2-undef" }, ctx);
      expect(res.success).toBe(true);
      expect(res.gameOver).toBe(false);

      const update = mocks.transaction.update.mock.calls[0][1];
      expect(update.player2Letters).toEqual(["S"]);
    });
  });

  describe("line 139: roundNumber || 1 fallback when roundNumber is falsy", () => {
    it("defaults to 1 when roundNumber is undefined", async () => {
      const game = bailGame({ roundNumber: undefined });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext("p1");
      const res = await (setterBail as any)({ gameId: "g", idempotencyKey: "k-round-undef" }, ctx);
      expect(res.success).toBe(true);
      expect(res.gameOver).toBe(false);

      const update = mocks.transaction.update.mock.calls[0][1];
      expect(update.roundNumber).toBe(2);
    });

    it("defaults to 1 when roundNumber is 0", async () => {
      const game = bailGame({ roundNumber: 0 });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext("p1");
      const res = await (setterBail as any)({ gameId: "g", idempotencyKey: "k-round-zero" }, ctx);
      expect(res.success).toBe(true);

      const update = mocks.transaction.update.mock.calls[0][1];
      expect(update.roundNumber).toBe(2);
    });

    it("defaults to 1 when roundNumber is null", async () => {
      const game = bailGame({ roundNumber: null });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext("p1");
      const res = await (setterBail as any)({ gameId: "g", idempotencyKey: "k-round-null" }, ctx);
      expect(res.success).toBe(true);

      const update = mocks.transaction.update.mock.calls[0][1];
      expect(update.roundNumber).toBe(2);
    });
  });
});
