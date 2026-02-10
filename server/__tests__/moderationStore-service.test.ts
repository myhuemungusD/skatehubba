/**
 * @fileoverview Tests for moderationStore service
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB chain
const mockDbChain: any = {};
const resetDbChain = () => {
  mockDbChain.select = vi.fn().mockReturnValue(mockDbChain);
  mockDbChain.from = vi.fn().mockReturnValue(mockDbChain);
  mockDbChain.where = vi.fn().mockReturnValue(mockDbChain);
  mockDbChain.limit = vi.fn().mockReturnValue(mockDbChain);
  mockDbChain.orderBy = vi.fn().mockReturnValue(mockDbChain);
  mockDbChain.offset = vi.fn().mockReturnValue(mockDbChain);
  mockDbChain.insert = vi.fn().mockReturnValue(mockDbChain);
  mockDbChain.values = vi.fn().mockReturnValue(mockDbChain);
  mockDbChain.returning = vi.fn().mockResolvedValue([{ id: "test-id" }]);
  mockDbChain.onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  mockDbChain.update = vi.fn().mockReturnValue(mockDbChain);
  mockDbChain.set = vi.fn().mockReturnValue(mockDbChain);
  mockDbChain.for = vi.fn().mockReturnValue(mockDbChain);
  mockDbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);
};
resetDbChain();

const mockTx: any = {};
const resetTx = () => {
  mockTx.select = vi.fn().mockReturnValue(mockTx);
  mockTx.from = vi.fn().mockReturnValue(mockTx);
  mockTx.where = vi.fn().mockReturnValue(mockTx);
  mockTx.for = vi.fn().mockResolvedValue([]);
  mockTx.insert = vi.fn().mockReturnValue(mockTx);
  mockTx.values = vi.fn().mockResolvedValue(undefined);
  mockTx.update = vi.fn().mockReturnValue(mockTx);
  mockTx.set = vi.fn().mockReturnValue(mockTx);
};
resetTx();

vi.mock("../db", () => ({
  getDb: () => ({
    ...mockDbChain,
    transaction: vi.fn(async (fn: any) => fn(mockTx)),
  }),
}));

vi.mock("@shared/schema", () => ({
  moderationProfiles: { userId: "userId", trustLevel: "trustLevel" },
  moderationReports: { status: "status", createdAt: "createdAt" },
  modActions: { _table: "mod_actions" },
  moderationQuotas: { id: "id", count: "count" },
  posts: { userId: "userId", status: "status", content: "content" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  desc: vi.fn(),
  and: vi.fn(),
  count: vi.fn(),
}));

vi.mock("../services/trustSafety", () => ({
  TRUST_QUOTAS: {
    0: { checkin: 3, post: 5, report: 2 },
    1: { checkin: 10, post: 15, report: 5 },
    2: { checkin: 50, post: 50, report: 20 },
  },
}));

const {
  getModerationProfile,
  consumeQuota,
  createReport,
  listReports,
  logModAction,
  applyModerationAction,
  setProVerificationStatus,
  createPost,
  QuotaExceededError,
} = await import("../services/moderationStore");

describe("ModerationStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDbChain();
    resetTx();
  });

  describe("getModerationProfile", () => {
    it("returns default profile when user not found", async () => {
      mockDbChain.limit = vi.fn().mockResolvedValue([]);
      const profile = await getModerationProfile("user-1");
      expect(profile).toEqual({
        trustLevel: 0,
        reputationScore: 0,
        isBanned: false,
        banExpiresAt: null,
        proVerificationStatus: "none",
        isProVerified: false,
      });
    });

    it("returns profile from database row", async () => {
      mockDbChain.limit = vi.fn().mockResolvedValue([
        {
          trustLevel: 2,
          reputationScore: 100,
          isBanned: true,
          banExpiresAt: new Date("2025-12-31"),
          proVerificationStatus: "verified",
          isProVerified: true,
        },
      ]);
      const profile = await getModerationProfile("user-2");
      expect(profile.trustLevel).toBe(2);
      expect(profile.reputationScore).toBe(100);
      expect(profile.isBanned).toBe(true);
      expect(profile.proVerificationStatus).toBe("verified");
      expect(profile.isProVerified).toBe(true);
    });

    it("handles null values in row", async () => {
      mockDbChain.limit = vi.fn().mockResolvedValue([
        {
          trustLevel: null,
          reputationScore: null,
          isBanned: null,
          banExpiresAt: null,
          proVerificationStatus: null,
          isProVerified: null,
        },
      ]);
      const profile = await getModerationProfile("user-3");
      expect(profile.trustLevel).toBe(0);
      expect(profile.reputationScore).toBe(0);
      expect(profile.isBanned).toBe(false);
      expect(profile.proVerificationStatus).toBe("none");
      expect(profile.isProVerified).toBe(false);
    });
  });

  describe("consumeQuota", () => {
    it("creates new quota record when none exists", async () => {
      mockTx.for = vi.fn().mockResolvedValue([]);
      const result = await consumeQuota("user-1", "checkin" as any, 0);
      expect(result.count).toBe(1);
      expect(result.limit).toBe(3);
    });

    it("increments existing quota", async () => {
      mockTx.for = vi.fn().mockResolvedValue([{ count: 1 }]);
      mockTx.update = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });
      const result = await consumeQuota("user-1", "checkin" as any, 0);
      expect(result.count).toBe(2);
      expect(result.limit).toBe(3);
    });

    it("throws QuotaExceededError when at limit", async () => {
      mockTx.for = vi.fn().mockResolvedValue([{ count: 3 }]);
      await expect(consumeQuota("user-1", "checkin" as any, 0)).rejects.toThrow(QuotaExceededError);
    });
  });

  describe("createReport", () => {
    it("creates a report", async () => {
      mockDbChain.returning = vi.fn().mockResolvedValue([{ id: "report-1", reporterId: "user-1" }]);
      const report = await createReport({
        reporterId: "user-1",
        targetType: "post",
        targetId: "post-1",
        reason: "spam",
        notes: null,
      });
      expect(report).toEqual({ id: "report-1", reporterId: "user-1" });
    });
  });

  describe("listReports", () => {
    it("returns reports and total count", async () => {
      // Mock the Promise.all pattern
      mockDbChain.offset = vi.fn().mockResolvedValue([{ id: "r1" }]);
      mockDbChain.where = vi.fn().mockReturnValue(mockDbChain);

      const result = await listReports("pending", 1, 20);
      expect(result).toHaveProperty("reports");
      expect(result).toHaveProperty("total");
    });

    it("returns reports without status filter", async () => {
      mockDbChain.offset = vi.fn().mockResolvedValue([]);
      const result = await listReports(undefined, 1, 20);
      expect(result).toHaveProperty("reports");
    });
  });

  describe("logModAction", () => {
    it("logs an action", async () => {
      mockDbChain.returning = vi.fn().mockResolvedValue([{ id: "action-1", actionType: "warn" }]);
      const action = await logModAction({
        adminId: "admin-1",
        targetUserId: "user-1",
        actionType: "warn",
        reasonCode: "test",
        notes: null,
        reversible: true,
        expiresAt: null,
        relatedReportId: null,
      });
      expect(action).toEqual({ id: "action-1", actionType: "warn" });
    });
  });

  describe("applyModerationAction", () => {
    it("applies temp_ban action", async () => {
      mockDbChain.onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
      mockDbChain.returning = vi.fn().mockResolvedValue([{ id: "action-1" }]);
      const result = await applyModerationAction({
        adminId: "admin-1",
        targetUserId: "user-1",
        actionType: "temp_ban",
        reasonCode: "harassment",
        notes: null,
        reversible: true,
        expiresAt: new Date("2025-12-31"),
        relatedReportId: null,
      });
      expect(result).toHaveProperty("updates");
    });

    it("applies perm_ban action", async () => {
      mockDbChain.onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
      mockDbChain.returning = vi.fn().mockResolvedValue([{ id: "action-2" }]);
      const result = await applyModerationAction({
        adminId: "admin-1",
        targetUserId: "user-1",
        actionType: "perm_ban",
        reasonCode: "severe",
        notes: null,
        reversible: false,
        expiresAt: null,
        relatedReportId: null,
      });
      expect(result).toHaveProperty("updates");
    });

    it("applies verify_pro action", async () => {
      mockDbChain.onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
      mockDbChain.returning = vi.fn().mockResolvedValue([{ id: "action-3" }]);
      const result = await applyModerationAction({
        adminId: "admin-1",
        targetUserId: "user-1",
        actionType: "verify_pro",
        reasonCode: "pro_verification",
        notes: null,
        reversible: true,
        expiresAt: null,
        relatedReportId: null,
      });
      expect(result.updates).toHaveProperty("proVerificationStatus", "verified");
      expect(result.updates).toHaveProperty("isProVerified", true);
    });

    it("applies revoke_pro action", async () => {
      mockDbChain.onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
      mockDbChain.returning = vi.fn().mockResolvedValue([{ id: "action-4" }]);
      const result = await applyModerationAction({
        adminId: "admin-1",
        targetUserId: "user-1",
        actionType: "revoke_pro",
        reasonCode: "pro_verification",
        notes: null,
        reversible: true,
        expiresAt: null,
        relatedReportId: null,
      });
      expect(result.updates).toHaveProperty("proVerificationStatus", "rejected");
      expect(result.updates).toHaveProperty("isProVerified", false);
    });
  });

  describe("setProVerificationStatus", () => {
    it("sets verified status", async () => {
      mockDbChain.onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
      mockDbChain.returning = vi.fn().mockResolvedValue([{ id: "action-5" }]);
      const result = await setProVerificationStatus({
        adminId: "admin-1",
        userId: "user-1",
        status: "verified" as any,
        evidence: ["url1"],
        notes: "Verified",
      });
      expect(result).toHaveProperty("id");
    });

    it("sets rejected status", async () => {
      mockDbChain.onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
      mockDbChain.returning = vi.fn().mockResolvedValue([{ id: "action-6" }]);
      const result = await setProVerificationStatus({
        adminId: "admin-1",
        userId: "user-1",
        status: "rejected" as any,
        evidence: [],
        notes: null,
      });
      expect(result).toHaveProperty("id");
    });
  });

  describe("createPost", () => {
    it("creates a post", async () => {
      mockDbChain.returning = vi
        .fn()
        .mockResolvedValue([{ id: "post-1", userId: "user-1", status: "active" }]);
      const post = await createPost("user-1", { text: "Test" });
      expect(post).toEqual({ id: "post-1", userId: "user-1", status: "active" });
    });
  });

  describe("QuotaExceededError", () => {
    it("has correct name and message", () => {
      const err = new QuotaExceededError();
      expect(err.name).toBe("QuotaExceededError");
      expect(err.message).toBe("QUOTA_EXCEEDED");
    });

    it("accepts custom message", () => {
      const err = new QuotaExceededError("Custom message");
      expect(err.message).toBe("Custom message");
    });
  });
});
