import { describe, it, expect, vi, beforeEach } from "vitest";
import { requirePaidOrPro } from "./requirePaidOrPro";
import type { Request, Response, NextFunction } from "express";

function createMockReqRes(user?: any) {
  const req = {
    currentUser: user,
  } as Request;

  const jsonFn = vi.fn().mockReturnThis();
  const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
  const res = { status: statusFn, json: jsonFn } as unknown as Response;
  const next = vi.fn() as NextFunction;

  return { req, res, next, statusFn, jsonFn };
}

describe("requirePaidOrPro middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("unauthenticated requests", () => {
    it("returns 401 when no user is present", () => {
      const { req, res, next, statusFn, jsonFn } = createMockReqRes();

      requirePaidOrPro(req, res, next);

      expect(statusFn).toHaveBeenCalledWith(401);
      expect(jsonFn).toHaveBeenCalledWith({ error: "Authentication required" });
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 401 when currentUser is undefined", () => {
      const { req, res, next, statusFn, jsonFn } = createMockReqRes(undefined);

      requirePaidOrPro(req, res, next);

      expect(statusFn).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 401 when currentUser is null", () => {
      const { req, res, next, statusFn, jsonFn } = createMockReqRes(null);

      requirePaidOrPro(req, res, next);

      expect(statusFn).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("free tier users", () => {
    it("returns 403 for free tier user", () => {
      const user = { id: "user1", accountTier: "free" };
      const { req, res, next, statusFn, jsonFn } = createMockReqRes(user);

      requirePaidOrPro(req, res, next);

      expect(statusFn).toHaveBeenCalledWith(403);
      expect(jsonFn).toHaveBeenCalledWith({
        error: "Upgrade required",
        code: "UPGRADE_REQUIRED",
        message: "This feature requires a Pro or Premium account.",
        currentTier: "free",
        upgradeOptions: {
          premium: {
            price: 9.99,
            description: "One-time purchase. All features for life.",
          },
          pro: {
            description: "Get awarded Pro status by an existing Pro user.",
          },
        },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("includes upgrade options in response for free tier", () => {
      const user = { id: "user1", accountTier: "free" };
      const { req, res, next, jsonFn } = createMockReqRes(user);

      requirePaidOrPro(req, res, next);

      const callArgs = jsonFn.mock.calls[0][0];
      expect(callArgs.upgradeOptions).toBeDefined();
      expect(callArgs.upgradeOptions.premium.price).toBe(9.99);
      expect(callArgs.upgradeOptions.pro).toBeDefined();
    });
  });

  describe("pro tier users", () => {
    it("allows pro tier user to proceed", () => {
      const user = { id: "user1", accountTier: "pro" };
      const { req, res, next, statusFn } = createMockReqRes(user);

      requirePaidOrPro(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(statusFn).not.toHaveBeenCalled();
    });
  });

  describe("premium tier users", () => {
    it("allows premium tier user to proceed", () => {
      const user = { id: "user1", accountTier: "premium" };
      const { req, res, next, statusFn } = createMockReqRes(user);

      requirePaidOrPro(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(statusFn).not.toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("rejects user with invalid tier value", () => {
      const user = { id: "user1", accountTier: "invalid" };
      const { req, res, next, statusFn } = createMockReqRes(user);

      requirePaidOrPro(req, res, next);

      expect(statusFn).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("rejects user with missing accountTier", () => {
      const user = { id: "user1" };
      const { req, res, next, statusFn } = createMockReqRes(user);

      requirePaidOrPro(req, res, next);

      expect(statusFn).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("rejects user with empty string tier", () => {
      const user = { id: "user1", accountTier: "" };
      const { req, res, next, statusFn } = createMockReqRes(user);

      requirePaidOrPro(req, res, next);

      expect(statusFn).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
