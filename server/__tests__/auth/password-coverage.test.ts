/**
 * Coverage tests for server/auth/routes/password.ts
 *
 * Lines 38-39: change-password rejects passwords > 72 characters
 * Lines 138-139: reset-password rejects passwords > 72 characters
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// --------------------------------------------------------------------------
// Mocks
// --------------------------------------------------------------------------

vi.mock("../../auth/service", () => ({
  AuthService: {
    changePassword: vi.fn(),
    resetPassword: vi.fn(),
    generatePasswordResetToken: vi.fn(),
    findUserByEmail: vi.fn(),
  },
}));

vi.mock("../../auth/middleware", () => ({
  authenticateUser: (_req: any, _res: any, next: any) => {
    _req.currentUser = _req.currentUser || { id: "user-1", email: "u@t.com" };
    next();
  },
  requireRecentAuth: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../../middleware/rateLimit", () => ({
  authLimiter: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../../auth/audit", () => ({
  AuditLogger: {
    logPasswordChanged: vi.fn(),
    logPasswordResetRequested: vi.fn(),
    logSessionsInvalidated: vi.fn(),
  },
  getClientIP: vi.fn(() => "127.0.0.1"),
}));

vi.mock("../../logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../auth/email", () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

// --------------------------------------------------------------------------
// Capture routes
// --------------------------------------------------------------------------

const capturedRoutes: Record<string, Function[]> = {};

const mockApp: any = {
  post: vi.fn((path: string, ...handlers: Function[]) => {
    capturedRoutes[path] = handlers;
  }),
  get: vi.fn(),
  use: vi.fn(),
};

const { setupPasswordRoutes } = await import("../../auth/routes/password");
setupPasswordRoutes(mockApp);

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function createReq(overrides: Record<string, any> = {}): any {
  return {
    body: {},
    headers: {},
    cookies: {},
    currentUser: { id: "user-1", email: "u@t.com" },
    ...overrides,
  };
}

function createRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

async function callRoute(path: string, req: any, res: any) {
  const handlers = capturedRoutes[path];
  if (!handlers)
    throw new Error(
      `Route ${path} not registered. Available: ${Object.keys(capturedRoutes).join(", ")}`
    );
  for (const handler of handlers) {
    await handler(req, res, () => {});
  }
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe("Password routes — max-length validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("change-password rejects passwords > 72 characters (line 39)", async () => {
    const longPassword = "Aa1" + "x".repeat(70); // 73 chars, meets complexity
    const req = createReq({
      body: { currentPassword: "OldPass123", newPassword: longPassword },
    });
    const res = createRes();

    await callRoute("/api/auth/change-password", req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Password must be at most 72 characters",
        code: "INVALID_PASSWORD",
      })
    );
  });

  it("reset-password rejects passwords > 72 characters (line 139)", async () => {
    const longPassword = "Aa1" + "x".repeat(70); // 73 chars
    const req = createReq({
      body: { token: "valid-reset-token", newPassword: longPassword },
    });
    const res = createRes();

    await callRoute("/api/auth/reset-password", req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Password must be at most 72 characters",
        code: "INVALID_PASSWORD",
      })
    );
  });
});
