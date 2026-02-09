/**
 * Production-level integration tests for requirePaidOrPro Middleware
 */

import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { requirePaidOrPro } from "../requirePaidOrPro";
import type { Request, Response, NextFunction } from "express";

describe("requirePaidOrPro Middleware Integration", () => {
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
      currentUser: undefined,
    };

    mockRes = {
      status: statusMock,
      json: jsonMock,
    };

    nextFn = vi.fn();
  });

  describe("Authentication Required", () => {
    it("should reject unauthenticated requests", () => {
      mockReq.currentUser = undefined;

      requirePaidOrPro(mockReq as Request, mockRes as Response, nextFn);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: "Authentication required",
      });
      expect(nextFn).not.toHaveBeenCalled();
    });

    it("should not call next() for unauthenticated users", () => {
      mockReq.currentUser = undefined;

      requirePaidOrPro(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).not.toHaveBeenCalled();
    });
  });

  describe("Pro Tier Access", () => {
    it("should allow pro tier users", () => {
      mockReq.currentUser = {
        id: "user-123",
        accountTier: "pro",
      } as any;

      requirePaidOrPro(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it("should not send error response for pro users", () => {
      mockReq.currentUser = {
        id: "user-456",
        accountTier: "pro",
      } as any;

      requirePaidOrPro(mockReq as Request, mockRes as Response, nextFn);

      expect(jsonMock).not.toHaveBeenCalled();
    });
  });

  describe("Premium Tier Access", () => {
    it("should allow premium tier users", () => {
      mockReq.currentUser = {
        id: "user-789",
        accountTier: "premium",
      } as any;

      requirePaidOrPro(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it("should not send error response for premium users", () => {
      mockReq.currentUser = {
        id: "user-abc",
        accountTier: "premium",
      } as any;

      requirePaidOrPro(mockReq as Request, mockRes as Response, nextFn);

      expect(jsonMock).not.toHaveBeenCalled();
    });
  });

  describe("Free Tier Rejection", () => {
    it("should reject free tier users with 403", () => {
      mockReq.currentUser = {
        id: "user-free",
        accountTier: "free",
      } as any;

      requirePaidOrPro(mockReq as Request, mockRes as Response, nextFn);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(nextFn).not.toHaveBeenCalled();
    });

    it("should include upgrade required error", () => {
      mockReq.currentUser = {
        id: "user-free",
        accountTier: "free",
      } as any;

      requirePaidOrPro(mockReq as Request, mockRes as Response, nextFn);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Upgrade required",
          code: "UPGRADE_REQUIRED",
        })
      );
    });

    it("should include helpful upgrade message", () => {
      mockReq.currentUser = {
        id: "user-free",
        accountTier: "free",
      } as any;

      requirePaidOrPro(mockReq as Request, mockRes as Response, nextFn);

      const response = jsonMock.mock.calls[0][0];
      expect(response.message).toBe("This feature requires a Pro or Premium account.");
    });

    it("should indicate current tier is free", () => {
      mockReq.currentUser = {
        id: "user-free",
        accountTier: "free",
      } as any;

      requirePaidOrPro(mockReq as Request, mockRes as Response, nextFn);

      const response = jsonMock.mock.calls[0][0];
      expect(response.currentTier).toBe("free");
    });
  });

  describe("Upgrade Options", () => {
    it("should include premium upgrade option", () => {
      mockReq.currentUser = {
        id: "user-free",
        accountTier: "free",
      } as any;

      requirePaidOrPro(mockReq as Request, mockRes as Response, nextFn);

      const response = jsonMock.mock.calls[0][0];
      expect(response.upgradeOptions).toHaveProperty("premium");
    });

    it("should show premium pricing", () => {
      mockReq.currentUser = {
        id: "user-free",
        accountTier: "free",
      } as any;

      requirePaidOrPro(mockReq as Request, mockRes as Response, nextFn);

      const response = jsonMock.mock.calls[0][0];
      expect(response.upgradeOptions.premium.price).toBe(9.99);
    });

    it("should describe premium as one-time purchase", () => {
      mockReq.currentUser = {
        id: "user-free",
        accountTier: "free",
      } as any;

      requirePaidOrPro(mockReq as Request, mockRes as Response, nextFn);

      const response = jsonMock.mock.calls[0][0];
      expect(response.upgradeOptions.premium.description).toContain("One-time purchase");
      expect(response.upgradeOptions.premium.description).toContain("All features for life");
    });

    it("should include pro upgrade option", () => {
      mockReq.currentUser = {
        id: "user-free",
        accountTier: "free",
      } as any;

      requirePaidOrPro(mockReq as Request, mockRes as Response, nextFn);

      const response = jsonMock.mock.calls[0][0];
      expect(response.upgradeOptions).toHaveProperty("pro");
    });

    it("should explain pro tier acquisition", () => {
      mockReq.currentUser = {
        id: "user-free",
        accountTier: "free",
      } as any;

      requirePaidOrPro(mockReq as Request, mockRes as Response, nextFn);

      const response = jsonMock.mock.calls[0][0];
      expect(response.upgradeOptions.pro.description).toContain("Get awarded Pro status");
    });
  });

  describe("Tier Validation", () => {
    it("should handle undefined tier as free", () => {
      mockReq.currentUser = {
        id: "user-no-tier",
        accountTier: undefined,
      } as any;

      requirePaidOrPro(mockReq as Request, mockRes as Response, nextFn);

      expect(statusMock).toHaveBeenCalledWith(403);
    });

    it("should handle null tier as free", () => {
      mockReq.currentUser = {
        id: "user-null-tier",
        accountTier: null,
      } as any;

      requirePaidOrPro(mockReq as Request, mockRes as Response, nextFn);

      expect(statusMock).toHaveBeenCalledWith(403);
    });

    it("should handle invalid tier as free", () => {
      mockReq.currentUser = {
        id: "user-invalid",
        accountTier: "invalid-tier",
      } as any;

      requirePaidOrPro(mockReq as Request, mockRes as Response, nextFn);

      expect(statusMock).toHaveBeenCalledWith(403);
    });
  });

  describe("Response Structure", () => {
    it("should return valid JSON structure", () => {
      mockReq.currentUser = {
        id: "user-free",
        accountTier: "free",
      } as any;

      requirePaidOrPro(mockReq as Request, mockRes as Response, nextFn);

      const response = jsonMock.mock.calls[0][0];
      expect(response).toHaveProperty("error");
      expect(response).toHaveProperty("code");
      expect(response).toHaveProperty("message");
      expect(response).toHaveProperty("currentTier");
      expect(response).toHaveProperty("upgradeOptions");
    });

    it("should have structured upgrade options", () => {
      mockReq.currentUser = {
        id: "user-free",
        accountTier: "free",
      } as any;

      requirePaidOrPro(mockReq as Request, mockRes as Response, nextFn);

      const response = jsonMock.mock.calls[0][0];
      expect(response.upgradeOptions).toHaveProperty("premium");
      expect(response.upgradeOptions).toHaveProperty("pro");
      expect(response.upgradeOptions.premium).toHaveProperty("price");
      expect(response.upgradeOptions.premium).toHaveProperty("description");
      expect(response.upgradeOptions.pro).toHaveProperty("description");
    });
  });

  describe("Middleware Ordering", () => {
    it("should require authenticateUser to be called first", () => {
      // If currentUser is not set, middleware rejects
      mockReq.currentUser = undefined;

      requirePaidOrPro(mockReq as Request, mockRes as Response, nextFn);

      expect(statusMock).toHaveBeenCalledWith(401);
    });
  });

  describe("Edge Cases", () => {
    it("should handle case-sensitive tier names", () => {
      mockReq.currentUser = {
        id: "user-case",
        accountTier: "Pro", // Wrong case
      } as any;

      requirePaidOrPro(mockReq as Request, mockRes as Response, nextFn);

      // Should reject because it expects lowercase "pro"
      expect(statusMock).toHaveBeenCalledWith(403);
    });

    it("should only accept exact tier names", () => {
      const validTiers = ["pro", "premium"];

      validTiers.forEach((tier) => {
        vi.clearAllMocks();
        mockReq.currentUser = {
          id: `user-${tier}`,
          accountTier: tier,
        } as any;

        requirePaidOrPro(mockReq as Request, mockRes as Response, nextFn);

        expect(nextFn).toHaveBeenCalled();
      });
    });

    it("should reject trial or other tiers", () => {
      const invalidTiers = ["trial", "basic", "starter", "enterprise"];

      invalidTiers.forEach((tier) => {
        vi.clearAllMocks();
        mockReq.currentUser = {
          id: `user-${tier}`,
          accountTier: tier,
        } as any;

        requirePaidOrPro(mockReq as Request, mockRes as Response, nextFn);

        expect(statusMock).toHaveBeenCalledWith(403);
        expect(nextFn).not.toHaveBeenCalled();
      });
    });
  });

  describe("Return Values", () => {
    it("should return void for authenticated paid users", () => {
      mockReq.currentUser = {
        id: "user-pro",
        accountTier: "pro",
      } as any;

      const result = requirePaidOrPro(mockReq as Request, mockRes as Response, nextFn);

      expect(result).toBeUndefined();
    });

    it("should not call next() for rejected users", () => {
      mockReq.currentUser = {
        id: "user-free",
        accountTier: "free",
      } as any;

      requirePaidOrPro(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).not.toHaveBeenCalled();
    });
  });
});
