/**
 * Additional branch coverage for stripeWebhook.ts
 *
 * Targets remaining uncovered branches:
 * - Line 271: userInfo has no email (skips email + notification)
 * - Line 170: checkout session has userId but wrong type (not premium_upgrade)
 * - Line 272: firstName is null/undefined, defaults to "Skater"
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("stripeWebhook — remaining branches", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      STRIPE_SECRET_KEY: "sk_test_key",
      STRIPE_WEBHOOK_SECRET: "whsec_test",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

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

  it("skips email/notification when userInfo has no email (line 271 false branch)", async () => {
    const mockSendReceipt = vi.fn().mockResolvedValue(undefined);
    const mockNotifyUser = vi.fn().mockResolvedValue(undefined);

    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    let txCallCount = 0;
    vi.doMock("../../db", () => ({
      getDb: () => ({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              // After transaction: userInfo query returns no email
              limit: vi.fn().mockResolvedValue([{ email: null, firstName: null }]),
            }),
          }),
        }),
        transaction: vi.fn(async (cb: Function) => {
          txCallCount = 0;
          const tx: any = {};
          tx.select = vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  for: vi.fn().mockImplementation(() => {
                    txCallCount++;
                    if (txCallCount === 1) return Promise.resolve([]); // no consumed payment
                    if (txCallCount === 2) return Promise.resolve([{ accountTier: "free" }]); // user found
                    return Promise.resolve([]);
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

    vi.doMock("stripe", () => ({
      default: class MockStripe {
        webhooks = {
          constructEvent: vi.fn().mockReturnValue({
            id: "evt-no-email",
            type: "checkout.session.completed",
            data: {
              object: {
                id: "sess-no-email",
                metadata: { userId: "user-1", type: "premium_upgrade" },
                payment_status: "paid",
                amount_total: 999,
                currency: "usd",
              },
            },
          }),
        };
      },
    }));

    vi.doMock("../../redis", () => ({ getRedisClient: () => null }));
    vi.doMock("@shared/schema", () => ({
      customUsers: { id: "id", email: "email", firstName: "firstName", accountTier: "accountTier", premiumPurchasedAt: "premiumPurchasedAt", updatedAt: "updatedAt" },
      consumedPaymentIntents: { id: "id", paymentIntentId: "paymentIntentId", userId: "userId" },
    }));
    vi.doMock("drizzle-orm", () => ({ eq: vi.fn() }));
    vi.doMock("../../services/emailService", () => ({ sendPaymentReceiptEmail: mockSendReceipt }));
    vi.doMock("../../services/notificationService", () => ({ notifyUser: mockNotifyUser }));

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
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    // Email and notification should NOT have been called since email is null
    expect(mockSendReceipt).not.toHaveBeenCalled();
    expect(mockNotifyUser).not.toHaveBeenCalled();
  });

  it("ignores checkout session when metadata type is not premium_upgrade (line 170)", async () => {
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));
    vi.doMock("../../db", () => ({
      getDb: () => ({
        select: vi.fn(),
        transaction: vi.fn(),
      }),
    }));
    vi.doMock("stripe", () => ({
      default: class MockStripe {
        webhooks = {
          constructEvent: vi.fn().mockReturnValue({
            id: "evt-wrong-type",
            type: "checkout.session.completed",
            data: {
              object: {
                id: "sess-wrong-type",
                metadata: { userId: "user-1", type: "something_else" },
                payment_status: "paid",
                amount_total: 999,
                currency: "usd",
              },
            },
          }),
        };
      },
    }));
    vi.doMock("../../redis", () => ({ getRedisClient: () => null }));
    vi.doMock("@shared/schema", () => ({
      customUsers: { id: "id", email: "email", firstName: "firstName", accountTier: "accountTier", premiumPurchasedAt: "premiumPurchasedAt", updatedAt: "updatedAt" },
      consumedPaymentIntents: { id: "id", paymentIntentId: "paymentIntentId", userId: "userId" },
    }));
    vi.doMock("drizzle-orm", () => ({ eq: vi.fn() }));
    vi.doMock("../../services/emailService", () => ({ sendPaymentReceiptEmail: vi.fn() }));
    vi.doMock("../../services/notificationService", () => ({ notifyUser: vi.fn() }));

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
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith("OK");
  });

  it("uses 'Skater' as fallback when firstName is null (line 272)", async () => {
    const mockSendReceipt = vi.fn().mockResolvedValue(undefined);
    const mockNotifyUser = vi.fn().mockResolvedValue(undefined);

    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    let txCallCount = 0;
    vi.doMock("../../db", () => ({
      getDb: () => ({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              // userInfo has email but no firstName
              limit: vi.fn().mockResolvedValue([{ email: "test@example.com", firstName: null }]),
            }),
          }),
        }),
        transaction: vi.fn(async (cb: Function) => {
          txCallCount = 0;
          const tx: any = {};
          tx.select = vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  for: vi.fn().mockImplementation(() => {
                    txCallCount++;
                    if (txCallCount === 1) return Promise.resolve([]);
                    if (txCallCount === 2) return Promise.resolve([{ accountTier: "free" }]);
                    return Promise.resolve([]);
                  }),
                }),
              }),
            }),
          });
          tx.insert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
          tx.update = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) });
          return cb(tx);
        }),
      }),
    }));

    vi.doMock("stripe", () => ({
      default: class MockStripe {
        webhooks = {
          constructEvent: vi.fn().mockReturnValue({
            id: "evt-no-name",
            type: "checkout.session.completed",
            data: {
              object: {
                id: "sess-no-name",
                metadata: { userId: "user-1", type: "premium_upgrade" },
                payment_status: "paid",
                amount_total: 999,
                currency: "usd",
              },
            },
          }),
        };
      },
    }));

    vi.doMock("../../redis", () => ({ getRedisClient: () => null }));
    vi.doMock("@shared/schema", () => ({
      customUsers: { id: "id", email: "email", firstName: "firstName", accountTier: "accountTier", premiumPurchasedAt: "premiumPurchasedAt", updatedAt: "updatedAt" },
      consumedPaymentIntents: { id: "id", paymentIntentId: "paymentIntentId", userId: "userId" },
    }));
    vi.doMock("drizzle-orm", () => ({ eq: vi.fn() }));
    vi.doMock("../../services/emailService", () => ({ sendPaymentReceiptEmail: mockSendReceipt }));
    vi.doMock("../../services/notificationService", () => ({ notifyUser: mockNotifyUser }));

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
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    await new Promise((r) => setTimeout(r, 10));

    expect(res.status).toHaveBeenCalledWith(200);
    // sendPaymentReceiptEmail should have been called with "Skater" as the name
    expect(mockSendReceipt).toHaveBeenCalledWith("test@example.com", "Skater", expect.any(Object));
  });
});
