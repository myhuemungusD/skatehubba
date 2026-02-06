import { describe, it, expect, vi } from "vitest";
import { ensureCsrfToken, requireCsrfToken } from "./csrf";

function createMockReqRes(
  overrides: {
    method?: string;
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
  } = {}
) {
  const cookies = overrides.cookies ?? {};
  const headers = overrides.headers ?? {};
  const req = {
    method: overrides.method ?? "GET",
    cookies,
    header: (name: string) => headers[name.toLowerCase()],
  } as any;

  const cookieArgs: any[] = [];
  const jsonFn = vi.fn().mockReturnThis();
  const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
  const res = {
    status: statusFn,
    json: jsonFn,
    cookie: vi.fn((...args: any[]) => cookieArgs.push(args)),
  } as any;

  const next = vi.fn();
  return { req, res, next, statusFn, jsonFn, cookieArgs };
}

describe("ensureCsrfToken", () => {
  it("sets a CSRF cookie when none exists", () => {
    const { req, res, next } = createMockReqRes({ cookies: {} });
    ensureCsrfToken(req, res, next);
    expect(res.cookie).toHaveBeenCalledWith(
      "csrfToken",
      expect.any(String),
      expect.objectContaining({
        httpOnly: false,
        sameSite: "lax",
        path: "/",
      })
    );
    expect(next).toHaveBeenCalled();
  });

  it("does not overwrite existing CSRF cookie", () => {
    const { req, res, next } = createMockReqRes({ cookies: { csrfToken: "existing" } });
    ensureCsrfToken(req, res, next);
    expect(res.cookie).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it("stores token in req.cookies for downstream use", () => {
    const { req, res, next } = createMockReqRes({ cookies: {} });
    ensureCsrfToken(req, res, next);
    expect(req.cookies.csrfToken).toBeDefined();
    expect(typeof req.cookies.csrfToken).toBe("string");
    expect(req.cookies.csrfToken.length).toBeGreaterThan(0);
  });
});

describe("requireCsrfToken", () => {
  it("allows GET requests without validation", () => {
    const { req, res, next } = createMockReqRes({ method: "GET" });
    requireCsrfToken(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("allows HEAD requests without validation", () => {
    const { req, res, next } = createMockReqRes({ method: "HEAD" });
    requireCsrfToken(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("allows OPTIONS requests without validation", () => {
    const { req, res, next } = createMockReqRes({ method: "OPTIONS" });
    requireCsrfToken(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("skips CSRF for Bearer auth requests", () => {
    const { req, res, next } = createMockReqRes({
      method: "POST",
      headers: { authorization: "Bearer some-token" },
    });
    requireCsrfToken(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("rejects POST without CSRF token", () => {
    const { req, res, next, statusFn, jsonFn } = createMockReqRes({ method: "POST" });
    requireCsrfToken(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(statusFn).toHaveBeenCalledWith(403);
    expect(jsonFn.mock.calls[0][0].error).toBe("Invalid CSRF token");
  });

  it("rejects when cookie and header don't match", () => {
    const { req, res, next, statusFn } = createMockReqRes({
      method: "POST",
      cookies: { csrfToken: "token-a" },
      headers: { "x-csrf-token": "token-b" },
    });
    requireCsrfToken(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(statusFn).toHaveBeenCalledWith(403);
  });

  it("allows POST with matching cookie and header", () => {
    const token = "valid-token-123";
    const { req, res, next } = createMockReqRes({
      method: "POST",
      cookies: { csrfToken: token },
      headers: { "x-csrf-token": token },
    });
    requireCsrfToken(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("rejects when only cookie is present", () => {
    const { req, res, next, statusFn } = createMockReqRes({
      method: "DELETE",
      cookies: { csrfToken: "token" },
    });
    requireCsrfToken(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(statusFn).toHaveBeenCalledWith(403);
  });

  it("rejects when only header is present", () => {
    const { req, res, next, statusFn } = createMockReqRes({
      method: "PUT",
      headers: { "x-csrf-token": "token" },
    });
    requireCsrfToken(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(statusFn).toHaveBeenCalledWith(403);
  });
});
