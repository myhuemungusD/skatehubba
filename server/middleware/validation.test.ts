import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { validateBody } from "./validation";

function createMockReqRes(body: unknown) {
  const req = { body } as any;
  const jsonFn = vi.fn().mockReturnThis();
  const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
  const res = { status: statusFn, json: jsonFn } as any;
  const next = vi.fn();
  return { req, res, next, statusFn, jsonFn };
}

const testSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().positive(),
});

describe("validateBody", () => {
  it("calls next() with valid data", () => {
    const { req, res, next } = createMockReqRes({ name: "Alice", age: 25 });
    validateBody(testSchema)(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("attaches validatedBody to req on success", () => {
    const { req, res, next } = createMockReqRes({ name: "Bob", age: 30 });
    validateBody(testSchema)(req, res, next);
    expect(req.validatedBody).toEqual({ name: "Bob", age: 30 });
  });

  it("returns 400 for invalid data by default", () => {
    const { req, res, next, statusFn, jsonFn } = createMockReqRes({ name: "" });
    validateBody(testSchema)(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(statusFn).toHaveBeenCalledWith(400);
    expect(jsonFn).toHaveBeenCalled();
    const body = jsonFn.mock.calls[0][0];
    expect(body.error).toBe("validation_error");
  });

  it("uses custom error code", () => {
    const { req, res, next, jsonFn } = createMockReqRes({});
    validateBody(testSchema, { errorCode: "bad_input" })(req, res, next);
    expect(jsonFn.mock.calls[0][0].error).toBe("bad_input");
  });

  it("uses custom status code", () => {
    const { req, res, next, statusFn } = createMockReqRes({});
    validateBody(testSchema, { status: 422 })(req, res, next);
    expect(statusFn).toHaveBeenCalledWith(422);
  });

  it("includes details by default", () => {
    const { req, res, next, jsonFn } = createMockReqRes({});
    validateBody(testSchema)(req, res, next);
    expect(jsonFn.mock.calls[0][0].details).toBeDefined();
  });

  it("omits details when includeDetails is false", () => {
    const { req, res, next, jsonFn } = createMockReqRes({});
    validateBody(testSchema, { includeDetails: false })(req, res, next);
    expect(jsonFn.mock.calls[0][0].details).toBeUndefined();
  });
});
