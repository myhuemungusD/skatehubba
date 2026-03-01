/**
 * @fileoverview Branch-coverage tests for stockRelease.ts
 *
 * Targets the uncovered branches:
 * - Line 88: throw error (unexpected error in releaseHoldAtomic transaction)
 * - Line 152: throw error (unexpected error in restockFromConsumedHold transaction)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

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
  update: vi.fn(),
  set: vi.fn(),
};

const mockRunTransaction = vi.fn();

const mockBatch = {
  set: vi.fn(),
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
  };
}

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

const { releaseHoldAtomic, restockFromConsumedHold } = await import("../stockRelease");

// ============================================================================
// Tests
// ============================================================================

describe("stockRelease — uncovered branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDocs.clear();
  });

  describe("releaseHoldAtomic — line 88: re-throws unexpected errors", () => {
    it("re-throws unexpected errors from the transaction", async () => {
      // Make runTransaction throw an unexpected error (not HoldNotFoundError or HoldAlreadyReleasedError)
      const unexpectedError = new Error("Firestore unavailable");
      mockRunTransaction.mockRejectedValueOnce(unexpectedError);

      await expect(releaseHoldAtomic("order-unexpected", "seed")).rejects.toThrow(
        "Firestore unavailable"
      );
    });

    it("re-throws TypeError from the transaction", async () => {
      const typeError = new TypeError("Cannot read properties of undefined");
      mockRunTransaction.mockRejectedValueOnce(typeError);

      await expect(releaseHoldAtomic("order-type-err", "seed")).rejects.toThrow(
        "Cannot read properties of undefined"
      );
    });
  });

  describe("restockFromConsumedHold — line 152: re-throws unexpected errors", () => {
    it("re-throws unexpected errors from the transaction", async () => {
      // Make runTransaction throw an unexpected error (not HoldNotFoundError or HoldAlreadyReleasedError)
      const unexpectedError = new Error("Network timeout");
      mockRunTransaction.mockRejectedValueOnce(unexpectedError);

      await expect(restockFromConsumedHold("order-unexpected")).rejects.toThrow("Network timeout");
    });

    it("re-throws RangeError from the transaction", async () => {
      const rangeError = new RangeError("Maximum call stack size exceeded");
      mockRunTransaction.mockRejectedValueOnce(rangeError);

      await expect(restockFromConsumedHold("order-range-err")).rejects.toThrow(
        "Maximum call stack size exceeded"
      );
    });
  });
});
