/**
 * @fileoverview Tests for Firestore operations
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSetDoc = vi.fn().mockResolvedValue(undefined);
const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);
const mockDeleteDoc = vi.fn().mockResolvedValue(undefined);
const mockAddDoc = vi.fn().mockResolvedValue({ id: "auto-generated-id" });
const mockGetDoc = vi.fn().mockResolvedValue({
  exists: () => true,
  data: () => ({ name: "Test", value: 42 }),
  id: "doc-1",
});
const mockGetDocs = vi.fn().mockResolvedValue({
  docs: [
    { id: "doc-1", data: () => ({ name: "One" }) },
    { id: "doc-2", data: () => ({ name: "Two" }) },
  ],
});

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_ref: any, id?: string) => ({ id: id || "doc-ref" })),
  setDoc: (...args: any[]) => mockSetDoc(...args),
  updateDoc: (...args: any[]) => mockUpdateDoc(...args),
  deleteDoc: (...args: any[]) => mockDeleteDoc(...args),
  addDoc: (...args: any[]) => mockAddDoc(...args),
  getDoc: (...args: any[]) => mockGetDoc(...args),
  getDocs: (...args: any[]) => mockGetDocs(...args),
  query: vi.fn((...args: any[]) => args),
  QueryConstraint: {},
  Timestamp: { now: vi.fn() },
  serverTimestamp: vi.fn(() => ({ _serverTimestamp: true })),
}));

vi.mock("../firebase", () => ({
  db: {},
}));

const {
  createDocument,
  updateDocument,
  deleteDocument,
  getDocument,
  queryDocuments,
  firestoreCollections,
} = await import("../firestore/operations");

describe("Firestore Operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("firestoreCollections", () => {
    it("should export collection name constants", () => {
      expect(firestoreCollections.users).toBe("users");
      expect(firestoreCollections.chatMessages).toBe("chat_messages");
      expect(firestoreCollections.gameSessions).toBe("game_sessions");
      expect(firestoreCollections.notifications).toBe("notifications");
      expect(firestoreCollections.activeCheckins).toBe("active_checkins");
      expect(firestoreCollections.challengeVotes).toBe("challenge_votes");
      expect(firestoreCollections.leaderboardLive).toBe("leaderboard_live");
    });
  });

  describe("createDocument", () => {
    it("should create document with auto-generated ID", async () => {
      const id = await createDocument("users", { name: "Test" });
      expect(id).toBe("auto-generated-id");
      expect(mockAddDoc).toHaveBeenCalled();
    });

    it("should create document with custom ID", async () => {
      const id = await createDocument("users", { name: "Test" }, "custom-id");
      expect(id).toBe("custom-id");
      expect(mockSetDoc).toHaveBeenCalled();
    });
  });

  describe("updateDocument", () => {
    it("should update document fields", async () => {
      await updateDocument("users", "doc-1", { name: "Updated" });
      expect(mockUpdateDoc).toHaveBeenCalled();
    });

    it("should update document without timestamp by default", async () => {
      await updateDocument("users", "doc-1", { name: "NoTimestamp" });
      const callArgs = mockUpdateDoc.mock.calls[0];
      // The data passed should NOT include updatedAt
      expect(callArgs[1]).toEqual({ name: "NoTimestamp" });
    });

    it("should add updatedAt timestamp when addTimestamp option is true", async () => {
      await updateDocument("users", "doc-1", { name: "WithTimestamp" }, { addTimestamp: true });
      const callArgs = mockUpdateDoc.mock.calls[0];
      // The data passed should include updatedAt from serverTimestamp
      expect(callArgs[1]).toEqual({
        name: "WithTimestamp",
        updatedAt: { _serverTimestamp: true },
      });
    });

    it("should not add timestamp when addTimestamp is explicitly false", async () => {
      await updateDocument("users", "doc-1", { name: "ExplicitFalse" }, { addTimestamp: false });
      const callArgs = mockUpdateDoc.mock.calls[0];
      expect(callArgs[1]).toEqual({ name: "ExplicitFalse" });
    });
  });

  describe("deleteDocument", () => {
    it("should delete document", async () => {
      await deleteDocument("users", "doc-1");
      expect(mockDeleteDoc).toHaveBeenCalled();
    });
  });

  describe("getDocument", () => {
    it("should return document data when exists", async () => {
      const result = await getDocument("users", "doc-1");
      expect(result).toEqual(expect.objectContaining({ name: "Test", value: 42 }));
    });

    it("should return null when document not found", async () => {
      mockGetDoc.mockResolvedValueOnce({
        exists: () => false,
        data: () => null,
      });
      const result = await getDocument("users", "nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("queryDocuments", () => {
    it("should return array of documents", async () => {
      const results = await queryDocuments("users", []);
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual(expect.objectContaining({ id: "doc-1" }));
    });
  });
});
