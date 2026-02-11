/**
 * @fileoverview Unit tests for moderation routes
 *
 * Tests:
 * - POST /report
 * - GET /admin/reports
 * - POST /admin/mod-action
 * - POST /admin/pro-verify
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const mockCreateReport = vi.fn();
const mockListReports = vi.fn();
const mockApplyModerationAction = vi.fn();
const mockSetProVerificationStatus = vi.fn();

vi.mock("../services/moderationStore", () => ({
  createReport: (...args: any[]) => mockCreateReport(...args),
  listReports: (...args: any[]) => mockListReports(...args),
  applyModerationAction: (...args: any[]) => mockApplyModerationAction(...args),
  setProVerificationStatus: (...args: any[]) => mockSetProVerificationStatus(...args),
}));

vi.mock("../auth/middleware", () => ({
  authenticateUser: (req: any, _res: any, next: any) => {
    req.currentUser = req.currentUser || { id: "user-1", roles: [] };
    next();
  },
  requireAdmin: (req: any, res: any, next: any) => {
    if (!req.currentUser?.roles?.includes("admin")) {
      return res.status(403).json({ error: "ADMIN_REQUIRED" });
    }
    next();
  },
}));

vi.mock("../middleware/trustSafety", () => ({
  enforceTrustAction: () => (_req: any, _res: any, next: any) => next(),
  enforceAdminRateLimit: () => (_req: any, _res: any, next: any) => next(),
  enforceNotBanned: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../config/constants", () => ({
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
}));

vi.mock("../utils/apiError", () => ({
  Errors: {
    validation: (res: any, issues: any, code: string, msg: string) =>
      res.status(400).json({ error: code, message: msg, details: { issues } }),
    unauthorized: (res: any) => res.status(401).json({ error: "UNAUTHORIZED" }),
    forbidden: (res: any) => res.status(403).json({ error: "FORBIDDEN" }),
  },
}));

// Capture route handlers
const routeHandlers: Record<string, any[]> = {};

vi.mock("express", () => ({
  Router: () => ({
    post: vi.fn((path: string, ...handlers: any[]) => {
      routeHandlers[`POST ${path}`] = handlers;
    }),
    get: vi.fn((path: string, ...handlers: any[]) => {
      routeHandlers[`GET ${path}`] = handlers;
    }),
    put: vi.fn(),
    delete: vi.fn(),
    use: vi.fn(),
  }),
}));

await import("../routes/moderation");

// ============================================================================
// Helpers
// ============================================================================

function createReq(overrides: any = {}) {
  return {
    currentUser: { id: "user-1", roles: [] },
    body: {},
    query: {},
    ...overrides,
  };
}

function createRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

async function callHandler(routeKey: string, req: any, res: any) {
  const handlers = routeHandlers[routeKey];
  if (!handlers) throw new Error(`Route ${routeKey} not registered`);
  for (const handler of handlers) {
    await handler(req, res, () => {});
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("Moderation Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateReport.mockResolvedValue({ id: "report-1" });
    mockListReports.mockResolvedValue({ reports: [], total: 0 });
    mockApplyModerationAction.mockResolvedValue({ id: "action-1" });
    mockSetProVerificationStatus.mockResolvedValue({ id: "action-2" });
  });

  describe("POST /report", () => {
    it("should create a report with valid data", async () => {
      const req = createReq({
        body: {
          targetType: "user",
          targetId: "target-1",
          reason: "spam content",
        },
      });
      const res = createRes();
      await callHandler("POST /report", req, res);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ reportId: "report-1" });
      expect(mockCreateReport).toHaveBeenCalledWith(
        expect.objectContaining({
          reporterId: "user-1",
          targetType: "user",
          targetId: "target-1",
          reason: "spam content",
        })
      );
    });

    it("should reject report with reason < 3 chars", async () => {
      const req = createReq({
        body: { targetType: "user", targetId: "t-1", reason: "ab" },
      });
      const res = createRes();
      await callHandler("POST /report", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should reject report with invalid targetType", async () => {
      const req = createReq({
        body: { targetType: "invalid", targetId: "t-1", reason: "spam" },
      });
      const res = createRes();
      await callHandler("POST /report", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 401 when no currentUser id", async () => {
      const req = createReq({
        currentUser: {},
        body: { targetType: "user", targetId: "t-1", reason: "spam content" },
      });
      const res = createRes();
      await callHandler("POST /report", req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should include optional notes", async () => {
      const req = createReq({
        body: {
          targetType: "post",
          targetId: "post-1",
          reason: "spam content",
          notes: "Posting promotional links repeatedly",
        },
      });
      const res = createRes();
      await callHandler("POST /report", req, res);
      expect(mockCreateReport).toHaveBeenCalledWith(
        expect.objectContaining({
          notes: "Posting promotional links repeatedly",
        })
      );
    });
  });

  describe("GET /admin/reports", () => {
    it("should list reports for admin users", async () => {
      const reports = [{ id: "r-1" }, { id: "r-2" }];
      mockListReports.mockResolvedValue({ reports, total: 2 });
      const req = createReq({
        currentUser: { id: "admin-1", roles: ["admin"] },
        query: {},
      });
      const res = createRes();
      await callHandler("GET /admin/reports", req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        reports,
        total: 2,
        page: 1,
        limit: 20,
      });
    });

    it("should reject non-admin users", async () => {
      const req = createReq({ query: {} });
      const res = createRes();
      await callHandler("GET /admin/reports", req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should support status filter and pagination", async () => {
      mockListReports.mockResolvedValue({ reports: [], total: 0 });
      const req = createReq({
        currentUser: { id: "admin-1", roles: ["admin"] },
        query: { status: "pending", page: "2", limit: "10" },
      });
      const res = createRes();
      await callHandler("GET /admin/reports", req, res);
      expect(mockListReports).toHaveBeenCalledWith("pending", 2, 10);
    });

    it("should clamp limit to MAX_PAGE_SIZE", async () => {
      mockListReports.mockResolvedValue({ reports: [], total: 0 });
      const req = createReq({
        currentUser: { id: "admin-1", roles: ["admin"] },
        query: { limit: "999" },
      });
      const res = createRes();
      await callHandler("GET /admin/reports", req, res);
      expect(mockListReports).toHaveBeenCalledWith(undefined, 1, 50);
    });
  });

  describe("POST /admin/mod-action", () => {
    it("should apply moderation action for admin", async () => {
      const req = createReq({
        currentUser: { id: "admin-1", roles: ["admin"] },
        body: {
          targetUserId: "user-2",
          actionType: "warn",
          reasonCode: "spam_violation",
        },
      });
      const res = createRes();
      await callHandler("POST /admin/mod-action", req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ modActionId: "action-1" });
    });

    it("should reject non-admin users", async () => {
      const req = createReq({
        body: {
          targetUserId: "user-2",
          actionType: "warn",
          reasonCode: "test",
        },
      });
      const res = createRes();
      await callHandler("POST /admin/mod-action", req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should reject invalid action type", async () => {
      const req = createReq({
        currentUser: { id: "admin-1", roles: ["admin"] },
        body: {
          targetUserId: "user-2",
          actionType: "invalid_action",
          reasonCode: "test",
        },
      });
      const res = createRes();
      await callHandler("POST /admin/mod-action", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should pass optional fields correctly", async () => {
      const req = createReq({
        currentUser: { id: "admin-1", roles: ["admin"] },
        body: {
          targetUserId: "user-2",
          actionType: "temp_ban",
          reasonCode: "harassment",
          notes: "Multiple reports",
          reversible: true,
          expiresAt: "2025-06-01T00:00:00Z",
          relatedReportId: "report-1",
        },
      });
      const res = createRes();
      await callHandler("POST /admin/mod-action", req, res);
      expect(mockApplyModerationAction).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: "admin-1",
          targetUserId: "user-2",
          actionType: "temp_ban",
          notes: "Multiple reports",
          reversible: true,
        })
      );
    });
  });

  describe("POST /admin/pro-verify", () => {
    it("should set pro verification status for admin", async () => {
      const req = createReq({
        currentUser: { id: "admin-1", roles: ["admin"] },
        body: {
          userId: "user-3",
          status: "verified",
          evidence: ["instagram link", "sponsor confirmation"],
        },
      });
      const res = createRes();
      await callHandler("POST /admin/pro-verify", req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ modActionId: "action-2" });
    });

    it("should reject non-admin", async () => {
      const req = createReq({
        body: { userId: "u-1", status: "verified", evidence: [] },
      });
      const res = createRes();
      await callHandler("POST /admin/pro-verify", req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should reject invalid status", async () => {
      const req = createReq({
        currentUser: { id: "admin-1", roles: ["admin"] },
        body: { userId: "u-1", status: "invalid_status" },
      });
      const res = createRes();
      await callHandler("POST /admin/pro-verify", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
