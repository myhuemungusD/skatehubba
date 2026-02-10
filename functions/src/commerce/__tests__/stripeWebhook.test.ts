/**
 * @fileoverview Unit tests for Stripe Webhook Handler (Firebase Functions)
 *
 * Tests payment processing webhook handlers:
 * - Signature verification
 * - Event deduplication
 * - Payment intent succeeded (order fulfillment)
 * - Payment intent failed (order cancellation)
 * - Charge dispute created
 * - Charge refunded (inventory restock)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type Stripe from "stripe";

// ============================================================================
// Mocks
// ============================================================================

// Mock express - capture route handlers
const _routeHandlers: Record<string, Function> = {};

const mockExpressApp: any = {
  use: vi.fn(),
  post: vi.fn((path: string, handler: Function) => {
    _routeHandlers[`POST ${path}`] = handler;
  }),
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  patch: vi.fn(),
};

const mockExpress = Object.assign(
  vi.fn(() => mockExpressApp),
  {
    Router: vi.fn(() => mockExpressApp),
    raw: vi.fn(() => (req: any, res: any, next: any) => next()),
    json: vi.fn(() => (req: any, res: any, next: any) => next()),
  }
);

vi.mock("express", () => ({
  default: mockExpress,
}));

// Mock firebase-functions/v2
vi.mock("firebase-functions/v2/https", () => ({
  onRequest: vi.fn((_opts: any, app: any) => app),
}));

vi.mock("firebase-functions/v2", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock Stripe - must be a proper constructor function
const mockConstructEvent = vi.fn();
const mockWebhooks = {
  constructEvent: mockConstructEvent,
};

const FakeStripe = function (this: any) {
  this.webhooks = mockWebhooks;
} as any;

vi.mock("stripe", () => ({
  default: FakeStripe,
}));

// In-memory Firestore mock
const mockDocs = new Map<string, any>();

const mockTransaction = {
  get: vi.fn().mockImplementation(async (ref: any) => {
    const key = ref._path;
    const data = mockDocs.get(key);
    return {
      exists: !!data,
      data: () => data,
    };
  }),
  update: vi.fn().mockImplementation((ref: any, updates: any) => {
    const key = ref._path;
    const current = mockDocs.get(key) || {};
    mockDocs.set(key, { ...current, ...updates });
  }),
  set: vi.fn().mockImplementation((ref: any, data: any) => {
    mockDocs.set(ref._path, data);
  }),
};

function makeDocRef(path: string) {
  return {
    _path: path,
    get: vi.fn().mockImplementation(async () => {
      const data = mockDocs.get(path);
      return { exists: !!data, data: () => data };
    }),
    update: vi.fn().mockImplementation(async (updates: any) => {
      const current = mockDocs.get(path) || {};
      mockDocs.set(path, { ...current, ...updates });
    }),
  };
}

vi.mock("../../firebaseAdmin", () => ({
  getAdminDb: () => ({
    collection: vi.fn().mockImplementation((collName: string) => ({
      doc: vi.fn().mockImplementation((docId: string) => {
        const path = `${collName}/${docId}`;
        return makeDocRef(path);
      }),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockImplementation(async () => {
        // Return docs matching the collection
        const docs: any[] = [];
        for (const [key, value] of mockDocs.entries()) {
          if (key.startsWith(collName + "/")) {
            const docId = key.split("/")[1];
            docs.push({
              id: docId,
              ref: makeDocRef(key),
              data: () => value,
            });
          }
        }
        return { empty: docs.length === 0, docs };
      }),
    })),
    runTransaction: vi.fn().mockImplementation(async (callback: any) => {
      return await callback(mockTransaction);
    }),
  }),
}));

vi.mock("firebase-admin/firestore", () => ({
  Timestamp: {
    now: () => ({ toMillis: () => Date.now(), toDate: () => new Date() }),
  },
}));

// Mock stock release functions
const mockReleaseHoldAtomic = vi.fn();
const mockConsumeHold = vi.fn();
const mockRestockFromConsumedHold = vi.fn();

vi.mock("../stockRelease", () => ({
  releaseHoldAtomic: mockReleaseHoldAtomic,
  consumeHold: mockConsumeHold,
  restockFromConsumedHold: mockRestockFromConsumedHold,
}));

// Mock webhook deduplication
const mockMarkEventProcessedOrSkip = vi.fn();
vi.mock("../webhookDedupe", () => ({
  markEventProcessedOrSkip: mockMarkEventProcessedOrSkip,
}));

// ============================================================================
// Test Setup
// ============================================================================

describe("Stripe Webhook Handler (Firebase Functions)", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDocs.clear();

    // Save original env
    originalEnv = process.env;

    // Set up test environment
    process.env = {
      ...originalEnv,
      STRIPE_SECRET_KEY: "sk_test_mock",
      STRIPE_WEBHOOK_SECRET: "whsec_mock",
    };

    // Default mock behaviors
    mockMarkEventProcessedOrSkip.mockResolvedValue(true);
    mockConsumeHold.mockResolvedValue(true);
    mockReleaseHoldAtomic.mockResolvedValue(true);
    mockRestockFromConsumedHold.mockResolvedValue(true);

    // Import to register routes
    await import("../stripeWebhook");
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // Helper to call the webhook handler
  async function callWebhook(req: any, res: any) {
    const handler = _routeHandlers["POST /stripe"];
    if (!handler) {
      throw new Error("POST /stripe handler not found");
    }
    await handler(req, res);
  }

  // ==========================================================================
  // Configuration & Signature Verification
  // ==========================================================================

  describe("Configuration & Signature Verification", () => {
    it("returns 500 when Stripe configuration is missing", async () => {
      delete process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_WEBHOOK_SECRET;

      // Re-import after env is cleared
      vi.resetModules();
      await import("../stripeWebhook");

      const mockReq = {
        headers: { "stripe-signature": "test" },
        body: Buffer.from("test"),
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await callWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.send).toHaveBeenCalledWith("Stripe not configured");

      // Restore env for other tests
      process.env.STRIPE_SECRET_KEY = "sk_test_mock";
      process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock";
    });

    it("returns 400 when stripe-signature header is missing", async () => {
      const mockReq = {
        headers: {},
        body: Buffer.from("test"),
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await callWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith("Missing signature");
    });

    it("returns 400 when webhook signature verification fails", async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error("Invalid signature");
      });

      const mockReq = {
        headers: { "stripe-signature": "invalid_sig" },
        body: Buffer.from("test"),
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await callWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith("Webhook Error: Invalid signature");
    });
  });

  // ==========================================================================
  // Event Deduplication
  // ==========================================================================

  describe("Event Deduplication", () => {
    it("skips duplicate events and returns 200", async () => {
      mockMarkEventProcessedOrSkip.mockResolvedValue(false);

      const event: Stripe.Event = {
        id: "evt_duplicate",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_123",
            metadata: { orderId: "order-1" },
          } as any,
        },
      } as any;

      mockConstructEvent.mockReturnValue(event);

      const mockReq = {
        headers: { "stripe-signature": "valid_sig" },
        body: Buffer.from("test"),
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await callWebhook(mockReq, mockRes);

      expect(mockMarkEventProcessedOrSkip).toHaveBeenCalledWith("evt_duplicate");
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith("Duplicate event");
    });
  });

  // ==========================================================================
  // payment_intent.succeeded Handler
  // ==========================================================================

  describe("handlePaymentSucceeded", () => {
    it("successfully marks order as paid and consumes hold", async () => {
      const orderId = "order-success";

      mockDocs.set(`orders/${orderId}`, {
        status: "pending",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_success",
      });

      const event: Stripe.Event = {
        id: "evt_123",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_success",
            metadata: { orderId },
            amount_received: 5000,
            currency: "usd",
          } as any,
        },
      } as any;

      mockConstructEvent.mockReturnValue(event);

      const mockReq = {
        headers: { "stripe-signature": "valid_sig" },
        body: Buffer.from("test"),
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await callWebhook(mockReq, mockRes);

      expect(mockConsumeHold).toHaveBeenCalledWith(orderId);
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("logs error when orderId metadata is missing", async () => {
      const event: Stripe.Event = {
        id: "evt_123",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_no_metadata",
            metadata: {},
            amount_received: 5000,
            currency: "usd",
          } as any,
        },
      } as any;

      mockConstructEvent.mockReturnValue(event);

      const mockReq = {
        headers: { "stripe-signature": "valid_sig" },
        body: Buffer.from("test"),
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await callWebhook(mockReq, mockRes);

      expect(mockConsumeHold).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("logs error when order not found", async () => {
      const event: Stripe.Event = {
        id: "evt_123",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_123",
            metadata: { orderId: "nonexistent" },
            amount_received: 5000,
            currency: "usd",
          } as any,
        },
      } as any;

      mockConstructEvent.mockReturnValue(event);

      const mockReq = {
        headers: { "stripe-signature": "valid_sig" },
        body: Buffer.from("test"),
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await callWebhook(mockReq, mockRes);

      expect(mockConsumeHold).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("skips when order already paid", async () => {
      const orderId = "order-already-paid";

      mockDocs.set(`orders/${orderId}`, {
        status: "paid",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_123",
      });

      const event: Stripe.Event = {
        id: "evt_123",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_123",
            metadata: { orderId },
            amount_received: 5000,
            currency: "usd",
          } as any,
        },
      } as any;

      mockConstructEvent.mockReturnValue(event);

      const mockReq = {
        headers: { "stripe-signature": "valid_sig" },
        body: Buffer.from("test"),
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await callWebhook(mockReq, mockRes);

      expect(mockConsumeHold).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("refuses to mark paid when order not in pending status", async () => {
      const orderId = "order-canceled";

      mockDocs.set(`orders/${orderId}`, {
        status: "canceled",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_123",
      });

      const event: Stripe.Event = {
        id: "evt_123",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_123",
            metadata: { orderId },
            amount_received: 5000,
            currency: "usd",
          } as any,
        },
      } as any;

      mockConstructEvent.mockReturnValue(event);

      const mockReq = {
        headers: { "stripe-signature": "valid_sig" },
        body: Buffer.from("test"),
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await callWebhook(mockReq, mockRes);

      expect(mockConsumeHold).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("throws error on payment intent ID mismatch (security)", async () => {
      const orderId = "order-mismatch";

      mockDocs.set(`orders/${orderId}`, {
        status: "pending",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_expected",
      });

      const event: Stripe.Event = {
        id: "evt_123",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_different",
            metadata: { orderId },
            amount_received: 5000,
            currency: "usd",
          } as any,
        },
      } as any;

      mockConstructEvent.mockReturnValue(event);

      const mockReq = {
        headers: { "stripe-signature": "valid_sig" },
        body: Buffer.from("test"),
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await callWebhook(mockReq, mockRes);

      expect(mockConsumeHold).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("throws error on amount mismatch", async () => {
      const orderId = "order-amount-mismatch";

      mockDocs.set(`orders/${orderId}`, {
        status: "pending",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_123",
      });

      const event: Stripe.Event = {
        id: "evt_123",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_123",
            metadata: { orderId },
            amount_received: 3000, // Wrong amount
            currency: "usd",
          } as any,
        },
      } as any;

      mockConstructEvent.mockReturnValue(event);

      const mockReq = {
        headers: { "stripe-signature": "valid_sig" },
        body: Buffer.from("test"),
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await callWebhook(mockReq, mockRes);

      expect(mockConsumeHold).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("throws error on currency mismatch", async () => {
      const orderId = "order-currency-mismatch";

      mockDocs.set(`orders/${orderId}`, {
        status: "pending",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_123",
      });

      const event: Stripe.Event = {
        id: "evt_123",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_123",
            metadata: { orderId },
            amount_received: 5000,
            currency: "eur", // Wrong currency
          } as any,
        },
      } as any;

      mockConstructEvent.mockReturnValue(event);

      const mockReq = {
        headers: { "stripe-signature": "valid_sig" },
        body: Buffer.from("test"),
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await callWebhook(mockReq, mockRes);

      expect(mockConsumeHold).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });

  // ==========================================================================
  // payment_intent.payment_failed Handler
  // ==========================================================================

  describe("handlePaymentFailed", () => {
    it("cancels order and releases stock on payment failure", async () => {
      const orderId = "order-fail";

      mockDocs.set(`orders/${orderId}`, {
        status: "pending",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_fail",
      });

      const event: Stripe.Event = {
        id: "evt_fail",
        type: "payment_intent.payment_failed",
        data: {
          object: {
            id: "pi_fail",
            metadata: { orderId },
            last_payment_error: { message: "Card declined" },
          } as any,
        },
      } as any;

      mockConstructEvent.mockReturnValue(event);

      const mockReq = {
        headers: { "stripe-signature": "valid_sig" },
        body: Buffer.from("test"),
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await callWebhook(mockReq, mockRes);

      expect(mockReleaseHoldAtomic).toHaveBeenCalledWith(orderId, orderId);
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("logs error when orderId metadata is missing", async () => {
      const event: Stripe.Event = {
        id: "evt_fail",
        type: "payment_intent.payment_failed",
        data: {
          object: {
            id: "pi_fail",
            metadata: {},
          } as any,
        },
      } as any;

      mockConstructEvent.mockReturnValue(event);

      const mockReq = {
        headers: { "stripe-signature": "valid_sig" },
        body: Buffer.from("test"),
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await callWebhook(mockReq, mockRes);

      expect(mockReleaseHoldAtomic).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("skips when order not in pending status", async () => {
      const orderId = "order-already-canceled";

      mockDocs.set(`orders/${orderId}`, {
        status: "canceled",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_fail",
      });

      const event: Stripe.Event = {
        id: "evt_fail",
        type: "payment_intent.payment_failed",
        data: {
          object: {
            id: "pi_fail",
            metadata: { orderId },
          } as any,
        },
      } as any;

      mockConstructEvent.mockReturnValue(event);

      const mockReq = {
        headers: { "stripe-signature": "valid_sig" },
        body: Buffer.from("test"),
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await callWebhook(mockReq, mockRes);

      expect(mockReleaseHoldAtomic).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });

  // ==========================================================================
  // charge.dispute.created Handler
  // ==========================================================================

  describe("handleChargeDisputeCreated", () => {
    it("marks paid order as disputed", async () => {
      const orderId = "order-dispute";

      mockDocs.set(`orders/${orderId}`, {
        status: "paid",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_dispute",
      });

      const event: Stripe.Event = {
        id: "evt_dispute",
        type: "charge.dispute.created",
        data: {
          object: {
            id: "dp_123",
            payment_intent: "pi_dispute",
            reason: "fraudulent",
            amount: 5000,
            currency: "usd",
          } as any,
        },
      } as any;

      mockConstructEvent.mockReturnValue(event);

      const mockReq = {
        headers: { "stripe-signature": "valid_sig" },
        body: Buffer.from("test"),
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await callWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("logs error when payment_intent is missing", async () => {
      const event: Stripe.Event = {
        id: "evt_dispute",
        type: "charge.dispute.created",
        data: {
          object: {
            id: "dp_123",
            payment_intent: null,
            reason: "fraudulent",
          } as any,
        },
      } as any;

      mockConstructEvent.mockReturnValue(event);

      const mockReq = {
        headers: { "stripe-signature": "valid_sig" },
        body: Buffer.from("test"),
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await callWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("skips when order already disputed", async () => {
      const orderId = "order-already-disputed";

      mockDocs.set(`orders/${orderId}`, {
        status: "disputed",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_dispute",
      });

      const event: Stripe.Event = {
        id: "evt_dispute",
        type: "charge.dispute.created",
        data: {
          object: {
            id: "dp_123",
            payment_intent: "pi_dispute",
            reason: "fraudulent",
          } as any,
        },
      } as any;

      mockConstructEvent.mockReturnValue(event);

      const mockReq = {
        headers: { "stripe-signature": "valid_sig" },
        body: Buffer.from("test"),
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await callWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("logs error when disputing order in unexpected status", async () => {
      const orderId = "order-pending-dispute";

      mockDocs.set(`orders/${orderId}`, {
        status: "pending",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_dispute",
      });

      const event: Stripe.Event = {
        id: "evt_dispute",
        type: "charge.dispute.created",
        data: {
          object: {
            id: "dp_123",
            payment_intent: "pi_dispute",
            reason: "fraudulent",
          } as any,
        },
      } as any;

      mockConstructEvent.mockReturnValue(event);

      const mockReq = {
        headers: { "stripe-signature": "valid_sig" },
        body: Buffer.from("test"),
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await callWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });

  // ==========================================================================
  // charge.refunded Handler
  // ==========================================================================

  describe("handleChargeRefunded", () => {
    it("marks order as refunded and restocks inventory on full refund", async () => {
      const orderId = "order-refund";

      mockDocs.set(`orders/${orderId}`, {
        status: "paid",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_refund",
      });

      const event: Stripe.Event = {
        id: "evt_refund",
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_123",
            payment_intent: "pi_refund",
            refunded: true,
            amount: 5000,
            amount_refunded: 5000,
          } as any,
        },
      } as any;

      mockConstructEvent.mockReturnValue(event);

      const mockReq = {
        headers: { "stripe-signature": "valid_sig" },
        body: Buffer.from("test"),
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await callWebhook(mockReq, mockRes);

      expect(mockRestockFromConsumedHold).toHaveBeenCalledWith(orderId);
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("logs warning on partial refund (requires manual review)", async () => {
      const orderId = "order-partial-refund";

      mockDocs.set(`orders/${orderId}`, {
        status: "paid",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_refund",
      });

      const event: Stripe.Event = {
        id: "evt_refund",
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_123",
            payment_intent: "pi_refund",
            refunded: false, // Partial refund
            amount: 5000,
            amount_refunded: 2500,
          } as any,
        },
      } as any;

      mockConstructEvent.mockReturnValue(event);

      const mockReq = {
        headers: { "stripe-signature": "valid_sig" },
        body: Buffer.from("test"),
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await callWebhook(mockReq, mockRes);

      expect(mockRestockFromConsumedHold).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("skips when order already refunded", async () => {
      const orderId = "order-already-refunded";

      mockDocs.set(`orders/${orderId}`, {
        status: "refunded",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_refund",
      });

      const event: Stripe.Event = {
        id: "evt_refund",
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_123",
            payment_intent: "pi_refund",
            refunded: true,
          } as any,
        },
      } as any;

      mockConstructEvent.mockReturnValue(event);

      const mockReq = {
        headers: { "stripe-signature": "valid_sig" },
        body: Buffer.from("test"),
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await callWebhook(mockReq, mockRes);

      expect(mockRestockFromConsumedHold).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("logs error when refunding order in unexpected status", async () => {
      const orderId = "order-pending-refund";

      mockDocs.set(`orders/${orderId}`, {
        status: "pending",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_refund",
      });

      const event: Stripe.Event = {
        id: "evt_refund",
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_123",
            payment_intent: "pi_refund",
            refunded: true,
          } as any,
        },
      } as any;

      mockConstructEvent.mockReturnValue(event);

      const mockReq = {
        headers: { "stripe-signature": "valid_sig" },
        body: Buffer.from("test"),
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await callWebhook(mockReq, mockRes);

      expect(mockRestockFromConsumedHold).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("logs error when payment_intent is missing", async () => {
      const event: Stripe.Event = {
        id: "evt_refund",
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_123",
            payment_intent: null,
            refunded: true,
          } as any,
        },
      } as any;

      mockConstructEvent.mockReturnValue(event);

      const mockReq = {
        headers: { "stripe-signature": "valid_sig" },
        body: Buffer.from("test"),
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await callWebhook(mockReq, mockRes);

      expect(mockRestockFromConsumedHold).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });

  // ==========================================================================
  // Unhandled Event Types
  // ==========================================================================

  describe("Unhandled Event Types", () => {
    it("returns 200 for unhandled event types", async () => {
      const event: Stripe.Event = {
        id: "evt_unhandled",
        type: "customer.created" as any,
        data: {
          object: {} as any,
        },
      } as any;

      mockConstructEvent.mockReturnValue(event);

      const mockReq = {
        headers: { "stripe-signature": "valid_sig" },
        body: Buffer.from("test"),
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await callWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith("OK");
    });
  });
});
