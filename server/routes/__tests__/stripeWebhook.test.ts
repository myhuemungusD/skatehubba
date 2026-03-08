/**
 * @fileoverview Unit tests for Stripe Webhook Handler (Server Routes)
 *
 * Payment system is currently DISABLED (STRIPE_PAYMENTS_ENABLED !== "true").
 * Tests verify that the webhook returns 410 when payments are disabled,
 * and that the original behavior works when payments are enabled.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type Stripe from "stripe";

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

vi.mock("../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("@shared/schema", () => ({
  customUsers: {
    id: "id",
    accountTier: "accountTier",
    email: "email",
    firstName: "firstName",
    premiumPurchasedAt: "premiumPurchasedAt",
    updatedAt: "updatedAt",
  },
  consumedPaymentIntents: {
    id: "id",
    paymentIntentId: "paymentIntentId",
    userId: "userId",
  },
}));

// Mock database
const mockDbReturns = {
  selectResult: [] as any[],
  updateResult: [] as any[],
};

// Track calls to differentiate between tx queries (consumed check, user check) and post-tx queries (email lookup)
let selectCallCount = 0;

let mockGetDbShouldThrow = false;

function createMockDb() {
  const db: any = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            // Returns a thenable that also has .for() for SELECT ... FOR UPDATE chains
            const result = Promise.resolve(mockDbReturns.selectResult);
            (result as any).for = vi.fn().mockImplementation(() => {
              selectCallCount++;
              // First .for("update") call = consumedPaymentIntents check → return [] (not consumed)
              // Second .for("update") call = user check → return selectResult
              if (selectCallCount === 1) return Promise.resolve([]);
              return Promise.resolve(mockDbReturns.selectResult);
            });
            return result;
          }),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.updateResult)),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
    transaction: vi.fn(async (cb: Function) => cb(db)),
  };
  return db;
}

vi.mock("../../db", () => ({
  getDb: () => {
    if (mockGetDbShouldThrow) throw new Error("Database not configured");
    return createMockDb();
  },
}));

// Mock Stripe
const mockConstructEvent = vi.fn();
const mockWebhooks = {
  constructEvent: mockConstructEvent,
};

// Stripe must be a proper constructor function
const FakeStripe = function (this: any) {
  this.webhooks = mockWebhooks;
} as any;

vi.mock("stripe", () => ({
  default: FakeStripe,
}));

// Mock email service
const mockSendPaymentReceiptEmail = vi.fn();
vi.mock("../../services/emailService", () => ({
  sendPaymentReceiptEmail: mockSendPaymentReceiptEmail,
}));

// Mock notification service
const mockNotifyUser = vi.fn();
vi.mock("../../services/notificationService", () => ({
  notifyUser: mockNotifyUser,
}));

// Mock Redis (configurable per test — defaults to null for in-memory fallback)
let mockRedisClient: any = null;
vi.mock("../../redis", () => ({
  getRedisClient: () => mockRedisClient,
}));

// =============================================================================
// Test Setup
// =============================================================================

describe("Stripe Webhook Handler (Server Routes)", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Clear route handlers
    Object.keys(_routeHandlers).forEach((key) => delete _routeHandlers[key]);

    // Save original env
    originalEnv = process.env;

    // Set up test environment
    process.env = {
      ...originalEnv,
      STRIPE_SECRET_KEY: "sk_test_mock",
      STRIPE_WEBHOOK_SECRET: "whsec_mock",
    };

    // Reset mock returns
    mockDbReturns.selectResult = [];
    mockDbReturns.updateResult = [];
    mockGetDbShouldThrow = false;
    selectCallCount = 0;
    mockRedisClient = null; // Default: no Redis (falls back to in-memory)

    // Default mock behaviors
    mockSendPaymentReceiptEmail.mockResolvedValue(undefined);
    mockNotifyUser.mockResolvedValue(undefined);

    // Set up default mock event - tests can override this
    mockConstructEvent.mockReturnValue({
      id: "evt_default",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_default",
          metadata: { userId: "test-user", type: "premium_upgrade" },
          payment_status: "paid",
          amount_total: 999,
        },
      },
    });

    // Reset modules and import to register routes
    vi.resetModules();
    await import("../stripeWebhook");
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  // ==========================================================================
  // Helpers
  // ==========================================================================

  function mockRequest(overrides: Record<string, any> = {}): any {
    return {
      headers: {},
      body: Buffer.from("test"),
      ...overrides,
    };
  }

  function mockResponse(): any {
    const res: any = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    return res;
  }

  async function callWebhook(req: any, res: any) {
    const handler = _routeHandlers["POST /"];
    if (!handler || handler.length === 0) {
      throw new Error("POST / handler not found");
    }
    // Call the last handler (the actual route handler)
    await handler[handler.length - 1](req, res);
  }

  // ==========================================================================
  // Payments Disabled (default state)
  // ==========================================================================

  describe("Payments Disabled (default)", () => {
    it("returns 410 when STRIPE_PAYMENTS_ENABLED is not set", async () => {
      const req = mockRequest({
        headers: { "stripe-signature": "valid_sig" },
      });
      const res = mockResponse();

      await callWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(410);
      expect(res.send).toHaveBeenCalledWith("Payment system disabled");
    });
  });

  // ==========================================================================
  // Payments Enabled (legacy/future behavior)
  // ==========================================================================

  describe("Payments Enabled", () => {
    beforeEach(async () => {
      vi.clearAllMocks();
      Object.keys(_routeHandlers).forEach((key) => delete _routeHandlers[key]);

      process.env = {
        ...originalEnv,
        STRIPE_SECRET_KEY: "sk_test_mock",
        STRIPE_WEBHOOK_SECRET: "whsec_mock",
        STRIPE_PAYMENTS_ENABLED: "true",
      };

      mockDbReturns.selectResult = [];
      mockDbReturns.updateResult = [];
      mockGetDbShouldThrow = false;
      selectCallCount = 0;
      mockRedisClient = null;

      mockSendPaymentReceiptEmail.mockResolvedValue(undefined);
      mockNotifyUser.mockResolvedValue(undefined);

      mockConstructEvent.mockReturnValue({
        id: "evt_default",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_default",
            metadata: { userId: "test-user", type: "premium_upgrade" },
            payment_status: "paid",
            amount_total: 999,
          },
        },
      });

      vi.resetModules();
      await import("../stripeWebhook");
    });

    describe("Configuration & Signature Verification", () => {
      it("returns 500 when Stripe configuration is missing", async () => {
        delete process.env.STRIPE_SECRET_KEY;
        delete process.env.STRIPE_WEBHOOK_SECRET;

        vi.resetModules();
        await import("../stripeWebhook");

        const req = mockRequest({
          headers: { "stripe-signature": "test" },
        });
        const res = mockResponse();

        await callWebhook(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.send).toHaveBeenCalledWith("Stripe not configured");

        process.env.STRIPE_SECRET_KEY = "sk_test_mock";
        process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock";
      });

      it("returns 400 when stripe-signature header is missing", async () => {
        const req = mockRequest({
          headers: {},
        });
        const res = mockResponse();

        await callWebhook(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.send).toHaveBeenCalledWith("Missing stripe-signature header");
      });

      it("returns 400 when webhook signature verification fails", async () => {
        mockConstructEvent.mockImplementation(() => {
          throw new Error("Invalid signature");
        });

        const req = mockRequest({
          headers: { "stripe-signature": "invalid_sig" },
        });
        const res = mockResponse();

        await callWebhook(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.send).toHaveBeenCalledWith("Webhook signature verification failed");
      });
    });

    describe("handleCheckoutCompleted", () => {
      it("successfully upgrades user to premium", async () => {
        const userId = "user-premium";

        mockDbReturns.selectResult = [
          { accountTier: "free", email: "user@test.com", firstName: "John" },
        ];

        const session: Stripe.Checkout.Session = {
          id: "cs_test_123",
          metadata: {
            userId,
            type: "premium_upgrade",
          },
          payment_status: "paid",
          amount_total: 999,
        } as any;

        const event: Stripe.Event = {
          id: "evt_123",
          type: "checkout.session.completed",
          data: {
            object: session,
          },
        } as any;

        mockConstructEvent.mockReturnValue(event);

        const req = mockRequest({
          headers: { "stripe-signature": "valid_sig" },
        });
        const res = mockResponse();

        await callWebhook(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith("OK");
      });

      it("ignores non-premium_upgrade checkout sessions", async () => {
        const session: Stripe.Checkout.Session = {
          id: "cs_test_123",
          metadata: {
            userId: "user-1",
            type: "other_type",
          },
          payment_status: "paid",
          amount_total: 999,
        } as any;

        const event: Stripe.Event = {
          id: "evt_123",
          type: "checkout.session.completed",
          data: {
            object: session,
          },
        } as any;

        mockConstructEvent.mockReturnValue(event);

        const req = mockRequest({
          headers: { "stripe-signature": "valid_sig" },
        });
        const res = mockResponse();

        await callWebhook(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
      });

      it("skips when payment status is not paid", async () => {
        const session: Stripe.Checkout.Session = {
          id: "cs_test_123",
          metadata: {
            userId: "user-1",
            type: "premium_upgrade",
          },
          payment_status: "unpaid",
          amount_total: 999,
        } as any;

        const event: Stripe.Event = {
          id: "evt_123",
          type: "checkout.session.completed",
          data: {
            object: session,
          },
        } as any;

        mockConstructEvent.mockReturnValue(event);

        const req = mockRequest({
          headers: { "stripe-signature": "valid_sig" },
        });
        const res = mockResponse();

        await callWebhook(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
      });

      it("returns 500 when database is unavailable (so Stripe retries)", async () => {
        mockGetDbShouldThrow = true;

        const session: Stripe.Checkout.Session = {
          id: "cs_test_123",
          metadata: {
            userId: "user-1",
            type: "premium_upgrade",
          },
          payment_status: "paid",
          amount_total: 999,
          currency: "usd",
        } as any;

        const event: Stripe.Event = {
          id: "evt_db_unavail",
          type: "checkout.session.completed",
          data: {
            object: session,
          },
        } as any;

        mockConstructEvent.mockReturnValue(event);

        const req = mockRequest({
          headers: { "stripe-signature": "valid_sig" },
        });
        const res = mockResponse();

        await callWebhook(req, res);

        expect(res.status).toHaveBeenCalledWith(500);

        mockGetDbShouldThrow = false;
      });
    });

    describe("Other Event Types", () => {
      it("returns 200 for unhandled event types", async () => {
        const event: Stripe.Event = {
          id: "evt_unhandled",
          type: "customer.created" as any,
          data: {
            object: {} as any,
          },
        } as any;

        mockConstructEvent.mockReturnValue(event);

        const req = mockRequest({
          headers: { "stripe-signature": "valid_sig" },
        });
        const res = mockResponse();

        await callWebhook(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith("OK");
      });
    });

    describe("Redis Deduplication", () => {
      it("uses Redis for dedup when available (new event)", async () => {
        mockRedisClient = {
          set: vi.fn().mockResolvedValue("OK"),
        };

        const event: Stripe.Event = {
          id: "evt_redis_new",
          type: "customer.created" as any,
          data: { object: {} as any },
        } as any;

        mockConstructEvent.mockReturnValue(event);

        const req = mockRequest({ headers: { "stripe-signature": "sig" } });
        const res = mockResponse();
        await callWebhook(req, res);

        expect(mockRedisClient.set).toHaveBeenCalledWith(
          "stripe_event:evt_redis_new",
          "1",
          "EX",
          expect.any(Number),
          "NX"
        );
        expect(res.status).toHaveBeenCalledWith(200);
      });

      it("rejects duplicate events via Redis (returns null for NX)", async () => {
        mockRedisClient = {
          set: vi.fn().mockResolvedValue(null),
        };

        const event: Stripe.Event = {
          id: "evt_redis_dup",
          type: "customer.created" as any,
          data: { object: {} as any },
        } as any;

        mockConstructEvent.mockReturnValue(event);

        const req = mockRequest({ headers: { "stripe-signature": "sig" } });
        const res = mockResponse();
        await callWebhook(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith("OK");
      });
    });
  });
});
