/**
 * Behavior tests for session cookie authentication in optionalAuthentication middleware
 *
 * Tests the session-based auth path: admin role assignment from Firebase custom claims,
 * graceful fallback when Firebase is unavailable, and proper handling of invalid/inactive sessions.
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

describe("optionalAuthentication — session cookie path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("grants admin role when Firebase custom claims include admin", async () => {
    const user = { id: "u1", firebaseUid: "fb-1", isActive: true, email: "a@b.com" };
    mockValidateSession.mockResolvedValue(user);
    mockGetUser.mockResolvedValue({ customClaims: { admin: true } });

    const req: any = { cookies: { sessionToken: "tok" }, headers: {} };
    const next = vi.fn();

    await optionalAuthentication(req, {} as any, next);

    expect(next).toHaveBeenCalled();
    expect(req.currentUser).toEqual({ ...user, roles: ["admin"] });
  });

  it("assigns empty roles when Firebase claims have no admin flag", async () => {
    const user = { id: "u2", firebaseUid: "fb-2", isActive: true };
    mockValidateSession.mockResolvedValue(user);
    mockGetUser.mockResolvedValue({ customClaims: {} });

    const req: any = { cookies: { sessionToken: "tok" }, headers: {} };
    const next = vi.fn();

    await optionalAuthentication(req, {} as any, next);

    expect(next).toHaveBeenCalled();
    expect(req.currentUser.roles).toEqual([]);
  });

  it("skips Firebase role lookup when user has no firebaseUid", async () => {
    const user = { id: "u3", firebaseUid: null, isActive: true };
    mockValidateSession.mockResolvedValue(user);

    const req: any = { cookies: { sessionToken: "tok" }, headers: {} };
    const next = vi.fn();

    await optionalAuthentication(req, {} as any, next);

    expect(next).toHaveBeenCalled();
    expect(req.currentUser.roles).toEqual([]);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("falls back to empty roles when Firebase getUser is unavailable", async () => {
    const user = { id: "u4", firebaseUid: "fb-4", isActive: true };
    mockValidateSession.mockResolvedValue(user);
    mockGetUser.mockRejectedValue(new Error("Firebase unavailable"));

    const req: any = { cookies: { sessionToken: "tok" }, headers: {} };
    const next = vi.fn();

    await optionalAuthentication(req, {} as any, next);

    expect(next).toHaveBeenCalled();
    expect(req.currentUser.roles).toEqual([]);
  });

  it("does not attach currentUser when session token is invalid", async () => {
    mockValidateSession.mockRejectedValue(new Error("Bad session"));

    const req: any = { cookies: { sessionToken: "bad" }, headers: {} };
    const next = vi.fn();

    await optionalAuthentication(req, {} as any, next);

    expect(next).toHaveBeenCalled();
    expect(req.currentUser).toBeUndefined();
  });

  it("does not attach currentUser when user account is inactive", async () => {
    mockValidateSession.mockResolvedValue({ id: "u5", isActive: false });

    const req: any = { cookies: { sessionToken: "tok" }, headers: {} };
    const next = vi.fn();

    await optionalAuthentication(req, {} as any, next);

    expect(next).toHaveBeenCalled();
    expect(req.currentUser).toBeUndefined();
  });
});
