/**
 * @fileoverview Unit tests for Socket Authentication Middleware
 *
 * Tests:
 * - socketAuthMiddleware: rate limiting, token validation, user lookup, data attachment
 * - requireSocketAdmin: checks admin role on socket data
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks — declared before any application imports
// ============================================================================

const mockVerifyIdToken = vi.fn();

vi.mock("../admin", () => ({
  admin: {
    auth: () => ({
      verifyIdToken: mockVerifyIdToken,
    }),
  },
}));

const mockFindUserByFirebaseUid = vi.fn();

vi.mock("../auth/service", () => ({
  AuthService: {
    findUserByFirebaseUid: mockFindUserByFirebaseUid,
  },
}));

vi.mock("../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../redis", () => ({
  getRedisClient: vi.fn().mockReturnValue(null),
}));

// ============================================================================
// Imports after mocks
// ============================================================================

const { socketAuthMiddleware, requireSocketAdmin } = await import("../socket/auth");
const logger = (await import("../logger")).default;

// ============================================================================
// Helpers
// ============================================================================

function createMockSocket(overrides: Record<string, any> = {}) {
  return {
    handshake: {
      auth: { token: "valid-token" },
      address: "127.0.0.1",
      ...overrides.handshake,
    },
    data: {},
    ...overrides,
  } as any;
}

// ============================================================================
// Tests
// ============================================================================

describe("Socket Auth Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: valid token + active user
    mockVerifyIdToken.mockResolvedValue({ uid: "firebase-uid-1", admin: false });
    mockFindUserByFirebaseUid.mockResolvedValue({
      id: "user-1",
      isActive: true,
    });
  });

  // ==========================================================================
  // socketAuthMiddleware
  // ==========================================================================

  describe("socketAuthMiddleware", () => {
    it("succeeds with valid token and active user", async () => {
      const socket = createMockSocket();
      const next = vi.fn();

      await socketAuthMiddleware(socket, next);

      expect(next).toHaveBeenCalledWith(); // called with no error
      expect(socket.data.userId).toBe("user-1");
      expect(socket.data.odv).toBe("user-1");
      expect(socket.data.firebaseUid).toBe("firebase-uid-1");
      expect(socket.data.rooms).toBeInstanceOf(Set);
      expect(socket.data.connectedAt).toBeInstanceOf(Date);
      expect(logger.info).toHaveBeenCalledWith(
        "[Socket] Authenticated connection",
        expect.objectContaining({ userId: "user-1" })
      );
    });

    it("attaches admin role from custom claims", async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: "firebase-uid-admin", admin: true });
      mockFindUserByFirebaseUid.mockResolvedValue({
        id: "admin-user",
        isActive: true,
      });

      const socket = createMockSocket();
      const next = vi.fn();

      await socketAuthMiddleware(socket, next);

      expect(next).toHaveBeenCalledWith();
      expect(socket.data.roles).toContain("admin");
    });

    it("rejects when token is missing", async () => {
      const socket = createMockSocket({
        handshake: { auth: {}, address: "127.0.0.1" },
      });
      const next = vi.fn();

      await socketAuthMiddleware(socket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      const error = next.mock.calls[0][0] as Error;
      expect(error.message).toBe("authentication_required");
      expect(logger.warn).toHaveBeenCalledWith("[Socket] Missing auth token", expect.any(Object));
    });

    it("rejects when token is not a string", async () => {
      const socket = createMockSocket({
        handshake: { auth: { token: 12345 }, address: "127.0.0.1" },
      });
      const next = vi.fn();

      await socketAuthMiddleware(socket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      const error = next.mock.calls[0][0] as Error;
      expect(error.message).toBe("authentication_required");
    });

    it("rejects when token verification fails", async () => {
      mockVerifyIdToken.mockRejectedValue(new Error("Token expired"));

      const socket = createMockSocket();
      const next = vi.fn();

      await socketAuthMiddleware(socket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      const error = next.mock.calls[0][0] as Error;
      expect(error.message).toBe("invalid_token");
      expect(logger.warn).toHaveBeenCalledWith(
        "[Socket] Invalid token",
        expect.objectContaining({ error: "Token expired" })
      );
    });

    it("rejects when user is not found", async () => {
      mockFindUserByFirebaseUid.mockResolvedValue(null);

      const socket = createMockSocket();
      const next = vi.fn();

      await socketAuthMiddleware(socket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      const error = next.mock.calls[0][0] as Error;
      expect(error.message).toBe("user_not_found");
      expect(logger.warn).toHaveBeenCalledWith(
        "[Socket] User not found",
        expect.objectContaining({ firebaseUid: "firebase-uid-1" })
      );
    });

    it("rejects when user is inactive", async () => {
      mockFindUserByFirebaseUid.mockResolvedValue({
        id: "inactive-user",
        isActive: false,
      });

      const socket = createMockSocket();
      const next = vi.fn();

      await socketAuthMiddleware(socket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      const error = next.mock.calls[0][0] as Error;
      expect(error.message).toBe("account_inactive");
      expect(logger.warn).toHaveBeenCalledWith(
        "[Socket] Inactive user attempted connection",
        expect.objectContaining({ odv: "inactive-user" })
      );
    });

    it("handles unexpected errors gracefully", async () => {
      mockFindUserByFirebaseUid.mockRejectedValue(new Error("DB connection lost"));

      const socket = createMockSocket();
      const next = vi.fn();

      await socketAuthMiddleware(socket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      const error = next.mock.calls[0][0] as Error;
      expect(error.message).toBe("authentication_failed");
      expect(logger.error).toHaveBeenCalledWith(
        "[Socket] Auth middleware error",
        expect.objectContaining({ error: "DB connection lost" })
      );
    });

    it("rate limits connections from the same IP (fallback mode)", async () => {
      const next = vi.fn();

      // Make 11 connection attempts from the same IP (limit is 10)
      for (let i = 0; i < 11; i++) {
        const socket = createMockSocket({
          handshake: { auth: { token: "valid-token" }, address: "192.168.1.100" },
        });
        await socketAuthMiddleware(socket, next);
      }

      // The 11th call should have been rate-limited
      const lastCall = next.mock.calls[next.mock.calls.length - 1];
      const lastError = lastCall[0] as Error;
      expect(lastError.message).toBe("rate_limit_exceeded");
      expect(logger.warn).toHaveBeenCalledWith(
        "[Socket] Rate limit exceeded",
        expect.objectContaining({ ip: "192.168.1.100" })
      );
    });
  });

  // ==========================================================================
  // requireSocketAdmin
  // ==========================================================================

  describe("requireSocketAdmin", () => {
    it("returns true when socket data has admin role", () => {
      const socket = {
        data: {
          roles: ["admin"],
        },
      } as any;

      expect(requireSocketAdmin(socket)).toBe(true);
    });

    it("returns false when socket data has no admin role", () => {
      const socket = {
        data: {
          roles: ["user"],
        },
      } as any;

      expect(requireSocketAdmin(socket)).toBe(false);
    });

    it("returns false when socket data has no roles", () => {
      const socket = {
        data: {},
      } as any;

      expect(requireSocketAdmin(socket)).toBe(false);
    });

    it("returns false when socket data is undefined", () => {
      const socket = {
        data: undefined,
      } as any;

      expect(requireSocketAdmin(socket)).toBe(false);
    });

    it("returns false when roles is empty array", () => {
      const socket = {
        data: {
          roles: [],
        },
      } as any;

      expect(requireSocketAdmin(socket)).toBe(false);
    });
  });
});
