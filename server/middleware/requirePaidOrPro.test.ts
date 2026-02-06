import { describe, it, expect, vi } from "vitest";
import { requirePaidOrPro } from "./requirePaidOrPro";
import type { Request, Response } from "express";

function createMockReqRes(currentUser?: any) {
  const req = {
    currentUser,
  } as any as Request;

  const jsonFn = vi.fn().mockReturnThis();
  const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
  const res = { status: statusFn, json: jsonFn } as any as Response;
  const next = vi.fn();

  return { req, res, next, statusFn, jsonFn };
}

describe("requirePaidOrPro middleware", () => {
  it("returns 401 if user is not authenticated", () => {
    const { req, res, next, statusFn, jsonFn } = createMockReqRes(undefined);

    requirePaidOrPro(req, res, next);

    expect(statusFn).toHaveBeenCalledWith(401);
    expect(jsonFn).toHaveBeenCalledWith({ error: "Authentication required" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 with upgrade info for free-tier users", () => {
    const { req, res, next, statusFn, jsonFn } = createMockReqRes({
      id: "user123",
      accountTier: "free",
    });

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

  it("allows pro-tier users to proceed", () => {
    const { req, res, next, statusFn, jsonFn } = createMockReqRes({
      id: "user123",
      accountTier: "pro",
    });

    requirePaidOrPro(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(statusFn).not.toHaveBeenCalled();
    expect(jsonFn).not.toHaveBeenCalled();
  });

  it("allows premium-tier users to proceed", () => {
    const { req, res, next, statusFn, jsonFn } = createMockReqRes({
      id: "user123",
      accountTier: "premium",
    });

    requirePaidOrPro(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(statusFn).not.toHaveBeenCalled();
    expect(jsonFn).not.toHaveBeenCalled();
  });

  it("handles missing accountTier (defaults to blocking)", () => {
    const { req, res, next, statusFn, jsonFn } = createMockReqRes({
      id: "user123",
      // accountTier is missing
    });

    requirePaidOrPro(req, res, next);

    expect(statusFn).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("blocks users with invalid tier values", () => {
    const { req, res, next, statusFn, jsonFn } = createMockReqRes({
      id: "user123",
      accountTier: "invalid_tier",
    });

    requirePaidOrPro(req, res, next);

    expect(statusFn).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
