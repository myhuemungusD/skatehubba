/**
 * Coverage tests for server/auth/service.ts — Firebase error handling
 *
 * Lines 377-380: resetPassword() — when user has firebaseUid and
 *   admin.auth().updateUser() throws, the error is logged but the
 *   password reset continues successfully.
 *
 * Lines 444-451: changePassword() — when user has firebaseUid and
 *   admin.auth().updateUser() throws, it returns
 *   { success: false, message: "Password change failed..." }.
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

// Hoisted mock so we can configure updateUser per test
const { mockUpdateUser } = vi.hoisted(() => ({
  mockUpdateUser: vi.fn(),
}));

vi.mock("../../admin", () => ({
  admin: {
    auth: () => ({
      updateUser: mockUpdateUser,
    }),
  },
}));

vi.mock("../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const { AuthService } = await import("../../auth/service");

describe("AuthService — Firebase error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resetPassword — Firebase updateUser failure (lines 377-380)", () => {
    it("logs the error but still completes the password reset when Firebase updateUser rejects", async () => {
      const userWithFirebaseUid = {
        id: "u1",
        email: "user@example.com",
        firebaseUid: "firebase-uid-123",
        passwordHash: "$2b$12$existinghash",
        isEmailVerified: true,
        resetPasswordToken: "valid-token",
        resetPasswordExpires: new Date(Date.now() + 3600000),
      };

      const updatedUser = {
        ...userWithFirebaseUid,
        passwordHash: "$2b$12$newhash",
        resetPasswordToken: null,
        resetPasswordExpires: null,
      };

      // select().from().where() — find user by reset token
      mockWhere.mockResolvedValueOnce([userWithFirebaseUid]);

      // hashPassword
      mockHash.mockResolvedValueOnce("$2b$12$newhash");

      // Firebase updateUser rejects
      mockUpdateUser.mockRejectedValueOnce(new Error("Firebase unavailable"));

      // update().set().where().returning() — update the user record
      mockReturning.mockResolvedValueOnce([updatedUser]);

      // deleteAllUserSessions: delete().where().returning()
      mockReturning.mockResolvedValueOnce([]);

      const result = await AuthService.resetPassword("valid-token", "NewPassword123!");

      // The reset should still succeed despite Firebase failure
      expect(result).toBeDefined();
      expect(result).toEqual(updatedUser);

      // Firebase updateUser was called with the user's firebaseUid
      expect(mockUpdateUser).toHaveBeenCalledWith("firebase-uid-123", {
        password: "NewPassword123!",
      });
    });
  });

  describe("changePassword — Firebase updateUser failure (lines 444-451)", () => {
    it("returns failure when Firebase updateUser rejects", async () => {
      const userWithFirebaseUid = {
        id: "u1",
        email: "user@example.com",
        firebaseUid: "firebase-uid-456",
        passwordHash: "$2b$12$existinghash",
        isEmailVerified: true,
      };

      // select().from().where() — findUserById
      mockWhere.mockResolvedValueOnce([userWithFirebaseUid]);

      // verifyPassword — current password is valid
      mockCompare.mockResolvedValueOnce(true);

      // hashPassword
      mockHash.mockResolvedValueOnce("$2b$12$newhash");

      // Firebase updateUser rejects
      mockUpdateUser.mockRejectedValueOnce(new Error("Firebase service down"));

      const result = await AuthService.changePassword("u1", "OldPassword123!", "NewPassword456!");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Password change failed");

      // Firebase updateUser was called with the user's firebaseUid
      expect(mockUpdateUser).toHaveBeenCalledWith("firebase-uid-456", {
        password: "NewPassword456!",
      });
    });
  });
});
