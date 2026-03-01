/**
 * @fileoverview Branch coverage tests for server/routes/tier.ts
 *
 * Targets the remaining uncovered branches on lines 140, 235, 327, 390:
 * - Line 140: `error instanceof Error ? error.message : String(error)` in award-pro catch
 * - Line 235: `error instanceof Error ? error.message : String(error)` in create-checkout-session catch
 * - Line 327: `stripeError instanceof Error ? stripeError.message : String(stripeError)` in purchase-premium stripe catch
 * - Line 390: `error instanceof Error ? error.message : String(error)` in purchase-premium outer catch
 *
 * All four need a non-Error value thrown so the String(error) branch is taken.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// =============================================================================
// Mocks — must be declared before imports
// =============================================================================

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

vi.mock("../../auth/middleware", () => ({
  authenticateUser: vi.fn((_req: any, _res: any, next: any) => next()),
  requireRecentAuth: vi.fn((_req: any, _res: any, next: any) => next()),
}));

vi.mock("../../middleware/requirePaidOrPro", () => ({
  requirePaidOrPro: vi.fn((_req: any, _res: any, next: any) => next()),
}));

vi.mock("../../middleware/security", () => ({
  proAwardLimiter: vi.fn((_req: any, _res: any, next: any) => next()),
  paymentLimiter: vi.fn((_req: any, _res: any, next: any) => next()),
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

vi.mock("../../config/server", () => ({
  DEV_DEFAULT_ORIGIN: "http://localhost:5173",
  validateOrigin: (origin: string | undefined) => {
    const allowed = ["http://localhost:5173", "http://localhost:3000", "http://localhost:5000"];
    const fallback = allowed[0] || "http://localhost:5173";
    if (!origin) return fallback;
    return allowed.includes(origin) ? origin : fallback;
  },
}));

// -- DB mock ------------------------------------------------------------------

const mockDbReturns = {
  selectResult: [] as any[],
  countResult: [{ value: 0 }] as any[],
  updateResult: [] as any[],
};

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockTransaction = vi.fn();

function resetDbChains() {
  mockSelect.mockImplementation(() => {
    const chain: any = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockImplementation(() => {
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
    const tx = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            const whereResult: any = Promise.resolve(mockDbReturns.countResult);
            whereResult.limit = vi.fn().mockImplementation(() => {
              const limitResult: any = Promise.resolve(mockDbReturns.selectResult);
              limitResult.for = vi
                .fn()
                .mockImplementation(() => Promise.resolve(mockDbReturns.selectResult));
              return limitResult;
            });
            return whereResult;
          }),
        }),
      })),
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

const mockGetDb = vi.fn(() => mockDb);

vi.mock("../../db", () => ({
  getDb: () => mockGetDb(),
}));

// -- Stripe mock --------------------------------------------------------------

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

await import("../../routes/tier");

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
// Tests — non-Error thrown values for String(error) branches
// =============================================================================

describe("Tier Routes — non-Error throw branches", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbReturns.selectResult = [];
    mockDbReturns.countResult = [{ value: 0 }];
    mockDbReturns.updateResult = [];
    mockGetDb.mockImplementation(() => mockDb);
    resetDbChains();
    process.env = { ...originalEnv, STRIPE_SECRET_KEY: "sk_test_fake123" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ===========================================================================
  // Line 140: award-pro catch with non-Error (String(error) branch)
  // ===========================================================================

  describe("POST /award-pro — non-Error thrown (line 140)", () => {
    it("returns 500 and logs String(error) when a non-Error is thrown", async () => {
      // Throw a plain string instead of an Error
      mockTransaction.mockImplementationOnce(() => {
        throw "unexpected string failure";
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

    it("handles a thrown number in award-pro catch", async () => {
      mockTransaction.mockImplementationOnce(() => {
        throw 42;
      });

      const req = mockRequest({
        body: { userId: "target-1" },
        currentUser: { id: "user-1", accountTier: "premium" },
      });
      const res = mockResponse();

      await callRoute("POST", "/award-pro", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "PRO_AWARD_FAILED" })
      );
    });
  });

  // ===========================================================================
  // Line 235: create-checkout-session catch with non-Error (String(error) branch)
  // ===========================================================================

  describe("POST /create-checkout-session — non-Error thrown (line 235)", () => {
    it("returns 500 and logs String(error) when Stripe throws a non-Error", async () => {
      // Stripe checkout create rejects with a plain string
      mockStripeCheckoutCreate.mockRejectedValueOnce("stripe network failure");

      const req = mockRequest({
        body: { idempotencyKey: "abcdefghijklmnop" },
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
  // Line 327: purchase-premium inner Stripe catch with non-Error (String(stripeError) branch)
  // ===========================================================================

  describe("POST /purchase-premium — non-Error in stripe catch (line 327)", () => {
    it("returns 402 when Stripe retrieve rejects with a non-Error value", async () => {
      // paymentIntents.retrieve rejects with a plain string
      mockStripePaymentIntentsRetrieve.mockRejectedValueOnce("stripe api string error");

      const req = mockRequest({
        body: { paymentIntentId: "pi_test_nonError" },
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
  });

  // ===========================================================================
  // Line 390: purchase-premium outer catch with non-Error (String(error) branch)
  // ===========================================================================

  describe("POST /purchase-premium — non-Error in outer catch (line 390)", () => {
    it("returns 500 when a non-Error is thrown in the outer try block", async () => {
      // Stripe succeeds but DB transaction throws a non-Error value
      mockStripePaymentIntentsRetrieve.mockResolvedValue({
        status: "succeeded",
        amount: 999,
        currency: "usd",
        metadata: { userId: "user-1" },
      });

      // Transaction rejects with a plain string (not an Error, so not PAYMENT_ALREADY_USED)
      mockTransaction.mockRejectedValueOnce("raw db failure string");

      const req = mockRequest({
        body: { paymentIntentId: "pi_test_nonError_outer" },
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

  // ===========================================================================
  // Line 68: awardCount?.value ?? 0 — when awardCount is undefined (empty result)
  // ===========================================================================

  describe("POST /award-pro — nullish awardCount (line 68)", () => {
    it("treats missing awardCount as 0 via ?? operator when count query returns empty", async () => {
      // Override transaction to return empty count result, causing awardCount to be undefined
      mockTransaction.mockImplementationOnce(async (cb: (tx: any) => Promise<any>) => {
        const tx = {
          select: vi.fn().mockImplementation(() => ({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockImplementation(() => {
                // Count query returns empty array → awardCount is undefined
                const whereResult: any = Promise.resolve([]);
                whereResult.limit = vi.fn().mockImplementation(() => {
                  // User lookup: user not found
                  const limitResult: any = Promise.resolve([]);
                  limitResult.for = vi
                    .fn()
                    .mockImplementation(() => Promise.resolve([]));
                  return limitResult;
                });
                return whereResult;
              }),
            }),
          })),
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

      const req = mockRequest({
        body: { userId: "target-1" },
        currentUser: { id: "user-1", accountTier: "premium" },
      });
      const res = mockResponse();

      await callRoute("POST", "/award-pro", req, res);

      // With empty count result, awardCount is undefined → ?.value is undefined → ?? 0 = 0
      // Then user lookup returns empty → USER_NOT_FOUND
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "USER_NOT_FOUND" })
      );
    });
  });

  // ===========================================================================
  // Line 117: result.error === "ALREADY_UPGRADED" false branch
  // (when transaction returns an unrecognized error that falls through all three checks)
  // ===========================================================================

  describe("POST /award-pro — unrecognized transaction error (line 117 false branch)", () => {
    it("falls through all error checks and hits the targetUser guard when result has unknown error", async () => {
      // Transaction returns a result with an unrecognized error code
      // This causes all three if-checks (lines 111, 114, 117) to evaluate to false
      // Then execution reaches line 123: !result.targetUser check
      mockTransaction.mockImplementationOnce(async () => {
        return { error: "UNKNOWN_ERROR", message: "Something unexpected." };
      });

      const req = mockRequest({
        body: { userId: "target-1" },
        currentUser: { id: "user-1", accountTier: "premium" },
      });
      const res = mockResponse();

      await callRoute("POST", "/award-pro", req, res);

      // Falls through all error checks, then !result.targetUser → true (no targetUser prop)
      // → returns 500 PRO_AWARD_FAILED
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
  // Malformed referer catch branch (line 191)
  // ===========================================================================

  describe("POST /create-checkout-session — malformed referer catch (line 191)", () => {
    it("handles malformed referer URL gracefully, falling back to default origin", async () => {
      mockStripeCheckoutCreate.mockResolvedValue({
        id: "cs_test_session",
        url: "https://checkout.stripe.com/pay/cs_test_session",
      });

      const req = mockRequest({
        headers: { referer: "not-a-valid-url:::bad" },
        body: { idempotencyKey: "abcdefghijklmnop" },
        currentUser: {
          id: "user-1",
          email: "test@test.com",
          accountTier: "free",
        },
      });
      const res = mockResponse();

      await callRoute("POST", "/create-checkout-session", req, res);

      // Should succeed and use default origin for URLs
      expect(mockStripeCheckoutCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url: expect.stringContaining("http://localhost:5173"),
          cancel_url: expect.stringContaining("http://localhost:5173"),
        }),
        expect.anything()
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://checkout.stripe.com/pay/cs_test_session",
        })
      );
    });
  });
});
