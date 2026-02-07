import crypto from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./service", () => ({
  AuthService: {
    validateSession: vi.fn(),
    findUserByFirebaseUid: vi.fn(),
  },
}));

vi.mock("../admin", () => ({
  admin: {
    auth: () => ({
      verifyIdToken: vi.fn(),
      getUser: vi.fn(),
    }),
  },
}));

vi.mock("../types/express.d.ts", () => ({}));

import {
  requireEmailVerification,
  requireRecentAuth,
  recordRecentAuth,
  clearRecentAuth,
} from "./middleware";

function mockReq(overrides: Record<string, unknown> = {}) {
  return {
    headers: {},
    cookies: {},
    currentUser: undefined,
    ...overrides,
  } as any;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("requireEmailVerification", () => {
  it("returns 401 if no currentUser", () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    requireEmailVerification(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Authentication failed" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 if email not verified", () => {
    const req = mockReq({ currentUser: { id: "u1", isEmailVerified: false } });
    const res = mockRes();
    const next = vi.fn();

    requireEmailVerification(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: "Email verification required",
      code: "EMAIL_NOT_VERIFIED",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next if email is verified", () => {
    const req = mockReq({ currentUser: { id: "u1", isEmailVerified: true } });
    const res = mockRes();
    const next = vi.fn();

    requireEmailVerification(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("requireRecentAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 if no currentUser", async () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await requireRecentAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 REAUTH_REQUIRED if no recent auth recorded", async () => {
    const req = mockReq({ currentUser: { id: "user-no-auth" } });
    const res = mockRes();
    const next = vi.fn();

    await requireRecentAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "REAUTH_REQUIRED" }));
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next if recently authenticated", async () => {
    const userId = "user-recent-" + crypto.randomUUID();
    recordRecentAuth(userId);

    const req = mockReq({ currentUser: { id: userId } });
    const res = mockRes();
    const next = vi.fn();

    await requireRecentAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();

    // Clean up
    clearRecentAuth(userId);
  });

  it("returns 403 after auth window expires", async () => {
    const userId = "user-expired-" + crypto.randomUUID();
    recordRecentAuth(userId);

    // Manually advance time past the 5-minute window
    vi.useFakeTimers();
    vi.advanceTimersByTime(6 * 60 * 1000); // 6 minutes

    const req = mockReq({ currentUser: { id: userId } });
    const res = mockRes();
    const next = vi.fn();

    await requireRecentAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "REAUTH_REQUIRED" }));

    vi.useRealTimers();
    clearRecentAuth(userId);
  });
});

describe("recordRecentAuth", () => {
  it("records auth timestamp for user", async () => {
    const userId = "record-test-" + crypto.randomUUID();
    recordRecentAuth(userId);

    const req = mockReq({ currentUser: { id: userId } });
    const res = mockRes();
    const next = vi.fn();

    await requireRecentAuth(req, res, next);
    expect(next).toHaveBeenCalled();

    clearRecentAuth(userId);
  });
});

describe("clearRecentAuth", () => {
  it("clears auth timestamp so reauth is required", async () => {
    const userId = "clear-test-" + crypto.randomUUID();
    recordRecentAuth(userId);
    clearRecentAuth(userId);

    const req = mockReq({ currentUser: { id: userId } });
    const res = mockRes();
    const next = vi.fn();

    await requireRecentAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
