/**
 * @fileoverview Coverage tests for stripeWebhook route
 *
 * Targets uncovered lines:
 * - isDuplicateEvent: Redis path (new event, duplicate, failure fallback, memory pruning)
 * - handleCheckoutCompleted: currency mismatch, user already premium, email/notification failures
 * - General switch handler error → 500
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Mocks — must be declared before imports
// =============================================================================

const routeHandlers: Record<string, Function[]> = {};
vi.mock("express", () => ({
  Router: () => ({
    post: vi.fn((path: string, ...handlers: Function[]) => {
      routeHandlers[`POST ${path}`] = handlers;
    }),
    get: vi.fn(),
  }),
}));

vi.mock("../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Redis mock — default: returns a client with a set method
const mockRedisSet = vi.fn();
let mockRedisClient: any = { set: mockRedisSet };
vi.mock("../../redis", () => ({
  getRedisClient: () => mockRedisClient,
}));

// Stripe mock
const mockConstructEvent = vi.fn();
vi.mock("stripe", () => ({
  default: class MockStripe {
    webhooks = { constructEvent: mockConstructEvent };
  },
}));

// Schema mock
vi.mock("@shared/schema", () => ({
  customUsers: {
    id: "id",
    email: "email",
    firstName: "firstName",
    accountTier: "accountTier",
    premiumPurchasedAt: "premiumPurchasedAt",
    updatedAt: "updatedAt",
  },
  consumedPaymentIntents: {
    id: "id",
    paymentIntentId: "paymentIntentId",
    userId: "userId",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

// Email & notification service mocks
const mockSendPaymentReceiptEmail = vi.fn();
const mockNotifyUser = vi.fn();
vi.mock("../../services/emailService", () => ({
  sendPaymentReceiptEmail: (...args: any[]) => mockSendPaymentReceiptEmail(...args),
}));
vi.mock("../../services/notificationService", () => ({
  notifyUser: (...args: any[]) => mockNotifyUser(...args),
}));

// DB mock — supports chainable select, insert, update, transaction
const mockSelectResult: any[] = [];
const mockTxSelectResults: any[][] = [];
let txSelectCallIndex = 0;

function buildSelectChain(results: any[]) {
  const chain: any = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.for = vi.fn().mockImplementation(() => Promise.resolve(results));
  // Also make chain itself thenable for cases that don't call .for()
  chain.then = (resolve: any) => Promise.resolve(results).then(resolve);
  return chain;
}

const mockTransaction = vi.fn();
const mockDb: any = {
  select: vi.fn(() => buildSelectChain(mockSelectResult)),
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  }),
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  }),
  transaction: mockTransaction,
};

vi.mock("../../db", () => ({
  getDb: () => mockDb,
}));

// =============================================================================
// Helpers
// =============================================================================

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

function makeReq(body: any = Buffer.from("{}"), sig: string = "sig_test") {
  return {
    body,
    headers: { "stripe-signature": sig },
  } as any;
}

function makeCheckoutEvent(
  overrides: Partial<{
    id: string;
    currency: string;
    amount_total: number;
    payment_status: string;
    metadata: Record<string, string>;
  }> = {}
) {
  return {
    id: `evt_${Date.now()}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_123",
        currency: "usd",
        amount_total: 999,
        payment_status: "paid",
        metadata: { userId: "user_1", type: "premium_upgrade" },
        ...overrides,
      },
    },
  };
}

// =============================================================================
// Test suite
// =============================================================================

describe("stripeWebhook coverage", () => {
  let handler: Function;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset environment
    process.env.STRIPE_SECRET_KEY = "sk_test_key";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

    // Reset Redis to default (available)
    mockRedisClient = { set: mockRedisSet };
    mockRedisSet.mockResolvedValue("OK");

    // Reset transaction mock
    txSelectCallIndex = 0;
    mockTxSelectResults.length = 0;
    mockTransaction.mockImplementation(async (cb: any) => {
      txSelectCallIndex = 0;
      const tx: any = {
        select: vi.fn(() => {
          const results = mockTxSelectResults[txSelectCallIndex] ?? [];
          txSelectCallIndex++;
          return buildSelectChain(results);
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      };
      return cb(tx);
    });

    // Reset top-level select (used for userInfo query after transaction)
    mockSelectResult.length = 0;

    // Email/notification defaults — resolve successfully
    mockSendPaymentReceiptEmail.mockResolvedValue(undefined);
    mockNotifyUser.mockResolvedValue(undefined);

    // Re-import to capture routes fresh
    // Clear module cache so each test gets a clean import
    vi.resetModules();

    // Re-apply mocks after resetModules
    vi.doMock("express", () => ({
      Router: () => ({
        post: vi.fn((path: string, ...handlers: Function[]) => {
          routeHandlers[`POST ${path}`] = handlers;
        }),
        get: vi.fn(),
      }),
    }));

    vi.doMock("../../logger", () => ({
      default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
    }));

    vi.doMock("../../redis", () => ({
      getRedisClient: () => mockRedisClient,
    }));

    vi.doMock("stripe", () => ({
      default: class MockStripe {
        webhooks = { constructEvent: mockConstructEvent };
      },
    }));

    vi.doMock("@shared/schema", () => ({
      customUsers: {
        id: "id",
        email: "email",
        firstName: "firstName",
        accountTier: "accountTier",
        premiumPurchasedAt: "premiumPurchasedAt",
        updatedAt: "updatedAt",
      },
      consumedPaymentIntents: {
        id: "id",
        paymentIntentId: "paymentIntentId",
        userId: "userId",
      },
    }));

    vi.doMock("drizzle-orm", () => ({
      eq: vi.fn(),
    }));

    vi.doMock("../../services/emailService", () => ({
      sendPaymentReceiptEmail: (...args: any[]) => mockSendPaymentReceiptEmail(...args),
    }));

    vi.doMock("../../services/notificationService", () => ({
      notifyUser: (...args: any[]) => mockNotifyUser(...args),
    }));

    vi.doMock("../../db", () => ({
      getDb: () => mockDb,
    }));

    await import("../../routes/stripeWebhook");
    handler = routeHandlers["POST /"]?.[0];
  });

  // ---------------------------------------------------------------------------
  // isDuplicateEvent — Redis path
  // ---------------------------------------------------------------------------

  describe("isDuplicateEvent via Redis", () => {
    it("returns false (new event) when Redis SET returns 'OK'", async () => {
      mockRedisSet.mockResolvedValue("OK");
      const event = makeCheckoutEvent();
      mockConstructEvent.mockReturnValue(event);

      // Set up transaction: no existing payment, user exists and is free
      mockTxSelectResults.push([]); // consumedPaymentIntents check → no match
      mockTxSelectResults.push([{ accountTier: "free" }]); // user check
      mockSelectResult.push({ email: "test@example.com", firstName: "Test" });

      const req = makeReq();
      const res = makeRes();
      await handler(req, res);

      // Should process the event (not return early as duplicate)
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
      // Redis SET was called with NX
      expect(mockRedisSet).toHaveBeenCalledWith(`stripe_event:${event.id}`, "1", "EX", 86400, "NX");
    });

    it("returns true (duplicate) when Redis SET returns null", async () => {
      mockRedisSet.mockResolvedValue(null);
      const event = makeCheckoutEvent();
      mockConstructEvent.mockReturnValue(event);

      const req = makeReq();
      const res = makeRes();
      await handler(req, res);

      // Should return 200 but skip processing (duplicate)
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
      // Transaction should NOT be called (event was deduplicated)
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("falls through to memory store when Redis throws", async () => {
      mockRedisSet.mockRejectedValue(new Error("Redis connection refused"));
      const event = makeCheckoutEvent();
      mockConstructEvent.mockReturnValue(event);

      // Set up transaction for a successful flow
      mockTxSelectResults.push([]); // no existing payment
      mockTxSelectResults.push([{ accountTier: "free" }]); // user found
      mockSelectResult.push({ email: "test@example.com", firstName: "Test" });

      const req = makeReq();
      const res = makeRes();
      await handler(req, res);

      // Despite Redis failure, event should be processed via memory fallback
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
      expect(mockTransaction).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // isDuplicateEvent — memory pruning when >1000 entries
  // ---------------------------------------------------------------------------

  describe("isDuplicateEvent memory pruning", () => {
    it("prunes expired entries when memory map exceeds 1000", async () => {
      // Disable Redis so we exercise the in-memory path
      mockRedisClient = null;

      // We need to import the module and send >1000 unique events through the
      // in-memory dedup path to trigger pruning. We can do this by sending
      // 1001 events quickly, then sending one more to trigger the prune branch.
      // But that would be slow. Instead, we send a smaller batch and directly
      // verify the pruning code path by sending 1002 events.

      // Strategy: fire 1002 unique events rapidly. The 1002nd should trigger
      // pruning of the map. All events use the "unhandled" type to avoid
      // needing full DB mocks.

      for (let i = 0; i < 1002; i++) {
        const event = {
          id: `evt_prune_${i}`,
          type: "some.unhandled.event",
          data: { object: {} },
        };
        mockConstructEvent.mockReturnValue(event);
        const req = makeReq();
        const res = makeRes();
        await handler(req, res);
        expect(res.status).toHaveBeenCalledWith(200);
      }

      // The 1002nd event exercised the pruning branch. If it didn't throw, the
      // code path was covered. Now send one final new event to confirm the map
      // still works.
      const finalEvent = {
        id: "evt_prune_final",
        type: "some.unhandled.event",
        data: { object: {} },
      };
      mockConstructEvent.mockReturnValue(finalEvent);
      const req = makeReq();
      const res = makeRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // ---------------------------------------------------------------------------
  // handleCheckoutCompleted — currency mismatch
  // ---------------------------------------------------------------------------

  describe("handleCheckoutCompleted currency mismatch", () => {
    it("logs error and returns when currency is not usd", async () => {
      mockRedisSet.mockResolvedValue("OK");
      const event = makeCheckoutEvent({ currency: "jpy" });
      mockConstructEvent.mockReturnValue(event);

      const req = makeReq();
      const res = makeRes();
      await handler(req, res);

      // Should still return 200 (the event was "handled" — just rejected)
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
      // No DB transaction should be started
      expect(mockTransaction).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // handleCheckoutCompleted — user already premium
  // ---------------------------------------------------------------------------

  describe("handleCheckoutCompleted user already premium", () => {
    it("skips upgrade when user is already premium", async () => {
      mockRedisSet.mockResolvedValue("OK");
      const event = makeCheckoutEvent();
      mockConstructEvent.mockReturnValue(event);

      // Transaction: no existing consumed payment, but user is already premium
      mockTxSelectResults.push([]); // no consumed payment
      mockTxSelectResults.push([{ accountTier: "premium" }]); // user is premium

      const req = makeReq();
      const res = makeRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
      expect(mockTransaction).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // handleCheckoutCompleted — email send failure
  // ---------------------------------------------------------------------------

  describe("handleCheckoutCompleted email/notification failures", () => {
    it("returns 200 even when sendPaymentReceiptEmail rejects", async () => {
      mockRedisSet.mockResolvedValue("OK");
      const event = makeCheckoutEvent();
      mockConstructEvent.mockReturnValue(event);

      // Normal upgrade path
      mockTxSelectResults.push([]); // no consumed payment
      mockTxSelectResults.push([{ accountTier: "free" }]); // user is free
      mockSelectResult.push({ email: "test@example.com", firstName: "Test" });

      // Email rejects
      mockSendPaymentReceiptEmail.mockRejectedValue(new Error("SMTP down"));
      mockNotifyUser.mockResolvedValue(undefined);

      const req = makeReq();
      const res = makeRes();
      await handler(req, res);

      // Flush microtasks so the .catch() handler on the rejected promise executes
      await new Promise((r) => setTimeout(r, 0));

      // Still returns 200 — email failure is non-blocking
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
      expect(mockSendPaymentReceiptEmail).toHaveBeenCalled();
    });

    it("returns 200 even when notifyUser rejects", async () => {
      mockRedisSet.mockResolvedValue("OK");
      const event = makeCheckoutEvent();
      mockConstructEvent.mockReturnValue(event);

      // Normal upgrade path
      mockTxSelectResults.push([]); // no consumed payment
      mockTxSelectResults.push([{ accountTier: "free" }]); // user is free
      mockSelectResult.push({ email: "test@example.com", firstName: "Test" });

      mockSendPaymentReceiptEmail.mockResolvedValue(undefined);
      mockNotifyUser.mockRejectedValue(new Error("Push service unavailable"));

      const req = makeReq();
      const res = makeRes();
      await handler(req, res);

      // Flush microtasks so the .catch() handler on the rejected promise executes
      await new Promise((r) => setTimeout(r, 0));

      // Still returns 200 — notification failure is non-blocking
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
      expect(mockNotifyUser).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // General error in switch handler → 500
  // ---------------------------------------------------------------------------

  describe("general error in event handler", () => {
    it("returns 500 when handleCheckoutCompleted throws", async () => {
      mockRedisSet.mockResolvedValue("OK");
      const event = makeCheckoutEvent();
      mockConstructEvent.mockReturnValue(event);

      // Make the transaction throw
      mockTransaction.mockRejectedValue(new Error("DB connection lost"));

      const req = makeReq();
      const res = makeRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith("Processing error");
    });
  });
});
