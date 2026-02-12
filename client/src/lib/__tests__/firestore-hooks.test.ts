/**
 * @fileoverview Tests for Firestore hooks (useFirestoreCollection, useFirestoreDocument)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Track state setter calls and captured effects
let capturedEffects: Function[] = [];
let stateValues: Map<number, any> = new Map();
let stateIndex = 0;
let stateSetters: Map<number, ReturnType<typeof vi.fn>> = new Map();

// Mock React - capture useEffect callbacks and useState values
vi.mock("react", () => ({
  useEffect: vi.fn((effect: Function) => {
    capturedEffects.push(effect);
  }),
  useState: vi.fn((initial: any) => {
    const idx = stateIndex++;
    stateValues.set(idx, initial);
    const setter = vi.fn((val: any) => stateValues.set(idx, val));
    stateSetters.set(idx, setter);
    return [initial, setter];
  }),
}));

// Mock firebase/firestore
const mockUnsubscribe = vi.fn();
const mockOnSnapshot = vi.fn(() => mockUnsubscribe);
const mockCollection = vi.fn(() => "collection-ref");
const mockDoc = vi.fn(() => "doc-ref");
const mockQuery = vi.fn((...args: any[]) => args);
const mockWhere = vi.fn((...args: any[]) => ({ type: "where", args }));
const mockOrderBy = vi.fn((...args: any[]) => ({ type: "orderBy", args }));
const mockLimit = vi.fn((...args: any[]) => ({ type: "limit", args }));

vi.mock("firebase/firestore", () => ({
  collection: (...args: any[]) => mockCollection(...args),
  doc: (...args: any[]) => mockDoc(...args),
  onSnapshot: (...args: any[]) => mockOnSnapshot(...args),
  query: (...args: any[]) => mockQuery(...args),
  where: (...args: any[]) => mockWhere(...args),
  orderBy: (...args: any[]) => mockOrderBy(...args),
  limit: (...args: any[]) => mockLimit(...args),
  QueryConstraint: {},
}));

vi.mock("../firebase", () => ({
  db: {},
}));

const mockLogger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn() };
vi.mock("../logger", () => ({
  logger: mockLogger,
}));

const {
  useFirestoreCollection,
  useFirestoreDocument,
  where: reExportedWhere,
  orderBy: reExportedOrderBy,
  limit: reExportedLimit,
} = await import("../firestore/hooks");

describe("Firestore Hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedEffects = [];
    stateValues = new Map();
    stateSetters = new Map();
    stateIndex = 0;
  });

  describe("Module exports", () => {
    it("should export useFirestoreCollection as a function", () => {
      expect(typeof useFirestoreCollection).toBe("function");
    });

    it("should export useFirestoreDocument as a function", () => {
      expect(typeof useFirestoreDocument).toBe("function");
    });
  });

  describe("Re-exports", () => {
    it("should re-export where from firebase/firestore", () => {
      expect(reExportedWhere).toBeDefined();
      reExportedWhere("field", "==", "value");
      expect(mockWhere).toHaveBeenCalledWith("field", "==", "value");
    });

    it("should re-export orderBy from firebase/firestore", () => {
      expect(reExportedOrderBy).toBeDefined();
      reExportedOrderBy("createdAt", "desc");
      expect(mockOrderBy).toHaveBeenCalledWith("createdAt", "desc");
    });

    it("should re-export limit from firebase/firestore", () => {
      expect(reExportedLimit).toBeDefined();
      reExportedLimit(10);
      expect(mockLimit).toHaveBeenCalledWith(10);
    });
  });

  describe("useFirestoreCollection", () => {
    it("should call onSnapshot with collection ref when no constraints provided", () => {
      useFirestoreCollection("users");

      // There should be a captured effect from useEffect
      expect(capturedEffects.length).toBeGreaterThan(0);

      // Execute the effect
      const cleanup = capturedEffects[capturedEffects.length - 1]();

      expect(mockCollection).toHaveBeenCalledWith({}, "users");
      expect(mockOnSnapshot).toHaveBeenCalled();
      // Should NOT use query when no constraints
      expect(mockQuery).not.toHaveBeenCalled();
      // onSnapshot should be called with the collection ref directly
      const snapshotArgs = mockOnSnapshot.mock.calls[0];
      expect(snapshotArgs[0]).toBe("collection-ref");
    });

    it("should call query when constraints are provided", () => {
      const constraint1 = { type: "where" };
      const constraint2 = { type: "orderBy" };

      useFirestoreCollection("users", [constraint1, constraint2] as any);

      // Execute the effect
      capturedEffects[capturedEffects.length - 1]();

      expect(mockCollection).toHaveBeenCalledWith({}, "users");
      expect(mockQuery).toHaveBeenCalledWith("collection-ref", constraint1, constraint2);
      // onSnapshot should be called with the query result
      const snapshotArgs = mockOnSnapshot.mock.calls[0];
      expect(snapshotArgs[0]).toEqual(["collection-ref", constraint1, constraint2]);
    });

    it("should skip setup when enabled is false", () => {
      useFirestoreCollection("users", [], { enabled: false });

      // Execute the effect
      const cleanup = capturedEffects[capturedEffects.length - 1]();

      // Should not set up any snapshot listeners
      expect(mockOnSnapshot).not.toHaveBeenCalled();
      expect(mockCollection).not.toHaveBeenCalled();

      // Cleanup should be undefined since there is no unsubscribe
      expect(cleanup).toBeUndefined();
    });

    it("should return data, loading, and error from useState", () => {
      const result = useFirestoreCollection("users");

      expect(result).toHaveProperty("data");
      expect(result).toHaveProperty("loading");
      expect(result).toHaveProperty("error");
      // Initial values
      expect(result.data).toEqual([]);
      expect(result.loading).toBe(true);
      expect(result.error).toBeNull();
    });

    it("should handle snapshot success callback", () => {
      useFirestoreCollection("users");

      // Execute the effect
      capturedEffects[capturedEffects.length - 1]();

      // Get the success callback passed to onSnapshot (second arg)
      const successCallback = mockOnSnapshot.mock.calls[0][1];
      expect(typeof successCallback).toBe("function");

      // Simulate a snapshot
      const mockSnapshot = {
        docs: [
          { id: "doc-1", data: () => ({ name: "Alice" }) },
          { id: "doc-2", data: () => ({ name: "Bob" }) },
        ],
      };
      successCallback(mockSnapshot);

      // setData should have been called (the setter at index 0)
      const setData = stateSetters.get(0);
      expect(setData).toHaveBeenCalledWith([
        { id: "doc-1", name: "Alice" },
        { id: "doc-2", name: "Bob" },
      ]);

      // setLoading should have been called with false
      const setLoading = stateSetters.get(1);
      expect(setLoading).toHaveBeenCalledWith(false);
    });

    it("should handle snapshot error callback", () => {
      useFirestoreCollection("users");

      // Execute the effect
      capturedEffects[capturedEffects.length - 1]();

      // Get the error callback passed to onSnapshot (third arg)
      const errorCallback = mockOnSnapshot.mock.calls[0][2];
      expect(typeof errorCallback).toBe("function");

      // Simulate an error
      const testError = new Error("Permission denied");
      errorCallback(testError);

      // setError should have been called with the error
      const setError = stateSetters.get(2);
      expect(setError).toHaveBeenCalledWith(testError);

      // setLoading should have been called with false
      const setLoading = stateSetters.get(1);
      expect(setLoading).toHaveBeenCalledWith(false);

      // logger.error should have been called
      expect(mockLogger.error).toHaveBeenCalledWith("Error fetching collection users:", testError);
    });

    it("should return unsubscribe function as cleanup", () => {
      useFirestoreCollection("users");

      // Execute the effect
      const cleanup = capturedEffects[capturedEffects.length - 1]();

      expect(typeof cleanup).toBe("function");

      // Call cleanup
      cleanup();

      // mockUnsubscribe should have been called
      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });

  describe("useFirestoreDocument", () => {
    it("should call onSnapshot with doc ref", () => {
      useFirestoreDocument("users", "user-123");

      // Execute the effect
      capturedEffects[capturedEffects.length - 1]();

      expect(mockDoc).toHaveBeenCalledWith({}, "users", "user-123");
      expect(mockOnSnapshot).toHaveBeenCalled();
      // onSnapshot should be called with the doc ref
      const snapshotArgs = mockOnSnapshot.mock.calls[0];
      expect(snapshotArgs[0]).toBe("doc-ref");
    });

    it("should skip setup when documentId is null", () => {
      useFirestoreDocument("users", null);

      // Execute the effect
      const cleanup = capturedEffects[capturedEffects.length - 1]();

      // Should not set up any snapshot listeners
      expect(mockOnSnapshot).not.toHaveBeenCalled();
      expect(mockDoc).not.toHaveBeenCalled();

      // Cleanup should be undefined
      expect(cleanup).toBeUndefined();
    });

    it("should skip setup when enabled is false", () => {
      useFirestoreDocument("users", "user-123", { enabled: false });

      // Execute the effect
      const cleanup = capturedEffects[capturedEffects.length - 1]();

      // Should not set up any snapshot listeners
      expect(mockOnSnapshot).not.toHaveBeenCalled();
      expect(mockDoc).not.toHaveBeenCalled();

      // Cleanup should be undefined
      expect(cleanup).toBeUndefined();
    });

    it("should return data, loading, and error from useState", () => {
      const result = useFirestoreDocument("users", "user-123");

      expect(result).toHaveProperty("data");
      expect(result).toHaveProperty("loading");
      expect(result).toHaveProperty("error");
      // Initial values
      expect(result.data).toBeNull();
      expect(result.loading).toBe(true);
      expect(result.error).toBeNull();
    });

    it("should handle snapshot success callback when document exists", () => {
      useFirestoreDocument("users", "user-123");

      // Execute the effect
      capturedEffects[capturedEffects.length - 1]();

      // Get the success callback passed to onSnapshot
      const successCallback = mockOnSnapshot.mock.calls[0][1];

      // Simulate a snapshot where document exists
      const mockSnapshot = {
        exists: () => true,
        id: "user-123",
        data: () => ({ name: "Alice", email: "alice@example.com" }),
      };
      successCallback(mockSnapshot);

      // setData should have been called with document data
      const setData = stateSetters.get(0);
      expect(setData).toHaveBeenCalledWith({
        id: "user-123",
        name: "Alice",
        email: "alice@example.com",
      });

      // setLoading should have been called with false
      const setLoading = stateSetters.get(1);
      expect(setLoading).toHaveBeenCalledWith(false);
    });

    it("should handle snapshot success callback when document does not exist", () => {
      useFirestoreDocument("users", "nonexistent");

      // Execute the effect
      capturedEffects[capturedEffects.length - 1]();

      // Get the success callback
      const successCallback = mockOnSnapshot.mock.calls[0][1];

      // Simulate a snapshot where document does not exist
      const mockSnapshot = {
        exists: () => false,
        id: "nonexistent",
        data: () => null,
      };
      successCallback(mockSnapshot);

      // setData should have been called with null
      const setData = stateSetters.get(0);
      expect(setData).toHaveBeenCalledWith(null);

      // setLoading should have been called with false
      const setLoading = stateSetters.get(1);
      expect(setLoading).toHaveBeenCalledWith(false);
    });

    it("should handle snapshot error callback", () => {
      useFirestoreDocument("users", "user-123");

      // Execute the effect
      capturedEffects[capturedEffects.length - 1]();

      // Get the error callback
      const errorCallback = mockOnSnapshot.mock.calls[0][2];

      // Simulate an error
      const testError = new Error("Document read failed");
      errorCallback(testError);

      // setError should have been called with the error
      const setError = stateSetters.get(2);
      expect(setError).toHaveBeenCalledWith(testError);

      // setLoading should have been called with false
      const setLoading = stateSetters.get(1);
      expect(setLoading).toHaveBeenCalledWith(false);

      // logger.error should have been called
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Error fetching document users/user-123:",
        testError
      );
    });

    it("should return unsubscribe function as cleanup", () => {
      useFirestoreDocument("users", "user-123");

      // Execute the effect
      const cleanup = capturedEffects[capturedEffects.length - 1]();

      expect(typeof cleanup).toBe("function");

      // Call cleanup
      cleanup();

      // mockUnsubscribe should have been called
      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });

  describe("Error handling during listener setup", () => {
    it("should catch and log errors in useFirestoreCollection setup", () => {
      const setupError = new Error("Invalid collection path");
      mockCollection.mockImplementationOnce(() => {
        throw setupError;
      });

      useFirestoreCollection("invalid/path");

      // Execute the effect
      capturedEffects[capturedEffects.length - 1]();

      // logger.error should have been called
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Error setting up listener for invalid/path:",
        setupError
      );

      // setError should have been called
      const setError = stateSetters.get(2);
      expect(setError).toHaveBeenCalledWith(setupError);

      // setLoading should have been called with false
      const setLoading = stateSetters.get(1);
      expect(setLoading).toHaveBeenCalledWith(false);
    });

    it("should catch and log errors in useFirestoreDocument setup", () => {
      const setupError = new Error("Invalid doc ref");
      mockDoc.mockImplementationOnce(() => {
        throw setupError;
      });

      useFirestoreDocument("users", "bad-id");

      // Execute the effect
      capturedEffects[capturedEffects.length - 1]();

      // logger.error should have been called
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Error setting up listener for users/bad-id:",
        setupError
      );

      // setError should have been called
      const setError = stateSetters.get(2);
      expect(setError).toHaveBeenCalledWith(setupError);

      // setLoading should have been called with false
      const setLoading = stateSetters.get(1);
      expect(setLoading).toHaveBeenCalledWith(false);
    });
  });
});
