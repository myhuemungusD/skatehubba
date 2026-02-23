/**
 * @fileoverview Unit tests for filmer request routes
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const mockCreateFilmerRequest = vi.fn();
const mockRespondToFilmerRequest = vi.fn();
const mockListFilmerRequests = vi.fn();

vi.mock("../../services/filmerRequests", () => {
  class FilmerRequestError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
      this.name = "FilmerRequestError";
    }
  }
  return {
    createFilmerRequest: (...args: any[]) => mockCreateFilmerRequest(...args),
    respondToFilmerRequest: (...args: any[]) => mockRespondToFilmerRequest(...args),
    listFilmerRequests: (...args: any[]) => mockListFilmerRequests(...args),
    FilmerRequestError,
  };
});

vi.mock("@shared/validation/filmer", () => ({
  FilmerRequestInput: {
    safeParse: (body: any) => {
      if (!body?.checkInId || !body?.filmerUid)
        return { success: false, error: { flatten: () => ({}) } };
      return { success: true, data: body };
    },
  },
  FilmerRespondInput: {
    safeParse: (body: any) => {
      if (!body?.requestId || !body?.action)
        return { success: false, error: { flatten: () => ({}) } };
      return { success: true, data: body };
    },
  },
  FilmerRequestsQuery: {
    safeParse: (query: any) => {
      return {
        success: true,
        data: { status: query.status, role: query.role, limit: query.limit },
      };
    },
  },
}));

vi.mock("../../auth/audit", () => ({
  getClientIP: () => "127.0.0.1",
}));

const { handleFilmerRequest, handleFilmerRespond, handleFilmerRequestsList } =
  await import("../../routes/filmer");

// ============================================================================
// Helpers
// ============================================================================

function createReq(overrides: any = {}) {
  return {
    currentUser: { id: "user-1", trustLevel: 1, isActive: true },
    body: {},
    query: {},
    get: vi.fn().mockReturnValue(undefined),
    headers: {},
    ...overrides,
  };
}

function createRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

// ============================================================================
// Tests
// ============================================================================

describe("Filmer Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("handleFilmerRequest", () => {
    it("should return 401 when not authenticated", async () => {
      const req = createReq({ currentUser: null });
      const res = createRes();
      await handleFilmerRequest(req as any, res as any);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return 400 for invalid input", async () => {
      const req = createReq({ body: {} });
      const res = createRes();
      await handleFilmerRequest(req as any, res as any);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should create filmer request with 201", async () => {
      mockCreateFilmerRequest.mockResolvedValue({ id: "req-1", alreadyExists: false });
      const req = createReq({
        body: { checkInId: "123", filmerUid: "filmer-1" },
      });
      const res = createRes();
      await handleFilmerRequest(req as any, res as any);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("should return 200 when request already exists", async () => {
      mockCreateFilmerRequest.mockResolvedValue({ id: "req-1", alreadyExists: true });
      const req = createReq({
        body: { checkInId: "123", filmerUid: "filmer-1" },
      });
      const res = createRes();
      await handleFilmerRequest(req as any, res as any);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should handle FilmerRequestError", async () => {
      const { FilmerRequestError } = await import("../../services/filmerRequests");
      mockCreateFilmerRequest.mockRejectedValue(
        new FilmerRequestError("INVALID_CHECKIN", "Invalid check-in", 400)
      );
      const req = createReq({
        body: { checkInId: "999", filmerUid: "filmer-1" },
      });
      const res = createRes();
      await handleFilmerRequest(req as any, res as any);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should handle unexpected errors with 500", async () => {
      mockCreateFilmerRequest.mockRejectedValue(new Error("Unexpected"));
      const req = createReq({
        body: { checkInId: "123", filmerUid: "filmer-1" },
      });
      const res = createRes();
      await handleFilmerRequest(req as any, res as any);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it("should pass device ID from header", async () => {
      mockCreateFilmerRequest.mockResolvedValue({ id: "req-1", alreadyExists: false });
      const req = createReq({
        body: { checkInId: "123", filmerUid: "filmer-1" },
        get: vi.fn((header: string) => {
          if (header === "x-device-id") return "device-abc";
          if (header === "user-agent") return "TestAgent/1.0";
          return undefined;
        }),
      });
      const res = createRes();
      await handleFilmerRequest(req as any, res as any);
      expect(mockCreateFilmerRequest).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: "device-abc", userAgent: "TestAgent/1.0" })
      );
    });
  });

  describe("handleFilmerRespond", () => {
    it("should return 401 when not authenticated", async () => {
      const req = createReq({ currentUser: null });
      const res = createRes();
      await handleFilmerRespond(req as any, res as any);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return 400 for invalid input", async () => {
      const req = createReq({ body: {} });
      const res = createRes();
      await handleFilmerRespond(req as any, res as any);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should respond to request with 200", async () => {
      mockRespondToFilmerRequest.mockResolvedValue({ success: true });
      const req = createReq({
        body: { requestId: "req-1", action: "accept" },
      });
      const res = createRes();
      await handleFilmerRespond(req as any, res as any);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("handleFilmerRequestsList", () => {
    it("should return 401 when not authenticated", async () => {
      const req = createReq({ currentUser: null });
      const res = createRes();
      await handleFilmerRequestsList(req as any, res as any);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should list requests with 200", async () => {
      const requests = [{ id: "req-1" }, { id: "req-2" }];
      mockListFilmerRequests.mockResolvedValue(requests);
      const req = createReq({ query: { status: "pending" } });
      const res = createRes();
      await handleFilmerRequestsList(req as any, res as any);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ requests });
    });

    it("should handle errors", async () => {
      mockListFilmerRequests.mockRejectedValue(new Error("DB error"));
      const req = createReq({ query: {} });
      const res = createRes();
      await handleFilmerRequestsList(req as any, res as any);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
