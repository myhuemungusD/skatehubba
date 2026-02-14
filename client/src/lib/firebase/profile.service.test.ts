/**
 * Tests for client/src/lib/firebase/profile.service.ts
 *
 * Covers: getProfile (with retries, permission-denied handling),
 * and updateProfile (with serverTimestamp).
 *
 * Strategy: mock all Firebase Firestore imports and the transformProfile utility.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockGetDoc = vi.fn();
const mockDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockServerTimestamp = vi.fn().mockReturnValue({ _type: "serverTimestamp" });

vi.mock("firebase/firestore", () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  serverTimestamp: () => mockServerTimestamp(),
}));

vi.mock("./config", () => ({
  db: { _type: "mock-firestore" },
}));

vi.mock("../logger", () => ({
  logger: {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockTransformProfile = vi.fn();

vi.mock("../../store/authStore.utils", () => ({
  transformProfile: (...args: unknown[]) => mockTransformProfile(...args),
}));

// ── Imports (resolved AFTER mocks) ────────────────────────────────────────

import { getProfile, updateProfile } from "./profile.service";
import { logger } from "../logger";

// ── Helpers ────────────────────────────────────────────────────────────────

const mockProfile = {
  uid: "user-123",
  username: "sk8r_boi",
  stance: "regular" as const,
  experienceLevel: "advanced" as const,
  favoriteTricks: ["kickflip", "heelflip"],
  bio: "Skater from SF",
  spotsVisited: 42,
  crewName: "Bay Crew",
  credibilityScore: 100,
  avatarUrl: "https://cdn.example.com/avatar.jpg",
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-06-01"),
};

function createMockSnapshot(exists: boolean, data?: Record<string, unknown>) {
  return {
    exists: () => exists,
    data: () => data,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("profile.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockReturnValue({ _type: "docRef", id: "user-123" });
  });

  // ────────────────────────────────────────────────────────────────────────
  // getProfile
  // ────────────────────────────────────────────────────────────────────────

  describe("getProfile", () => {
    it("returns transformed profile when document exists", async () => {
      const rawData = { username: "sk8r_boi", stance: "regular" };
      const snapshot = createMockSnapshot(true, rawData);
      mockGetDoc.mockResolvedValue(snapshot);
      mockTransformProfile.mockReturnValue(mockProfile);

      const result = await getProfile("user-123");

      expect(mockDoc).toHaveBeenCalledWith({ _type: "mock-firestore" }, "profiles", "user-123");
      expect(mockGetDoc).toHaveBeenCalledWith({ _type: "docRef", id: "user-123" });
      expect(mockTransformProfile).toHaveBeenCalledWith("user-123", rawData);
      expect(result).toEqual(mockProfile);
    });

    it("returns null when document does not exist", async () => {
      const snapshot = createMockSnapshot(false);
      mockGetDoc.mockResolvedValue(snapshot);

      const result = await getProfile("nonexistent-user");

      expect(result).toBeNull();
      expect(mockTransformProfile).not.toHaveBeenCalled();
    });

    it("throws non-permission errors immediately without retry", async () => {
      const error = new Error("Firestore unavailable");
      mockGetDoc.mockRejectedValue(error);

      await expect(getProfile("user-123")).rejects.toThrow("Firestore unavailable");

      // Should only attempt once for non-permission-denied errors
      expect(mockGetDoc).toHaveBeenCalledTimes(1);
    });

    it("retries on permission-denied errors up to 3 times", async () => {
      const permError = Object.assign(new Error("Permission denied"), {
        code: "permission-denied",
      });
      mockGetDoc.mockRejectedValue(permError);

      await expect(getProfile("user-123")).rejects.toThrow();

      // 3 attempts total (initial + 2 retries)
      expect(mockGetDoc).toHaveBeenCalledTimes(3);
    }, 10000);

    it("succeeds on retry after permission-denied", async () => {
      const permError = Object.assign(new Error("Permission denied"), {
        code: "permission-denied",
      });
      const rawData = { username: "retry_user" };
      const snapshot = createMockSnapshot(true, rawData);

      // First call fails, second succeeds
      mockGetDoc.mockRejectedValueOnce(permError).mockResolvedValueOnce(snapshot);
      mockTransformProfile.mockReturnValue(mockProfile);

      const result = await getProfile("user-123");

      expect(mockGetDoc).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockProfile);
    }, 10000);

    it("waits between retries with increasing delay", async () => {
      vi.useFakeTimers();

      const permError = Object.assign(new Error("Permission denied"), {
        code: "permission-denied",
      });
      const rawData = { username: "delayed_user" };
      const snapshot = createMockSnapshot(true, rawData);

      mockGetDoc
        .mockRejectedValueOnce(permError)
        .mockRejectedValueOnce(permError)
        .mockResolvedValueOnce(snapshot);
      mockTransformProfile.mockReturnValue(mockProfile);

      const profilePromise = getProfile("user-123");

      // First retry after 500ms
      await vi.advanceTimersByTimeAsync(500);
      // Second retry after 1000ms
      await vi.advanceTimersByTimeAsync(1000);

      const result = await profilePromise;
      expect(result).toEqual(mockProfile);
      expect(mockGetDoc).toHaveBeenCalledTimes(3);

      vi.useRealTimers();
    });

    it("throws permission-denied on last attempt without retrying", async () => {
      const permError = Object.assign(new Error("Permission denied"), {
        code: "permission-denied",
      });

      // All 3 attempts fail with permission-denied
      mockGetDoc.mockRejectedValue(permError);

      // The last attempt (attempt === maxRetries) throws immediately
      await expect(getProfile("user-123")).rejects.toThrow("Permission denied");

      expect(mockGetDoc).toHaveBeenCalledTimes(3);
    }, 10000);
  });

  // ────────────────────────────────────────────────────────────────────────
  // updateProfile
  // ────────────────────────────────────────────────────────────────────────

  describe("updateProfile", () => {
    it("updates profile document with provided fields and serverTimestamp", async () => {
      mockUpdateDoc.mockResolvedValue(undefined);

      await updateProfile("user-123", {
        bio: "Updated bio",
        crewName: "New Crew",
      });

      expect(mockDoc).toHaveBeenCalledWith({ _type: "mock-firestore" }, "profiles", "user-123");
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        { _type: "docRef", id: "user-123" },
        {
          bio: "Updated bio",
          crewName: "New Crew",
          updatedAt: { _type: "serverTimestamp" },
        }
      );
    });

    it("updates only avatarUrl", async () => {
      mockUpdateDoc.mockResolvedValue(undefined);

      await updateProfile("user-123", {
        avatarUrl: "https://cdn.example.com/new-avatar.jpg",
      });

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        { _type: "docRef", id: "user-123" },
        {
          avatarUrl: "https://cdn.example.com/new-avatar.jpg",
          updatedAt: { _type: "serverTimestamp" },
        }
      );
    });

    it("handles empty updates (still sets updatedAt)", async () => {
      mockUpdateDoc.mockResolvedValue(undefined);

      await updateProfile("user-123", {});

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        { _type: "docRef", id: "user-123" },
        {
          updatedAt: { _type: "serverTimestamp" },
        }
      );
    });

    it("throws user-friendly error when updateDoc fails", async () => {
      mockUpdateDoc.mockRejectedValue(new Error("Firestore write error"));

      await expect(updateProfile("user-123", { bio: "New bio" })).rejects.toThrow(
        "Failed to update user profile."
      );

      expect(logger.error).toHaveBeenCalledWith(
        "[ProfileService] Failed to update profile:",
        expect.any(Error)
      );
    });

    it("sets null values for nullable fields", async () => {
      mockUpdateDoc.mockResolvedValue(undefined);

      await updateProfile("user-123", {
        bio: null,
        crewName: null,
        avatarUrl: null,
      });

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        { _type: "docRef", id: "user-123" },
        {
          bio: null,
          crewName: null,
          avatarUrl: null,
          updatedAt: { _type: "serverTimestamp" },
        }
      );
    });
  });
});
