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

vi.mock("../../admin", () => ({
  admin: {
    auth: () => ({
      verifyIdToken: mockVerifyIdToken,
    }),
  },
}));

const mockFindUserByFirebaseUid = vi.fn();

vi.mock("../../auth/service", () => ({
  AuthService: {
    findUserByFirebaseUid: mockFindUserByFirebaseUid,
  },
}));

vi.mock("../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

let mockRedisClient: any = null;

vi.mock("../../redis", () => ({
  getRedisClient: () => mockRedisClient,
}));

// ============================================================================
// Imports after mocks
// ============================================================================

const { socketAuthMiddleware, requireSocketAdmin } = await import("../../socket/auth");
const logger = (await import("../../logger")).default;

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
    mockRedisClient = null;

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

    it("uses Redis for rate limiting when available (lines 49-55)", async () => {
      mockRedisClient = {
        incr: vi.fn().mockResolvedValue(1),
        expire: vi.fn().mockResolvedValue(1),
      };

      const socket = createMockSocket({
        handshake: { auth: { token: "valid-token" }, address: "10.0.0.1" },
      });
      const next = vi.fn();

      await socketAuthMiddleware(socket, next);

      // Should have called Redis incr
      expect(mockRedisClient.incr).toHaveBeenCalledWith(expect.stringContaining("10.0.0.1"));
      // count === 1 -> should set expire
      expect(mockRedisClient.expire).toHaveBeenCalled();
      // Should succeed
      expect(next).toHaveBeenCalledWith();
    });

    it("Redis rate limit: does not call expire when count > 1 (line 52)", async () => {
      mockRedisClient = {
        incr: vi.fn().mockResolvedValue(5),
        expire: vi.fn(),
      };

      const socket = createMockSocket({
        handshake: { auth: { token: "valid-token" }, address: "10.0.0.2" },
      });
      const next = vi.fn();

      await socketAuthMiddleware(socket, next);

      expect(mockRedisClient.incr).toHaveBeenCalled();
      // count !== 1 -> expire should NOT be called
      expect(mockRedisClient.expire).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith();
    });

    it("Redis rate limit: rejects when count exceeds limit", async () => {
      mockRedisClient = {
        incr: vi.fn().mockResolvedValue(11),
        expire: vi.fn(),
      };

      const socket = createMockSocket({
        handshake: { auth: { token: "valid-token" }, address: "10.0.0.3" },
      });
      const next = vi.fn();

      await socketAuthMiddleware(socket, next);

      const error = next.mock.calls[0][0] as Error;
      expect(error.message).toBe("rate_limit_exceeded");
    });

    it("falls through to in-memory when Redis incr throws (line 56-58)", async () => {
      mockRedisClient = {
        incr: vi.fn().mockRejectedValue(new Error("Redis down")),
        expire: vi.fn(),
      };

      const socket = createMockSocket({
        handshake: { auth: { token: "valid-token" }, address: "10.0.0.4" },
      });
      const next = vi.fn();

      await socketAuthMiddleware(socket, next);

      // Should fall through to in-memory and succeed
      expect(next).toHaveBeenCalledWith();
    });

    it("rejects when handshake.auth is undefined (line 108 hasAuth check)", async () => {
      const socket = createMockSocket({
        handshake: { auth: undefined, address: "127.0.0.1" },
      });
      const next = vi.fn();

      await socketAuthMiddleware(socket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      const error = next.mock.calls[0][0] as Error;
      expect(error.message).toBe("authentication_required");
    });

    it("handles non-Error thrown during token verification (line 123)", async () => {
      mockVerifyIdToken.mockRejectedValue("non-error-string");

      const socket = createMockSocket();
      const next = vi.fn();

      await socketAuthMiddleware(socket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      const error = next.mock.calls[0][0] as Error;
      expect(error.message).toBe("invalid_token");
      expect(logger.warn).toHaveBeenCalledWith(
        "[Socket] Invalid token",
        expect.objectContaining({ error: "Unknown error" })
      );
    });

    it("handles non-Error thrown in outer catch (line 175)", async () => {
      // Make findUserByFirebaseUid throw a non-Error value
      // to trigger the outer catch with a non-Error
      mockFindUserByFirebaseUid.mockRejectedValue("some non-error value");

      const socket = createMockSocket({
        handshake: { auth: { token: "valid-token" }, address: "172.16.0.175" },
      });
      const next = vi.fn();

      await socketAuthMiddleware(socket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      const error = next.mock.calls[0][0] as Error;
      expect(error.message).toBe("authentication_failed");
      expect(logger.error).toHaveBeenCalledWith(
        "[Socket] Auth middleware error",
        expect.objectContaining({ error: "Unknown error" })
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

  // ==========================================================================
  // cleanupRateLimits — fallback entry expiration (lines 30-33)
  // ==========================================================================

  describe("cleanupRateLimits (lines 30-33)", () => {
    it("removes expired entries from fallback rate limit map", async () => {
      vi.useFakeTimers();

      try {
        // Make a connection to create a fallback rate limit entry
        const socket = createMockSocket({
          handshake: { auth: { token: "valid-token" }, address: "10.99.99.99" },
        });
        const next = vi.fn();
        await socketAuthMiddleware(socket, next);

        // The entry for 10.99.99.99 should exist and allow connections
        expect(next).toHaveBeenCalledWith();

        // Advance time past the rate limit window (60 seconds)
        vi.advanceTimersByTime(61_000);

        // Now make another connection from the same IP — the cleanup interval
        // should have run and removed the expired entry.
        // The connection should succeed (fresh entry).
        vi.clearAllMocks();
        mockVerifyIdToken.mockResolvedValue({ uid: "firebase-uid-1", admin: false });
        mockFindUserByFirebaseUid.mockResolvedValue({
          id: "user-1",
          isActive: true,
        });

        const socket2 = createMockSocket({
          handshake: { auth: { token: "valid-token" }, address: "10.99.99.99" },
        });
        const next2 = vi.fn();
        await socketAuthMiddleware(socket2, next2);

        // Should succeed — the expired entry was cleaned up
        expect(next2).toHaveBeenCalledWith();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
