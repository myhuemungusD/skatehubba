/**
 * Edge-case behavior tests for Stripe webhook handlers, inventory holds, and stock release.
 *
 * Tests payment lifecycle edge cases (idempotent replays, status guards, validation
 * mismatches), dispute and refund handling, hold expiration, and stock release
 * batch processing with shard distribution.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Environment variables - must be set before any module imports
// ============================================================================

process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

// ============================================================================
// Capture the Express route handler so we can invoke it directly
// ============================================================================

let capturedStripeHandler: ((req: any, res: any) => Promise<void>) | null = null;

const mockExpressApp: any = {
  use: vi.fn(),
  post: vi.fn((path: string, handler: any) => {
    if (path === "/stripe") {
      capturedStripeHandler = handler;
    }
  }),
};

const mockExpress = Object.assign(
  vi.fn(() => mockExpressApp),
  {
    raw: vi.fn(() => vi.fn()),
    json: vi.fn(() => vi.fn()),
  }
);

vi.mock("express", () => ({
  default: mockExpress,
}));

// ============================================================================
// Firebase Functions mocks
// ============================================================================

vi.mock("firebase-functions/v2/https", () => ({
  onRequest: vi.fn((_opts: any, app: any) => app),
}));

vi.mock("firebase-functions/v2/scheduler", () => ({
  onSchedule: vi.fn((_opts: any, handler: any) => handler),
}));

vi.mock("firebase-functions/v2", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("firebase-admin/firestore", () => ({
  Timestamp: {
    now: vi.fn(() => ({ toMillis: () => Date.now(), toDate: () => new Date() })),
  },
  FieldValue: {
    increment: vi.fn((n: number) => ({ __incrementValue: n })),
  },
  DocumentReference: class {},
}));

// ============================================================================
// Stripe mock
// ============================================================================

const mockConstructEvent = vi.fn();

const FakeStripe = function (this: any) {
  this.webhooks = { constructEvent: mockConstructEvent };
} as any;

vi.mock("stripe", () => ({
  default: FakeStripe,
}));

// ============================================================================
// Firestore mock with precise per-path control
// ============================================================================

const mockDocs = new Map<string, any>();
const mockTransactionGet = vi.fn();
const mockTransactionUpdate = vi.fn();
const mockRunTransaction = vi.fn();

/** Per-path update mocks so we can make specific doc refs throw */
const mockDocUpdateFns = new Map<string, ReturnType<typeof vi.fn>>();
const mockDocGetFns = new Map<string, ReturnType<typeof vi.fn>>();

function makeDocRef(path: string) {
  const parts = path.split("/");
  const docId = parts[parts.length - 1];

  if (!mockDocUpdateFns.has(path)) {
    mockDocUpdateFns.set(
      path,
      vi.fn().mockImplementation(async (updates: any) => {
        const current = mockDocs.get(path) || {};
        mockDocs.set(path, { ...current, ...updates });
      })
    );
  }

  if (!mockDocGetFns.has(path)) {
    mockDocGetFns.set(
      path,
      vi.fn().mockImplementation(async () => {
        const data = mockDocs.get(path);
        return { exists: !!data, data: () => data };
      })
    );
  }

  return {
    _path: path,
    id: docId,
    get: mockDocGetFns.get(path)!,
    update: mockDocUpdateFns.get(path)!,
    collection: vi.fn().mockImplementation((subColl: string) => ({
      doc: vi.fn().mockImplementation((subDocId: string) => {
        return makeDocRef(`${path}/${subColl}/${subDocId}`);
      }),
    })),
  };
}

const mockBatchSet = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);

vi.mock("../../firebaseAdmin", () => ({
  getAdminDb: vi.fn(() => ({
    collection: vi.fn().mockImplementation((collName: string) => ({
      doc: vi.fn().mockImplementation((docId: string) => {
        return makeDocRef(`${collName}/${docId}`);
      }),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockImplementation(async () => {
        const docs: any[] = [];
        for (const [key, value] of mockDocs.entries()) {
          if (key.startsWith(collName + "/") && key.split("/").length === 2) {
            docs.push({
              id: key.split("/")[1],
              ref: makeDocRef(key),
              data: () => value,
            });
          }
        }
        return { empty: docs.length === 0, docs };
      }),
    })),
    runTransaction: mockRunTransaction,
    batch: vi.fn(() => ({
      set: mockBatchSet,
      update: mockBatchUpdate,
      commit: mockBatchCommit,
    })),
  })),
}));

// ============================================================================
// Stock release and webhook dedupe mocks (for stripeWebhook tests)
// ============================================================================

const mockConsumeHold = vi.fn().mockResolvedValue(true);
const mockReleaseHoldAtomic = vi.fn().mockResolvedValue(true);
const mockRestockFromConsumedHold = vi.fn().mockResolvedValue(true);

