/**
 * @fileoverview Tests for uncovered lines in server/routes/tier.ts
 *
 * Covers:
 * - Line 112: Award limit reached (MAX_PRO_AWARDS = 5) → 409 AWARD_LIMIT_REACHED
 * - Line 124: result.targetUser is falsy after transaction (guard) → 500 PRO_AWARD_FAILED
 * - Lines 296-302: purchase-premium currency check — wrong currency → 402 PAYMENT_CURRENCY_INVALID
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
// Tests
// =============================================================================

describe("Tier Routes — coverage gaps", () => {
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
  // POST /award-pro — line 112: AWARD_LIMIT_REACHED
  // ===========================================================================

  describe("POST /award-pro — award limit reached (line 112)", () => {
    it("returns 409 AWARD_LIMIT_REACHED when user has already awarded 5 pros", async () => {
      // Count query returns 5 → meets the MAX_PRO_AWARDS cap
      mockDbReturns.countResult = [{ value: 5 }];

      const req = mockRequest({
        body: { userId: "target-1" },
        currentUser: { id: "user-1", accountTier: "premium" },
      });
      const res = mockResponse();

      await callRoute("POST", "/award-pro", req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "AWARD_LIMIT_REACHED",
          message: "You have already awarded Pro status to 5 users.",
        })
      );
    });

    it("returns 409 AWARD_LIMIT_REACHED when user has awarded more than 5", async () => {
      mockDbReturns.countResult = [{ value: 10 }];

      const req = mockRequest({
        body: { userId: "target-1" },
        currentUser: { id: "user-1", accountTier: "premium" },
      });
      const res = mockResponse();

      await callRoute("POST", "/award-pro", req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "AWARD_LIMIT_REACHED",
        })
      );
    });
  });

  // ===========================================================================
  // POST /award-pro — line 124: targetUser is falsy guard
  // ===========================================================================

  describe("POST /award-pro — targetUser null guard (line 124)", () => {
    it("returns 500 PRO_AWARD_FAILED when transaction succeeds but targetUser is missing", async () => {
      // Override the transaction to return { success: true } with no targetUser property
      mockTransaction.mockImplementationOnce(async (cb: (tx: any) => Promise<any>) => {
        // Instead of running the real callback, return a result with success but no targetUser
        return { success: true };
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

    it("returns 500 PRO_AWARD_FAILED when targetUser is explicitly null", async () => {
      mockTransaction.mockImplementationOnce(async () => {
        return { success: true, targetUser: null };
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
  // POST /purchase-premium — lines 296-302: currency mismatch
  // ===========================================================================

  describe("POST /purchase-premium — currency mismatch (lines 296-302)", () => {
    it("returns 402 PAYMENT_CURRENCY_INVALID when currency is not usd", async () => {
      mockStripePaymentIntentsRetrieve.mockResolvedValue({
        status: "succeeded",
        amount: 999,
        currency: "eur",
        metadata: { userId: "user-1" },
      });

      const req = mockRequest({
        body: { paymentIntentId: "pi_eur_123" },
        currentUser: {
          id: "user-1",
          email: "test@test.com",
          accountTier: "free",
        },
      });
      const res = mockResponse();

      await callRoute("POST", "/purchase-premium", req, res);

      expect(res.status).toHaveBeenCalledWith(402);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "PAYMENT_CURRENCY_INVALID",
          message: "Payment currency invalid.",
        })
      );
    });

    it("returns 402 PAYMENT_CURRENCY_INVALID for gbp currency", async () => {
      mockStripePaymentIntentsRetrieve.mockResolvedValue({
        status: "succeeded",
        amount: 999,
        currency: "gbp",
        metadata: { userId: "user-1" },
      });

      const req = mockRequest({
        body: { paymentIntentId: "pi_gbp_456" },
        currentUser: {
          id: "user-1",
          email: "test@test.com",
          accountTier: "free",
        },
      });
      const res = mockResponse();

      await callRoute("POST", "/purchase-premium", req, res);

      expect(res.status).toHaveBeenCalledWith(402);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "PAYMENT_CURRENCY_INVALID",
          message: "Payment currency invalid.",
        })
      );
    });
  });
});
