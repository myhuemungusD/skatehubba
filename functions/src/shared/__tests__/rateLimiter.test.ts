import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Hoisted mock state
// ============================================================================

const mocks = vi.hoisted(() => {
  const transaction = {
    get: vi.fn(),
    set: vi.fn(),
    update: vi.fn(),
  };

  const runTransaction = vi.fn(async (fn: any) => fn(transaction));

  const docRef = {
    id: "mock-doc-ref",
  };

  const collectionRef = {
    doc: vi.fn().mockReturnValue(docRef),
  };

  const firestoreInstance = {
    collection: vi.fn().mockReturnValue(collectionRef),
    runTransaction,
  };

  return {
    transaction,
    runTransaction,
    docRef,
    collectionRef,
    firestoreInstance,
  };
});

// ============================================================================
// Module mocks
// ============================================================================

vi.mock("firebase-functions", () => ({
  https: {
    HttpsError: class HttpsError extends Error {
      code: string;
      constructor(code: string, message: string) {
        super(message);
        this.code = code;
      }
    },
  },
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("firebase-admin", () => {
  const mod = {
    apps: [{ name: "mock" }],
    initializeApp: vi.fn(),
    firestore: vi.fn(() => mocks.firestoreInstance),
  };
  return { ...mod, default: mod };
});

// ============================================================================
// Import module under test
// ============================================================================

import { checkRateLimit } from "../rateLimiter";

// ============================================================================
// Tests
// ============================================================================

describe("checkRateLimit (Firestore-based)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new rate limit entry for a first-time user", async () => {
    mocks.transaction.get.mockResolvedValueOnce({
      exists: false,
    });

    await checkRateLimit("user-new");

    expect(mocks.firestoreInstance.collection).toHaveBeenCalledWith("rateLimits");
    expect(mocks.collectionRef.doc).toHaveBeenCalledWith("user-new");
    expect(mocks.transaction.set).toHaveBeenCalledWith(
      mocks.docRef,
      expect.objectContaining({ count: 1, resetAt: expect.any(Number) })
    );
  });

  it("resets the counter when the window has expired", async () => {
    mocks.transaction.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ count: 8, resetAt: Date.now() - 1000 }),
    });

    await checkRateLimit("user-expired");

    expect(mocks.transaction.set).toHaveBeenCalledWith(
      mocks.docRef,
      expect.objectContaining({ count: 1, resetAt: expect.any(Number) })
    );
  });

  it("increments the counter within a valid window", async () => {
    mocks.transaction.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ count: 5, resetAt: Date.now() + 30000 }),
    });

    await checkRateLimit("user-active");

    expect(mocks.transaction.update).toHaveBeenCalledWith(mocks.docRef, { count: 6 });
  });

  it("throws resource-exhausted when limit is reached", async () => {
    mocks.transaction.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ count: 10, resetAt: Date.now() + 30000 }),
    });

    await expect(checkRateLimit("user-limit")).rejects.toThrow(
      "Too many requests. Please try again later."
    );
  });

  it("allows exactly 10 requests before blocking", async () => {
    mocks.transaction.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ count: 9, resetAt: Date.now() + 30000 }),
    });

    // 10th request (count goes from 9 to 10)
    await checkRateLimit("user-at-limit");
    expect(mocks.transaction.update).toHaveBeenCalledWith(mocks.docRef, { count: 10 });
  });

  it("uses Firestore transactions for atomic read-modify-write", async () => {
    mocks.transaction.get.mockResolvedValueOnce({
      exists: false,
    });

    await checkRateLimit("user-tx");

    expect(mocks.firestoreInstance.runTransaction).toHaveBeenCalledTimes(1);
  });
});
