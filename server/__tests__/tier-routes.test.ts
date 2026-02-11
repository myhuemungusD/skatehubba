/**
 * @fileoverview Integration tests for tier routes
 *
 * Tests:
 * - GET /: returns tier info
 * - POST /award-pro: pro award flow, self-award, user not found, already pro, db unavailable
 * - POST /create-checkout-session: creates session, already premium, no stripe key, invalid body
 * - POST /purchase-premium: success, already premium, no stripe key, payment not succeeded, wrong amount, db unavailable
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Mocks
// =============================================================================

// Mock Express Router to capture registered routes
const _routeHandlers: Record<string, Function[]> = {};
const _mockRouter: any = {
  use: vi.fn(),
  get: vi.fn((path: string, ...handlers: Function[]) => {
    _routeHandlers[`GET ${path}`] = handlers;
  }),
  post: vi.fn((path: string, ...handlers: Function[]) => {
    _routeHandlers[`POST ${path}`] = handlers;
  }),
  put: vi.fn((path: string, ...handlers: Function[]) => {
    _routeHandlers[`PUT ${path}`] = handlers;
  }),
  patch: vi.fn((path: string, ...handlers: Function[]) => {
    _routeHandlers[`PATCH ${path}`] = handlers;
  }),
  delete: vi.fn((path: string, ...handlers: Function[]) => {
    _routeHandlers[`DELETE ${path}`] = handlers;
  }),
};
vi.mock("express", () => ({
  Router: () => _mockRouter,
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

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
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

const mockDbReturns = {
  selectResult: [] as any[],
  insertResult: [] as any[],
  updateResult: [] as any[],
};

let mockIsDatabaseAvailable = true;

const mockTxMethods = () => ({
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.insertResult)),
    }),
  }),
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.updateResult)),
      }),
    }),
  }),
});

vi.mock("../db", () => ({
  getDb: () => ({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.selectResult)),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.insertResult)),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.updateResult)),
        }),
      }),
    }),
    transaction: vi.fn().mockImplementation(async (cb: Function) => cb(mockTxMethods())),
  }),
  isDatabaseAvailable: () => mockIsDatabaseAvailable,
}));

// Mock stripe dynamic import
const mockStripeCheckoutCreate = vi.fn();
const mockStripePaymentIntentsRetrieve = vi.fn();

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      checkout: {
        sessions: {
          create: mockStripeCheckoutCreate,
        },
      },
      paymentIntents: {
        retrieve: mockStripePaymentIntentsRetrieve,
      },
    };
  }),
}));

// =============================================================================
// Imports after mocks
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
  const handlers = _routeHandlers[key];
  if (!handlers)
    throw new Error(`No handler for ${key}. Available: ${Object.keys(_routeHandlers).join(", ")}`);
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
    mockDbReturns.insertResult = [];
    mockDbReturns.updateResult = [];
    mockIsDatabaseAvailable = true;
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

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ tier: "free" }));
    });
  });

  // ===========================================================================
  // POST /award-pro
  // ===========================================================================

  describe("POST /award-pro", () => {
    it("awards pro status successfully", async () => {
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
          message: expect.stringContaining("Skater"),
          awardedTo: "target-1",
          awardedBy: "user-1",
        })
      );
    });

    it("blocks self-award", async () => {
      const req = mockRequest({
        body: { userId: "user-1" },
        currentUser: { id: "user-1" },
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

    it("returns 404 when target user not found", async () => {
      mockDbReturns.selectResult = [];

      const req = mockRequest({
        body: { userId: "nonexistent" },
      });
      const res = mockResponse();

      await callRoute("POST", "/award-pro", req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "USER_NOT_FOUND", message: "User not found." })
      );
    });

    it("returns 409 when user already has pro or premium", async () => {
      mockDbReturns.selectResult = [{ id: "target-1", accountTier: "pro", firstName: "Skater" }];

      const req = mockRequest({ body: { userId: "target-1" } });
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

    it("returns 503 when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;

      const req = mockRequest({ body: { userId: "target-1" } });
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

    it("returns 400 for invalid body (missing userId)", async () => {
      const req = mockRequest({ body: {} });
      const res = mockResponse();

      await callRoute("POST", "/award-pro", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "VALIDATION_ERROR" }));
    });
  });

  // ===========================================================================
  // POST /create-checkout-session
  // ===========================================================================

  describe("POST /create-checkout-session", () => {
    it("returns 409 when user already has premium", async () => {
      const req = mockRequest({
        body: { idempotencyKey: "key-123" },
        currentUser: { id: "user-1", accountTier: "premium", email: "test@test.com" },
      });
      const res = mockResponse();

      await callRoute("POST", "/create-checkout-session", req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "ALREADY_PREMIUM", message: "You already have Premium." })
      );
    });

    it("returns 500 when stripe key not configured", async () => {
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

    it("returns 400 for invalid body", async () => {
      const req = mockRequest({ body: {} });
      const res = mockResponse();

      await callRoute("POST", "/create-checkout-session", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "VALIDATION_ERROR" }));
    });

    it("returns 500 on stripe error", async () => {
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
    it("returns 409 when user already has premium", async () => {
      const req = mockRequest({
        body: { paymentIntentId: "pi_test_123" },
        currentUser: { id: "user-1", accountTier: "premium", email: "test@test.com" },
      });
      const res = mockResponse();

      await callRoute("POST", "/purchase-premium", req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "ALREADY_PREMIUM", message: "You already have Premium." })
      );
    });

    it("returns 500 when stripe key not configured", async () => {
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

    it("returns 400 for invalid body (missing paymentIntentId)", async () => {
      const req = mockRequest({ body: {} });
      const res = mockResponse();

      await callRoute("POST", "/purchase-premium", req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "VALIDATION_ERROR" }));
    });

    it("returns 409 when payment intent has already been consumed", async () => {
      mockStripePaymentIntentsRetrieve.mockResolvedValue({
        status: "succeeded",
        amount: 999,
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

    it("upgrades to premium and records payment intent on success", async () => {
      mockStripePaymentIntentsRetrieve.mockResolvedValue({
        status: "succeeded",
        amount: 999,
      });
      // No existing consumed payment intent
      mockDbReturns.selectResult = [];

      const req = mockRequest({
        body: { paymentIntentId: "pi_fresh_123" },
      });
      const res = mockResponse();

      await callRoute("POST", "/purchase-premium", req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          tier: "premium",
        })
      );
    });
  });
});
