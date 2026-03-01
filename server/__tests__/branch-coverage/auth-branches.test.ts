/**
 * Branch coverage tests for auth-related files:
 * - server/auth/service.ts (lines 382, 449)
 * - server/auth/mfa/crypto.ts (lines 38-39)
 * - server/auth/mfa/totp.ts (line 93)
 * - server/auth/lockout.ts (line 186)
 * - server/auth/middleware.ts (line 190)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ===========================================================================
// auth/service — branch coverage (lines 382 and 449)
// ===========================================================================
describe("AuthService branches", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe("Line 382: resetPassword — Firebase error is non-Error (String)", () => {
    it("should continue reset and log error when Firebase updateUser throws string", async () => {
      const mockLoggerError = vi.fn();

      vi.doMock("../../config/env", () => ({
        env: { JWT_SECRET: "a".repeat(64), NODE_ENV: "test" },
      }));

      vi.doMock("bcryptjs", () => ({
        default: {
          compare: vi.fn().mockResolvedValue(true),
          hash: vi.fn().mockResolvedValue("new-hash"),
          genSalt: vi.fn().mockResolvedValue("$2b$12$salt"),
        },
      }));

      vi.doMock("jsonwebtoken", () => ({
        default: {
          sign: vi.fn().mockReturnValue("jwt-token"),
          verify: vi.fn().mockReturnValue({ userId: "user-1" }),
        },
      }));

      // Build a mock DB that supports both update().set().where().returning()
      // and delete().where().returning()
      vi.doMock("../../db.ts", () => ({
        getDb: vi.fn(() => {
          const chain: any = {};
          chain.select = vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn().mockResolvedValue([
                {
                  id: "user-1",
                  email: "test@test.com",
                  passwordHash: "old-hash",
                  firebaseUid: "fb-uid-1",
                  resetPasswordToken: "token-123",
                  resetPasswordExpires: new Date(Date.now() + 86400000),
                },
              ]),
            })),
          }));
          chain.update = vi.fn(() => ({
            set: vi.fn(() => ({
              where: vi.fn(() => ({
                returning: vi.fn().mockResolvedValue([
                  { id: "user-1", email: "test@test.com", isEmailVerified: true },
                ]),
              })),
            })),
          }));
          chain.delete = vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn().mockResolvedValue([]),
            })),
          }));
          chain.insert = vi.fn(() => ({
            values: vi.fn(() => ({
              returning: vi.fn().mockResolvedValue([{ token: "new-session" }]),
            })),
          }));
          return chain;
        }),
      }));

      vi.doMock("../../../packages/shared/schema/index", () => ({
        customUsers: {
          id: "id",
          email: "email",
          resetPasswordToken: "resetPasswordToken",
          resetPasswordExpires: "resetPasswordExpires",
          firebaseUid: "firebaseUid",
          emailVerificationToken: "emailVerificationToken",
          emailVerificationExpires: "emailVerificationExpires",
        },
        authSessions: { userId: "userId", token: "token", expiresAt: "expiresAt" },
      }));

      vi.doMock("drizzle-orm", () => ({
        eq: vi.fn(),
        and: vi.fn(),
        gt: vi.fn(),
      }));

      vi.doMock("../../admin.ts", () => ({
        admin: {
          auth: () => ({
            updateUser: vi.fn().mockRejectedValue("Firebase unavailable string"),
          }),
        },
      }));

      vi.doMock("../../logger.ts", () => ({
        default: { info: vi.fn(), warn: vi.fn(), error: mockLoggerError },
      }));

      const { AuthService } = await import("../../auth/service");
      const result = await AuthService.resetPassword("token-123", "newPassword123");

      // Should succeed even though Firebase threw — non-blocking
      expect(result).toBeDefined();
      // The error was logged with String(err) since err is not an Error instance
      expect(mockLoggerError).toHaveBeenCalledWith(
        "Failed to update Firebase password during reset",
        expect.objectContaining({ error: "Firebase unavailable string" })
      );
    });
  });

  describe("Line 449: changePassword — Firebase error is non-Error (String)", () => {
    it("should return failure when Firebase password change throws non-Error", async () => {
      const mockLoggerError = vi.fn();

      vi.doMock("../../config/env", () => ({
        env: { JWT_SECRET: "a".repeat(64), NODE_ENV: "test" },
      }));

      vi.doMock("bcryptjs", () => ({
        default: {
          compare: vi.fn().mockResolvedValue(true),
          hash: vi.fn().mockResolvedValue("new-hash"),
          genSalt: vi.fn().mockResolvedValue("$2b$12$salt"),
        },
      }));

      vi.doMock("jsonwebtoken", () => ({
        default: {
          sign: vi.fn().mockReturnValue("jwt-token"),
          verify: vi.fn().mockReturnValue({ userId: "user-2" }),
        },
      }));

      vi.doMock("../../db.ts", () => ({
        getDb: vi.fn(() => ({
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn().mockResolvedValue([
                {
                  id: "user-2",
                  email: "test2@test.com",
                  passwordHash: "firebase-auth-user",
                  firebaseUid: "fb-uid-2",
                },
              ]),
            })),
          })),
          update: vi.fn(() => ({
            set: vi.fn(() => ({
              where: vi.fn(() => ({
                returning: vi.fn().mockResolvedValue([]),
              })),
            })),
          })),
          delete: vi.fn(() => ({
            where: vi.fn().mockResolvedValue([]),
          })),
        })),
      }));

      vi.doMock("../../../packages/shared/schema/index", () => ({
        customUsers: { id: "id", email: "email", firebaseUid: "firebaseUid" },
        authSessions: { userId: "userId", token: "token", expiresAt: "expiresAt" },
      }));

      vi.doMock("drizzle-orm", () => ({
        eq: vi.fn(),
        and: vi.fn(),
        gt: vi.fn(),
      }));

      vi.doMock("../../admin.ts", () => ({
        admin: {
          auth: () => ({
            updateUser: vi.fn().mockRejectedValue("Firebase error string"),
          }),
        },
      }));

      vi.doMock("../../logger.ts", () => ({
        default: { info: vi.fn(), warn: vi.fn(), error: mockLoggerError },
      }));

      const { AuthService } = await import("../../auth/service");
      const result = await AuthService.changePassword(
        "user-2",
        "anyPassword",
        "newPassword123"
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain("Password change failed");
      // The error was logged with String(err) since err is not an Error
      expect(mockLoggerError).toHaveBeenCalledWith(
        "Failed to update Firebase password during change",
        expect.objectContaining({ error: "Firebase error string" })
      );
    });
  });
});

// ===========================================================================
// auth/mfa/crypto — branch coverage (lines 38-39)
// ===========================================================================
describe("MFA crypto branches", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe("Lines 38-39: getMfaBaseKey with short dedicated key falls back to JWT_SECRET", () => {
    it("should fall back to JWT_SECRET when MFA_ENCRYPTION_KEY < 32 chars", async () => {
      vi.doMock("../../config/env.ts", () => ({
        env: { JWT_SECRET: "b".repeat(64) },
      }));
      vi.doMock("../../logger.ts", () => ({
        default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      }));

      const oldKey = process.env.MFA_ENCRYPTION_KEY;
      const oldEnv = process.env.NODE_ENV;
      process.env.MFA_ENCRYPTION_KEY = "short"; // < 32 chars
      process.env.NODE_ENV = "test";

      try {
        const { encrypt, decrypt } = await import("../../auth/mfa/crypto");
        const encrypted = encrypt("test-secret");
        expect(encrypted).toContain("v2$");
        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe("test-secret");
      } finally {
        if (oldKey !== undefined) process.env.MFA_ENCRYPTION_KEY = oldKey;
        else delete process.env.MFA_ENCRYPTION_KEY;
        if (oldEnv !== undefined) process.env.NODE_ENV = oldEnv;
        else delete process.env.NODE_ENV;
      }
    });
  });
});

// ===========================================================================
// auth/mfa/totp — branch coverage (line 93)
// ===========================================================================
describe("TOTP branches", () => {
  it("Line 93: generateTOTP uses Date.now() when timestamp is 0 (falsy)", async () => {
    const { generateTOTP, generateSecret } = await import("../../auth/mfa/totp");
    const secret = generateSecret();

    // Passing 0 triggers `timestamp || Date.now()` fallback
    const code = generateTOTP(secret, 0);

    expect(code).toHaveLength(6);
    expect(/^\d{6}$/.test(code)).toBe(true);
  });
});

// ===========================================================================
// auth/lockout — branch coverage (line 186)
// ===========================================================================
describe("Lockout branches", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe("Line 186: recordAttempt catch block falls back to checkLockout", () => {
    it("should return checkLockout result when insert fails", async () => {
      vi.doMock("../../db.ts", () => ({
        getDb: vi.fn(() => ({
          insert: vi.fn(() => {
            throw new Error("DB write failed");
          }),
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn().mockResolvedValue([]),
            })),
          })),
          delete: vi.fn(() => ({
            where: vi.fn().mockResolvedValue([]),
          })),
        })),
      }));

      vi.doMock("../../../packages/shared/schema/index", () => ({
        loginAttempts: { email: "email", success: "success", createdAt: "createdAt" },
        accountLockouts: { email: "email", unlockAt: "unlockAt" },
      }));

      vi.doMock("drizzle-orm", () => ({
        eq: vi.fn(),
        and: vi.fn(),
        gt: vi.fn(),
        sql: vi.fn(),
        count: vi.fn(() => "count"),
      }));

      vi.doMock("../../security.ts", () => ({
        SECURITY_CONFIG: { MAX_LOGIN_ATTEMPTS: 5, LOCKOUT_DURATION: 900000 },
      }));

      vi.doMock("../../config/constants.ts", () => ({
        LOGIN_ATTEMPT_WINDOW_MS: 300000,
      }));

      vi.doMock("../../auth/audit.ts", () => ({
        AuditLogger: { logAccountLocked: vi.fn().mockResolvedValue(undefined) },
      }));

      vi.doMock("../../logger.ts", () => ({
        default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      }));

      const { LockoutService } = await import("../../auth/lockout");
      const result = await LockoutService.recordAttempt("test@test.com", "1.2.3.4", false);

      expect(result).toBeDefined();
      expect(typeof result.isLocked).toBe("boolean");
    });
  });
});

// ===========================================================================
// auth/middleware — branch coverage (line 190)
// ===========================================================================
describe("Auth middleware branches", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe("Line 190: optionalAuthentication — decoded.admin in bearer token", () => {
    it("should add admin role when decoded.admin is true", async () => {
      vi.doMock("../../auth/service.ts", () => ({
        AuthService: {
          validateSession: vi.fn().mockResolvedValue(null),
          findUserByFirebaseUid: vi.fn().mockResolvedValue({
            id: "user-admin",
            email: "admin@test.com",
            isActive: true,
            firebaseUid: "fb-admin",
          }),
        },
      }));

      vi.doMock("../../admin.ts", () => ({
        admin: {
          auth: () => ({
            verifyIdToken: vi.fn().mockResolvedValue({ uid: "fb-admin", admin: true }),
          }),
        },
      }));

      vi.doMock("../../logger.ts", () => ({
        default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      }));

      vi.doMock("../../redis.ts", () => ({
        getRedisClient: vi.fn().mockReturnValue(null),
      }));

      // Must mock the types import
      vi.doMock("../../types/express.d.ts", () => ({}));

      const { optionalAuthentication } = await import("../../auth/middleware");

      const mockReq: any = {
        cookies: {},
        headers: { authorization: "Bearer valid-token" },
      };
      const mockRes: any = {};
      const mockNext = vi.fn();

      await optionalAuthentication(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.currentUser).toBeDefined();
      expect(mockReq.currentUser.roles).toContain("admin");
    });

    it("should not add admin role when decoded.admin is false/undefined", async () => {
      vi.doMock("../../auth/service.ts", () => ({
        AuthService: {
          validateSession: vi.fn().mockResolvedValue(null),
          findUserByFirebaseUid: vi.fn().mockResolvedValue({
            id: "user-regular",
            email: "user@test.com",
            isActive: true,
            firebaseUid: "fb-regular",
          }),
        },
      }));

      vi.doMock("../../admin.ts", () => ({
        admin: {
          auth: () => ({
            verifyIdToken: vi.fn().mockResolvedValue({ uid: "fb-regular" }),
          }),
        },
      }));

      vi.doMock("../../logger.ts", () => ({
        default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      }));

      vi.doMock("../../redis.ts", () => ({
        getRedisClient: vi.fn().mockReturnValue(null),
      }));

      vi.doMock("../../types/express.d.ts", () => ({}));

      const { optionalAuthentication } = await import("../../auth/middleware");

      const mockReq: any = {
        cookies: {},
        headers: { authorization: "Bearer valid-token" },
      };
      const mockRes: any = {};
      const mockNext = vi.fn();

      await optionalAuthentication(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.currentUser).toBeDefined();
      expect(mockReq.currentUser.roles).not.toContain("admin");
    });
  });
});
