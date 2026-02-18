/**
 * Coverage tests for optionalAuthentication middleware – session cookie path.
 *
 * Lines 158-172 of server/auth/middleware.ts are only exercised when a valid
 * session cookie is present. This file tests that path directly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockValidateSession, mockGetUser } = vi.hoisted(() => ({
  mockValidateSession: vi.fn(),
  mockGetUser: vi.fn(),
}));

vi.mock("../service", () => ({
  AuthService: {
    validateSession: mockValidateSession,
    findUserByFirebaseUid: vi.fn(),
  },
}));

vi.mock("../../admin", () => ({
  admin: {
    auth: () => ({
      verifyIdToken: vi.fn(),
      getUser: mockGetUser,
    }),
  },
}));

vi.mock("../../types/express.d.ts", () => ({}));
vi.mock("../../logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../redis", () => ({ getRedisClient: () => null }));

import { optionalAuthentication } from "../middleware";

describe("optionalAuthentication – session cookie path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("authenticates via session cookie with admin role", async () => {
    const user = { id: "u1", firebaseUid: "fb-1", isActive: true, email: "a@b.com" };
    mockValidateSession.mockResolvedValue(user);
    mockGetUser.mockResolvedValue({ customClaims: { admin: true } });

    const req: any = { cookies: { sessionToken: "tok" }, headers: {} };
    const next = vi.fn();

    await optionalAuthentication(req, {} as any, next);

    expect(next).toHaveBeenCalled();
    expect(req.currentUser).toEqual({ ...user, roles: ["admin"] });
  });

  it("authenticates via session cookie without admin claims", async () => {
    const user = { id: "u2", firebaseUid: "fb-2", isActive: true };
    mockValidateSession.mockResolvedValue(user);
    mockGetUser.mockResolvedValue({ customClaims: {} });

    const req: any = { cookies: { sessionToken: "tok" }, headers: {} };
    const next = vi.fn();

    await optionalAuthentication(req, {} as any, next);

    expect(next).toHaveBeenCalled();
    expect(req.currentUser.roles).toEqual([]);
  });

  it("authenticates when user has no firebaseUid", async () => {
    const user = { id: "u3", firebaseUid: null, isActive: true };
    mockValidateSession.mockResolvedValue(user);

    const req: any = { cookies: { sessionToken: "tok" }, headers: {} };
    const next = vi.fn();

    await optionalAuthentication(req, {} as any, next);

    expect(next).toHaveBeenCalled();
    expect(req.currentUser.roles).toEqual([]);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("handles Firebase getUser failure gracefully", async () => {
    const user = { id: "u4", firebaseUid: "fb-4", isActive: true };
    mockValidateSession.mockResolvedValue(user);
    mockGetUser.mockRejectedValue(new Error("Firebase unavailable"));

    const req: any = { cookies: { sessionToken: "tok" }, headers: {} };
    const next = vi.fn();

    await optionalAuthentication(req, {} as any, next);

    expect(next).toHaveBeenCalled();
    expect(req.currentUser.roles).toEqual([]);
  });

  it("falls through when session is invalid", async () => {
    mockValidateSession.mockRejectedValue(new Error("Bad session"));

    const req: any = { cookies: { sessionToken: "bad" }, headers: {} };
    const next = vi.fn();

    await optionalAuthentication(req, {} as any, next);

    expect(next).toHaveBeenCalled();
    expect(req.currentUser).toBeUndefined();
  });

  it("falls through when user is inactive", async () => {
    mockValidateSession.mockResolvedValue({ id: "u5", isActive: false });

    const req: any = { cookies: { sessionToken: "tok" }, headers: {} };
    const next = vi.fn();

    await optionalAuthentication(req, {} as any, next);

    expect(next).toHaveBeenCalled();
    expect(req.currentUser).toBeUndefined();
  });
});
