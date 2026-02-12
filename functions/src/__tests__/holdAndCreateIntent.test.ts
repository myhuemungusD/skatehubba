/**
 * @fileoverview Unit tests for holdAndCreatePaymentIntent (Firebase onCall)
 *
 * Tests the checkout flow including:
 * - Input validation (auth, orderId, items, shipping address)
 * - Product validation (not found, inactive, invalid shards, maxPerUser)
 * - Stock reservation via sharded counters
 * - Rollback on insufficient stock
 * - Currency validation (mixed currencies)
 * - Totals calculation (subtotal, tax 8.75%, shipping)
 * - Free shipping over $100
 * - Stripe PaymentIntent creation
 * - Race protection for existing orders
 * - Stripe failure handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Mocks - declared BEFORE any imports of the module under test
// ============================================================================

// Capture the handler passed to onCall so we can call it directly
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

// Firestore in-memory store
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
    runTransaction: vi.fn().mockImplementation(async (callback: any) => {
      return await callback(mockTransaction);
    }),
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

// Mock crypto.randomInt - always return 0 for deterministic shard selection
vi.mock("crypto", () => ({
  randomInt: vi.fn().mockReturnValue(0),
}));

// Mock Stripe
const mockPaymentIntentsCreate = vi.fn().mockResolvedValue({
  id: "pi_test_123",
  client_secret: "pi_test_123_secret_abc",
});

vi.mock("stripe", () => {
  const MockStripe = function (this: any) {
    this.paymentIntents = { create: mockPaymentIntentsCreate };
  } as any;
  return { default: MockStripe };
});

// ============================================================================
// Import after all mocks are set up
// Set STRIPE_SECRET_KEY before the import so the module-level const captures it
// ============================================================================

const savedStripeKey = process.env.STRIPE_SECRET_KEY;
process.env.STRIPE_SECRET_KEY = "sk_test_holdAndCreate";

const mod = await import("../commerce/holdAndCreateIntent");

// Restore original env after import
if (savedStripeKey === undefined) {
  delete process.env.STRIPE_SECRET_KEY;
} else {
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

/** Seed a product in the mock store */
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

/** Seed a stock shard with available inventory */
function seedShard(productId: string, shardId: number, available: number): void {
  mockDocs.set(`products/${productId}/stockShards/${shardId}`, {
    available,
  });
}

// ============================================================================
// Tests
// ============================================================================

