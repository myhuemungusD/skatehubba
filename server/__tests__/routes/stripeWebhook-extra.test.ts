/**
 * @fileoverview Extra coverage tests for stripeWebhook route
 *
 * Targets the two uncovered branches inside the db.transaction() callback
 * in handleCheckoutCompleted:
 *
 * - Lines 220-222: Early return when the checkout session was already processed
 *   (existing consumed payment intent found via SELECT FOR UPDATE)
 * - Lines 233-235: Early return when the user is not found in the database
 *
 * Uses vi.resetModules() + vi.doMock() to create a fresh module instance per
 * test so we can wire up the transaction mock with specific SELECT results.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("stripeWebhook — handleCheckoutCompleted transaction branches", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      STRIPE_SECRET_KEY: "sk_test_x",
      STRIPE_WEBHOOK_SECRET: "whsec_x",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function makeRes() {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.send = vi.fn().mockReturnValue(res);
    return res;
  }

  function makeReq() {
    return {
      body: Buffer.from("{}"),
      headers: { "stripe-signature": "sig_test" },
    } as any;
  }

  /**
   * Wire up all doMock calls for a single test.
   *
   * @param txSelectResults — ordered array of result arrays that the
   *   transaction's successive SELECT queries will return.
   */
  function setupMocks(txSelectResults: any[][]) {
    let txSelectCallCount = 0;

    // Logger
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    vi.doMock("../../logger", () => ({ default: mockLogger }));

    // DB — outer db.select (used for userInfo query after transaction)
    // and db.transaction with configurable per-SELECT results
    vi.doMock("../../db", () => ({
      getDb: () => ({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ email: "a@b.com", firstName: "A" }]),
            }),
          }),
        }),
        transaction: vi.fn(async (cb: Function) => {
          const tx: any = {};
          tx.select = vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  for: vi.fn().mockImplementation(() => {
                    const result = txSelectResults[txSelectCallCount] || [];
                    txSelectCallCount++;
                    return Promise.resolve(result);
                  }),
                }),
              }),
            }),
          });
          tx.insert = vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
          });
          tx.update = vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          });
          return cb(tx);
        }),
      }),
    }));

    // Stripe — constructEvent returns a valid checkout.session.completed event
    const mockConstructEvent = vi.fn().mockReturnValue({
      id: "evt-tx-test",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "sess-tx-test",
          metadata: { userId: "user-1", type: "premium_upgrade" },
          payment_status: "paid",
          amount_total: 999,
          currency: "usd",
        },
      },
    });
    vi.doMock("stripe", () => ({
      default: class MockStripe {
        webhooks = { constructEvent: mockConstructEvent };
      },
    }));

    // Redis — null (no Redis available), so the in-memory path is used.
    // The first call will always be "new" since we reset modules each time.
    vi.doMock("../../redis", () => ({
      getRedisClient: () => null,
    }));

    // Schema
    vi.doMock("@shared/schema", () => ({
      customUsers: {
        id: "id",
        email: "email",
        firstName: "firstName",
        accountTier: "accountTier",
        premiumPurchasedAt: "premiumPurchasedAt",
        updatedAt: "updatedAt",
      },
      consumedPaymentIntents: {
        id: "id",
        paymentIntentId: "paymentIntentId",
        userId: "userId",
      },
    }));

    vi.doMock("drizzle-orm", () => ({ eq: vi.fn() }));

    // Email & notification — resolve silently
    vi.doMock("../../services/emailService", () => ({
      sendPaymentReceiptEmail: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("../../services/notificationService", () => ({
      notifyUser: vi.fn().mockResolvedValue(undefined),
    }));

    return { mockLogger };
  }

  // ---------------------------------------------------------------------------
  // Test 1 — already-processed session (lines 220-222)
  // ---------------------------------------------------------------------------

  it("returns early when the checkout session was already processed (lines 220-222)", async () => {
    // First tx SELECT returns an existing row → session already consumed
    const { mockLogger } = setupMocks([[{ id: 1 }]]);

    // Capture route handlers via Express Router mock
    const routeHandlers: Record<string, Function[]> = {};
    vi.doMock("express", () => ({
      Router: () => ({
        post: vi.fn((path: string, ...handlers: Function[]) => {
          routeHandlers[`POST ${path}`] = handlers;
        }),
        get: vi.fn(),
      }),
    }));

    await import("../../routes/stripeWebhook");

    const handler = routeHandlers["POST /"]?.[0];
    expect(handler).toBeDefined();

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith("OK");

    // The logger.info call for "already processed" should have been made
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Webhook session already processed, skipping",
      expect.objectContaining({ sessionId: "sess-tx-test", userId: "user-1" })
    );
  });

  // ---------------------------------------------------------------------------
  // Test 2 — user not found (lines 233-235)
  // ---------------------------------------------------------------------------

  it("returns early when the user is not found for premium upgrade (lines 233-235)", async () => {
    // First tx SELECT returns [] (no existing consumed payment)
    // Second tx SELECT returns [] (no user found)
    const { mockLogger } = setupMocks([[], []]);

    const routeHandlers: Record<string, Function[]> = {};
    vi.doMock("express", () => ({
      Router: () => ({
        post: vi.fn((path: string, ...handlers: Function[]) => {
          routeHandlers[`POST ${path}`] = handlers;
        }),
        get: vi.fn(),
      }),
    }));

    await import("../../routes/stripeWebhook");

    const handler = routeHandlers["POST /"]?.[0];
    expect(handler).toBeDefined();

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith("OK");

    // The logger.error call for "User not found" should have been made
    expect(mockLogger.error).toHaveBeenCalledWith(
      "User not found for premium upgrade",
      expect.objectContaining({ userId: "user-1", sessionId: "sess-tx-test" })
    );
  });
});
