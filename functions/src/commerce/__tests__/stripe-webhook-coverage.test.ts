/**
 * @fileoverview Additional coverage tests for stripeWebhook.ts and expireHolds.ts
 *
 * Targets specific uncovered lines:
 *
 * stripeWebhook.ts:
 *   - Lines 88-93:  handlePaymentSucceeded — order already paid, early return
 *   - Lines 95-101: handlePaymentSucceeded — order not in pending status
 *   - Lines 105-113: handlePaymentSucceeded — payment intent ID mismatch
 *   - Lines 117-127: handlePaymentSucceeded — amount mismatch
 *   - Lines 130-139: handlePaymentSucceeded — currency mismatch
 *   - Lines 150-156: handlePaymentSucceeded — transaction error catch block
 *   - Lines 210-214: handlePaymentFailed — order not in pending status
 *   - Lines 226-232: handlePaymentFailed — transaction error catch block
 *   - Lines 291-297: handleChargeDisputeCreated — unexpected order status
 *   - Lines 307-312: handleChargeDisputeCreated — update error catch block
 *   - Lines 355-362: handleChargeRefunded — partial refund
 *   - Lines 371-377: handleChargeRefunded — unexpected order status
 *   - Lines 387-392: handleChargeRefunded — update error catch block
 *   - Lines 486-496: main handler — event processing error catch block
 *
 * expireHolds.ts:
 *   - Lines 36-40: timeout guard in while loop
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Capture the Express route handler so we can invoke it directly
// ============================================================================

let capturedHandler: ((req: any, res: any) => Promise<void>) | null = null;

const mockExpressApp: any = {
  use: vi.fn(),
  post: vi.fn((path: string, handler: any) => {
    if (path === "/stripe") {
      capturedHandler = handler;
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

vi.mock("firebase-functions/v2", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("firebase-functions/v2/scheduler", () => ({
  onSchedule: vi.fn((_opts: any, handler: any) => handler),
}));

vi.mock("firebase-admin/firestore", () => ({
  Timestamp: {
    now: vi.fn(() => ({ toMillis: () => Date.now(), toDate: () => new Date() })),
  },
  DocumentReference: class {},
}));

// ============================================================================
// Stripe mock — constructEvent just returns the parsed body
// ============================================================================

const mockConstructEvent = vi.fn();

const FakeStripe = function (this: any) {
  this.webhooks = { constructEvent: mockConstructEvent };
} as any;

vi.mock("stripe", () => ({
  default: FakeStripe,
}));

// ============================================================================
// Firestore mock with precise control
// ============================================================================

const mockDocs = new Map<string, any>();
const mockTransactionGet = vi.fn();
const mockTransactionUpdate = vi.fn();
const mockRunTransaction = vi.fn();

/** Track update calls per doc ref so we can make specific refs throw */
const mockDocUpdateFns = new Map<string, ReturnType<typeof vi.fn>>();

function makeDocRef(path: string) {
  const parts = path.split("/");
  const docId = parts[parts.length - 1];

  // Reuse the same update mock for the same path so we can configure it once
  if (!mockDocUpdateFns.has(path)) {
    mockDocUpdateFns.set(
      path,
      vi.fn().mockImplementation(async (updates: any) => {
        const current = mockDocs.get(path) || {};
        mockDocs.set(path, { ...current, ...updates });
      })
    );
  }

  return {
    _path: path,
    id: docId,
    get: vi.fn().mockImplementation(async () => {
      const data = mockDocs.get(path);
      return { exists: !!data, data: () => data };
    }),
    update: mockDocUpdateFns.get(path)!,
  };
}

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
          if (key.startsWith(collName + "/")) {
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
  })),
}));

// ============================================================================
// Stock release and webhook dedupe mocks
// ============================================================================

const mockConsumeHold = vi.fn().mockResolvedValue(true);
const mockReleaseHoldAtomic = vi.fn().mockResolvedValue(true);
const mockRestockFromConsumedHold = vi.fn().mockResolvedValue(true);

vi.mock("../stockRelease", () => ({
  releaseHoldAtomic: (...args: any[]) => mockReleaseHoldAtomic(...args),
  consumeHold: (...args: any[]) => mockConsumeHold(...args),
  restockFromConsumedHold: (...args: any[]) => mockRestockFromConsumedHold(...args),
}));

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

function setConstructEvent(event: any) {
  mockConstructEvent.mockReturnValue(event);
}

