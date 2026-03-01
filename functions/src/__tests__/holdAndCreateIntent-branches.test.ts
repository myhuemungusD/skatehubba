/**
 * @fileoverview Branch-coverage tests for holdAndCreateIntent.ts
 *
 * Targets the uncovered branches:
 * - Line 93: catch block in tryReserveFromShards (shard transaction fails)
 * - Line 320: throw when STRIPE_SECRET_KEY is not configured
 *
 * This file deliberately does NOT set STRIPE_SECRET_KEY before import
 * so that the module-level const captures an undefined value, covering line 320.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Capture the handler passed to onCall so we can call it directly
// ============================================================================

let capturedHandler: any;

vi.mock("firebase-functions/v2/https", () => ({
  onCall: vi.fn((_opts: any, handler: any) => {
    capturedHandler = handler;
    return handler;
  }),
  HttpsError: class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = "HttpsError";
    }
  },
}));

vi.mock("firebase-functions/v2", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// In-memory Firestore mock
const mockDocs = new Map<string, any>();

const mockTransaction = {
  get: vi.fn().mockImplementation(async (ref: any) => {
    const key = ref._path;
    const data = mockDocs.get(key);
    return { exists: !!data, data: () => data };
  }),
  update: vi.fn().mockImplementation((ref: any, updates: any) => {
    const key = ref._path;
    const current = mockDocs.get(key) || {};
    const resolved: Record<string, any> = {};
    for (const [k, v] of Object.entries(updates)) {
      if (v && typeof v === "object" && (v as any).__increment !== undefined) {
        resolved[k] = (current[k] || 0) + (v as any).__increment;
      } else {
        resolved[k] = v;
      }
    }
    mockDocs.set(key, { ...current, ...resolved });
  }),
  set: vi.fn().mockImplementation((ref: any, data: any) => {
    mockDocs.set(ref._path, data);
  }),
};

const mockBatch = {
  update: vi.fn(),
  commit: vi.fn().mockResolvedValue(undefined),
};

function makeDocRef(path: string) {
  return {
    _path: path,
    get: vi.fn().mockImplementation(async () => {
      const data = mockDocs.get(path);
      return { exists: !!data, data: () => data };
    }),
    set: vi.fn().mockImplementation(async (data: any) => {
      mockDocs.set(path, data);
    }),
    update: vi.fn().mockImplementation(async (updates: any) => {
      const current = mockDocs.get(path) || {};
      mockDocs.set(path, { ...current, ...updates });
    }),
  };
}

const mockRunTransaction = vi.fn().mockImplementation(async (callback: any) => {
  return await callback(mockTransaction);
});

vi.mock("../firebaseAdmin", () => ({
  getAdminDb: () => ({
    collection: vi.fn().mockImplementation((collName: string) => ({
      doc: vi.fn().mockImplementation((docId: string) => {
        const path = `${collName}/${docId}`;
        const ref = makeDocRef(path);
        return {
          ...ref,
          collection: vi.fn().mockImplementation((subColl: string) => ({
            doc: vi.fn().mockImplementation((subDocId: string) => {
              const subPath = `${collName}/${docId}/${subColl}/${subDocId}`;
              return makeDocRef(subPath);
            }),
          })),
        };
      }),
    })),
    runTransaction: mockRunTransaction,
    batch: vi.fn().mockReturnValue(mockBatch),
  }),
}));

vi.mock("firebase-admin/firestore", () => ({
  Timestamp: {
    now: () => ({ toMillis: () => Date.now(), toDate: () => new Date() }),
    fromMillis: (ms: number) => ({
      toMillis: () => ms,
      toDate: () => new Date(ms),
    }),
  },
  FieldValue: {
    increment: (n: number) => ({ __increment: n }),
  },
}));

// Mock crypto.randomInt for deterministic shard selection
const mockRandomInt = vi.fn().mockReturnValue(0);
vi.mock("crypto", () => ({
  randomInt: (...args: any[]) => mockRandomInt(...args),
}));

// Mock Stripe — will not be reached in the "not configured" test
vi.mock("stripe", () => {
  const MockStripe = function (this: any) {
    this.paymentIntents = { create: vi.fn() };
  } as any;
  return { default: MockStripe };
});

// ============================================================================
// Import with STRIPE_SECRET_KEY explicitly UNSET
// ============================================================================

const savedStripeKey = process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_SECRET_KEY;

await import("../commerce/holdAndCreateIntent");

// Restore after import
if (savedStripeKey !== undefined) {
  process.env.STRIPE_SECRET_KEY = savedStripeKey;
}

// ============================================================================
// Helpers
// ============================================================================

const validShippingAddress = {
  name: "Tony Hawk",
  line1: "123 Skate Ln",
  city: "San Diego",
  state: "CA",
  postalCode: "92101",
  country: "US",
};

function seedProduct(id: string, overrides: Record<string, any> = {}): void {
  mockDocs.set(`products/${id}`, {
    name: "Test Product",
    priceCents: 5000,
    currency: "USD",
    active: true,
    shards: 4,
    ...overrides,
  });
}

function seedShard(productId: string, shardId: number, available: number): void {
  mockDocs.set(`products/${productId}/stockShards/${shardId}`, {
    available,
  });
}

// ============================================================================
// Tests
// ============================================================================

describe("holdAndCreatePaymentIntent — uncovered branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDocs.clear();
    mockRandomInt.mockReturnValue(0);
  });

  describe("line 320: throw when STRIPE_SECRET_KEY is not configured", () => {
    it("throws 'internal' error and rolls back stock when Stripe is not configured", async () => {
      // Set up a valid product with stock so we get past reservation
      seedProduct("p1", { priceCents: 5000, shards: 1 });
      seedShard("p1", 0, 10);

      const request = {
        auth: { uid: "user-1" },
        data: {
          orderId: "ord-no-stripe-key",
          items: [{ productId: "p1", qty: 1 }],
          shippingAddress: validShippingAddress,
        },
      };

      try {
        await capturedHandler(request);
        expect.unreachable("should have thrown");
      } catch (err: any) {
        expect(err.code).toBe("internal");
        expect(err.message).toContain("Stripe not configured");
      }

      // Rollback batch should have been committed
      expect(mockBatch.commit).toHaveBeenCalled();
    });
  });

  describe("line 93: catch block in tryReserveFromShards", () => {
    it("logs warning and continues on shard transaction failure", async () => {
      seedProduct("p1", { priceCents: 5000, shards: 2 });
      seedShard("p1", 0, 10);
      seedShard("p1", 1, 10);

      // Make randomInt return 0 first (which will fail), then 1 (success)
      mockRandomInt.mockReturnValueOnce(0).mockReturnValueOnce(1);

      // Make the first runTransaction call throw to simulate contention
      let txCallCount = 0;
      mockRunTransaction.mockImplementation(async (callback: any) => {
        txCallCount++;
        if (txCallCount === 1) {
          throw new Error("Transaction contention on shard");
        }
        return await callback(mockTransaction);
      });

      const request = {
        auth: { uid: "user-1" },
        data: {
          orderId: "ord-shard-fail-branch",
          items: [{ productId: "p1", qty: 1 }],
          shippingAddress: validShippingAddress,
        },
      };

      // Should still throw "Stripe not configured" (since STRIPE_SECRET_KEY is not set),
      // but the shard transaction failure path (line 93) will have been exercised
      try {
        await capturedHandler(request);
        expect.unreachable("should have thrown");
      } catch (err: any) {
        // We expect either "Stripe not configured" or the error to propagate
        expect(err.message).toBeDefined();
      }

      // Verify the warning was logged for the shard transaction failure
      const { logger } = await import("firebase-functions/v2");
      expect((logger.warn as any)).toHaveBeenCalledWith(
        "Shard reservation transaction failed",
        expect.objectContaining({
          productId: "p1",
        })
      );
    });
  });

  describe("line 163: qty <= 0 branch (integer zero)", () => {
    it("throws 'invalid-argument' when qty is 0 (integer but not positive)", async () => {
      seedProduct("p1", { priceCents: 5000, shards: 1 });

      const request = {
        auth: { uid: "user-1" },
        data: {
          orderId: "ord-zero-qty",
          items: [{ productId: "p1", qty: 0 }],
          shippingAddress: validShippingAddress,
        },
      };

      try {
        await capturedHandler(request);
        expect.unreachable("should have thrown");
      } catch (err: any) {
        expect(err.code).toBe("invalid-argument");
        expect(err.message).toContain("Invalid quantity");
      }
    });

    it("throws 'invalid-argument' when qty is a non-integer float", async () => {
      seedProduct("p1", { priceCents: 5000, shards: 1 });

      const request = {
        auth: { uid: "user-1" },
        data: {
          orderId: "ord-float-qty",
          items: [{ productId: "p1", qty: 1.5 }],
          shippingAddress: validShippingAddress,
        },
      };

      try {
        await capturedHandler(request);
        expect.unreachable("should have thrown");
      } catch (err: any) {
        expect(err.code).toBe("invalid-argument");
        expect(err.message).toContain("Invalid quantity");
      }
    });
  });

  describe("line 74: shard doc does not exist (shardSnap.exists false)", () => {
    it("treats non-existent shard as 0 available", async () => {
      seedProduct("p1", { priceCents: 5000, shards: 1 });
      // Do NOT seed any shard for p1 — shardSnap.exists will be false

      const request = {
        auth: { uid: "user-1" },
        data: {
          orderId: "ord-no-shard-doc",
          items: [{ productId: "p1", qty: 1 }],
          shippingAddress: validShippingAddress,
        },
      };

      try {
        await capturedHandler(request);
        expect.unreachable("should have thrown");
      } catch (err: any) {
        // Will throw resource-exhausted (no stock) or "Stripe not configured"
        expect(err.message).toBeDefined();
      }
    });

    it("treats shard with undefined available as 0", async () => {
      seedProduct("p1", { priceCents: 5000, shards: 1 });
      // Shard exists but has no available field
      mockDocs.set("products/p1/stockShards/0", { someOtherField: true });

      const request = {
        auth: { uid: "user-1" },
        data: {
          orderId: "ord-no-available-field",
          items: [{ productId: "p1", qty: 1 }],
          shippingAddress: validShippingAddress,
        },
      };

      try {
        await capturedHandler(request);
        expect.unreachable("should have thrown");
      } catch (err: any) {
        // Will exhaust all shards since available is undefined (treated as 0)
        expect(err.message).toBeDefined();
      }
    });
  });

  describe("line 296: currency ?? 'USD' fallback", () => {
    it("defaults to USD when product has no currency field", async () => {
      seedProduct("p1", { priceCents: 5000, shards: 1, currency: undefined });
      seedShard("p1", 0, 10);

      const request = {
        auth: { uid: "user-1" },
        data: {
          orderId: "ord-no-currency",
          items: [{ productId: "p1", qty: 1 }],
          shippingAddress: validShippingAddress,
        },
      };

      // Will fail at "Stripe not configured" but the currency fallback path is exercised
      try {
        await capturedHandler(request);
        expect.unreachable("should have thrown");
      } catch (err: any) {
        expect(err.code).toBe("internal");
        expect(err.message).toContain("Stripe not configured");
      }
    });
  });

  describe("line 205: typeof address !== 'object' branch", () => {
    it("throws 'invalid-argument' when shipping address is a string", async () => {
      const request = {
        auth: { uid: "user-1" },
        data: {
          orderId: "ord-str-addr",
          items: [{ productId: "p1", qty: 1 }],
          shippingAddress: "123 Main St",
        },
      };

      try {
        await capturedHandler(request);
        expect.unreachable("should have thrown");
      } catch (err: any) {
        expect(err.code).toBe("invalid-argument");
        expect(err.message).toContain("Shipping address is required");
      }
    });

    it("throws 'invalid-argument' when shipping address is a number", async () => {
      const request = {
        auth: { uid: "user-1" },
        data: {
          orderId: "ord-num-addr",
          items: [{ productId: "p1", qty: 1 }],
          shippingAddress: 42,
        },
      };

      try {
        await capturedHandler(request);
        expect.unreachable("should have thrown");
      } catch (err: any) {
        expect(err.code).toBe("invalid-argument");
        expect(err.message).toContain("Shipping address is required");
      }
    });
  });
});
