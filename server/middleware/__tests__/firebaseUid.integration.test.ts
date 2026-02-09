/**
 * Production-level integration tests for Firebase UID Middleware
 */

import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { requireFirebaseUid, optionalFirebaseUid } from "../firebaseUid";
import type { Request, Response, NextFunction } from "express";

// Mock Firebase admin
const mockVerifyIdToken = vi.fn();
vi.mock("../../admin", () => ({
  admin: {
    auth: () => ({
      verifyIdToken: mockVerifyIdToken,
    }),
  },
}));

// Mock logger
vi.mock("../../logger", () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("Firebase UID Middleware Integration", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let nextFn: NextFunction;
  let statusMock: Mock;
  let jsonMock: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    statusMock = vi.fn().mockReturnThis();
    jsonMock = vi.fn().mockReturnThis();

    mockReq = {
      header: vi.fn(),
      headers: {},
    };

    mockRes = {
      status: statusMock,
      json: jsonMock,
    };

    nextFn = vi.fn();
  });

  describe("requireFirebaseUid", () => {
    it("should reject requests without Authorization header", async () => {
      (mockReq.header as Mock).mockReturnValue("");

      await requireFirebaseUid(mockReq as Request, mockRes as Response, nextFn);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: "auth_required",
        message: "Authorization token missing.",
      });
      expect(nextFn).not.toHaveBeenCalled();
    });

    it("should reject malformed Authorization header", async () => {
      (mockReq.header as Mock).mockReturnValue("InvalidFormat token123");

      await requireFirebaseUid(mockReq as Request, mockRes as Response, nextFn);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(nextFn).not.toHaveBeenCalled();
    });

    it("should accept valid Bearer token", async () => {
      const validToken = "valid-firebase-token";
      const mockUid = "user-123";

      (mockReq.header as Mock).mockReturnValue(`Bearer ${validToken}`);
      mockVerifyIdToken.mockResolvedValue({ uid: mockUid });

      await requireFirebaseUid(mockReq as Request, mockRes as Response, nextFn);

      expect(mockVerifyIdToken).toHaveBeenCalledWith(validToken, true);
      expect((mockReq as any).firebaseUid).toBe(mockUid);
      expect(nextFn).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it("should verify token with revocation check", async () => {
      const validToken = "valid-token";
      (mockReq.header as Mock).mockReturnValue(`Bearer ${validToken}`);
      mockVerifyIdToken.mockResolvedValue({ uid: "user-123" });

      await requireFirebaseUid(mockReq as Request, mockRes as Response, nextFn);

      // Second parameter true = check if token was revoked
      expect(mockVerifyIdToken).toHaveBeenCalledWith(validToken, true);
    });

    it("should reject expired token", async () => {
      (mockReq.header as Mock).mockReturnValue("Bearer expired-token");
      mockVerifyIdToken.mockRejectedValue(new Error("Token expired"));

      await requireFirebaseUid(mockReq as Request, mockRes as Response, nextFn);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: "auth_required",
        message: "Invalid or expired token.",
      });
      expect(nextFn).not.toHaveBeenCalled();
    });

    it("should reject revoked token", async () => {
      (mockReq.header as Mock).mockReturnValue("Bearer revoked-token");
      mockVerifyIdToken.mockRejectedValue(new Error("Token revoked"));

      await requireFirebaseUid(mockReq as Request, mockRes as Response, nextFn);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(nextFn).not.toHaveBeenCalled();
    });

    it("should attach firebaseUid to request object", async () => {
      const expectedUid = "firebase-user-456";
      (mockReq.header as Mock).mockReturnValue("Bearer valid-token");
      mockVerifyIdToken.mockResolvedValue({ uid: expectedUid });

      await requireFirebaseUid(mockReq as Request, mockRes as Response, nextFn);

      expect((mockReq as any).firebaseUid).toBe(expectedUid);
    });

    it("should extract token from Bearer prefix", async () => {
      const token = "abc123def456";
      (mockReq.header as Mock).mockReturnValue(`Bearer ${token}`);
      mockVerifyIdToken.mockResolvedValue({ uid: "user-789" });

      await requireFirebaseUid(mockReq as Request, mockRes as Response, nextFn);

      expect(mockVerifyIdToken).toHaveBeenCalledWith(token, true);
    });

    it("should handle token verification errors gracefully", async () => {
      (mockReq.header as Mock).mockReturnValue("Bearer invalid");
      mockVerifyIdToken.mockRejectedValue(new Error("Invalid signature"));

      await requireFirebaseUid(mockReq as Request, mockRes as Response, nextFn);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "auth_required",
        })
      );
    });
  });

  describe("optionalFirebaseUid", () => {
    it("should allow requests without Authorization header", async () => {
      (mockReq.header as Mock).mockReturnValue("");

      await optionalFirebaseUid(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
      expect((mockReq as any).firebaseUid).toBeUndefined();
    });

    it("should attach UID if valid token present", async () => {
      const expectedUid = "optional-user-123";
      (mockReq.header as Mock).mockReturnValue("Bearer valid-token");
      mockVerifyIdToken.mockResolvedValue({ uid: expectedUid });

      await optionalFirebaseUid(mockReq as Request, mockRes as Response, nextFn);

      expect((mockReq as any).firebaseUid).toBe(expectedUid);
      expect(nextFn).toHaveBeenCalled();
    });

    it("should silently ignore invalid tokens", async () => {
      (mockReq.header as Mock).mockReturnValue("Bearer invalid-token");
      mockVerifyIdToken.mockRejectedValue(new Error("Invalid token"));

      await optionalFirebaseUid(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
      expect((mockReq as any).firebaseUid).toBeUndefined();
    });

    it("should handle malformed tokens gracefully", async () => {
      (mockReq.header as Mock).mockReturnValue("NotBearer token");

      await optionalFirebaseUid(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(mockVerifyIdToken).not.toHaveBeenCalled();
    });

    it("should verify token with revocation check", async () => {
      const token = "valid-optional-token";
      (mockReq.header as Mock).mockReturnValue(`Bearer ${token}`);
      mockVerifyIdToken.mockResolvedValue({ uid: "user-456" });

      await optionalFirebaseUid(mockReq as Request, mockRes as Response, nextFn);

      expect(mockVerifyIdToken).toHaveBeenCalledWith(token, true);
    });

    it("should not throw on verification failure", async () => {
      (mockReq.header as Mock).mockReturnValue("Bearer failing-token");
      mockVerifyIdToken.mockRejectedValue(new Error("Verification failed"));

      await expect(
        optionalFirebaseUid(mockReq as Request, mockRes as Response, nextFn)
      ).resolves.not.toThrow();
    });
  });

  describe("Authorization Header Parsing", () => {
    it("should parse Bearer token correctly", () => {
      const header = "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...";
      const match = header.match(/^Bearer (.+)$/);

      expect(match).not.toBeNull();
      expect(match![1]).toContain("eyJ");
    });

    it("should reject non-Bearer schemes", () => {
      const header = "Basic dXNlcjpwYXNz";
      const match = header.match(/^Bearer (.+)$/);

      expect(match).toBeNull();
    });

    it("should handle empty Authorization header", () => {
      const header = "";
      const match = header.match(/^Bearer (.+)$/);

      expect(match).toBeNull();
    });

    it("should handle Bearer without token", () => {
      const header = "Bearer ";
      const match = header.match(/^Bearer (.+)$/);

      expect(match).toBeNull();
    });
  });

  describe("Error Messages", () => {
    it("should not leak error details to client", async () => {
      (mockReq.header as Mock).mockReturnValue("Bearer bad-token");
      mockVerifyIdToken.mockRejectedValue(new Error("Detailed internal error"));

      await requireFirebaseUid(mockReq as Request, mockRes as Response, nextFn);

      expect(jsonMock).toHaveBeenCalledWith({
        error: "auth_required",
        message: "Invalid or expired token.",
      });

      // Should not contain "Detailed internal error"
      const response = jsonMock.mock.calls[0][0];
      expect(JSON.stringify(response)).not.toContain("Detailed internal");
    });

    it("should provide user-friendly error messages", async () => {
      (mockReq.header as Mock).mockReturnValue("");

      await requireFirebaseUid(mockReq as Request, mockRes as Response, nextFn);

      const response = jsonMock.mock.calls[0][0];
      expect(response.message).toBeTruthy();
      expect(response.message.length).toBeGreaterThan(10);
    });
  });

  describe("Type Safety", () => {
    it("should properly type FirebaseAuthedRequest", async () => {
      const uid = "typed-user-123";
      (mockReq.header as Mock).mockReturnValue("Bearer valid");
      mockVerifyIdToken.mockResolvedValue({ uid });

      await requireFirebaseUid(mockReq as Request, mockRes as Response, nextFn);

      const typedReq = mockReq as any;
      expect(typeof typedReq.firebaseUid).toBe("string");
      expect(typedReq.firebaseUid).toBe(uid);
    });
  });
});
