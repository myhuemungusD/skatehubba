import { describe, it, expect, vi } from "vitest";
import { requirePaidOrPro } from "./requirePaidOrPro";
import type { Request, Response, NextFunction } from "express";

function mockReq(overrides: Record<string, any> = {}) {
  return {
    currentUser: undefined,
    ...overrides,
  } as any as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

function mockNext() {
  return vi.fn() as NextFunction;
}

describe("requirePaidOrPro middleware", () => {
  it("should return 401 if no currentUser", () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    requirePaidOrPro(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Authentication required" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should call next() for premium users", () => {
    const req = mockReq({
      currentUser: { id: "user1", accountTier: "premium" },
    });
    const res = mockRes();
    const next = mockNext();

    requirePaidOrPro(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("should call next() for pro users", () => {
    const req = mockReq({
      currentUser: { id: "user1", accountTier: "pro" },
    });
    const res = mockRes();
    const next = mockNext();

    requirePaidOrPro(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("should return 403 for free users with upgrade info", () => {
    const req = mockReq({
      currentUser: { id: "user1", accountTier: "free" },
    });
    const res = mockRes();
    const next = mockNext();

    requirePaidOrPro(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
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

  it("should return 403 for users with undefined tier", () => {
    const req = mockReq({
      currentUser: { id: "user1", accountTier: undefined },
    });
    const res = mockRes();
    const next = mockNext();

    requirePaidOrPro(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 403 for users with invalid tier", () => {
    const req = mockReq({
      currentUser: { id: "user1", accountTier: "invalid_tier" },
    });
    const res = mockRes();
    const next = mockNext();

    requirePaidOrPro(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