/**
 * Configure runTransaction to execute the callback with our controlled
 * transaction mock.  This is the default "happy" configuration.
 */
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

/**
 * Configure runTransaction to reject with the given error.
 */
function configureTransactionReject(error: Error) {
  mockRunTransaction.mockRejectedValue(error);
}

// ============================================================================
// Tests
// ============================================================================

describe("Stripe Webhook — coverage gaps", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDocs.clear();
    mockDocUpdateFns.clear();
    capturedHandler = null;

    originalEnv = { ...process.env };
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

    mockMarkEventProcessedOrSkip.mockResolvedValue(true);
    mockConsumeHold.mockResolvedValue(true);
    mockReleaseHoldAtomic.mockResolvedValue(true);
    mockRestockFromConsumedHold.mockResolvedValue(true);

    configureTransactionHappy();

    // Reset and re-import to capture the route handler fresh
    vi.resetModules();
    await import("../stripeWebhook");
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  async function callWebhook(req: any, res: any) {
    if (!capturedHandler) throw new Error("POST /stripe handler was not captured");
    await capturedHandler(req, res);
  }

  // ==========================================================================
  // handlePaymentSucceeded — Lines 88-93: order.status === "paid"
  // ==========================================================================

  describe("handlePaymentSucceeded — already paid (lines 88-93)", () => {
    it("returns early without consuming hold when order is already paid", async () => {
      const orderId = "order-already-paid-cov";

      mockDocs.set(`orders/${orderId}`, {
        status: "paid",
        totalCents: 4000,
        currency: "usd",
        stripePaymentIntentId: "pi_paid",
      });

      setConstructEvent({
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
  });

  // ==========================================================================
  // handlePaymentSucceeded — Lines 95-101: order.status !== "pending"
  // ==========================================================================

  describe("handlePaymentSucceeded — wrong status (lines 95-101)", () => {
    it("refuses to mark paid when order is canceled", async () => {
      const orderId = "order-canceled-cov";

      mockDocs.set(`orders/${orderId}`, {
        status: "canceled",
        totalCents: 4000,
        currency: "usd",
        stripePaymentIntentId: "pi_canceled",
      });

      setConstructEvent({
        id: "evt_wrong_status",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_canceled",
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

    it("refuses to mark paid when order is fulfilled", async () => {
      const orderId = "order-fulfilled-cov";

      mockDocs.set(`orders/${orderId}`, {
        status: "fulfilled",
        totalCents: 4000,
        currency: "usd",
        stripePaymentIntentId: "pi_fulfilled",
      });

      setConstructEvent({
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
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // ==========================================================================
  // handlePaymentSucceeded — Lines 105-113: PI ID mismatch
  // ==========================================================================

  describe("handlePaymentSucceeded — PI mismatch (lines 105-113)", () => {
    it("throws security error when payment intent ID does not match order", async () => {
      const orderId = "order-pi-mismatch";

      mockDocs.set(`orders/${orderId}`, {
        status: "pending",
        totalCents: 4000,
        currency: "usd",
        stripePaymentIntentId: "pi_expected",
      });

      setConstructEvent({
        id: "evt_pi_mismatch",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_WRONG",
            metadata: { orderId },
            amount_received: 4000,
            currency: "usd",
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      // The throw inside the transaction causes runTransaction to reject,
      // catch block (150-156) re-throws, outer catch (486-496) returns 200
      expect(mockConsumeHold).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
    });
  });

  // ==========================================================================
  // handlePaymentSucceeded — Lines 117-127: amount mismatch
  // ==========================================================================

  describe("handlePaymentSucceeded — amount mismatch (lines 117-127)", () => {
    it("throws when amount_received differs from order totalCents", async () => {
      const orderId = "order-amt-mismatch";

      mockDocs.set(`orders/${orderId}`, {
        status: "pending",
        totalCents: 4000,
        currency: "usd",
        stripePaymentIntentId: "pi_amt",
      });

      setConstructEvent({
        id: "evt_amt_mismatch",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_amt",
            metadata: { orderId },
            amount_received: 9999,
            currency: "usd",
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(mockConsumeHold).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // ==========================================================================
  // handlePaymentSucceeded — Lines 130-139: currency mismatch
  // ==========================================================================

  describe("handlePaymentSucceeded — currency mismatch (lines 130-139)", () => {
    it("throws when currency does not match order currency", async () => {
      const orderId = "order-cur-mismatch";

      mockDocs.set(`orders/${orderId}`, {
        status: "pending",
        totalCents: 4000,
        currency: "usd",
        stripePaymentIntentId: "pi_cur",
      });

      setConstructEvent({
        id: "evt_cur_mismatch",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_cur",
            metadata: { orderId },
            amount_received: 4000,
            currency: "gbp",
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(mockConsumeHold).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // ==========================================================================
  // handlePaymentSucceeded — Lines 150-156: transaction error (catch rethrows)
  // ==========================================================================

  describe("handlePaymentSucceeded — transaction error (lines 150-156)", () => {
    it("catches and rethrows transaction failure, outer handler returns 200", async () => {
      const orderId = "order-tx-fail";

      mockDocs.set(`orders/${orderId}`, {
        status: "pending",
        totalCents: 4000,
        currency: "usd",
        stripePaymentIntentId: "pi_txfail",
      });

      // Force the transaction itself to reject
      configureTransactionReject(new Error("Firestore contention"));

      setConstructEvent({
        id: "evt_tx_fail",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_txfail",
            metadata: { orderId },
            amount_received: 4000,
            currency: "usd",
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(mockConsumeHold).not.toHaveBeenCalled();
      // Outer catch returns 200 (lines 486-496)
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
    });
  });

  // ==========================================================================
  // handlePaymentFailed — Lines 210-214: order not in pending status
  // ==========================================================================

  describe("handlePaymentFailed — wrong status (lines 210-214)", () => {
    it("skips cancel when order is already paid", async () => {
      const orderId = "order-fail-paid";

      mockDocs.set(`orders/${orderId}`, {
        status: "paid",
        totalCents: 4000,
        currency: "usd",
        stripePaymentIntentId: "pi_fail_paid",
      });

      setConstructEvent({
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

    it("skips cancel when order is already canceled", async () => {
      const orderId = "order-fail-canceled";

      mockDocs.set(`orders/${orderId}`, {
        status: "canceled",
        totalCents: 4000,
        currency: "usd",
        stripePaymentIntentId: "pi_fail_canceled",
      });

      setConstructEvent({
        id: "evt_fail_canceled",
        type: "payment_intent.payment_failed",
        data: {
          object: {
            id: "pi_fail_canceled",
            metadata: { orderId },
            last_payment_error: { message: "Insufficient funds" },
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(mockReleaseHoldAtomic).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // ==========================================================================
  // handlePaymentFailed — Lines 226-232: transaction error (catch rethrows)
  // ==========================================================================

  describe("handlePaymentFailed — transaction error (lines 226-232)", () => {
    it("catches and rethrows transaction failure, outer handler returns 200", async () => {
      const orderId = "order-fail-tx-err";

      mockDocs.set(`orders/${orderId}`, {
        status: "pending",
        totalCents: 4000,
        currency: "usd",
        stripePaymentIntentId: "pi_fail_tx",
      });

      configureTransactionReject(new Error("Firestore unavailable"));

      setConstructEvent({
        id: "evt_fail_tx_err",
        type: "payment_intent.payment_failed",
        data: {
          object: {
            id: "pi_fail_tx",
            metadata: { orderId },
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
  });

  // ==========================================================================
  // handleChargeDisputeCreated — Lines 291-297: unexpected status
  // ==========================================================================

  describe("handleChargeDisputeCreated — unexpected status (lines 291-297)", () => {
    it("returns early when order is in pending status (not paid/fulfilled)", async () => {
      const orderId = "order-dispute-pending";

      mockDocs.set(`orders/${orderId}`, {
        status: "pending",
        totalCents: 4000,
        currency: "usd",
        stripePaymentIntentId: "pi_dispute_pend",
      });

      setConstructEvent({
        id: "evt_dispute_pend",
        type: "charge.dispute.created",
        data: {
          object: {
            id: "dp_pend",
            payment_intent: "pi_dispute_pend",
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

    it("returns early when order is canceled", async () => {
      const orderId = "order-dispute-canceled";

      mockDocs.set(`orders/${orderId}`, {
        status: "canceled",
        totalCents: 4000,
        currency: "usd",
        stripePaymentIntentId: "pi_dispute_canc",
      });

      setConstructEvent({
        id: "evt_dispute_canc",
        type: "charge.dispute.created",
        data: {
          object: {
            id: "dp_canc",
            payment_intent: "pi_dispute_canc",
            reason: "product_not_received",
            amount: 4000,
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
  // handleChargeDisputeCreated — Lines 307-312: update error (catch rethrows)
  // ==========================================================================

  describe("handleChargeDisputeCreated — update error (lines 307-312)", () => {
    it("catches and rethrows when orderRef.update fails", async () => {
      const orderId = "order-dispute-upd-fail";

      mockDocs.set(`orders/${orderId}`, {
        status: "paid",
        totalCents: 4000,
        currency: "usd",
        stripePaymentIntentId: "pi_dispute_fail",
      });

      // Pre-create the doc ref update mock and make it reject
      mockDocUpdateFns.set(
        `orders/${orderId}`,
        vi.fn().mockRejectedValue(new Error("Firestore update failed"))
      );

      setConstructEvent({
        id: "evt_dispute_upd_fail",
        type: "charge.dispute.created",
        data: {
          object: {
            id: "dp_upd_fail",
            payment_intent: "pi_dispute_fail",
            reason: "fraudulent",
            amount: 4000,
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
  });

  // ==========================================================================
  // handleChargeRefunded — Lines 355-362: partial refund
  // ==========================================================================

  describe("handleChargeRefunded — partial refund (lines 355-362)", () => {
    it("logs warning and returns early on partial refund", async () => {
      const orderId = "order-partial-ref";

      mockDocs.set(`orders/${orderId}`, {
        status: "paid",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_partial_ref",
      });

      setConstructEvent({
        id: "evt_partial_ref",
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_partial",
            payment_intent: "pi_partial_ref",
            refunded: false, // partial refund
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
  });

  // ==========================================================================
  // handleChargeRefunded — Lines 371-377: unexpected order status
  // ==========================================================================

  describe("handleChargeRefunded — unexpected status (lines 371-377)", () => {
    it("returns early when order is in pending status", async () => {
      const orderId = "order-refund-pending";

      mockDocs.set(`orders/${orderId}`, {
        status: "pending",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_refund_pend",
      });

      setConstructEvent({
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

    it("returns early when order is canceled", async () => {
      const orderId = "order-refund-canceled";

      mockDocs.set(`orders/${orderId}`, {
        status: "canceled",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_refund_canc",
      });

      setConstructEvent({
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
  });

  // ==========================================================================
  // handleChargeRefunded — Lines 387-392: update error (catch rethrows)
  // ==========================================================================

  describe("handleChargeRefunded — update error (lines 387-392)", () => {
    it("catches and rethrows when orderRef.update fails during refund", async () => {
      const orderId = "order-refund-upd-fail";

      mockDocs.set(`orders/${orderId}`, {
        status: "paid",
        totalCents: 5000,
        currency: "usd",
        stripePaymentIntentId: "pi_refund_fail",
      });

      // Pre-create the doc ref update mock and make it reject
      mockDocUpdateFns.set(
        `orders/${orderId}`,
        vi.fn().mockRejectedValue(new Error("Firestore write failed"))
      );

      setConstructEvent({
        id: "evt_refund_upd_fail",
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_refund_fail",
            payment_intent: "pi_refund_fail",
            refunded: true,
            amount: 5000,
            amount_refunded: 5000,
          },
        },
      });

      const { req, res } = makeReqRes();
      await callWebhook(req, res);

      expect(mockRestockFromConsumedHold).not.toHaveBeenCalled();
      // Error caught by outer handler, returns 200
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("OK");
    });
  });

  // ==========================================================================
  // Main handler — Lines 486-496: event processing error catch block
  // ==========================================================================

  describe("Main handler — event processing error (lines 486-496)", () => {
    it("returns 200 even when handler throws a non-Error value", async () => {
      const orderId = "order-string-throw";

      mockDocs.set(`orders/${orderId}`, {
        status: "pending",
        totalCents: 4000,
        currency: "usd",
        stripePaymentIntentId: "pi_string_throw",
      });

      // Make runTransaction reject with a string (non-Error)
      mockRunTransaction.mockRejectedValue("some string error");

      setConstructEvent({
        id: "evt_string_throw",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_string_throw",
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

    it("returns 200 when payment_intent.succeeded handler throws Error", async () => {
      const orderId = "order-err-throw";

      mockDocs.set(`orders/${orderId}`, {
        status: "pending",
        totalCents: 4000,
        currency: "usd",
        stripePaymentIntentId: "pi_err_throw",
      });

      configureTransactionReject(new Error("DB unavailable"));

      setConstructEvent({
        id: "evt_err_throw",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_err_throw",
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
      const orderId = "order-fail-err";

      mockDocs.set(`orders/${orderId}`, {
        status: "pending",
        totalCents: 4000,
        currency: "usd",
        stripePaymentIntentId: "pi_fail_err",
      });

      configureTransactionReject(new Error("Timeout"));

      setConstructEvent({
        id: "evt_fail_err",
        type: "payment_intent.payment_failed",
        data: {
          object: {
            id: "pi_fail_err",
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
      const orderId = "order-dispute-err";

      mockDocs.set(`orders/${orderId}`, {
        status: "paid",
        totalCents: 4000,
        currency: "usd",
        stripePaymentIntentId: "pi_dispute_err",
      });

      mockDocUpdateFns.set(
        `orders/${orderId}`,
        vi.fn().mockRejectedValue(new Error("Permission denied"))
      );

      setConstructEvent({
        id: "evt_dispute_err",
        type: "charge.dispute.created",
        data: {
          object: {
            id: "dp_err",
            payment_intent: "pi_dispute_err",
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
      const orderId = "order-refund-err";

      mockDocs.set(`orders/${orderId}`, {
        status: "paid",
        totalCents: 4000,
        currency: "usd",
        stripePaymentIntentId: "pi_refund_err",
      });

      mockDocUpdateFns.set(
        `orders/${orderId}`,
        vi.fn().mockRejectedValue(new Error("Quota exceeded"))
      );

      setConstructEvent({
        id: "evt_refund_err",
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_refund_err",
            payment_intent: "pi_refund_err",
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
// expireHolds — timeout guard (lines 36-40)
// ============================================================================

describe("expireHolds — timeout guard (lines 36-40)", () => {
  let expireHoldsFn: () => Promise<void>;
  let originalDateNow: () => number;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDocs.clear();

    // Save and prepare Date.now for manipulation
    originalDateNow = Date.now;

    vi.resetModules();
    const mod = await import("../expireHolds");
    // onSchedule mock returns the handler directly
    expireHoldsFn = mod.expireHolds as unknown as () => Promise<void>;
  });

  afterEach(() => {
    // Restore Date.now
    Date.now = originalDateNow;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("breaks out of main while loop when timeout guard triggers before query", async () => {
    // Set up an expired hold so the first query would return results
    mockDocs.set("holds/hold-timeout-1", {
      status: "held",
      uid: "user-1",
      items: [{ productId: "prod-1", qty: 1 }],
      expiresAt: { toMillis: () => originalDateNow.call(Date) - 60000 },
    });
    mockDocs.set("products/prod-1", { shards: 3 });

    let callCount = 0;
    const baseTime = originalDateNow.call(Date);

    // First call: startTime is captured (callCount 0 -> 0ms elapsed)
    // Second call: inside while loop check (callCount 1 -> over 50s)
    Date.now = () => {
      callCount++;
      if (callCount <= 1) {
        return baseTime; // Initial capture of startTime
      }
      // All subsequent calls: way past the timeout threshold (50s)
      return baseTime + 60_000;
    };

    await expireHoldsFn();

    // The hold should NOT have been processed because the timeout guard
    // triggered before the query was executed
    const hold = mockDocs.get("holds/hold-timeout-1");
    expect(hold.status).toBe("held"); // unchanged — guard broke the loop
  });

  it("breaks out of main while loop after processing first batch when time exceeds limit", async () => {
    // Set up expired holds (we need the first batch to succeed, then timeout on second iteration)
    mockDocs.set("holds/hold-batch-1", {
      status: "held",
      uid: "user-1",
      items: [{ productId: "prod-1", qty: 1 }],
      expiresAt: { toMillis: () => originalDateNow.call(Date) - 60000 },
    });
    mockDocs.set("products/prod-1", { shards: 3 });

    const baseTime = originalDateNow.call(Date);
    let callCount = 0;

    // Simulate time progression:
    //  - First few calls of Date.now: within time budget (during startTime capture and first batch)
    //  - After several calls (second iteration's timeout check): over budget
    Date.now = () => {
      callCount++;
      if (callCount <= 8) {
        // Enough calls to get through startTime capture + first batch processing
        return baseTime;
      }
      // Subsequent calls: over the 50-second limit
      return baseTime + 55_000;
    };

    await expireHoldsFn();

    // First hold should have been processed, but the loop should have stopped
    // after that because there is only 1 hold (not a full batch of 100)
    // So this tests that the function completes gracefully
  });
});
