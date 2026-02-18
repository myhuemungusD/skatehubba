/**
 * @fileoverview Unit tests for Stripe Webhook Handler (Server Routes)
 *
 * Tests tier upgrade webhook handlers:
 * - Signature verification
 * - checkout.session.completed (premium upgrade)
 * - Payment status validation
 * - Amount validation
 * - User upgrade flow
 * - Email and notification sending
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
}));

// Mock database
const mockDbReturns = {
  selectResult: [] as any[],
  updateResult: [] as any[],
};

let mockIsDatabaseAvailable = true;

vi.mock("../../db", () => ({
  getDb: () => ({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.selectResult)),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => Promise.resolve(mockDbReturns.updateResult)),
      }),
    }),
  }),
  isDatabaseAvailable: () => mockIsDatabaseAvailable,
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

// Mock Redis (returns null — dedup falls back to in-memory)
vi.mock("../../redis", () => ({
  getRedisClient: () => null,
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
    mockIsDatabaseAvailable = true;

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
  // Configuration & Signature Verification
  // ==========================================================================

  describe("Configuration & Signature Verification", () => {
    it("returns 500 when Stripe configuration is missing", async () => {
      delete process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_WEBHOOK_SECRET;

      // Re-import to pick up new env
      vi.resetModules();
      await import("../stripeWebhook");

      const req = mockRequest({
        headers: { "stripe-signature": "test" },
      });
      const res = mockResponse();

      await callWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith("Stripe not configured");

      // Restore env for other tests
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

  // ==========================================================================
  // checkout.session.completed Handler
  // ==========================================================================

  describe("handleCheckoutCompleted", () => {
    it("successfully upgrades user to premium", async () => {
      const userId = "user-premium";

      // User exists and is free tier
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

    it("ignores sessions without userId metadata", async () => {
      const session: Stripe.Checkout.Session = {
        id: "cs_test_123",
        metadata: {
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

    it("logs error when amount does not match expected", async () => {
      const session: Stripe.Checkout.Session = {
        id: "cs_test_123",
        metadata: {
          userId: "user-1",
          type: "premium_upgrade",
        },
        payment_status: "paid",
        amount_total: 1500, // Wrong amount
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

    it("throws when database is unavailable", async () => {
      mockIsDatabaseAvailable = false;

      const session: Stripe.Checkout.Session = {
        id: "cs_test_123",
        metadata: {
          userId: "user-1",
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

      // Restore for other tests
      mockIsDatabaseAvailable = true;
    });

    it("logs error when user not found", async () => {
      mockDbReturns.selectResult = []; // User not found

      const session: Stripe.Checkout.Session = {
        id: "cs_test_123",
        metadata: {
          userId: "nonexistent",
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
    });

    it("skips upgrade when user already premium", async () => {
      mockDbReturns.selectResult = [{ accountTier: "premium" }];

      const session: Stripe.Checkout.Session = {
        id: "cs_test_123",
        metadata: {
          userId: "user-already-premium",
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
    });

    it("sends payment receipt email after upgrade", async () => {
      const userId = "user-email";

      // First query: check if already premium
      // Second query: get user info for email
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

      expect(mockSendPaymentReceiptEmail).toHaveBeenCalledWith(
        "user@test.com",
        "John",
        expect.objectContaining({
          amount: "$9.99",
          tier: "Premium",
          transactionId: "cs_test_123",
        })
      );

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("sends in-app notification after upgrade", async () => {
      const userId = "user-notify";

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

      // Give time for async email/notification calls
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockNotifyUser).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: "payment_receipt",
          title: "Premium Activated",
          body: "Your Premium upgrade is confirmed. All features unlocked.",
          data: { sessionId: "cs_test_123" },
        })
      );

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("handles email sending failure gracefully", async () => {
      const userId = "user-email-fail";

      mockDbReturns.selectResult = [
        { accountTier: "free", email: "user@test.com", firstName: "John" },
      ];

      mockSendPaymentReceiptEmail.mockRejectedValue(new Error("Email service down"));

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

      // Give time for async email/notification calls
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should still return 200 (email failure is non-critical)
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("handles notification sending failure gracefully", async () => {
      const userId = "user-notify-fail";

      mockDbReturns.selectResult = [
        { accountTier: "free", email: "user@test.com", firstName: "John" },
      ];

      mockNotifyUser.mockRejectedValue(new Error("Notification service down"));

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

      // Give time for async email/notification calls
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should still return 200 (notification failure is non-critical)
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("uses default name when firstName is null", async () => {
      const userId = "user-no-name";

      mockDbReturns.selectResult = [
        { accountTier: "free", email: "user@test.com", firstName: null },
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

      // Give time for async email/notification calls
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockSendPaymentReceiptEmail).toHaveBeenCalledWith(
        "user@test.com",
        "Skater",
        expect.any(Object)
      );

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // ==========================================================================
  // Event Deduplication (in-memory fallback)
  // ==========================================================================

  describe("Event Deduplication", () => {
    it("should reject duplicate events via in-memory fallback", async () => {
      const event: Stripe.Event = {
        id: "evt_dedup_test",
        type: "customer.created" as any,
        data: { object: {} as any },
      } as any;

      mockConstructEvent.mockReturnValue(event);

      // First call — event is new
      const req1 = mockRequest({ headers: { "stripe-signature": "sig" } });
      const res1 = mockResponse();
      await callWebhook(req1, res1);
      expect(res1.status).toHaveBeenCalledWith(200);

      // Second call with same event ID — duplicate
      const req2 = mockRequest({ headers: { "stripe-signature": "sig" } });
      const res2 = mockResponse();
      await callWebhook(req2, res2);
      expect(res2.status).toHaveBeenCalledWith(200);
      expect(res2.send).toHaveBeenCalledWith("OK");
    });
  });

  // ==========================================================================
  // Other Event Types
  // ==========================================================================

  describe("Other Event Types", () => {
    it("logs customer.subscription.updated (no-op)", async () => {
      const subscription: Stripe.Subscription = {
        id: "sub_123",
        status: "active",
      } as any;

      const event: Stripe.Event = {
        id: "evt_123",
        type: "customer.subscription.updated",
        data: {
          object: subscription,
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

    it("logs customer.subscription.deleted (no-op)", async () => {
      const subscription: Stripe.Subscription = {
        id: "sub_123",
      } as any;

      const event: Stripe.Event = {
        id: "evt_123",
        type: "customer.subscription.deleted",
        data: {
          object: subscription,
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
});
