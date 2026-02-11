/**
 * @fileoverview Integration tests for tier routes
 *
 * Tests:
 * - GET /: returns tier info from currentUser
 * - POST /award-pro: invalid body, self-award, DB unavailable, user not found, already upgraded, success, error
 * - POST /create-checkout-session: invalid body, already premium, no STRIPE_SECRET_KEY, success (mock Stripe), error
 * - POST /purchase-premium: invalid body, already premium, DB unavailable, no STRIPE_SECRET_KEY,
 *                           payment not succeeded, amount mismatch, stripe error, payment reuse, success, general error
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// =============================================================================
// Mocks — must be declared before imports
// =============================================================================

// Mock Express Router to capture registered routes
const capturedRoutes: Record<string, Function[]> = {};
const mockRouter: any = {
  use: vi.fn(),
  get: vi.fn((path: string, ...handlers: Function[]) => {
    capturedRoutes[`GET ${path}`] = handlers;
  }),
  post: vi.fn((path: string, ...handlers: Function[]) => {
    capturedRoutes[`POST ${path}`] = handlers;
  }),
  put: vi.fn((path: string, ...handlers: Function[]) => {
    capturedRoutes[`PUT ${path}`] = handlers;
  }),
  patch: vi.fn((path: string, ...handlers: Function[]) => {
    capturedRoutes[`PATCH ${path}`] = handlers;
  }),
  delete: vi.fn((path: string, ...handlers: Function[]) => {
    capturedRoutes[`DELETE ${path}`] = handlers;
  }),
};
vi.mock("express", () => ({
  Router: () => mockRouter,
}));

vi.mock("../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../auth/middleware", () => ({
  authenticateUser: vi.fn((_req: any, _res: any, next: any) => next()),
}));

vi.mock("../middleware/requirePaidOrPro", () => ({
  requirePaidOrPro: vi.fn((_req: any, _res: any, next: any) => next()),
}));

vi.mock("../middleware/security", () => ({
  proAwardLimiter: vi.fn((_req: any, _res: any, next: any) => next()),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  count: vi.fn(),
}));

vi.mock("@shared/schema", () => ({
  customUsers: {
    id: "id",
    accountTier: "accountTier",
    firstName: "firstName",
    proAwardedBy: "proAwardedBy",
    premiumPurchasedAt: "premiumPurchasedAt",
    updatedAt: "updatedAt",
  },
  consumedPaymentIntents: {
    id: "id",
    paymentIntentId: "paymentIntentId",
    userId: "userId",
    createdAt: "createdAt",
  },
}));

vi.mock("../config/server", () => ({
  DEV_DEFAULT_ORIGIN: "http://localhost:5173",
}));

// -- DB mock (shared singleton so tests can override per-call) ----------------

const mockDbReturns = {
  selectResult: [] as any[],
  countResult: [{ value: 0 }] as any[],
  updateResult: [] as any[],
};

let mockIsDatabaseAvailable = true;

// Mutable mock functions so individual tests can override behaviour
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockTransaction = vi.fn();

function resetDbChains() {
  // The select chain needs to be thenable at both .where() and .limit() to
  // support queries that terminate at either point (e.g. count queries have
  // no .limit(), while target-user lookups do).
  mockSelect.mockImplementation(() => {
    const chain: any = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockImplementation(() => {
      // Return something that is both thenable (for count queries ending at .where())
      // and chainable (for queries that continue to .limit())
      const whereResult: any = Promise.resolve(mockDbReturns.countResult);
      whereResult.limit = vi
        .fn()
        .mockImplementation(() => Promise.resolve(mockDbReturns.selectResult));
      return whereResult;
    });
    return chain;
  });
  mockInsert.mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  });
  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.updateResult)),
    }),
  });
  mockTransaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
    let selectCallCount = 0;
    const tx = {
      select: vi.fn().mockImplementation(() => {
        selectCallCount++;
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation(() => {
              // The where() result needs to support both:
              // 1. Being awaitable directly (for count queries)
              // 2. Having a .limit() method (for user lookup queries)
              const whereResult: any = Promise.resolve(mockDbReturns.countResult);
              whereResult.limit = vi.fn().mockImplementation(() => {
                // Support optional .for("update") call
                const limitResult: any = Promise.resolve(mockDbReturns.selectResult);
                limitResult.for = vi
                  .fn()
                  .mockImplementation(() => Promise.resolve(mockDbReturns.selectResult));
                return limitResult;
              });
              return whereResult;
            }),
          }),
        };
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.updateResult)),
        }),
      }),
    };
    return cb(tx);
  });
}

const mockDb = {
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  transaction: mockTransaction,
};

vi.mock("../db", () => ({
  getDb: () => mockDb,
  isDatabaseAvailable: () => mockIsDatabaseAvailable,
}));

// -- Stripe mock (using vi.hoisted to ensure availability in factory) ---------

const { mockStripeCheckoutCreate, mockStripePaymentIntentsRetrieve } = vi.hoisted(() => ({
  mockStripeCheckoutCreate: vi.fn(),
  mockStripePaymentIntentsRetrieve: vi.fn(),
}));

vi.mock("stripe", () => {
  class MockStripe {
    checkout = {
      sessions: {
        create: (...args: any[]) => mockStripeCheckoutCreate(...args),
      },
    };
    paymentIntents = {
      retrieve: (...args: any[]) => mockStripePaymentIntentsRetrieve(...args),
    };
  }
  return { default: MockStripe };
});

// =============================================================================
// Import after mocks
// =============================================================================

await import("../routes/tier");

// =============================================================================
// Helpers
// =============================================================================

function mockRequest(overrides: Record<string, any> = {}): any {
  return {
    headers: { origin: "http://localhost:5173" },
    body: {},
    params: {},
    query: {},
    currentUser: {
      id: "user-1",
      email: "test@test.com",
      accountTier: "free",
      proAwardedBy: null,
      premiumPurchasedAt: null,
    },
    ...overrides,
  };
}

function mockResponse(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

async function callRoute(method: string, path: string, req: any, res: any) {
  const key = `${method} ${path}`;
  const handlers = capturedRoutes[key];
  if (!handlers) {
    throw new Error(`No handler for ${key}. Available: ${Object.keys(capturedRoutes).join(", ")}`);
  }
  for (const handler of handlers) {
    await handler(req, res, () => {});
  }
}

// =============================================================================
// Tests
// =============================================================================

describe("Tier Routes", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbReturns.selectResult = [];
    mockDbReturns.countResult = [{ value: 0 }];
    mockDbReturns.updateResult = [];
    mockIsDatabaseAvailable = true;
    resetDbChains();
    process.env = { ...originalEnv, STRIPE_SECRET_KEY: "sk_test_fake123" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ===========================================================================
  // GET /
  // ===========================================================================

  describe("GET /", () => {
    it("returns current user tier info", async () => {
      const req = mockRequest({
        currentUser: {
          id: "user-1",
          accountTier: "pro",
          proAwardedBy: "mentor-1",
          premiumPurchasedAt: null,
        },
      });
      const res = mockResponse();

      await callRoute("GET", "/", req, res);

      expect(res.json).toHaveBeenCalledWith({
        tier: "pro",
        proAwardedBy: "mentor-1",
        premiumPurchasedAt: null,
      });
    });

    it("returns free tier for default user", async () => {
      const req = mockRequest();
      const res = mockResponse();

      await callRoute("GET", "/", req, res);

      expect(res.json).toHaveBeenCalledWith({
        tier: "free",
        proAwardedBy: null,
        premiumPurchasedAt: null,
      });
    });

    it("returns premium tier info with purchasedAt date", async () => {
      const purchaseDate = new Date("2025-06-01T00:00:00Z");
      const req = mockRequest({
        currentUser: {
          id: "user-1",
          accountTier: "premium",
          proAwardedBy: null,
          premiumPurchasedAt: purchaseDate,
        },
      });
      const res = mockResponse();

      await callRoute("GET", "/", req, res);

      expect(res.json).toHaveBeenCalledWith({
        tier: "premium",
        proAwardedBy: null,
        premiumPurchasedAt: purchaseDate,
      });
    });
  });

  // ===========================================================================
  // POST /award-pro
  // ===========================================================================

  describe("POST /award-pro", () => {
    it("returns 400 for invalid body (missing userId)", async () => {
      const req = mockRequest({ body: {} });
      const res = mockResponse();

      await callRoute("POST", "/award-pro", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "VALIDATION_ERROR" }));
    });

    it("returns 400 for invalid body (empty userId)", async () => {
      const req = mockRequest({ body: { userId: "" } });
      const res = mockResponse();

      await callRoute("POST", "/award-pro", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "VALIDATION_ERROR" }));
    });

    it("blocks pro (non-premium) users from awarding", async () => {
      const req = mockRequest({
        body: { userId: "target-1" },
        currentUser: { id: "user-1", accountTier: "pro" },
      });
      const res = mockResponse();

      await callRoute("POST", "/award-pro", req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "PREMIUM_REQUIRED",
          message: "Only Premium members can award Pro status.",
        })
      );
    });

    it("blocks self-award", async () => {
      const req = mockRequest({
        body: { userId: "user-1" },
        currentUser: { id: "user-1", accountTier: "premium" },
      });
      const res = mockResponse();

      await callRoute("POST", "/award-pro", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "SELF_AWARD",
          message: "You can't award Pro to yourself.",
        })
      );
    });

    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;

      const req = mockRequest({
        body: { userId: "target-1" },
        currentUser: { id: "user-1", accountTier: "premium" },
      });
      const res = mockResponse();

      await callRoute("POST", "/award-pro", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "DATABASE_UNAVAILABLE",
          message: "Database unavailable. Please try again shortly.",
        })
      );
    });

    it("returns 404 when target user not found", async () => {
      // First select (count) returns 0 awards, second select (target) returns empty
      mockDbReturns.selectResult = [];

      const req = mockRequest({
        body: { userId: "nonexistent" },
        currentUser: { id: "user-1", accountTier: "premium" },
      });
      const res = mockResponse();

      await callRoute("POST", "/award-pro", req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "USER_NOT_FOUND",
          message: "User not found.",
        })
      );
    });

    it("returns 409 when target user already has pro or premium", async () => {
      mockDbReturns.selectResult = [{ id: "target-1", accountTier: "pro", firstName: "Skater" }];

      const req = mockRequest({
        body: { userId: "target-1" },
        currentUser: { id: "user-1", accountTier: "premium" },
      });
      const res = mockResponse();

      await callRoute("POST", "/award-pro", req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "ALREADY_UPGRADED",
          message: "User already has Pro or Premium status.",
          details: { currentTier: "pro" },
        })
      );
    });

    it("awards pro status successfully", async () => {
      mockDbReturns.selectResult = [{ id: "target-1", accountTier: "free", firstName: "Skater" }];

      const req = mockRequest({
        body: { userId: "target-1" },
        currentUser: { id: "user-1", accountTier: "premium" },
      });
      const res = mockResponse();

      await callRoute("POST", "/award-pro", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Pro status awarded to Skater",
          awardedTo: "target-1",
          awardedBy: "user-1",
        })
      );
    });

    it("uses fallback name when target has no firstName", async () => {
      mockDbReturns.selectResult = [{ id: "target-2", accountTier: "free", firstName: null }];

      const req = mockRequest({
        body: { userId: "target-2" },
        currentUser: { id: "user-1", accountTier: "premium" },
      });
      const res = mockResponse();

      await callRoute("POST", "/award-pro", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Pro status awarded to user",
        })
      );
    });

    it("returns 500 when db operation throws", async () => {
      mockTransaction.mockImplementationOnce(() => {
        throw new Error("DB connection lost");
      });

      const req = mockRequest({
        body: { userId: "target-1" },
        currentUser: { id: "user-1", accountTier: "premium" },
      });
      const res = mockResponse();

      await callRoute("POST", "/award-pro", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "PRO_AWARD_FAILED",
          message: "Failed to award Pro status.",
        })
      );
    });
  });

  // ===========================================================================
  // POST /create-checkout-session
  // ===========================================================================

  describe("POST /create-checkout-session", () => {
    it("returns 400 for invalid body (missing idempotencyKey)", async () => {
      const req = mockRequest({ body: {} });
      const res = mockResponse();

      await callRoute("POST", "/create-checkout-session", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "VALIDATION_ERROR" }));
    });

    it("returns 400 for invalid body (empty idempotencyKey)", async () => {
      const req = mockRequest({ body: { idempotencyKey: "" } });
      const res = mockResponse();

      await callRoute("POST", "/create-checkout-session", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "VALIDATION_ERROR" }));
    });

    it("returns 409 when user already has premium", async () => {
      const req = mockRequest({
        body: { idempotencyKey: "key-123" },
        currentUser: {
          id: "user-1",
          accountTier: "premium",
          email: "test@test.com",
        },
      });
      const res = mockResponse();

      await callRoute("POST", "/create-checkout-session", req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "ALREADY_PREMIUM",
          message: "You already have Premium.",
          details: { currentTier: "premium" },
        })
      );
    });

    it("returns 500 when STRIPE_SECRET_KEY not configured", async () => {
      delete process.env.STRIPE_SECRET_KEY;

      const req = mockRequest({
        body: { idempotencyKey: "key-123" },
      });
      const res = mockResponse();

      await callRoute("POST", "/create-checkout-session", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "PAYMENT_NOT_CONFIGURED",
          message: "Payment service not available.",
        })
      );
    });

    it("creates checkout session successfully", async () => {
      mockStripeCheckoutCreate.mockResolvedValue({
        id: "cs_test_session",
        url: "https://checkout.stripe.com/pay/cs_test_session",
      });

      const req = mockRequest({
        body: { idempotencyKey: "key-123" },
        currentUser: {
          id: "user-1",
          email: "test@test.com",
          accountTier: "free",
        },
      });
      const res = mockResponse();

      await callRoute("POST", "/create-checkout-session", req, res);

      expect(mockStripeCheckoutCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "payment",
          line_items: [
            expect.objectContaining({
              price_data: expect.objectContaining({
                currency: "usd",
                unit_amount: 999,
              }),
              quantity: 1,
            }),
          ],
          metadata: {
            userId: "user-1",
            type: "premium_upgrade",
          },
          customer_email: "test@test.com",
        }),
        expect.objectContaining({
          idempotencyKey: "checkout_user-1_key-123",
        })
      );

      expect(res.json).toHaveBeenCalledWith({
        url: "https://checkout.stripe.com/pay/cs_test_session",
      });
    });

    it("uses referer header when origin is missing", async () => {
      mockStripeCheckoutCreate.mockResolvedValue({
        id: "cs_test_session",
        url: "https://checkout.stripe.com/pay/cs_test_session",
      });

      const req = mockRequest({
        headers: { referer: "https://myapp.com/settings" },
        body: { idempotencyKey: "key-456" },
        currentUser: {
          id: "user-1",
          email: "test@test.com",
          accountTier: "free",
        },
      });
      const res = mockResponse();

      await callRoute("POST", "/create-checkout-session", req, res);

      expect(mockStripeCheckoutCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url: expect.stringContaining("https://myapp.com"),
          cancel_url: expect.stringContaining("https://myapp.com"),
        }),
        expect.anything()
      );
    });

    it("returns 500 on Stripe error", async () => {
      mockStripeCheckoutCreate.mockRejectedValue(new Error("Stripe API error"));

      const req = mockRequest({
        body: { idempotencyKey: "key-123" },
      });
      const res = mockResponse();

      await callRoute("POST", "/create-checkout-session", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "CHECKOUT_FAILED",
          message: "Failed to create checkout session.",
        })
      );
    });
  });

  // ===========================================================================
  // POST /purchase-premium
  // ===========================================================================

  describe("POST /purchase-premium", () => {
    it("returns 400 for invalid body (missing paymentIntentId)", async () => {
      const req = mockRequest({ body: {} });
      const res = mockResponse();

      await callRoute("POST", "/purchase-premium", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "VALIDATION_ERROR" }));
    });

    it("returns 400 for invalid body (empty paymentIntentId)", async () => {
      const req = mockRequest({ body: { paymentIntentId: "" } });
      const res = mockResponse();

      await callRoute("POST", "/purchase-premium", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "VALIDATION_ERROR" }));
    });

    it("returns 409 when user already has premium", async () => {
      const req = mockRequest({
        body: { paymentIntentId: "pi_test_123" },
        currentUser: {
          id: "user-1",
          accountTier: "premium",
          email: "test@test.com",
        },
      });
      const res = mockResponse();

      await callRoute("POST", "/purchase-premium", req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "ALREADY_PREMIUM",
          message: "You already have Premium.",
          details: { currentTier: "premium" },
        })
      );
    });

    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;

      const req = mockRequest({
        body: { paymentIntentId: "pi_test_123" },
      });
      const res = mockResponse();

      await callRoute("POST", "/purchase-premium", req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "DATABASE_UNAVAILABLE",
          message: "Database unavailable. Please try again shortly.",
        })
      );
    });

    it("returns 500 when STRIPE_SECRET_KEY not configured", async () => {
      delete process.env.STRIPE_SECRET_KEY;

      const req = mockRequest({
        body: { paymentIntentId: "pi_test_123" },
      });
      const res = mockResponse();

      await callRoute("POST", "/purchase-premium", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "PAYMENT_NOT_CONFIGURED",
          message: "Payment verification not available.",
        })
      );
    });

    it("returns 402 when payment has not succeeded", async () => {
      mockStripePaymentIntentsRetrieve.mockResolvedValue({
        status: "requires_payment_method",
        amount: 999,
        metadata: { userId: "user-1" },
      });

      const req = mockRequest({
        body: { paymentIntentId: "pi_test_123" },
      });
      const res = mockResponse();

      await callRoute("POST", "/purchase-premium", req, res);

      expect(res.status).toHaveBeenCalledWith(402);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "PAYMENT_NOT_COMPLETED",
          message: "Payment not completed.",
          details: { status: "requires_payment_method" },
        })
      );
    });

    it("returns 402 when payment amount does not match $9.99", async () => {
      mockStripePaymentIntentsRetrieve.mockResolvedValue({
        status: "succeeded",
        amount: 500,
        metadata: { userId: "user-1" },
      });

      const req = mockRequest({
        body: { paymentIntentId: "pi_test_123" },
      });
      const res = mockResponse();

      await callRoute("POST", "/purchase-premium", req, res);

      expect(res.status).toHaveBeenCalledWith(402);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "PAYMENT_AMOUNT_INVALID",
          message: "Payment amount invalid.",
        })
      );
    });

    it("returns 402 when Stripe payment retrieval fails", async () => {
      mockStripePaymentIntentsRetrieve.mockRejectedValue(
        new Error("No such payment_intent: pi_invalid")
      );

      const req = mockRequest({
        body: { paymentIntentId: "pi_invalid" },
      });
      const res = mockResponse();

      await callRoute("POST", "/purchase-premium", req, res);

      expect(res.status).toHaveBeenCalledWith(402);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "PAYMENT_VERIFICATION_FAILED",
          message: "Payment verification failed.",
        })
      );
    });

    it("returns 403 when payment intent does not belong to user", async () => {
      mockStripePaymentIntentsRetrieve.mockResolvedValue({
        status: "succeeded",
        amount: 999,
        metadata: { userId: "other-user" },
      });

      const req = mockRequest({
        body: { paymentIntentId: "pi_other_user" },
        currentUser: {
          id: "user-1",
          email: "test@test.com",
          accountTier: "free",
        },
      });
      const res = mockResponse();

      await callRoute("POST", "/purchase-premium", req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "PAYMENT_INTENT_FORBIDDEN",
          message: "This payment intent does not belong to you.",
        })
      );
    });

    it("returns 409 when payment intent has already been consumed", async () => {
      mockStripePaymentIntentsRetrieve.mockResolvedValue({
        status: "succeeded",
        amount: 999,
        metadata: { userId: "user-1" },
      });
      // Simulate that the payment intent already exists in consumed_payment_intents
      mockDbReturns.selectResult = [{ id: 1 }];

      const req = mockRequest({
        body: { paymentIntentId: "pi_already_used" },
      });
      const res = mockResponse();

      await callRoute("POST", "/purchase-premium", req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "PAYMENT_ALREADY_USED",
          message: "This payment has already been applied to an account.",
        })
      );
    });

    it("purchases premium successfully", async () => {
      mockStripePaymentIntentsRetrieve.mockResolvedValue({
        status: "succeeded",
        amount: 999,
        metadata: { userId: "user-1" },
      });
      // No existing consumed payment intent
      mockDbReturns.selectResult = [];

      const req = mockRequest({
        body: { paymentIntentId: "pi_test_123" },
        currentUser: {
          id: "user-1",
          email: "test@test.com",
          accountTier: "free",
        },
      });
      const res = mockResponse();

      await callRoute("POST", "/purchase-premium", req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Welcome to Premium! All features are now unlocked for life.",
        tier: "premium",
      });
    });

    it("returns 500 on general error during purchase", async () => {
      mockStripePaymentIntentsRetrieve.mockResolvedValue({
        status: "succeeded",
        amount: 999,
        metadata: { userId: "user-1" },
      });

      // Override the shared mockDb.select for this call to throw inside the transaction
      mockTransaction.mockRejectedValueOnce(new Error("DB write failed"));

      const req = mockRequest({
        body: { paymentIntentId: "pi_test_123" },
        currentUser: {
          id: "user-1",
          email: "test@test.com",
          accountTier: "free",
        },
      });
      const res = mockResponse();

      await callRoute("POST", "/purchase-premium", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "PURCHASE_FAILED",
          message: "Failed to process purchase.",
        })
      );
    });
  });
});
