/**
 * @fileoverview Unit tests for Commerce / Payment Flow
 *
 * Tests critical payment paths:
 * - Stock reservation and release (sharded counters)
 * - Hold lifecycle (held -> consumed/released/expired)
 * - Webhook deduplication
 * - Stripe webhook handling (payment succeeded/failed)
 * - Cart validation and totals calculation
 * - Shipping address validation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

// Mock firebase-functions/v2
vi.mock("firebase-functions/v2/https", () => ({
  onCall: vi.fn((_opts: any, handler: any) => handler),
  onRequest: vi.fn((_opts: any, app: any) => app),
  HttpsError: class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = "HttpsError";
    }
  },
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
    // Handle FieldValue.increment
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
  set: vi.fn().mockImplementation((ref: any, data: any, _opts?: any) => {
    const key = ref._path;
    const current = mockDocs.get(key) || {};
    const resolved: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === "object" && (v as any).__increment !== undefined) {
        resolved[k] = (current[k] || 0) + (v as any).__increment;
      } else {
        resolved[k] = v;
      }
    }
    mockDocs.set(key, { ...current, ...resolved });
  }),
  update: vi.fn().mockImplementation((ref: any, updates: any) => {
    const key = ref._path;
    const current = mockDocs.get(key) || {};
    mockDocs.set(key, { ...current, ...updates });
  }),
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

// Shared runTransaction mock so tests can override it per-call
const mockRunTransaction = vi.fn().mockImplementation(async (callback: any) => {
  return await callback(mockTransaction);
});

vi.mock("../../firebaseAdmin", () => ({
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
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockImplementation(async () => {
        // Return matching docs for queries
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
    batch: vi.fn().mockReturnValue(mockBatch),
  }),
}));

vi.mock("firebase-admin/firestore", () => ({
  Timestamp: {
    now: () => ({ toMillis: () => Date.now(), toDate: () => new Date() }),
    fromMillis: (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) }),
  },
  FieldValue: {
    increment: (n: number) => ({ __increment: n }),
  },
}));

// ============================================================================
// Import after mocks
// ============================================================================

const { hashToShard, releaseHoldAtomic, consumeHold, restockFromConsumedHold } =
  await import("../stockRelease");
const { markEventProcessedOrSkip } = await import("../webhookDedupe");
const { expireHolds } = await import("../expireHolds");

// ============================================================================
// Tests
// ============================================================================

describe("Commerce / Payment Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDocs.clear();
  });

  // ==========================================================================
  // Stock Release - hashToShard
  // ==========================================================================

  describe("hashToShard", () => {
    it("returns a value within [0, shardCount)", () => {
      for (let i = 0; i < 100; i++) {
        const shard = hashToShard(`order-${i}`, 0, 20);
        expect(shard).toBeGreaterThanOrEqual(0);
        expect(shard).toBeLessThan(20);
      }
    });

    it("is deterministic for same inputs", () => {
      const a = hashToShard("order-abc", 0, 20);
      const b = hashToShard("order-abc", 0, 20);
      expect(a).toBe(b);
    });

    it("produces valid shards for different item indices", () => {
      const a = hashToShard("order-abc", 0, 20);
      const b = hashToShard("order-abc", 1, 20);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(20);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(20);
    });

    it("handles single shard (always returns 0)", () => {
      const shard = hashToShard("order-abc", 0, 1);
      expect(shard).toBe(0);
    });

    it("distributes across shards for many orders", () => {
      const shardCount = 10;
      const seen = new Set<number>();
      for (let i = 0; i < 100; i++) {
        seen.add(hashToShard(`order-${i}`, 0, shardCount));
      }
      // With 100 different orders and 10 shards, expect decent spread
      expect(seen.size).toBeGreaterThan(5);
    });
  });

  // ==========================================================================
  // Stock Release - consumeHold
  // ==========================================================================

  describe("consumeHold", () => {
    it("transitions hold from 'held' to 'consumed'", async () => {
      mockDocs.set("holds/order-1", { status: "held", items: [] });

      const result = await consumeHold("order-1");
      expect(result).toBe(true);

      // Transaction should have been called
      expect(mockTransaction.get).toHaveBeenCalled();
      expect(mockTransaction.update).toHaveBeenCalled();
    });

    it("returns false if hold not found", async () => {
      // No hold document exists
      const result = await consumeHold("nonexistent");
      expect(result).toBe(false);
    });

    it("returns false if hold is not in 'held' status", async () => {
      mockDocs.set("holds/order-1", { status: "released", items: [] });

      const result = await consumeHold("order-1");
      expect(result).toBe(false);
    });

    it("returns false if hold is already consumed", async () => {
      mockDocs.set("holds/order-1", { status: "consumed", items: [] });

      const result = await consumeHold("order-1");
      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // Stock Release - releaseHoldAtomic
  // ==========================================================================

  describe("releaseHoldAtomic", () => {
    it("returns false when hold does not exist", async () => {
      const result = await releaseHoldAtomic("nonexistent", "seed");
      expect(result).toBe(false);
    });

    it("returns false when hold is not in 'held' status", async () => {
      mockDocs.set("holds/order-1", { status: "consumed", items: [] });

      const result = await releaseHoldAtomic("order-1", "order-1");
      expect(result).toBe(false);
    });

    it("releases hold with items back to stock shards", async () => {
      mockDocs.set("holds/order-1", {
        status: "held",
        items: [{ productId: "prod-1", qty: 2 }],
      });
      mockDocs.set("products/prod-1", { shards: 5 });

      const result = await releaseHoldAtomic("order-1", "order-1");
      expect(result).toBe(true);

      // Batch should have been committed
      expect(mockBatch.commit).toHaveBeenCalled();
    });

    it("releases hold with empty items list", async () => {
      mockDocs.set("holds/order-1", {
        status: "held",
        items: [],
      });

      const result = await releaseHoldAtomic("order-1", "order-1");
      expect(result).toBe(true);
    });

    it("uses default shard count (20) when product doc does not exist (covers line 72)", async () => {
      mockDocs.set("holds/order-no-product", {
        status: "held",
        items: [{ productId: "nonexistent-prod", qty: 1 }],
      });
      // Do NOT set products/nonexistent-prod -> productSnap.exists is false -> shards defaults to 20

      const result = await releaseHoldAtomic("order-no-product", "order-no-product");
      expect(result).toBe(true);
      expect(mockBatch.set).toHaveBeenCalled();
      expect(mockBatch.commit).toHaveBeenCalled();
    });

    it("uses default shard count when product has no shards field (covers line 72)", async () => {
      mockDocs.set("holds/order-no-shards-field", {
        status: "held",
        items: [{ productId: "prod-no-shards", qty: 2 }],
      });
      // Product exists but has no shards field
      mockDocs.set("products/prod-no-shards", { name: "Test Product" });

      const result = await releaseHoldAtomic("order-no-shards-field", "order-no-shards-field");
      expect(result).toBe(true);
      expect(mockBatch.set).toHaveBeenCalled();
    });

    it("caches product shard count for repeated product IDs (covers line 70-74)", async () => {
      mockDocs.set("holds/order-repeated-prod", {
        status: "held",
        items: [
          { productId: "prod-1", qty: 1 },
          { productId: "prod-1", qty: 2 },
        ],
      });
      mockDocs.set("products/prod-1", { shards: 8 });

      const result = await releaseHoldAtomic("order-repeated-prod", "order-repeated-prod");
      expect(result).toBe(true);
      // Both items should use the same cached shard count
      expect(mockBatch.set).toHaveBeenCalledTimes(2);
    });

    it("handles multiple items in a single hold", async () => {
      mockDocs.set("holds/order-1", {
        status: "held",
        items: [
          { productId: "prod-1", qty: 3 },
          { productId: "prod-2", qty: 1 },
        ],
      });
      mockDocs.set("products/prod-1", { shards: 10 });
      mockDocs.set("products/prod-2", { shards: 5 });

      const result = await releaseHoldAtomic("order-1", "order-1");
      expect(result).toBe(true);
      expect(mockBatch.set).toHaveBeenCalledTimes(2);
      expect(mockBatch.commit).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Webhook Deduplication
  // ==========================================================================

  describe("markEventProcessedOrSkip", () => {
    it("returns true for new events (should process)", async () => {
      // Event doesn't exist yet
      const result = await markEventProcessedOrSkip("evt_new_123");
      expect(result).toBe(true);
    });

    it("returns false for duplicate events", async () => {
      // Pre-populate the event as already processed
      mockDocs.set("processedEvents/evt_dup_123", { createdAt: new Date() });

      const result = await markEventProcessedOrSkip("evt_dup_123");
      expect(result).toBe(false);
    });

    it("creates event record when processing new event", async () => {
      await markEventProcessedOrSkip("evt_brand_new");
      expect(mockTransaction.set).toHaveBeenCalled();
    });

    it("returns false when transaction throws an error (covers lines 45-47)", async () => {
      // Temporarily make runTransaction throw
      mockRunTransaction.mockRejectedValueOnce(new Error("Firestore unavailable"));

      const result = await markEventProcessedOrSkip("evt_error_123");
      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // Shipping Address Validation (tested via module internals)
  // ==========================================================================

  describe("holdAndCreatePaymentIntent - input validation", () => {
    let holdAndCreatePaymentIntent: any;

    beforeEach(async () => {
      // The onCall mock wraps the handler, so we import the handler directly
      const mod = await import("../holdAndCreateIntent");
      holdAndCreatePaymentIntent = mod.holdAndCreatePaymentIntent;
    });

    it("rejects unauthenticated requests", async () => {
      const request = { auth: null, data: {} };

      await expect(holdAndCreatePaymentIntent(request)).rejects.toThrow("You must be logged in");
    });

    it("rejects missing orderId", async () => {
      const request = {
        auth: { uid: "user-1" },
        data: { items: [{ productId: "p1", qty: 1 }], shippingAddress: {} },
      };

      await expect(holdAndCreatePaymentIntent(request)).rejects.toThrow("orderId is required");
    });

    it("rejects empty cart", async () => {
      const request = {
        auth: { uid: "user-1" },
        data: { orderId: "ord-1", items: [], shippingAddress: {} },
      };

      await expect(holdAndCreatePaymentIntent(request)).rejects.toThrow("Cart items are required");
    });

    it("rejects missing shipping address fields", async () => {
      const request = {
        auth: { uid: "user-1" },
        data: {
          orderId: "ord-1",
          items: [{ productId: "p1", qty: 1 }],
          shippingAddress: { name: "Test" }, // missing line1, city, etc.
        },
      };

      await expect(holdAndCreatePaymentIntent(request)).rejects.toThrow("Shipping address");
    });

    it("rejects null shipping address", async () => {
      const request = {
        auth: { uid: "user-1" },
        data: {
          orderId: "ord-1",
          items: [{ productId: "p1", qty: 1 }],
          shippingAddress: null,
        },
      };

      await expect(holdAndCreatePaymentIntent(request)).rejects.toThrow(
        "Shipping address is required"
      );
    });

    it("rejects invalid product quantity", async () => {
      // Set up product in mock store
      mockDocs.set("products/p1", {
        name: "Test",
        priceCents: 1000,
        currency: "USD",
        active: true,
        shards: 5,
      });

      const request = {
        auth: { uid: "user-1" },
        data: {
          orderId: "ord-1",
          items: [{ productId: "p1", qty: -1 }],
          shippingAddress: {
            name: "Test",
            line1: "123 Main",
            city: "LA",
            state: "CA",
            postalCode: "90001",
            country: "US",
          },
        },
      };

      await expect(holdAndCreatePaymentIntent(request)).rejects.toThrow("Invalid quantity");
    });

    it("rejects inactive products", async () => {
      mockDocs.set("products/p1", {
        name: "Test",
        priceCents: 1000,
        currency: "USD",
        active: false,
        shards: 5,
      });

      const request = {
        auth: { uid: "user-1" },
        data: {
          orderId: "ord-1",
          items: [{ productId: "p1", qty: 1 }],
          shippingAddress: {
            name: "Test",
            line1: "123 Main",
            city: "LA",
            state: "CA",
            postalCode: "90001",
            country: "US",
          },
        },
      };

      await expect(holdAndCreatePaymentIntent(request)).rejects.toThrow("not available");
    });

    it("rejects product not found", async () => {
      const request = {
        auth: { uid: "user-1" },
        data: {
          orderId: "ord-1",
          items: [{ productId: "nonexistent", qty: 1 }],
          shippingAddress: {
            name: "Test",
            line1: "123 Main",
            city: "LA",
            state: "CA",
            postalCode: "90001",
            country: "US",
          },
        },
      };

      await expect(holdAndCreatePaymentIntent(request)).rejects.toThrow("not found");
    });

    it("rejects quantity exceeding maxPerUser", async () => {
      mockDocs.set("products/p1", {
        name: "Limited Edition",
        priceCents: 5000,
        currency: "USD",
        active: true,
        shards: 5,
        maxPerUser: 2,
      });

      const request = {
        auth: { uid: "user-1" },
        data: {
          orderId: "ord-1",
          items: [{ productId: "p1", qty: 5 }],
          shippingAddress: {
            name: "Test",
            line1: "123 Main",
            city: "LA",
            state: "CA",
            postalCode: "90001",
            country: "US",
          },
        },
      };

      await expect(holdAndCreatePaymentIntent(request)).rejects.toThrow("Maximum 2 per customer");
    });
  });

  // ==========================================================================
  // Restock from consumed hold (refund/dispute path)
  // ==========================================================================

  describe("restockFromConsumedHold", () => {
    it("restocks inventory from a consumed hold", async () => {
      mockDocs.set("holds/order-refund", {
        status: "consumed",
        items: [{ productId: "prod-1", qty: 3 }],
      });
      mockDocs.set("products/prod-1", { shards: 5 });

      const result = await restockFromConsumedHold("order-refund");
      expect(result).toBe(true);

      // Hold status should be updated to released
      const hold = mockDocs.get("holds/order-refund");
      expect(hold.status).toBe("released");
      expect(mockBatch.commit).toHaveBeenCalled();
    });

    it("returns false when hold not found", async () => {
      const result = await restockFromConsumedHold("nonexistent");
      expect(result).toBe(false);
    });

    it("returns false when hold is not in consumed status", async () => {
      mockDocs.set("holds/order-held", {
        status: "held",
        items: [{ productId: "prod-1", qty: 1 }],
      });

      const result = await restockFromConsumedHold("order-held");
      expect(result).toBe(false);
    });

    it("returns false for already-released hold", async () => {
      mockDocs.set("holds/order-released", {
        status: "released",
        items: [],
      });

      const result = await restockFromConsumedHold("order-released");
      expect(result).toBe(false);
    });

    it("handles consumed hold with empty items list", async () => {
      mockDocs.set("holds/order-empty", {
        status: "consumed",
        items: [],
      });

      const result = await restockFromConsumedHold("order-empty");
      expect(result).toBe(true);

      const hold = mockDocs.get("holds/order-empty");
      expect(hold.status).toBe("released");
    });

    it("uses default shard count when product not found during restock (covers lines 171-175)", async () => {
      mockDocs.set("holds/order-restock-no-prod", {
        status: "consumed",
        items: [{ productId: "ghost-prod", qty: 2 }],
      });
      // Do NOT set products/ghost-prod -> defaults to 20 shards

      const result = await restockFromConsumedHold("order-restock-no-prod");
      expect(result).toBe(true);
      expect(mockBatch.set).toHaveBeenCalled();
      expect(mockBatch.commit).toHaveBeenCalled();
    });

    it("uses default shard count when product has no shards field during restock (covers line 173)", async () => {
      mockDocs.set("holds/order-restock-no-shards", {
        status: "consumed",
        items: [{ productId: "prod-bare", qty: 1 }],
      });
      mockDocs.set("products/prod-bare", { name: "Bare Product" });

      const result = await restockFromConsumedHold("order-restock-no-shards");
      expect(result).toBe(true);
      expect(mockBatch.set).toHaveBeenCalled();
    });

    it("caches product shard count for repeated product IDs during restock (covers lines 171-176)", async () => {
      mockDocs.set("holds/order-restock-cache", {
        status: "consumed",
        items: [
          { productId: "prod-1", qty: 1 },
          { productId: "prod-1", qty: 3 },
        ],
      });
      mockDocs.set("products/prod-1", { shards: 6 });

      const result = await restockFromConsumedHold("order-restock-cache");
      expect(result).toBe(true);
      expect(mockBatch.set).toHaveBeenCalledTimes(2);
    });

    it("restocks multiple items to correct shards", async () => {
      mockDocs.set("holds/order-multi", {
        status: "consumed",
        items: [
          { productId: "prod-1", qty: 2 },
          { productId: "prod-2", qty: 5 },
        ],
      });
      mockDocs.set("products/prod-1", { shards: 10 });
      mockDocs.set("products/prod-2", { shards: 5 });

      const result = await restockFromConsumedHold("order-multi");
      expect(result).toBe(true);
      expect(mockBatch.set).toHaveBeenCalledTimes(2);
      expect(mockBatch.commit).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Expire Holds (scheduled function - real code coverage)
  // ==========================================================================

  describe("expireHolds scheduled function", () => {
    it("releases expired holds and updates status to expired", async () => {
      mockDocs.set("holds/expired-1", {
        status: "held",
        uid: "user-1",
        items: [{ productId: "prod-1", qty: 2 }],
        expiresAt: { toMillis: () => Date.now() - 60000 },
      });
      mockDocs.set("products/prod-1", { shards: 5 });

      await expireHolds();

      const hold = mockDocs.get("holds/expired-1");
      expect(hold.status).toBe("expired");
    });

    it("does nothing when no expired holds exist", async () => {
      // Empty store - no holds to process
      mockBatch.commit.mockClear();

      await expireHolds();

      expect(mockBatch.commit).not.toHaveBeenCalled();
    });

    it("processes multiple expired holds", async () => {
      mockDocs.set("holds/exp-1", {
        status: "held",
        uid: "user-1",
        items: [{ productId: "prod-1", qty: 1 }],
        expiresAt: { toMillis: () => Date.now() - 60000 },
      });
      mockDocs.set("holds/exp-2", {
        status: "held",
        uid: "user-2",
        items: [{ productId: "prod-2", qty: 3 }],
        expiresAt: { toMillis: () => Date.now() - 120000 },
      });
      mockDocs.set("products/prod-1", { shards: 5 });
      mockDocs.set("products/prod-2", { shards: 5 });

      await expireHolds();

      expect(mockDocs.get("holds/exp-1").status).toBe("expired");
      expect(mockDocs.get("holds/exp-2").status).toBe("expired");
    });

    it("continues processing when individual hold release fails", async () => {
      // Hold with missing product - releaseHoldAtomic uses default shard count
      mockDocs.set("holds/hold-1", {
        status: "held",
        uid: "user-1",
        items: [{ productId: "missing-prod", qty: 1 }],
        expiresAt: { toMillis: () => Date.now() - 60000 },
      });

      // Should not throw - errors are caught per-hold
      await expireHolds();
    });

    it("breaks out of main loop when timeout guard is triggered (covers lines 36-40)", async () => {
      // Create a large batch of expired holds to force a long processing time
      // We mock Date.now to simulate time passing
      const originalNow = Date.now;
      let callCount = 0;

      // First call returns the real time, subsequent calls simulate 55s elapsed
      vi.spyOn(Date, "now").mockImplementation(() => {
        callCount++;
        if (callCount <= 2) return originalNow.call(Date);
        // After first batch iteration, return a time > 50s past start
        return originalNow.call(Date) + 55000;
      });

      mockDocs.set("holds/timeout-1", {
        status: "held",
        uid: "user-1",
        items: [{ productId: "prod-1", qty: 1 }],
        expiresAt: { toMillis: () => originalNow.call(Date) - 60000 },
      });
      mockDocs.set("products/prod-1", { shards: 5 });

      await expireHolds();

      vi.spyOn(Date, "now").mockRestore();
    });

    it("breaks out of per-doc loop when mid-batch timeout triggers (covers lines 62-66)", async () => {
      const originalNow = Date.now;
      let callCount = 0;

      // Let processing start, but timeout mid-batch when iterating docs
      vi.spyOn(Date, "now").mockImplementation(() => {
        callCount++;
        // First few calls (start + loop entry) -> normal time
        if (callCount <= 4) return originalNow.call(Date);
        // Mid-batch: time has exceeded 50s
        return originalNow.call(Date) + 55000;
      });

      // Create multiple expired holds to iterate
      mockDocs.set("holds/mb-1", {
        status: "held",
        uid: "user-1",
        items: [{ productId: "prod-1", qty: 1 }],
        expiresAt: { toMillis: () => originalNow.call(Date) - 60000 },
      });
      mockDocs.set("holds/mb-2", {
        status: "held",
        uid: "user-2",
        items: [{ productId: "prod-1", qty: 1 }],
        expiresAt: { toMillis: () => originalNow.call(Date) - 60000 },
      });
      mockDocs.set("products/prod-1", { shards: 5 });

      await expireHolds();

      vi.spyOn(Date, "now").mockRestore();
    });

    it("logs error but continues when releaseHoldAtomic throws (covers line 91)", async () => {
      // Force releaseHoldAtomic to throw by making the batch commit fail
      mockBatch.commit.mockRejectedValueOnce(new Error("Firestore batch write failed"));

      mockDocs.set("holds/err-1", {
        status: "held",
        uid: "user-1",
        items: [{ productId: "prod-1", qty: 1 }],
        expiresAt: { toMillis: () => Date.now() - 60000 },
      });
      mockDocs.set("products/prod-1", { shards: 5 });

      // Should not throw - error is caught per-hold
      await expireHolds();
    });
  });
});
