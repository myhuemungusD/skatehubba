/**
 * @fileoverview Branch-coverage tests for submitTrick.ts
 *
 * Targets the uncovered branches:
 * - Line 88: processedIdempotencyKeys || [] when processedIdempotencyKeys is undefined
 * - Line 149: game.player1Id === userId ? game.player2Id : game.player1Id
 *             when player2 is the attacker (userId !== game.player1Id path)
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

const { submitTrick } = await import("../submitTrick");

// ============================================================================
// Helpers
// ============================================================================

function makeContext(uid: string): any {
  return { auth: { uid } };
}

const baseGame = (overrides: Record<string, any> = {}) => ({
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
  ...overrides,
});

// ============================================================================
// Tests
// ============================================================================

describe("submitTrick — uncovered branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runTransaction.mockImplementation(async (fn: any) => fn(mocks.transaction));
    mocks.checkRateLimitFn.mockResolvedValue(undefined);
  });

  describe("line 88: processedIdempotencyKeys || [] fallback", () => {
    it("handles undefined processedIdempotencyKeys (uses [] fallback)", async () => {
      const game = baseGame({ processedIdempotencyKeys: undefined });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext("p1");
      const res = await (submitTrick as any)(
        {
          gameId: "g",
          clipUrl: "http://clip",
          trickName: "kickflip",
          isSetTrick: true,
          idempotencyKey: "k-undef-keys",
        },
        ctx
      );
      expect(res.success).toBe(true);
      expect(res.duplicate).toBe(false);
    });

    it("handles null processedIdempotencyKeys (uses [] fallback)", async () => {
      const game = baseGame({ processedIdempotencyKeys: null });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext("p1");
      const res = await (submitTrick as any)(
        {
          gameId: "g",
          clipUrl: "http://clip",
          trickName: "treflip",
          isSetTrick: true,
          idempotencyKey: "k-null-keys",
        },
        ctx
      );
      expect(res.success).toBe(true);
      expect(res.duplicate).toBe(false);
    });
  });

  describe("line 149: nextTurn ternary — player2 as attacker setting trick", () => {
    it("swaps turn to player1 when player2 is the attacker setting a trick", async () => {
      // player2 is the current attacker and it's their turn to set a trick
      const game = baseGame({
        currentTurn: "p2",
        currentAttacker: "p2",
        turnPhase: "attacker_recording",
      });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext("p2");
      const res = await (submitTrick as any)(
        {
          gameId: "g",
          clipUrl: "http://clip",
          trickName: "heelflip",
          isSetTrick: true,
          idempotencyKey: "k-p2-set",
        },
        ctx
      );
      expect(res.success).toBe(true);
      expect(res.duplicate).toBe(false);

      const update = mocks.transaction.update.mock.calls[0][1];
      // When player2 sets, nextTurn should be player1 (game.player1Id === userId is false,
      // so we take the else branch: game.player1Id)
      expect(update.currentTurn).toBe("p1");
      expect(update.turnPhase).toBe("defender_recording");
    });
  });
});