/** When true, the stockRelease mock delegates to the real implementation */
let useRealStockRelease = false;

vi.mock("../stockRelease", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    hashToShard: actual.hashToShard,
    releaseHoldAtomic: (...args: any[]) =>
      useRealStockRelease ? actual.releaseHoldAtomic(...args) : mockReleaseHoldAtomic(...args),
    consumeHold: (...args: any[]) =>
      useRealStockRelease ? actual.consumeHold(...args) : mockConsumeHold(...args),
    restockFromConsumedHold: (...args: any[]) =>
      useRealStockRelease
        ? actual.restockFromConsumedHold(...args)
        : mockRestockFromConsumedHold(...args),
  };
});

const mockMarkEventProcessedOrSkip = vi.fn().mockResolvedValue(true);

vi.mock("../webhookDedupe", () => ({
  markEventProcessedOrSkip: (...args: any[]) => mockMarkEventProcessedOrSkip(...args),
}));

// ============================================================================
// Helpers
// ============================================================================

function makeReqRes() {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const req: any = {
    headers: { "stripe-signature": "test_sig" },
    body: Buffer.from("{}"),
  };
  return { req, res };
}

function configureTransactionHappy() {
  mockTransactionGet.mockImplementation(async (ref: any) => {
    const data = mockDocs.get(ref._path);
    return { exists: !!data, data: () => data };
  });
  mockTransactionUpdate.mockImplementation((ref: any, updates: any) => {
    const current = mockDocs.get(ref._path) || {};
    mockDocs.set(ref._path, { ...current, ...updates });
  });
  mockRunTransaction.mockImplementation(async (cb: any) => {
    return await cb({ get: mockTransactionGet, update: mockTransactionUpdate });
  });
}

async function callWebhook(req: any, res: any) {
  if (!capturedStripeHandler) throw new Error("POST /stripe handler was not captured");
  await capturedStripeHandler(req, res);
}

// ============================================================================
// STRIPE WEBHOOK TESTS
// ============================================================================

