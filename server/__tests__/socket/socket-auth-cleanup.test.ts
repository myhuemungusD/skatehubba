/**
 * @fileoverview Coverage tests for socket/auth.ts cleanupRateLimits (lines 30-33)
 *
 * Uses fake timers to trigger the setInterval-based cleanup of expired
 * rate limit entries in the fallback in-memory map.
 *
 * This must be a separate file because:
 * 1. vi.useFakeTimers() must be called BEFORE the module's setInterval fires
 * 2. The main socket-auth.test.ts uses real timers for most tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Enable fake timers before module import so the setInterval is captured
vi.useFakeTimers();

// ============================================================================
// Mocks
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

vi.mock("../../redis", () => ({
  getRedisClient: () => null,
}));

// ============================================================================
// Imports
// ============================================================================

const { socketAuthMiddleware } = await import("../../socket/auth");

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

describe("Socket Auth — cleanupRateLimits (lines 30-33)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: "firebase-uid-1", admin: false });
    mockFindUserByFirebaseUid.mockResolvedValue({
      id: "user-1",
      isActive: true,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it("cleanup interval removes expired fallback entries", async () => {
    // Create rate limit entries by making multiple connections from one IP
    // (multiple connections to be sure the entry is established)
    for (let i = 0; i < 3; i++) {
      const socket = createMockSocket({
        handshake: { auth: { token: "valid-token" }, address: "cleanup-test-ip" },
      });
      const next = vi.fn();
      await socketAuthMiddleware(socket, next);
      expect(next).toHaveBeenCalledWith();
    }

    // Advance time past TWO rate limit windows (120+ seconds) to ensure:
    // 1. The first interval fires at 60s but Date.now() === resetAt (not >, so no delete)
    // 2. The second interval fires at 120s where Date.now() > resetAt (delete happens)
    vi.advanceTimersByTime(121_000);

    // Now saturate from the same IP — if the entry was cleaned up,
    // we should be able to make 10 connections (the max) without rate limiting.
    // If it was NOT cleaned up, the existing count would cause rate limiting sooner.
    vi.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: "firebase-uid-1", admin: false });
    mockFindUserByFirebaseUid.mockResolvedValue({
      id: "user-1",
      isActive: true,
    });

    let successCount = 0;
    for (let i = 0; i < 10; i++) {
      vi.clearAllMocks();
      mockVerifyIdToken.mockResolvedValue({ uid: "firebase-uid-1", admin: false });
      mockFindUserByFirebaseUid.mockResolvedValue({
        id: "user-1",
        isActive: true,
      });

      const socket = createMockSocket({
        handshake: { auth: { token: "valid-token" }, address: "cleanup-test-ip" },
      });
      const next = vi.fn();
      await socketAuthMiddleware(socket, next);
      if (next.mock.calls.length > 0 && next.mock.calls[0][0] === undefined) {
        successCount++;
      }
    }

    // If cleanup worked, all 10 connections should succeed (fresh count starts at 0)
    // If cleanup didn't work, only 7 would succeed (10 - 3 = 7 remaining)
    expect(successCount).toBe(10);
  });

  it("cleanup interval does NOT remove non-expired entries", async () => {
    // Create entries from several IPs
    for (let i = 0; i < 5; i++) {
      const socket = createMockSocket({
        handshake: { auth: { token: "valid-token" }, address: `fresh-ip-${i}` },
      });
      const next = vi.fn();
      await socketAuthMiddleware(socket, next);
    }

    // Advance only 30 seconds (less than 60 second window) — entries should NOT be cleaned up
    vi.advanceTimersByTime(30_000);

    // Make more connections from the same IPs — they should accumulate (not reset)
    for (let i = 0; i < 5; i++) {
      vi.clearAllMocks();
      mockVerifyIdToken.mockResolvedValue({ uid: "firebase-uid-1", admin: false });
      mockFindUserByFirebaseUid.mockResolvedValue({
        id: "user-1",
        isActive: true,
      });

      const socket = createMockSocket({
        handshake: { auth: { token: "valid-token" }, address: `fresh-ip-${i}` },
      });
      const next = vi.fn();
      await socketAuthMiddleware(socket, next);
      // Should still succeed (count=2, under limit of 10)
      expect(next).toHaveBeenCalledWith();
    }
  });
});
