/**
 * @fileoverview Unit tests for audit log middleware
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

const mockInfo = vi.fn();

vi.mock("../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  createChildLogger: vi.fn(() => ({
    info: mockInfo,
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

const { emitAuditLog, auditMiddleware } = await import("../middleware/auditLog");

describe("auditLog middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("emitAuditLog", () => {
    it("should log an audit entry with all fields", () => {
      emitAuditLog({
        action: "auth.login",
        userId: "user-1",
        targetId: "target-1",
        ip: "127.0.0.1",
        userAgent: "TestAgent/1.0",
        method: "POST",
        path: "/api/login",
        statusCode: 200,
        detail: "Successful login",
      });

      expect(mockInfo).toHaveBeenCalledWith("[AUDIT] auth.login", {
        action: "auth.login",
        userId: "user-1",
        targetId: "target-1",
        ip: "127.0.0.1",
        userAgent: "TestAgent/1.0",
        method: "POST",
        path: "/api/login",
        statusCode: 200,
        detail: "Successful login",
      });
    });

    it("should default userId to anonymous when not provided", () => {
      emitAuditLog({
        action: "spot.create",
        ip: "10.0.0.1",
        userAgent: "Bot/1.0",
        method: "POST",
        path: "/api/spots",
      });

      expect(mockInfo).toHaveBeenCalledWith(
        "[AUDIT] spot.create",
        expect.objectContaining({ userId: "anonymous" })
      );
    });
  });

  describe("auditMiddleware", () => {
    it("should call next and emit audit log on response finish", () => {
      const middleware = auditMiddleware("admin.user_ban");

      const finishHandlers: Array<() => void> = [];
      const req = {
        currentUser: { id: "admin-1" },
        params: { userId: "user-2" },
        ip: "192.168.1.1",
        get: vi.fn().mockReturnValue("AdminBrowser/1.0"),
        method: "PATCH",
        originalUrl: "/api/admin/users/user-2/ban",
      } as unknown as Request;

      const res = {
        on: vi.fn((event: string, handler: () => void) => {
          if (event === "finish") finishHandlers.push(handler);
        }),
        statusCode: 200,
      } as unknown as Response;

      const next = vi.fn() as NextFunction;

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(finishHandlers).toHaveLength(1);

      // Simulate response finish
      finishHandlers[0]();

      expect(mockInfo).toHaveBeenCalledWith("[AUDIT] admin.user_ban", {
        action: "admin.user_ban",
        userId: "admin-1",
        targetId: "user-2",
        ip: "192.168.1.1",
        userAgent: "AdminBrowser/1.0",
        method: "PATCH",
        path: "/api/admin/users/user-2/ban",
        statusCode: 200,
      });
    });

    it("should handle missing user and params gracefully", () => {
      const middleware = auditMiddleware("auth.logout");

      const finishHandlers: Array<() => void> = [];
      const req = {
        currentUser: undefined,
        params: {},
        ip: undefined,
        get: vi.fn().mockReturnValue(undefined),
        method: "POST",
        originalUrl: "/api/logout",
      } as unknown as Request;

      const res = {
        on: vi.fn((event: string, handler: () => void) => {
          if (event === "finish") finishHandlers.push(handler);
        }),
        statusCode: 204,
      } as unknown as Response;

      const next = vi.fn() as NextFunction;

      middleware(req, res, next);
      finishHandlers[0]();

      expect(mockInfo).toHaveBeenCalledWith("[AUDIT] auth.logout", {
        action: "auth.logout",
        userId: "anonymous",
        targetId: undefined,
        ip: "unknown",
        userAgent: "unknown",
        method: "POST",
        path: "/api/logout",
        statusCode: 204,
      });
    });
  });
});