describe("holdAndCreatePaymentIntent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDocs.clear();
    mockPaymentIntentsCreate.mockResolvedValue({
      id: "pi_test_123",
      client_secret: "pi_test_123_secret_abc",
    });
  });

  // 1. Unauthenticated request
  it("throws 'unauthenticated' when request.auth is missing", async () => {
    const request = { auth: null, data: {} };

    try {
      await capturedHandler(request);
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err.code).toBe("unauthenticated");
      expect(err.message).toContain("logged in");
    }
  });

  // 2. Missing orderId
  it("throws 'invalid-argument' when orderId is missing", async () => {
    const request = {
      auth: { uid: "user-1" },
      data: {
        items: [{ productId: "p1", qty: 1 }],
        shippingAddress: validShippingAddress,
      },
    };

    try {
      await capturedHandler(request);
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err.code).toBe("invalid-argument");
      expect(err.message).toContain("orderId");
    }
  });

  // 3. Empty items array
  it("throws 'invalid-argument' when items array is empty", async () => {
    const request = {
      auth: { uid: "user-1" },
      data: {
        orderId: "ord-1",
        items: [],
        shippingAddress: validShippingAddress,
      },
    };

    try {
      await capturedHandler(request);
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err.code).toBe("invalid-argument");
      expect(err.message).toContain("Cart items");
    }
  });

  // 4. Missing shipping address fields
  it("throws 'invalid-argument' when shipping address is missing required fields", async () => {
    const request = {
      auth: { uid: "user-1" },
      data: {
        orderId: "ord-1",
        items: [{ productId: "p1", qty: 1 }],
        shippingAddress: { name: "Test" },
      },
    };

    try {
      await capturedHandler(request);
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err.code).toBe("invalid-argument");
      expect(err.message).toContain("Shipping address");
    }
  });

  // 5. Product not found
  it("throws 'not-found' when a product does not exist", async () => {
    const request = {
      auth: { uid: "user-1" },
      data: {
        orderId: "ord-1",
        items: [{ productId: "nonexistent", qty: 1 }],
        shippingAddress: validShippingAddress,
      },
    };

    try {
      await capturedHandler(request);
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err.code).toBe("not-found");
      expect(err.message).toContain("not found");
    }
  });

  // 6. Inactive product
  it("throws 'failed-precondition' when product is inactive", async () => {
    seedProduct("p1", { active: false });

    const request = {
      auth: { uid: "user-1" },
      data: {
        orderId: "ord-1",
        items: [{ productId: "p1", qty: 1 }],
        shippingAddress: validShippingAddress,
      },
    };

    try {
      await capturedHandler(request);
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err.code).toBe("failed-precondition");
      expect(err.message).toContain("not available");
    }
  });

  // 7. Invalid shards configuration
  it("throws 'internal' when product has invalid shards config", async () => {
    seedProduct("p1", { shards: 0 });

    const request = {
      auth: { uid: "user-1" },
      data: {
        orderId: "ord-1",
        items: [{ productId: "p1", qty: 1 }],
        shippingAddress: validShippingAddress,
      },
    };

    try {
      await capturedHandler(request);
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err.code).toBe("internal");
      expect(err.message).toContain("invalid shards");
    }
  });

  // 8. Exceeding maxPerUser
  it("throws 'invalid-argument' when quantity exceeds maxPerUser", async () => {
    seedProduct("p1", { maxPerUser: 2 });

    const request = {
      auth: { uid: "user-1" },
      data: {
        orderId: "ord-1",
        items: [{ productId: "p1", qty: 5 }],
        shippingAddress: validShippingAddress,
      },
    };

    try {
      await capturedHandler(request);
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err.code).toBe("invalid-argument");
      expect(err.message).toContain("Maximum 2 per customer");
    }
  });

  // 9. Insufficient stock -> rollback
  it("throws 'resource-exhausted' and rolls back when stock is insufficient", async () => {
    seedProduct("p1", { shards: 1 });
    seedShard("p1", 0, 1);

    const request = {
      auth: { uid: "user-1" },
      data: {
        orderId: "ord-1",
        items: [{ productId: "p1", qty: 5 }],
        shippingAddress: validShippingAddress,
      },
    };

    try {
      await capturedHandler(request);
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err.code).toBe("resource-exhausted");
      expect(err.message).toContain("Insufficient stock");
    }

    // Rollback should have been called (batch.commit for rollback)
    expect(mockBatch.commit).toHaveBeenCalled();
  });

  // 10. Mixed currencies
  it("throws 'invalid-argument' when cart contains mixed currencies", async () => {
    seedProduct("p1", { currency: "USD", shards: 4 });
    seedProduct("p2", { currency: "EUR", shards: 4 });
    seedShard("p1", 0, 10);
    seedShard("p2", 0, 10);

    const request = {
      auth: { uid: "user-1" },
      data: {
        orderId: "ord-1",
        items: [
          { productId: "p1", qty: 1 },
          { productId: "p2", qty: 1 },
        ],
        shippingAddress: validShippingAddress,
      },
    };

    try {
      await capturedHandler(request);
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err.code).toBe("invalid-argument");
      expect(err.message).toContain("different currencies");
    }
  });

  // 11. Successful checkout flow with proper totals
  it("returns correct response for a successful checkout", async () => {
    // Product at $50.00 (5000 cents), qty 1
    seedProduct("p1", { priceCents: 5000, shards: 1 });
    seedShard("p1", 0, 10);

    const request = {
      auth: { uid: "user-1" },
      data: {
        orderId: "ord-success",
        items: [{ productId: "p1", qty: 1 }],
        shippingAddress: validShippingAddress,
      },
    };

    const result = await capturedHandler(request);

    expect(result.orderId).toBe("ord-success");
    expect(result.holdStatus).toBe("held");
    expect(result.paymentIntentClientSecret).toBe("pi_test_123_secret_abc");
    expect(result.expiresAt).toBeDefined();

    // Verify Stripe was called with correct totals:
    // subtotal = 5000, tax = Math.round(5000 * 0.0875) = 438, shipping = 999 (under $100)
    // total = 5000 + 438 + 999 = 6437
    expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 6437,
        currency: "usd",
        metadata: { orderId: "ord-success", uid: "user-1" },
      }),
      expect.objectContaining({
        idempotencyKey: "pi_ord-success",
      })
    );
  });

  // 12. Free shipping when subtotal >= $100 (10000 cents)
  it("applies free shipping when subtotal is >= $100", async () => {
    // Product at $120.00 (12000 cents)
    seedProduct("p1", { priceCents: 12000, shards: 1 });
    seedShard("p1", 0, 10);

    const request = {
      auth: { uid: "user-1" },
      data: {
        orderId: "ord-free-ship",
        items: [{ productId: "p1", qty: 1 }],
        shippingAddress: validShippingAddress,
      },
    };

    const result = await capturedHandler(request);

    expect(result.orderId).toBe("ord-free-ship");

    // subtotal = 12000, tax = Math.round(12000 * 0.0875) = 1050, shipping = 0 (free)
    // total = 12000 + 1050 + 0 = 13050
    expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 13050,
      }),
      expect.anything()
    );
  });

  // 13. Stripe failure causes rollback of reserved stock
  it("rolls back reserved stock when Stripe paymentIntents.create fails", async () => {
    seedProduct("p1", { priceCents: 5000, shards: 1 });
    seedShard("p1", 0, 10);

    mockPaymentIntentsCreate.mockRejectedValueOnce(new Error("Stripe API error"));

    const request = {
      auth: { uid: "user-1" },
      data: {
        orderId: "ord-stripe-fail",
        items: [{ productId: "p1", qty: 1 }],
        shippingAddress: validShippingAddress,
      },
    };

    try {
      await capturedHandler(request);
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("Stripe API error");
    }

    // Rollback batch should have been committed
    expect(mockBatch.commit).toHaveBeenCalled();
  });

  // 14. Existing order race protection
  it("throws 'failed-precondition' when order already exists", async () => {
    seedProduct("p1", { priceCents: 5000, shards: 1 });
    seedShard("p1", 0, 10);

    // Pre-populate the hold document to simulate an existing order
    mockDocs.set("holds/ord-dup", { status: "held", items: [] });

    const request = {
      auth: { uid: "user-1" },
      data: {
        orderId: "ord-dup",
        items: [{ productId: "p1", qty: 1 }],
        shippingAddress: validShippingAddress,
      },
    };

    try {
      await capturedHandler(request);
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err.code).toBe("failed-precondition");
      expect(err.message).toContain("Order already exists");
    }
  });
});
