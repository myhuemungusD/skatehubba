import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { asyncHandler } from "../asyncHandler";

function mockReqResNext() {
  const req = {} as Request;
  const res = {} as Response;
  const next = vi.fn() as unknown as NextFunction;
  return { req, res, next };
}

describe("asyncHandler", () => {
  it("calls next with error when async handler rejects", async () => {
    const { req, res, next } = mockReqResNext();
    const error = new Error("async boom");
    const handler = asyncHandler(async () => {
      throw error;
    });

    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it("does not call next with error when async handler resolves", async () => {
    const { req, res, next } = mockReqResNext();
    const handler = asyncHandler(async () => "ok");

    await handler(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it("calls next with error when handler throws synchronously", () => {
    const { req, res, next } = mockReqResNext();
    const error = new Error("sync boom");
    const handler = asyncHandler((() => {
      throw error;
    }) as unknown as Parameters<typeof asyncHandler>[0]);

    handler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
