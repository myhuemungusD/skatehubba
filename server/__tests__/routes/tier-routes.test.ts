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

// -- DB mock (shared singleton so tests can override per-call) ----------------

const mockDbReturns = {
  selectResult: [] as any[],
  countResult: [{ value: 0 }] as any[],
  updateResult: [] as any[],
};

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

const mockGetDb = vi.fn(() => mockDb);

vi.mock("../../db", () => ({
  getDb: () => mockGetDb(),
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

describe("Tier Routes", () => {
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

    it("blocks free users from awarding", async () => {
      const req = mockRequest({
        body: { userId: "target-1" },
        currentUser: { id: "user-1", accountTier: "free" },
      });
      const res = mockResponse();

      await callRoute("POST", "/award-pro", req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "PRO_REQUIRED",
          message: "Only Pro skaters can award Pro status.",
        })
      );
    });

    it("allows pro users to award pro", async () => {
      mockDbReturns.selectResult = [{ id: "target-1", accountTier: "free", firstName: "Skater" }];

      const req = mockRequest({
        body: { userId: "target-1" },
        currentUser: { id: "user-1", accountTier: "pro" },
      });
      const res = mockResponse();

      await callRoute("POST", "/award-pro", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          awardedTo: "target-1",
          awardedBy: "user-1",
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

    it("returns 500 when database is unavailable (getDb throws, caught by route)", async () => {
      mockGetDb.mockImplementation(() => {
        throw new Error("Database not configured");
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
        })
      );
      // Verify no tier information is leaked in the response
      expect(res.json.mock.calls[0][0]).not.toHaveProperty("details");
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
  // POST /create-checkout-session (DISABLED — payments removed)
  // ===========================================================================

  describe("POST /create-checkout-session", () => {
    it("returns 410 with payments disabled message", async () => {
      const req = mockRequest({
        body: { idempotencyKey: "abcdefghijklmnop" },
      });
      const res = mockResponse();

      await callRoute("POST", "/create-checkout-session", req, res);

      expect(res.status).toHaveBeenCalledWith(410);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "PAYMENTS_DISABLED",
        })
      );
    });
  });

  // ===========================================================================
  // POST /purchase-premium (DISABLED — payments removed)
  // ===========================================================================

  describe("POST /purchase-premium", () => {
    it("returns 410 with payments disabled message", async () => {
      const req = mockRequest({
        body: { paymentIntentId: "pi_test_123" },
      });
      const res = mockResponse();

      await callRoute("POST", "/purchase-premium", req, res);

      expect(res.status).toHaveBeenCalledWith(410);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "PAYMENTS_DISABLED",
        })
      );
    });
  });
});
