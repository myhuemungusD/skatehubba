import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockVerifyToken = vi.fn();

vi.mock("../../admin", () => ({
  admin: {
    appCheck: () => ({
      verifyToken: mockVerifyToken,
    }),
  },
}));

vi.mock("../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { verifyAppCheck, requireAppCheck } from "../appCheck";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockReq(headers: Record<string, string> = {}): Request {
  return {
    header: vi.fn((name: string) => headers[name.toLowerCase()]),
    ip: "127.0.0.1",
    path: "/api/test",
  } as unknown as Request;
}

function createMockRes(): Response & {
  _status: number;
  _json: unknown;
  _headers: Record<string, string>;
} {
  const res = {
    _status: 200,
    _json: null as unknown,
    _headers: {} as Record<string, string>,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: unknown) {
      res._json = data;
      return res;
    },
    setHeader(name: string, value: string) {
      res._headers[name] = value;
      return res;
    },
  };
  return res as unknown as Response & {
    _status: number;
    _json: unknown;
    _headers: Record<string, string>;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("appCheck middleware", () => {
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    next = vi.fn();
    delete process.env.APP_CHECK_MODE;
  });

  // =========================================================================
  // verifyAppCheck
  // =========================================================================

  describe("verifyAppCheck", () => {
    describe("no token provided", () => {
      it("calls next in monitor mode (default)", async () => {
        const req = createMockReq();
        const res = createMockRes();

        await verifyAppCheck(req, res, next);

        expect(next).toHaveBeenCalledWith();
      });

      it("calls next and sets warning header in warn mode", async () => {
        process.env.APP_CHECK_MODE = "warn";
        const req = createMockReq();
        const res = createMockRes();

        await verifyAppCheck(req, res, next);

        expect(next).toHaveBeenCalledWith();
        expect(res._headers["X-App-Check-Warning"]).toBe("Token missing");
      });

      it("returns 401 in enforce mode", async () => {
        process.env.APP_CHECK_MODE = "enforce";
        const req = createMockReq();
        const res = createMockRes();

        await verifyAppCheck(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res._status).toBe(401);
        expect(res._json).toEqual({
          error: "App verification required",
          code: "APP_CHECK_REQUIRED",
        });
      });
    });

    describe("invalid token", () => {
      it("calls next in monitor mode (default)", async () => {
        mockVerifyToken.mockRejectedValue(new Error("invalid"));
        const req = createMockReq({ "x-firebase-appcheck": "bad-token" });
        const res = createMockRes();

        await verifyAppCheck(req, res, next);

        expect(next).toHaveBeenCalledWith();
      });

      it("calls next and sets warning header in warn mode", async () => {
        process.env.APP_CHECK_MODE = "warn";
        mockVerifyToken.mockRejectedValue(new Error("invalid"));
        const req = createMockReq({ "x-firebase-appcheck": "bad-token" });
        const res = createMockRes();

        await verifyAppCheck(req, res, next);

        expect(next).toHaveBeenCalledWith();
        expect(res._headers["X-App-Check-Warning"]).toBe("Token invalid");
      });

      it("returns 401 in enforce mode", async () => {
        process.env.APP_CHECK_MODE = "enforce";
        mockVerifyToken.mockRejectedValue(new Error("invalid"));
        const req = createMockReq({ "x-firebase-appcheck": "bad-token" });
        const res = createMockRes();

        await verifyAppCheck(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res._status).toBe(401);
        expect(res._json).toEqual({
          error: "App verification failed",
          code: "APP_CHECK_INVALID",
        });
      });
    });

    describe("valid token", () => {
      it("attaches claims to request and calls next", async () => {
        mockVerifyToken.mockResolvedValue({ appId: "1:test:android:abc" });
        const req = createMockReq({ "x-firebase-appcheck": "valid-token" });
        const res = createMockRes();

        await verifyAppCheck(req, res, next);

        expect(next).toHaveBeenCalledWith();
        expect((req as Request & { appCheckClaims?: { appId: string } }).appCheckClaims).toEqual({
          appId: "1:test:android:abc",
        });
      });
    });

    describe("unexpected error", () => {
      it("forwards error to next()", async () => {
        const unexpectedError = new Error("unexpected crash");
        const req = {
          header: () => {
            throw unexpectedError;
          },
          ip: "127.0.0.1",
          path: "/api/test",
        } as unknown as Request;
        const res = createMockRes();

        await verifyAppCheck(req, res, next);

        expect(next).toHaveBeenCalledWith(unexpectedError);
      });
    });
  });

  // =========================================================================
  // requireAppCheck
  // =========================================================================

  describe("requireAppCheck", () => {
    it("returns 401 when no token is provided", async () => {
      const req = createMockReq();
      const res = createMockRes();

      await requireAppCheck(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(401);
      expect(res._json).toEqual({
        error: "App verification required",
        code: "APP_CHECK_REQUIRED",
      });
    });

    it("returns 401 when token is invalid", async () => {
      mockVerifyToken.mockRejectedValue(new Error("invalid"));
      const req = createMockReq({ "x-firebase-appcheck": "bad-token" });
      const res = createMockRes();

      await requireAppCheck(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(401);
      expect(res._json).toEqual({
        error: "App verification failed",
        code: "APP_CHECK_INVALID",
      });
    });

    it("attaches claims and calls next for valid token", async () => {
      mockVerifyToken.mockResolvedValue({ appId: "1:test:ios:xyz" });
      const req = createMockReq({ "x-firebase-appcheck": "valid-token" });
      const res = createMockRes();

      await requireAppCheck(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect((req as Request & { appCheckClaims?: { appId: string } }).appCheckClaims).toEqual({
        appId: "1:test:ios:xyz",
      });
    });

    it("forwards unexpected errors to next()", async () => {
      const unexpectedError = new Error("unexpected crash");
      const req = {
        header: () => {
          throw unexpectedError;
        },
        ip: "127.0.0.1",
        path: "/api/test",
      } as unknown as Request;
      const res = createMockRes();

      await requireAppCheck(req, res, next);

      expect(next).toHaveBeenCalledWith(unexpectedError);
    });
  });

  // =========================================================================
  // getMode
  // =========================================================================

  describe("APP_CHECK_MODE parsing", () => {
    it("defaults to monitor when unset", async () => {
      delete process.env.APP_CHECK_MODE;
      const req = createMockReq();
      const res = createMockRes();

      await verifyAppCheck(req, res, next);

      // In monitor mode, missing token just calls next
      expect(next).toHaveBeenCalledWith();
    });

    it("accepts uppercase mode values", async () => {
      process.env.APP_CHECK_MODE = "ENFORCE";
      const req = createMockReq();
      const res = createMockRes();

      await verifyAppCheck(req, res, next);

      expect(res._status).toBe(401);
    });

    it("falls back to monitor for invalid mode values", async () => {
      process.env.APP_CHECK_MODE = "invalid-mode";
      const req = createMockReq();
      const res = createMockRes();

      await verifyAppCheck(req, res, next);

      // In monitor mode (fallback), missing token just calls next
      expect(next).toHaveBeenCalledWith();
    });
  });
});
