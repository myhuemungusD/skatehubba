/**
 * Coverage tests for server/auth/service.ts — uncovered lines ~326-338, 423-428
 *
 * Lines 326-338: generatePasswordResetToken() — the happy path where user exists,
 *   is verified, and a reset token is generated and saved.
 *
 * Lines 423-428: changePassword() with currentSessionToken — the branch where
 *   sessions are deleted and a new session is created.
 *
 * Firebase sync: resetPassword/changePassword call admin.auth().updateUser()
 *   to keep Firebase in sync with the custom DB password.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock env
vi.mock("../../config/env", () => ({
  env: {
    DATABASE_URL: "mock://test",
    JWT_SECRET: "test-jwt-secret-at-least-32-characters-long!",
    SESSION_SECRET: "test-session-secret-at-least-32-chars-long",
    NODE_ENV: "test",
  },
}));

// Mock Firebase Admin SDK
const mockUpdateUser = vi.fn();
vi.mock("../../admin", () => ({
  admin: {
    auth: () => ({
      updateUser: (...args: any[]) => mockUpdateUser(...args),
    }),
  },
}));

// Mock logger
const mockLogError = vi.fn();
vi.mock("../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: (...args: any[]) => mockLogError(...args),
    debug: vi.fn(),
  },
}));

// Mock bcryptjs at module level to avoid ESM spy issues
const mockCompare = vi.fn();
const mockHash = vi.fn();
vi.mock("bcryptjs", () => ({
  default: {
    compare: (...args: any[]) => mockCompare(...args),
    hash: (...args: any[]) => mockHash(...args),
    genSalt: vi.fn().mockResolvedValue("$2b$12$salt"),
  },
  compare: (...args: any[]) => mockCompare(...args),
  hash: (...args: any[]) => mockHash(...args),
  genSalt: vi.fn().mockResolvedValue("$2b$12$salt"),
}));

// Track DB calls precisely
const mockReturning = vi.fn().mockResolvedValue([]);
const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });

vi.mock("../../db", () => ({
  db: null,
  getDb: () => ({
    select: vi.fn().mockReturnValue({ from: mockFrom }),
    insert: vi.fn().mockReturnValue({ values: mockValues }),
    update: vi.fn().mockReturnValue({ set: mockSet }),
    delete: vi.fn().mockReturnValue({ where: mockWhere }),
  }),
}));

vi.mock("../../../packages/shared/schema/index", () => ({
  customUsers: {
    email: "email",
    id: "id",
    firebaseUid: "firebaseUid",
    emailVerificationToken: "emailVerificationToken",
    emailVerificationExpires: "emailVerificationExpires",
    resetPasswordToken: "resetPasswordToken",
    resetPasswordExpires: "resetPasswordExpires",
    isEmailVerified: "isEmailVerified",
    isActive: "isActive",
    passwordHash: "passwordHash",
    lastLoginAt: "lastLoginAt",
    updatedAt: "updatedAt",
  },
  authSessions: {
    userId: "userId",
    token: "token",
    expiresAt: "expiresAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: any, val: any) => ({ _op: "eq", col, val })),
  and: vi.fn((...args: any[]) => ({ _op: "and", args })),
  gt: vi.fn((...args: any[]) => ({ _op: "gt", args })),
}));

const { AuthService } = await import("../../auth/service");

describe("AuthService — additional coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generatePasswordResetToken", () => {
    it("returns null when user is not found", async () => {
      mockWhere.mockResolvedValueOnce([]);
      const result = await AuthService.generatePasswordResetToken("nobody@example.com");
      expect(result).toBeNull();
    });

    it("succeeds when user exists but email is not verified", async () => {
      mockWhere.mockResolvedValueOnce([
        { id: "u1", email: "user@example.com", isEmailVerified: false },
      ]);
      mockWhere.mockResolvedValueOnce(undefined);
      const result = await AuthService.generatePasswordResetToken("user@example.com");
      expect(result).toBeDefined();
      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[0-9a-f]+$/);
    });

    it("generates and stores a reset token for a verified user (lines 326-338)", async () => {
      mockWhere.mockResolvedValueOnce([
        { id: "u1", email: "user@example.com", isEmailVerified: true },
      ]);
      mockWhere.mockResolvedValueOnce(undefined);

      const result = await AuthService.generatePasswordResetToken("user@example.com");

      expect(result).toBeDefined();
      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[0-9a-f]+$/);

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          resetPasswordToken: expect.any(String),
          resetPasswordExpires: expect.any(Date),
          updatedAt: expect.any(Date),
        })
      );
    });
  });

  describe("changePassword with currentSessionToken", () => {
    it("deletes all sessions and creates a new one when currentSessionToken is provided (lines 423-428)", async () => {
      mockWhere.mockResolvedValueOnce([
        {
          id: "u1",
          email: "user@example.com",
          passwordHash: "$2b$12$hashedpassword",
          isEmailVerified: true,
        },
      ]);

      mockCompare.mockResolvedValueOnce(true);
      mockHash.mockResolvedValueOnce("$2b$12$newhash");

      // update().set().where() for setting new password
      mockWhere.mockResolvedValueOnce(undefined);

      // deleteAllUserSessions: delete().where().returning()
      mockReturning.mockResolvedValueOnce([{ id: "s1" }, { id: "s2" }]);

      // createSession: insert().values().returning()
      mockReturning.mockResolvedValueOnce([
        { id: "new-session", userId: "u1", token: "hash", expiresAt: new Date() },
      ]);

      const result = await AuthService.changePassword(
        "u1",
        "OldPassword123!",
        "NewPassword456!",
        "current-session-token"
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain("session(s) logged out");
    });

    it("deletes all sessions without creating new one when no currentSessionToken", async () => {
      mockWhere.mockResolvedValueOnce([
        {
          id: "u1",
          email: "user@example.com",
          passwordHash: "firebase-auth-user",
          isEmailVerified: true,
        },
      ]);

      mockHash.mockResolvedValueOnce("$2b$12$newhash");

      // update().set().where() for setting new password
      mockWhere.mockResolvedValueOnce(undefined);

      // deleteAllUserSessions
      mockReturning.mockResolvedValueOnce([]);

      const result = await AuthService.changePassword("u1", "", "NewPassword456!");

      expect(result.success).toBe(true);
      expect(result.message).toBe("Password changed. All sessions have been logged out.");
    });
  });

  describe("resetPassword — Firebase sync", () => {
    it("updates Firebase password when user has firebaseUid", async () => {
      mockHash.mockResolvedValueOnce("$2b$12$newhash");
      mockUpdateUser.mockResolvedValueOnce({});

      // SELECT: find user by reset token
      mockWhere.mockResolvedValueOnce([
        {
          id: "u1",
          email: "user@example.com",
          firebaseUid: "firebase-uid-123",
          resetPasswordToken: "valid-token",
          resetPasswordExpires: new Date(Date.now() + 86400000),
        },
      ]);

      // UPDATE: set new password, clear token (returns updated user)
      mockReturning.mockResolvedValueOnce([
        { id: "u1", email: "user@example.com", isEmailVerified: true },
      ]);

      // deleteAllUserSessions
      mockReturning.mockResolvedValueOnce([]);

      const result = await AuthService.resetPassword("valid-token", "NewSecure1");

      expect(result).not.toBeNull();
      expect(mockUpdateUser).toHaveBeenCalledWith("firebase-uid-123", { password: "NewSecure1" });
    });

    it("aborts reset when Firebase password update fails", async () => {
      mockHash.mockResolvedValueOnce("$2b$12$newhash");
      mockUpdateUser.mockRejectedValueOnce(new Error("Firebase unavailable"));

      // SELECT: find user by reset token
      mockWhere.mockResolvedValueOnce([
        {
          id: "u1",
          email: "user@example.com",
          firebaseUid: "firebase-uid-123",
          resetPasswordToken: "valid-token",
          resetPasswordExpires: new Date(Date.now() + 86400000),
        },
      ]);

      const result = await AuthService.resetPassword("valid-token", "NewSecure1");

      expect(result).toBeNull();
      expect(mockLogError).toHaveBeenCalledWith(
        "Failed to update Firebase password during reset — aborting reset",
        expect.objectContaining({ userId: "u1" })
      );
    });

    it("skips Firebase update when user has no firebaseUid", async () => {
      mockHash.mockResolvedValueOnce("$2b$12$newhash");

      // SELECT: user without firebaseUid
      mockWhere.mockResolvedValueOnce([
        {
          id: "u1",
          email: "user@example.com",
          resetPasswordToken: "valid-token",
          resetPasswordExpires: new Date(Date.now() + 86400000),
        },
      ]);

      // UPDATE: returns updated user
      mockReturning.mockResolvedValueOnce([
        { id: "u1", email: "user@example.com", isEmailVerified: true },
      ]);

      // deleteAllUserSessions
      mockReturning.mockResolvedValueOnce([]);

      const result = await AuthService.resetPassword("valid-token", "NewSecure1");

      expect(result).not.toBeNull();
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it("returns null when concurrent request already consumed the token", async () => {
      mockHash.mockResolvedValueOnce("$2b$12$newhash");

      // SELECT: find user by reset token
      mockWhere.mockResolvedValueOnce([
        {
          id: "u1",
          email: "user@example.com",
          resetPasswordToken: "valid-token",
          resetPasswordExpires: new Date(Date.now() + 86400000),
        },
      ]);

      // UPDATE: returns empty (token already consumed by concurrent request)
      mockReturning.mockResolvedValueOnce([]);

      const result = await AuthService.resetPassword("valid-token", "NewSecure1");

      expect(result).toBeNull();
    });
  });

  describe("changePassword — Firebase sync", () => {
    it("updates Firebase password when user has firebaseUid", async () => {
      mockUpdateUser.mockResolvedValueOnce({});

      mockWhere.mockResolvedValueOnce([
        {
          id: "u1",
          email: "user@example.com",
          passwordHash: "firebase-auth-user",
          firebaseUid: "firebase-uid-123",
          isEmailVerified: true,
        },
      ]);

      mockHash.mockResolvedValueOnce("$2b$12$newhash");

      // update().set().where() for setting new password
      mockWhere.mockResolvedValueOnce(undefined);

      // deleteAllUserSessions
      mockReturning.mockResolvedValueOnce([]);

      const result = await AuthService.changePassword("u1", "", "NewPassword456!");

      expect(result.success).toBe(true);
      expect(mockUpdateUser).toHaveBeenCalledWith("firebase-uid-123", {
        password: "NewPassword456!",
      });
    });

    it("fails when Firebase password update fails", async () => {
      mockUpdateUser.mockRejectedValueOnce(new Error("Firebase unavailable"));

      mockWhere.mockResolvedValueOnce([
        {
          id: "u1",
          email: "user@example.com",
          passwordHash: "firebase-auth-user",
          firebaseUid: "firebase-uid-123",
          isEmailVerified: true,
        },
      ]);

      mockHash.mockResolvedValueOnce("$2b$12$newhash");

      const result = await AuthService.changePassword("u1", "", "NewPassword456!");

      expect(result.success).toBe(false);
      expect(result.message).toBe("Password change failed. Please try again.");
      expect(mockLogError).toHaveBeenCalledWith(
        "Failed to update Firebase password during change",
        expect.objectContaining({ userId: "u1" })
      );
    });
  });
});