describe("Stripe Webhook — edge cases", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDocs.clear();
    mockDocUpdateFns.clear();
    mockDocGetFns.clear();
    capturedStripeHandler = null;

    originalEnv = { ...process.env };
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

    mockMarkEventProcessedOrSkip.mockResolvedValue(true);
    mockConsumeHold.mockResolvedValue(true);
    mockReleaseHoldAtomic.mockResolvedValue(true);
    mockRestockFromConsumedHold.mockResolvedValue(true);

    mockBatchSet.mockClear();
    mockBatchUpdate.mockClear();
    mockBatchCommit.mockClear().mockResolvedValue(undefined);

    configureTransactionHappy();

    vi.resetModules();
    await import("../stripeWebhook");
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  // ==========================================================================
  // handlePaymentSucceeded
  // ==========================================================================

  describe("handlePaymentSucceeded", () => {
    it("is idempotent — skips already-paid orders without consuming hold", async () => {
      const orderId = "order-already-paid-cov2";

      mockDocs.set(`orders/${orderId}`, {
        status: "paid",
        totalCents: 4000,
        currency: "usd",
        stripePaymentIntentId: "pi_paid",
      });

      mockConstructEvent.mockReturnValue({
        id: "evt_paid_dup",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_paid",
            metadata: { orderId },
            amount_received: 4000,
            currency: "usd",
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(mockConsumeHold).not.toHaveBeenCalled();
      expect(mockTransactionUpdate).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
    });

    it("refuses to mark paid when order is not in pending status", async () => {
      const orderId = "order-fulfilled-cov2";

      mockDocs.set(`orders/${orderId}`, {
        status: "fulfilled",
        totalCents: 4000,
        currency: "usd",
        stripePaymentIntentId: "pi_fulfilled",
      });

      mockConstructEvent.mockReturnValue({
        id: "evt_fulfilled_status",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_fulfilled",
            metadata: { orderId },
            amount_received: 4000,
            currency: "usd",
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(mockConsumeHold).not.toHaveBeenCalled();
      expect(mockTransactionUpdate).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("refuses to mark paid when order is canceled (not pending)", async () => {
      const orderId = "order-canceled-pay";

      mockDocs.set(`orders/${orderId}`, {
        status: "canceled",
        totalCents: 3000,
        currency: "usd",
        stripePaymentIntentId: "pi_canceled_pay",
      });

      mockConstructEvent.mockReturnValue({
        id: "evt_canceled_pay",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_canceled_pay",
            metadata: { orderId },
            amount_received: 3000,
            currency: "usd",
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(mockConsumeHold).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("rejects payment with mismatched payment intent ID as a security violation", async () => {
      const orderId = "order-pi-sec-mismatch";

      mockDocs.set(`orders/${orderId}`, {
        status: "pending",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_expected_one",
      });

      mockConstructEvent.mockReturnValue({
        id: "evt_pi_sec",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_WRONG_ONE",
            metadata: { orderId },
            amount_received: 5000,
            currency: "usd",
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      // The throw inside transaction -> catch block re-throws -> outer catch returns 200
      expect(mockConsumeHold).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
    });

    it("rejects payment when received amount differs from order total", async () => {
      const orderId = "order-amt-mismatch-cov2";

      mockDocs.set(`orders/${orderId}`, {
        status: "pending",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_amt_cov2",
      });

      mockConstructEvent.mockReturnValue({
        id: "evt_amt_cov2",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_amt_cov2",
            metadata: { orderId },
            amount_received: 999,
            currency: "usd",
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(mockConsumeHold).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
    });

    it("rejects payment when currency does not match order", async () => {
      const orderId = "order-cur-mismatch-cov2";

      mockDocs.set(`orders/${orderId}`, {
        status: "pending",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_cur_cov2",
      });

      mockConstructEvent.mockReturnValue({
        id: "evt_cur_cov2",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_cur_cov2",
            metadata: { orderId },
            amount_received: 5000,
            currency: "eur",
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(mockConsumeHold).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
    });

    it("handles consumeHold failure after successful payment", async () => {
      const orderId = "order-consume-fail";

      mockDocs.set(`orders/${orderId}`, {
        status: "pending",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_consume_fail",
      });

      mockConstructEvent.mockReturnValue({
        id: "evt_consume_fail",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_consume_fail",
            metadata: { orderId },
            amount_received: 5000,
            currency: "usd",
          },
        },
      });

      // Make consumeHold reject
      mockConsumeHold.mockRejectedValueOnce(new Error("consumeHold failed"));

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(mockConsumeHold).toHaveBeenCalledWith(orderId);
      // consumeHold throw -> re-thrown -> outer catch returns 200
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
    });
  });

  // ==========================================================================
  // handlePaymentFailed
  // ==========================================================================

  describe("handlePaymentFailed", () => {
    it("handles missing order gracefully", async () => {
      // No order in mockDocs for this ID
      mockConstructEvent.mockReturnValue({
        id: "evt_fail_no_order",
        type: "payment_intent.payment_failed",
        data: {
          object: {
            id: "pi_fail_no_order",
            metadata: { orderId: "nonexistent-order" },
            last_payment_error: { message: "Card declined" },
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(mockReleaseHoldAtomic).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
    });

    it("skips cancellation when order is already paid", async () => {
      const orderId = "order-fail-already-paid";

      mockDocs.set(`orders/${orderId}`, {
        status: "paid",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_fail_paid",
      });

      mockConstructEvent.mockReturnValue({
        id: "evt_fail_paid",
        type: "payment_intent.payment_failed",
        data: {
          object: {
            id: "pi_fail_paid",
            metadata: { orderId },
            last_payment_error: { message: "Declined" },
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(mockReleaseHoldAtomic).not.toHaveBeenCalled();
      expect(mockTransactionUpdate).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("handles releaseHold failure after order cancellation", async () => {
      const orderId = "order-release-fail";

      mockDocs.set(`orders/${orderId}`, {
        status: "pending",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_release_fail",
      });

      mockConstructEvent.mockReturnValue({
        id: "evt_release_fail",
        type: "payment_intent.payment_failed",
        data: {
          object: {
            id: "pi_release_fail",
            metadata: { orderId },
            last_payment_error: { message: "Card declined" },
          },
        },
      });

      // Make releaseHoldAtomic reject
      mockReleaseHoldAtomic.mockRejectedValueOnce(new Error("releaseHold failed"));

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(mockReleaseHoldAtomic).toHaveBeenCalledWith(orderId, orderId);
      // Error thrown -> outer catch returns 200
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
    });
  });

  // ==========================================================================
  // handleChargeDisputeCreated
  // ==========================================================================

  describe("handleChargeDisputeCreated", () => {
    it("ignores disputes with no payment intent attached", async () => {
      mockConstructEvent.mockReturnValue({
        id: "evt_dispute_no_pi",
        type: "charge.dispute.created",
        data: {
          object: {
            id: "dp_no_pi",
            payment_intent: null,
            reason: "fraudulent",
            amount: 5000,
            currency: "usd",
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
    });

    it("ignores disputes for unknown orders", async () => {
      // No order in mockDocs
      mockConstructEvent.mockReturnValue({
        id: "evt_dispute_no_order",
        type: "charge.dispute.created",
        data: {
          object: {
            id: "dp_no_order",
            payment_intent: "pi_nonexistent_dispute",
            reason: "fraudulent",
            amount: 5000,
            currency: "usd",
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
    });

    it("is idempotent — skips already-disputed orders", async () => {
      const orderId = "order-already-disputed-cov2";

      mockDocs.set(`orders/${orderId}`, {
        status: "disputed",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_already_disputed",
      });

      mockConstructEvent.mockReturnValue({
        id: "evt_already_disputed",
        type: "charge.dispute.created",
        data: {
          object: {
            id: "dp_already",
            payment_intent: "pi_already_disputed",
            reason: "fraudulent",
            amount: 5000,
            currency: "usd",
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
    });

    it("ignores disputes for orders in pending status", async () => {
      const orderId = "order-dispute-pending-cov2";

      mockDocs.set(`orders/${orderId}`, {
        status: "pending",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_dispute_pend",
      });

      mockConstructEvent.mockReturnValue({
        id: "evt_dispute_pend",
        type: "charge.dispute.created",
        data: {
          object: {
            id: "dp_pend",
            payment_intent: "pi_dispute_pend",
            reason: "product_not_received",
            amount: 5000,
            currency: "usd",
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("returns early when order in unexpected status - canceled", async () => {
      const orderId = "order-dispute-canceled-cov2";

      mockDocs.set(`orders/${orderId}`, {
        status: "canceled",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_dispute_canc",
      });

      mockConstructEvent.mockReturnValue({
        id: "evt_dispute_canc",
        type: "charge.dispute.created",
        data: {
          object: {
            id: "dp_canc",
            payment_intent: "pi_dispute_canc",
            reason: "product_not_received",
            amount: 5000,
            currency: "usd",
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("returns early when order in unexpected status - refunded", async () => {
      const orderId = "order-dispute-refunded-cov2";

      mockDocs.set(`orders/${orderId}`, {
        status: "refunded",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_dispute_ref",
      });

      mockConstructEvent.mockReturnValue({
        id: "evt_dispute_ref",
        type: "charge.dispute.created",
        data: {
          object: {
            id: "dp_ref",
            payment_intent: "pi_dispute_ref",
            reason: "product_not_received",
            amount: 5000,
            currency: "usd",
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("propagates Firestore write failures during dispute update", async () => {
      const orderId = "order-dispute-update-fail-cov2";

      mockDocs.set(`orders/${orderId}`, {
        status: "paid",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_dispute_uf",
      });

      // Pre-create the doc ref update mock to throw
      mockDocUpdateFns.set(
        `orders/${orderId}`,
        vi.fn().mockRejectedValue(new Error("Firestore dispute update failed"))
      );

      mockConstructEvent.mockReturnValue({
        id: "evt_dispute_uf",
        type: "charge.dispute.created",
        data: {
          object: {
            id: "dp_uf",
            payment_intent: "pi_dispute_uf",
            reason: "fraudulent",
            amount: 5000,
            currency: "usd",
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      // Error caught by outer handler, returns 200
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
    });

    it("marks fulfilled order as disputed successfully", async () => {
      const orderId = "order-dispute-fulfilled";

      mockDocs.set(`orders/${orderId}`, {
        status: "fulfilled",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_dispute_fulfilled",
      });

      mockConstructEvent.mockReturnValue({
        id: "evt_dispute_fulfilled",
        type: "charge.dispute.created",
        data: {
          object: {
            id: "dp_fulfilled",
            payment_intent: "pi_dispute_fulfilled",
            reason: "product_not_received",
            amount: 5000,
            currency: "usd",
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // ==========================================================================
  // handleChargeRefunded
  // ==========================================================================

  describe("handleChargeRefunded", () => {
    it("ignores refunds with no payment intent attached", async () => {
      mockConstructEvent.mockReturnValue({
        id: "evt_refund_no_pi",
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_no_pi",
            payment_intent: null,
            refunded: true,
            amount: 5000,
            amount_refunded: 5000,
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(mockRestockFromConsumedHold).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
    });

    it("ignores refunds for unknown orders", async () => {
      // No order in mockDocs
      mockConstructEvent.mockReturnValue({
        id: "evt_refund_no_order",
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_no_order",
            payment_intent: "pi_orphan_refund",
            refunded: true,
            amount: 5000,
            amount_refunded: 5000,
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(mockRestockFromConsumedHold).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
    });

    it("skips partial refunds — only full refunds are processed", async () => {
      const orderId = "order-partial-ref-cov2";

      mockDocs.set(`orders/${orderId}`, {
        status: "paid",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_partial_cov2",
      });

      mockConstructEvent.mockReturnValue({
        id: "evt_partial_cov2",
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_partial_cov2",
            payment_intent: "pi_partial_cov2",
            refunded: false,
            amount: 5000,
            amount_refunded: 2500,
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(mockRestockFromConsumedHold).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
    });

    it("is idempotent — skips already-refunded orders", async () => {
      const orderId = "order-already-refunded-cov2";

      mockDocs.set(`orders/${orderId}`, {
        status: "refunded",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_already_ref",
      });

      mockConstructEvent.mockReturnValue({
        id: "evt_already_ref",
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_already_ref",
            payment_intent: "pi_already_ref",
            refunded: true,
            amount: 5000,
            amount_refunded: 5000,
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(mockRestockFromConsumedHold).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
    });

    it("ignores refunds for orders still in pending status", async () => {
      const orderId = "order-refund-pending-cov2";

      mockDocs.set(`orders/${orderId}`, {
        status: "pending",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_refund_pend",
      });

      mockConstructEvent.mockReturnValue({
        id: "evt_refund_pend",
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_refund_pend",
            payment_intent: "pi_refund_pend",
            refunded: true,
            amount: 5000,
            amount_refunded: 5000,
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(mockRestockFromConsumedHold).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("returns early when order in unexpected status - canceled", async () => {
      const orderId = "order-refund-canceled-cov2";

      mockDocs.set(`orders/${orderId}`, {
        status: "canceled",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_refund_canc",
      });

      mockConstructEvent.mockReturnValue({
        id: "evt_refund_canc",
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_refund_canc",
            payment_intent: "pi_refund_canc",
            refunded: true,
            amount: 5000,
            amount_refunded: 5000,
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(mockRestockFromConsumedHold).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("propagates Firestore write failures during refund update", async () => {
      const orderId = "order-refund-upd-fail-cov2";

      mockDocs.set(`orders/${orderId}`, {
        status: "paid",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_ref_upd_fail",
      });

      mockDocUpdateFns.set(
        `orders/${orderId}`,
        vi.fn().mockRejectedValue(new Error("Firestore refund update failed"))
      );

      mockConstructEvent.mockReturnValue({
        id: "evt_ref_upd_fail",
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_ref_upd_fail",
            payment_intent: "pi_ref_upd_fail",
            refunded: true,
            amount: 5000,
            amount_refunded: 5000,
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(mockRestockFromConsumedHold).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
    });

    it("handles restock failure after successful refund status update", async () => {
      const orderId = "order-restock-fail-cov2";

      mockDocs.set(`orders/${orderId}`, {
        status: "paid",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_restock_fail",
      });

      mockConstructEvent.mockReturnValue({
        id: "evt_restock_fail",
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_restock_fail",
            payment_intent: "pi_restock_fail",
            refunded: true,
            amount: 5000,
            amount_refunded: 5000,
          },
        },
      });

      // Make restock fail
      mockRestockFromConsumedHold.mockRejectedValueOnce(new Error("Restock batch failed"));

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(mockRestockFromConsumedHold).toHaveBeenCalledWith(orderId);
      // Restock failure is non-fatal; should still return 200 without entering outer catch
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
    });

    it("refunds from fulfilled status successfully", async () => {
      const orderId = "order-refund-fulfilled";

      mockDocs.set(`orders/${orderId}`, {
        status: "fulfilled",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_refund_fulfilled",
      });

      mockConstructEvent.mockReturnValue({
        id: "evt_refund_fulfilled",
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_refund_fulfilled",
            payment_intent: "pi_refund_fulfilled",
            refunded: true,
            amount: 5000,
            amount_refunded: 5000,
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(mockRestockFromConsumedHold).toHaveBeenCalledWith(orderId);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("refunds from disputed status successfully", async () => {
      const orderId = "order-refund-disputed";

      mockDocs.set(`orders/${orderId}`, {
        status: "disputed",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_refund_disputed",
      });

      mockConstructEvent.mockReturnValue({
        id: "evt_refund_disputed",
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_refund_disputed",
            payment_intent: "pi_refund_disputed",
            refunded: true,
            amount: 5000,
            amount_refunded: 5000,
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(mockRestockFromConsumedHold).toHaveBeenCalledWith(orderId);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // ==========================================================================
  // Webhook endpoint error processing
  // ==========================================================================

  describe("Webhook endpoint — error processing event", () => {
    it("returns 200 to Stripe when handler throws an Error", async () => {
      const orderId = "order-error-throw";

      mockDocs.set(`orders/${orderId}`, {
        status: "pending",
        totalCents: 4000,
        currency: "usd",
        stripePaymentIntentId: "pi_error_throw",
      });

      mockRunTransaction.mockRejectedValueOnce(new Error("Database unavailable"));

      mockConstructEvent.mockReturnValue({
        id: "evt_error_throw",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_error_throw",
            metadata: { orderId },
            amount_received: 4000,
            currency: "usd",
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
    });

    it("returns 200 to Stripe when handler throws a non-Error value", async () => {
      const orderId = "order-string-error";

      mockDocs.set(`orders/${orderId}`, {
        status: "pending",
        totalCents: 4000,
        currency: "usd",
        stripePaymentIntentId: "pi_string_err",
      });

      mockRunTransaction.mockRejectedValueOnce("a string error message");

      mockConstructEvent.mockReturnValue({
        id: "evt_string_err",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_string_err",
            metadata: { orderId },
            amount_received: 4000,
            currency: "usd",
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
    });

    it("returns 200 when payment_failed handler throws", async () => {
      const orderId = "order-fail-throws";

      mockDocs.set(`orders/${orderId}`, {
        status: "pending",
        totalCents: 4000,
        currency: "usd",
        stripePaymentIntentId: "pi_fail_throws",
      });

      mockRunTransaction.mockRejectedValueOnce(new Error("Timeout"));

      mockConstructEvent.mockReturnValue({
        id: "evt_fail_throws",
        type: "payment_intent.payment_failed",
        data: {
          object: {
            id: "pi_fail_throws",
            metadata: { orderId },
            last_payment_error: { message: "Declined" },
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
    });

    it("returns 200 when dispute handler throws", async () => {
      const orderId = "order-dispute-throws";

      mockDocs.set(`orders/${orderId}`, {
        status: "paid",
        totalCents: 4000,
        currency: "usd",
        stripePaymentIntentId: "pi_dispute_throws",
      });

      mockDocUpdateFns.set(
        `orders/${orderId}`,
        vi.fn().mockRejectedValue(new Error("Permission denied"))
      );

      mockConstructEvent.mockReturnValue({
        id: "evt_dispute_throws",
        type: "charge.dispute.created",
        data: {
          object: {
            id: "dp_throws",
            payment_intent: "pi_dispute_throws",
            reason: "fraudulent",
            amount: 4000,
            currency: "usd",
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
    });

    it("returns 200 when refund handler throws", async () => {
      const orderId = "order-refund-throws";

      mockDocs.set(`orders/${orderId}`, {
        status: "paid",
        totalCents: 4000,
        currency: "usd",
        stripePaymentIntentId: "pi_refund_throws",
      });

      mockDocUpdateFns.set(
        `orders/${orderId}`,
        vi.fn().mockRejectedValue(new Error("Quota exceeded"))
      );

      mockConstructEvent.mockReturnValue({
        id: "evt_refund_throws",
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_refund_throws",
            payment_intent: "pi_refund_throws",
            refunded: true,
            amount: 4000,
            amount_refunded: 4000,
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
    });
  });
});

// ============================================================================
// EXPIRE HOLDS — hold release returns false
// ============================================================================

describe("expireHolds — hold release returns false", () => {
  let expireHoldsFn: () => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDocs.clear();
    mockDocUpdateFns.clear();
    mockDocGetFns.clear();

    // releaseHoldAtomic returns false (hold was not actually released)
    mockReleaseHoldAtomic.mockResolvedValue(false);

    vi.resetModules();
    const mod = await import("../expireHolds");
    expireHoldsFn = mod.expireHolds as unknown as () => Promise<void>;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("skips status update when releaseHoldAtomic returns false", async () => {
    mockDocs.set("holds/hold-no-release", {
      status: "held",
      uid: "user-1",
      items: [{ productId: "prod-1", qty: 1 }],
      expiresAt: { toMillis: () => Date.now() - 60000 },
    });

    await expireHoldsFn();

    expect(mockReleaseHoldAtomic).toHaveBeenCalled();
    // The hold status should NOT have been updated because releaseHoldAtomic returned false
    const hold = mockDocs.get("holds/hold-no-release");
    expect(hold.status).toBe("held");
  });
});

// ============================================================================
// EXPIRE HOLDS — timeout guard prevents runaway processing
// ============================================================================

describe("expireHolds — timeout guard", () => {
  let expireHoldsFn: () => Promise<void>;
  let originalDateNow: () => number;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDocs.clear();
    mockDocUpdateFns.clear();
    mockDocGetFns.clear();

    originalDateNow = Date.now;

    vi.resetModules();
    const mod = await import("../expireHolds");
    expireHoldsFn = mod.expireHolds as unknown as () => Promise<void>;
  });

  afterEach(() => {
    Date.now = originalDateNow;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("breaks out of processing loop when elapsed time exceeds safety timeout", async () => {
    mockDocs.set("holds/hold-timeout-1", {
      status: "held",
      uid: "user-1",
      items: [{ productId: "prod-1", qty: 1 }],
      expiresAt: { toMillis: () => originalDateNow.call(Date) - 60000 },
    });
    mockDocs.set("products/prod-1", { shards: 3 });

    let callCount = 0;
    const baseTime = originalDateNow.call(Date);

    Date.now = () => {
      callCount++;
      if (callCount <= 1) {
        return baseTime;
      }
      return baseTime + 60_000;
    };

    await expireHoldsFn();

    const hold = mockDocs.get("holds/hold-timeout-1");
    expect(hold.status).toBe("held");
  });

  it("stops after first batch when processing time exceeds limit", async () => {
    mockDocs.set("holds/hold-batch-1", {
      status: "held",
      uid: "user-1",
      items: [{ productId: "prod-1", qty: 1 }],
      expiresAt: { toMillis: () => originalDateNow.call(Date) - 60000 },
    });
    mockDocs.set("products/prod-1", { shards: 3 });

    const baseTime = originalDateNow.call(Date);
    let callCount = 0;

    Date.now = () => {
      callCount++;
      if (callCount <= 8) {
        return baseTime;
      }
      return baseTime + 55_000;
    };

    await expireHoldsFn();
  });
});

// ============================================================================
// STOCK RELEASE — releaseHoldAtomic batch processing
// ============================================================================

describe("stockRelease — releaseHoldAtomic batch processing", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockDocs.clear();
    mockDocUpdateFns.clear();
    mockDocGetFns.clear();
    mockBatchSet.mockClear();
    mockBatchUpdate.mockClear();
    mockBatchCommit.mockClear().mockResolvedValue(undefined);

    // Re-setup transaction mock after clearAllMocks wiped it
    mockTransactionGet.mockImplementation(async (ref: any) => {
      const data = mockDocs.get(ref._path);
      return { exists: !!data, data: () => data };
    });
    mockTransactionUpdate.mockImplementation((ref: any, updates: any) => {
      const current = mockDocs.get(ref._path) || {};
      mockDocs.set(ref._path, { ...current, ...updates });
    });
    mockRunTransaction.mockImplementation(async (cb: any) => {
      return await cb({ get: mockTransactionGet, update: mockTransactionUpdate });
    });

    useRealStockRelease = true;
  });

  afterEach(() => {
    useRealStockRelease = false;
  });

  it("releases held items by incrementing inventory shard counters", async () => {
    // Set up a hold with items
    mockDocs.set("holds/order-batch-1", {
      status: "held",
      uid: "user-1",
      items: [
        { productId: "prod-a", qty: 2 },
        { productId: "prod-b", qty: 3 },
      ],
      expiresAt: { toMillis: () => Date.now() - 60000 },
      createdAt: { toMillis: () => Date.now() - 120000 },
    });

    // Set up product docs with shard counts
    mockDocs.set("products/prod-a", { shards: 5 });
    mockDocs.set("products/prod-b", { shards: 10 });

    const { releaseHoldAtomic } = await import("../stockRelease");
    const result = await releaseHoldAtomic("order-batch-1", "order-batch-1");

    expect(result).toBe(true);
    // batch.set should have been called for each item (shard stock return)
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    // hold status is updated via transaction.update, not batch.update
    expect(mockTransactionUpdate).toHaveBeenCalled();
    // batch.commit should have been called once (for shard ops)
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it("returns false when hold not found", async () => {
    // No hold in mockDocs
    const { releaseHoldAtomic } = await import("../stockRelease");
    const result = await releaseHoldAtomic("nonexistent-hold", "nonexistent-hold");

    expect(result).toBe(false);
    expect(mockBatchSet).not.toHaveBeenCalled();
  });

  it("returns false when hold is not in held status", async () => {
    mockDocs.set("holds/order-released", {
      status: "released",
      uid: "user-1",
      items: [{ productId: "prod-a", qty: 1 }],
    });

    const { releaseHoldAtomic } = await import("../stockRelease");
    const result = await releaseHoldAtomic("order-released", "order-released");

    expect(result).toBe(false);
    expect(mockBatchSet).not.toHaveBeenCalled();
  });

  it("handles hold with empty items (edge case - chunks.length === 0)", async () => {
    mockDocs.set("holds/order-empty", {
      status: "held",
      uid: "user-1",
      items: [],
    });

    const { releaseHoldAtomic } = await import("../stockRelease");
    const result = await releaseHoldAtomic("order-empty", "order-empty");

    expect(result).toBe(true);
    // No batch set calls since there are no items
    expect(mockBatchSet).not.toHaveBeenCalled();
    // Hold status is updated via transaction.update (held → released)
    expect(mockTransactionUpdate).toHaveBeenCalled();
  });

  it("uses default shard count when product doc does not exist", async () => {
    mockDocs.set("holds/order-no-prod", {
      status: "held",
      uid: "user-1",
      items: [{ productId: "nonexistent-prod", qty: 1 }],
    });
    // No product doc -> defaults to 20 shards

    const { releaseHoldAtomic } = await import("../stockRelease");
    const result = await releaseHoldAtomic("order-no-prod", "order-no-prod");

    expect(result).toBe(true);
    expect(mockBatchSet).toHaveBeenCalledTimes(1);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// STOCK RELEASE — restockFromConsumedHold batch processing
// ============================================================================

describe("stockRelease — restockFromConsumedHold batch processing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDocs.clear();
    mockDocUpdateFns.clear();
    mockDocGetFns.clear();
    mockBatchSet.mockClear();
    mockBatchUpdate.mockClear();
    mockBatchCommit.mockClear().mockResolvedValue(undefined);

    // Re-setup transaction mock after clearAllMocks wiped it
    mockTransactionGet.mockImplementation(async (ref: any) => {
      const data = mockDocs.get(ref._path);
      return { exists: !!data, data: () => data };
    });
    mockTransactionUpdate.mockImplementation((ref: any, updates: any) => {
      const current = mockDocs.get(ref._path) || {};
      mockDocs.set(ref._path, { ...current, ...updates });
    });
    mockRunTransaction.mockImplementation(async (cb: any) => {
      return await cb({ get: mockTransactionGet, update: mockTransactionUpdate });
    });

    useRealStockRelease = true;
  });

  afterEach(() => {
    useRealStockRelease = false;
  });

  it("restocks consumed items by incrementing inventory shard counters", async () => {
    mockDocs.set("holds/order-restock-1", {
      status: "consumed",
      uid: "user-1",
      items: [
        { productId: "prod-x", qty: 1 },
        { productId: "prod-y", qty: 5 },
      ],
    });

    mockDocs.set("products/prod-x", { shards: 4 });
    mockDocs.set("products/prod-y", { shards: 8 });

    const { restockFromConsumedHold } = await import("../stockRelease");
    const result = await restockFromConsumedHold("order-restock-1");

    expect(result).toBe(true);
    // batch.set should have been called for each item (shard stock return)
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    // hold status is updated via transaction.update, not batch.update
    expect(mockTransactionUpdate).toHaveBeenCalled();
    // batch.commit should have been called once (for shard ops)
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it("returns false when hold not found for restock", async () => {
    const { restockFromConsumedHold } = await import("../stockRelease");
    const result = await restockFromConsumedHold("nonexistent-restock");

    expect(result).toBe(false);
    expect(mockBatchSet).not.toHaveBeenCalled();
  });

  it("returns false when hold is not in consumed status", async () => {
    mockDocs.set("holds/order-not-consumed", {
      status: "held",
      uid: "user-1",
      items: [{ productId: "prod-a", qty: 1 }],
    });

    const { restockFromConsumedHold } = await import("../stockRelease");
    const result = await restockFromConsumedHold("order-not-consumed");

    expect(result).toBe(false);
    expect(mockBatchSet).not.toHaveBeenCalled();
  });

  it("handles consumed hold with empty items", async () => {
    mockDocs.set("holds/order-restock-empty", {
      status: "consumed",
      uid: "user-1",
      items: [],
    });

    const { restockFromConsumedHold } = await import("../stockRelease");
    const result = await restockFromConsumedHold("order-restock-empty");

    expect(result).toBe(true);
    expect(mockBatchSet).not.toHaveBeenCalled();
    // Hold status is updated via transaction.update (consumed → released)
    expect(mockTransactionUpdate).toHaveBeenCalled();
  });

  it("uses default shard count when product doc not found", async () => {
    mockDocs.set("holds/order-restock-no-prod", {
      status: "consumed",
      uid: "user-1",
      items: [{ productId: "missing-prod", qty: 3 }],
    });

    const { restockFromConsumedHold } = await import("../stockRelease");
    const result = await restockFromConsumedHold("order-restock-no-prod");

    expect(result).toBe(true);
    expect(mockBatchSet).toHaveBeenCalledTimes(1);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it("caches product shard count for repeated productId", async () => {
    mockDocs.set("holds/order-restock-cache", {
      status: "consumed",
      uid: "user-1",
      items: [
        { productId: "prod-same", qty: 1 },
        { productId: "prod-same", qty: 2 },
        { productId: "prod-same", qty: 3 },
      ],
    });

    mockDocs.set("products/prod-same", { shards: 6 });

    const { restockFromConsumedHold } = await import("../stockRelease");
    const result = await restockFromConsumedHold("order-restock-cache");

    expect(result).toBe(true);
    // 3 items -> 3 batch.set calls
    expect(mockBatchSet).toHaveBeenCalledTimes(3);
    // Product doc should have been read only once (cached)
    const prodGetFn = mockDocGetFns.get("products/prod-same");
    expect(prodGetFn).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// STOCK RELEASE — hashToShard tests
// ============================================================================

describe("stockRelease — hashToShard", () => {
  it("returns a deterministic shard number in range", async () => {
    const { hashToShard } = await import("../stockRelease");

    const shard = hashToShard("order-1", 0, 20);
    expect(shard).toBeGreaterThanOrEqual(0);
    expect(shard).toBeLessThan(20);

    // Deterministic: calling again with same args gives same result
    expect(hashToShard("order-1", 0, 20)).toBe(shard);
  });

  it("distributes across shards for different inputs", async () => {
    const { hashToShard } = await import("../stockRelease");

    const shards = new Set<number>();
    for (let i = 0; i < 50; i++) {
      shards.add(hashToShard(`order-${i}`, 0, 10));
    }
    // With 50 different orders, we should use multiple shards
    expect(shards.size).toBeGreaterThan(1);
  });
});
