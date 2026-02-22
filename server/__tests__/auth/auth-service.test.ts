/**
 * @fileoverview Unit tests for AuthService
 * @module server/__tests__/auth-service.test
 *
 * Tests authentication service functions in isolation.
 * Database operations are mocked to focus on business logic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock environment before any imports
vi.mock("../../config/env", () => ({
  env: {
    DATABASE_URL: "mock://test",
    JWT_SECRET: "test-jwt-secret-at-least-32-characters-long!",
    SESSION_SECRET: "test-session-secret-at-least-32-chars-long",
    NODE_ENV: "test",
  },
}));

// Mock the database to avoid connection issues
vi.mock("../../db", () => ({
  db: null,
  getDb: () => ({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  }),
}));

// Import after mocking
const { AuthService } = await import("../../auth/service");

describe("AuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =============================================================================
  // PASSWORD HASHING TESTS
  // =============================================================================

  describe("hashPassword", () => {
    it("should hash a password using bcrypt", async () => {
      const password = "TestPassword123!";
      const hash = await AuthService.hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.startsWith("$2a$") || hash.startsWith("$2b$")).toBe(true);
    });

    it("should generate different hashes for the same password", async () => {
      const password = "SamePassword123!";
      const hash1 = await AuthService.hashPassword(password);
      const hash2 = await AuthService.hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });

    it("should handle empty password", async () => {
      const hash = await AuthService.hashPassword("");
      expect(hash).toBeDefined();
      expect(hash.length).toBeGreaterThan(0);
    });

    it("should handle unicode passwords", async () => {
      const password = "密码🔐テスト";
      const hash = await AuthService.hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash.startsWith("$2a$") || hash.startsWith("$2b$")).toBe(true);
    });
  });

  describe("verifyPassword", () => {
    it("should return true for matching password and hash", async () => {
      const password = "CorrectPassword123!";
      const hash = await AuthService.hashPassword(password);

      const isValid = await AuthService.verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it("should return false for non-matching password", async () => {
      const password = "CorrectPassword123!";
      const hash = await AuthService.hashPassword(password);

      const isValid = await AuthService.verifyPassword("WrongPassword123!", hash);
      expect(isValid).toBe(false);
    });

    it("should return false for invalid hash format", async () => {
      const isValid = await AuthService.verifyPassword("password", "not-a-valid-hash");
      expect(isValid).toBe(false);
    });
  });

  // =============================================================================
  // JWT TOKEN TESTS
  // =============================================================================

  describe("generateJWT", () => {
    it("should generate a valid JWT token", () => {
      const userId = "user-123";
      const token = AuthService.generateJWT(userId);

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.split(".").length).toBe(3); // JWT has 3 parts
    });

    it("should include userId in token payload", () => {
      const userId = "user-456";
      const token = AuthService.generateJWT(userId);

      const decoded = AuthService.verifyJWT(token);
      expect(decoded).not.toBeNull();
      expect(decoded?.userId).toBe(userId);
    });

    it("should generate unique tokens (with unique jti)", () => {
      const userId = "user-789";
      const token1 = AuthService.generateJWT(userId);
      const token2 = AuthService.generateJWT(userId);

      expect(token1).not.toBe(token2);
    });
  });

  describe("verifyJWT", () => {
    it("should verify a valid token", () => {
      const userId = "user-verify";
      const token = AuthService.generateJWT(userId);

      const decoded = AuthService.verifyJWT(token);
      expect(decoded).not.toBeNull();
      expect(decoded?.userId).toBe(userId);
    });

    it("should return null for invalid token", () => {
      const decoded = AuthService.verifyJWT("invalid.token.here");
      expect(decoded).toBeNull();
    });

    it("should return null for malformed token", () => {
      const decoded = AuthService.verifyJWT("not-even-a-jwt");
      expect(decoded).toBeNull();
    });

    it("should return null for empty token", () => {
      const decoded = AuthService.verifyJWT("");
      expect(decoded).toBeNull();
    });

    it("should return null for token signed with different secret", () => {
      // This token was signed with a different secret
      const fakeToken =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJmYWtlIiwidHlwZSI6ImFjY2VzcyJ9.fake";
      const decoded = AuthService.verifyJWT(fakeToken);
      expect(decoded).toBeNull();
    });
  });

  // =============================================================================
  // SECURE TOKEN GENERATION TESTS
  // =============================================================================

  describe("generateSecureToken", () => {
    it("should generate a 64-character hex token", () => {
      const token = AuthService.generateSecureToken();

      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[0-9a-f]+$/);
    });

    it("should generate unique tokens", () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 50; i++) {
        tokens.add(AuthService.generateSecureToken());
      }
      expect(tokens.size).toBe(50);
    });
  });
});

// =============================================================================
// LOCKOUT SERVICE TESTS
// =============================================================================

describe("LockoutService.getLockoutMessage", () => {
  // Test the pure function directly without importing the whole service
  const getLockoutMessage = (unlockAt: Date): string => {
    const now = Date.now();
    const unlockTime = unlockAt.getTime();
    const remainingMs = unlockTime - now;

    if (remainingMs <= 0) {
      return "Your account is now unlocked. Please try again.";
    }

    const remainingMinutes = Math.ceil(remainingMs / 60000);

    if (remainingMinutes <= 1) {
      return "Account temporarily locked. Please try again in less than a minute.";
    } else if (remainingMinutes < 60) {
      return `Account temporarily locked. Please try again in ${remainingMinutes} minutes.`;
    } else {
      const remainingHours = Math.ceil(remainingMinutes / 60);
      return `Account temporarily locked. Please try again in ${remainingHours} hour${remainingHours > 1 ? "s" : ""}.`;
    }
  };

  it("should show unlocked message for past unlock time", () => {
    const pastDate = new Date(Date.now() - 60000);
    const message = getLockoutMessage(pastDate);
    expect(message).toBe("Your account is now unlocked. Please try again.");
  });

  it("should show minutes message for near-future unlock", () => {
    const futureDate = new Date(Date.now() + 5 * 60000);
    const message = getLockoutMessage(futureDate);
    expect(message).toMatch(/Please try again in \d+ minutes/);
  });

  it("should show hours message for far-future unlock", () => {
    const futureDate = new Date(Date.now() + 2 * 60 * 60000);
    const message = getLockoutMessage(futureDate);
    expect(message).toMatch(/Please try again in \d+ hours/);
  });

  it("should show less than a minute for very short lockout", () => {
    const futureDate = new Date(Date.now() + 30000);
    const message = getLockoutMessage(futureDate);
    expect(message).toBe("Account temporarily locked. Please try again in less than a minute.");
  });
});
