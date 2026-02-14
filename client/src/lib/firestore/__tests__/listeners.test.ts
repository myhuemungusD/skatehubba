/**
 * Tests for client/src/lib/firestore/listeners.ts
 *
 * Covers: listenToCollection function (lines 15-31)
 * including success callback, error callback, and constraint handling.
 */

const mockCollection = vi.fn(() => ({ _type: "collectionRef" }));
const mockQuery = vi.fn((...args: unknown[]) => ({ _type: "query", args }));
const mockOnSnapshot = vi.fn();

vi.mock("firebase/firestore", () => ({
  collection: (...args: unknown[]) => mockCollection(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
}));

vi.mock("../../firebase/config", () => ({
  db: { _type: "mock-db" },
}));

import { listenToCollection } from "../listeners";

describe("listenToCollection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSnapshot.mockReturnValue(vi.fn()); // default unsubscribe
  });

  it("creates a collection reference with the correct path", () => {
    listenToCollection("games", [], vi.fn());

    expect(mockCollection).toHaveBeenCalledWith({ _type: "mock-db" }, "games");
  });

  it("passes constraints to query when constraints are non-empty", () => {
    const constraint1 = { _type: "where" };
    const constraint2 = { _type: "limit" };

    listenToCollection("games", [constraint1, constraint2] as any, vi.fn());

    expect(mockQuery).toHaveBeenCalledWith({ _type: "collectionRef" }, constraint1, constraint2);
  });

  it("uses collectionRef directly when constraints are empty", () => {
    listenToCollection("games", [], vi.fn());

    // query should not be called with constraints, but the raw collectionRef is used
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns an unsubscribe function from onSnapshot", () => {
    const mockUnsub = vi.fn();
    mockOnSnapshot.mockReturnValue(mockUnsub);

    const unsub = listenToCollection("games", [], vi.fn());

    expect(unsub).toBe(mockUnsub);
  });

  it("calls onSnapshot with the correct query/collection ref", () => {
    listenToCollection("games", [], vi.fn());

    expect(mockOnSnapshot).toHaveBeenCalledWith(
      { _type: "collectionRef" }, // no constraints = raw collectionRef
      expect.any(Function),
      expect.any(Function)
    );
  });

  it("maps snapshot docs to items with id and calls onNext", () => {
    mockOnSnapshot.mockImplementation((_q: any, onNext: any) => {
      onNext({
        docs: [
          { id: "doc-1", data: () => ({ name: "Game 1", status: "active" }) },
          { id: "doc-2", data: () => ({ name: "Game 2", status: "waiting" }) },
        ],
      });
      return vi.fn();
    });

    const onNext = vi.fn();
    listenToCollection("games", [], onNext);

    expect(onNext).toHaveBeenCalledWith([
      { id: "doc-1", name: "Game 1", status: "active" },
      { id: "doc-2", name: "Game 2", status: "waiting" },
    ]);
  });

  it("calls onError with code and message when snapshot errors", () => {
    mockOnSnapshot.mockImplementation((_q: any, _onNext: any, onError: any) => {
      onError({ code: "permission-denied", message: "Access denied" });
      return vi.fn();
    });

    const onError = vi.fn();
    listenToCollection("games", [], vi.fn(), onError);

    expect(onError).toHaveBeenCalledWith({
      code: "permission-denied",
      message: "Access denied",
    });
  });

  it("does not throw when onError is not provided and snapshot errors", () => {
    mockOnSnapshot.mockImplementation((_q: any, _onNext: any, onError: any) => {
      // Invoke the error handler - should call onError?.() which is safe
      onError({ code: "unavailable", message: "Service unavailable" });
      return vi.fn();
    });

    // Should not throw
    expect(() => {
      listenToCollection("games", [], vi.fn());
    }).not.toThrow();
  });

  it("calls onNext with empty array when snapshot has no docs", () => {
    mockOnSnapshot.mockImplementation((_q: any, onNext: any) => {
      onNext({ docs: [] });
      return vi.fn();
    });

    const onNext = vi.fn();
    listenToCollection("games", [], onNext);

    expect(onNext).toHaveBeenCalledWith([]);
  });
});
