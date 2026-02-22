/**
 * Miscellaneous remaining coverage gaps across multiple server and client files.
 *
 * 1. server/auth/lockout.ts   — unlockAccount, cleanup, cleanup error path
 * 2. server/auth/mfa.ts       — isEnabled returns false for no record
 * 3. server/auth/middleware.ts — requireRecentAuth fallback (in-memory, not recent)
 * 4. server/monitoring/index.ts — percentile with empty array, npm_package_version undefined
 * 5. server/db.ts              — getUserDisplayName fallback to "Skater"
 * 6. server/logger.ts          — redact skips falsy values, maskIfSensitive non-sensitive
 * 7. server/middleware/cronAuth.ts — verifyCronSecret with no CRON_SECRET configured
 * 8. client/src/lib/api/errors.ts — extractCode nested error object, extractMessage fallback
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ===========================================================================
// 1. LockoutService — unlockAccount + cleanup
// ===========================================================================

describe("LockoutService.unlockAccount and cleanup", () => {
  const { mockLockoutSelect, mockLockoutDelete, mockLockoutFrom, mockLockoutWhere } = vi.hoisted(
    () => ({
      mockLockoutSelect: vi.fn(),
      mockLockoutDelete: vi.fn(),
      mockLockoutFrom: vi.fn(),
      mockLockoutWhere: vi.fn(),
    })
  );

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    vi.doMock("../../db", () => ({
      getDb: () => ({
        select: mockLockoutSelect,
        delete: mockLockoutDelete,
      }),
    }));

    vi.doMock("../../logger", () => ({
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

    vi.doMock("../../auth/audit", () => ({
      AuditLogger: {
        logAccountLocked: vi.fn().mockResolvedValue(undefined),
      },
    }));

    vi.doMock("../../security", () => ({
      SECURITY_CONFIG: {
        MAX_LOGIN_ATTEMPTS: 5,
        LOCKOUT_DURATION: 15 * 60 * 1000,
      },
    }));

    vi.doMock("../../../packages/shared/schema/index", () => ({
      loginAttempts: { email: "email", success: "success", createdAt: "createdAt" },
      accountLockouts: { email: "email", unlockAt: "unlockAt", failedAttempts: "failedAttempts" },
    }));

    vi.doMock("drizzle-orm", () => ({
      eq: vi.fn((...args: unknown[]) => args),
      and: vi.fn((...args: unknown[]) => args),
      gt: vi.fn((...args: unknown[]) => args),
      sql: vi.fn((strings: TemplateStringsArray, ..._vals: unknown[]) => ({
        _sql: true,
        strings,
      })),
      count: vi.fn(() => "count"),
    }));

    vi.doMock("../../config/constants", () => ({
      LOGIN_ATTEMPT_WINDOW_MS: 60 * 60 * 1000,
    }));

    mockLockoutWhere.mockResolvedValue(undefined);
    mockLockoutDelete.mockReturnValue({ where: mockLockoutWhere });
    mockLockoutFrom.mockReturnValue({ where: mockLockoutWhere });
    mockLockoutSelect.mockReturnValue({ from: mockLockoutFrom });
  });

  it("unlockAccount deletes lockout and logs info", async () => {
    const { LockoutService } = await import("../../auth/lockout");
    const logger = (await import("../../logger")).default;

    await LockoutService.unlockAccount("Test@Example.com");

    expect(mockLockoutDelete).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      "Account unlocked manually",
      expect.objectContaining({ email: "test@example.com" })
    );
  });

  it("cleanup deletes expired lockouts and old attempts", async () => {
    const { LockoutService } = await import("../../auth/lockout");
    const logger = (await import("../../logger")).default;

    await LockoutService.cleanup();

    expect(mockLockoutDelete).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledWith("Cleaned up expired lockouts and old login attempts");
  });

  it("cleanup handles errors gracefully", async () => {
    mockLockoutWhere.mockRejectedValue(new Error("DB cleanup error"));

    const { LockoutService } = await import("../../auth/lockout");
    const logger = (await import("../../logger")).default;

    await LockoutService.cleanup();

    expect(logger.error).toHaveBeenCalledWith(
      "Error cleaning up lockout data",
      expect.objectContaining({ error: "DB cleanup error" })
    );
  });
});

// ===========================================================================
// 2. MfaService.isEnabled — returns false when no record found
// ===========================================================================

describe("MfaService.isEnabled", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns false when no MFA record exists for user", async () => {
    const mockWhere = vi.fn().mockResolvedValue([]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

    vi.doMock("../../db", () => ({
      getDb: () => ({ select: mockSelect }),
    }));

    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },

      createChildLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
    }));

    vi.doMock("../../config/env", () => ({
      env: { JWT_SECRET: "test-secret-key-at-least-32-chars-long" },
    }));

    vi.doMock("../../../packages/shared/schema/index", () => ({
      mfaSecrets: { userId: "userId" },
    }));

    vi.doMock("drizzle-orm", () => ({
      eq: vi.fn((...args: unknown[]) => args),
    }));

    vi.doMock("../../auth/audit", () => ({
      AuditLogger: { logMfaEvent: vi.fn().mockResolvedValue(undefined) },
      AUDIT_EVENTS: { MFA_BACKUP_CODES_REGENERATED: "mfa.backup_codes_regenerated" },
    }));

    vi.doMock("bcryptjs", () => ({
      default: { hash: vi.fn(), compare: vi.fn() },
    }));

    const { MfaService } = await import("../../auth/mfa");

    const result = await MfaService.isEnabled("nonexistent-user");
    expect(result).toBe(false);
  });
});

// ===========================================================================
// 3. requireRecentAuth — in-memory fallback, not recent
// ===========================================================================

describe("requireRecentAuth — in-memory fallback branch", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 403 REAUTH_REQUIRED when user has no recent auth in fallback map", async () => {
    vi.doMock("../../auth/service", () => ({
      AuthService: {
        validateSession: vi.fn(),
        findUserByFirebaseUid: vi.fn(),
      },
    }));

    vi.doMock("../../admin", () => ({
      admin: {
        auth: () => ({
          verifyIdToken: vi.fn(),
          getUser: vi.fn(),
        }),
      },
    }));

    vi.doMock("../../types/express.d.ts", () => ({}));

    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },

      createChildLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
    }));

    vi.doMock("../../redis", () => ({
      getRedisClient: () => null, // Force fallback to in-memory
    }));

    const { requireRecentAuth } = await import("../../auth/middleware");

    const req: any = {
      headers: {},
      cookies: {},
      currentUser: { id: "user-no-recent-auth" },
    };

    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    const next = vi.fn();

    await requireRecentAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "REAUTH_REQUIRED" }));
    expect(next).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 4. Monitoring — percentile empty array, npm_package_version undefined
// ===========================================================================

describe("Monitoring — percentile and version coverage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("system-status returns p95=0, p99=0 when no latency samples exist and version=unknown", async () => {
    // Ensure npm_package_version is undefined
    const originalVersion = process.env.npm_package_version;
    delete process.env.npm_package_version;

    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },

      createChildLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
    }));

    vi.doMock("../../config/env", () => ({
      env: { NODE_ENV: "test" },
    }));

    vi.doMock("../../db", () => ({
      getDb: () => ({
        execute: vi.fn().mockResolvedValue("ok"),
      }),
      isDatabaseAvailable: vi.fn(() => true),
    }));

    vi.doMock("../../redis", () => ({
      getRedisClient: () => null,
    }));

    vi.doMock("drizzle-orm", () => ({
      sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
        _sql: strings.join("?"),
        values,
      }),
    }));

    vi.doMock("../../services/videoTranscoder", () => ({
      checkFfmpegAvailable: vi.fn().mockResolvedValue({ ffmpeg: true, ffprobe: true }),
    }));

    const { registerMonitoringRoutes } = await import("../../monitoring/index");

    // Capture the route handler
    const routes: Record<string, Function> = {};
    const app: any = {
      get: vi.fn((path: string, ...handlers: Function[]) => {
        routes[path] = handlers[handlers.length - 1];
      }),
    };
    registerMonitoringRoutes(app);

    // Call the system-status handler directly
    const req: any = {};
    const jsonData: unknown[] = [];
    const res: any = {
      json: vi.fn((data: unknown) => {
        jsonData.push(data);
        return res;
      }),
      status: vi.fn().mockReturnThis(),
    };

    await routes["/api/admin/system-status"](req, res);

    const data = jsonData[0] as any;

    // When no latency samples exist, percentile should return 0
    expect(data.metrics.p95LatencyMs).toBe(0);
    expect(data.metrics.p99LatencyMs).toBe(0);

    // npm_package_version is undefined -> should be "unknown"
    expect(data.health.version).toBe("unknown");

    // Verify process info
    expect(data.process.pid).toBe(process.pid);
    expect(data.process.nodeVersion).toBe(process.version);
    expect(typeof data.process.memoryUsageMb).toBe("number");
    expect(typeof data.process.cpuUser).toBe("number");

    // Restore
    if (originalVersion !== undefined) {
      process.env.npm_package_version = originalVersion;
    }
  });
});

// ===========================================================================
// 5. db.ts — getUserDisplayName fallback to "Skater"
// ===========================================================================

// NOTE: getUserDisplayName and Logger redact tests moved to separate isolated
// test files to avoid conflicts with module-level vi.mock() from other files.

// ===========================================================================
// 7. middleware/cronAuth.ts — verifyCronSecret with no CRON_SECRET
// ===========================================================================

describe("verifyCronSecret with no CRON_SECRET", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns false when CRON_SECRET is not configured", async () => {
    // Save and clear CRON_SECRET
    const origCronSecret = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;

    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },

      createChildLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
    }));

    const { verifyCronSecret } = await import("../../middleware/cronAuth");
    const logger = (await import("../../logger")).default;

    const result = verifyCronSecret("Bearer some-secret");

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      "[Cron] CRON_SECRET not configured — rejecting request"
    );

    // Restore
    if (origCronSecret !== undefined) {
      process.env.CRON_SECRET = origCronSecret;
    }
  });
});

// ===========================================================================
// 8. client/src/lib/api/errors.ts — extractCode nested error object
// ===========================================================================

describe("errors.ts — extractCode with nested error object containing string code", () => {
  it("extracts code from payload.error.code (nested object path)", async () => {
    const { normalizeApiError } = await import("../../../client/src/lib/api/errors");

    const err = normalizeApiError({
      payload: { error: { code: "TOO_FAR" } },
      status: 422,
    });

    expect(err.code).toBe("TOO_FAR");
  });

  it("falls back to UNKNOWN when nested error.code is not a string", async () => {
    const { normalizeApiError } = await import("../../../client/src/lib/api/errors");

    const err = normalizeApiError({
      payload: { error: { code: 12345 } },
      status: 500,
    });

    expect(err.code).toBe("UNKNOWN");
  });

  it("returns undefined from extractMessage for object with no message/error strings", async () => {
    const { normalizeApiError } = await import("../../../client/src/lib/api/errors");

    const err = normalizeApiError({
      payload: { data: { nested: true } },
    });

    expect(err.message).toBe("Something went wrong. Please try again.");
  });

  it("returns fallback message when payload is null and no statusText", async () => {
    const { normalizeApiError } = await import("../../../client/src/lib/api/errors");

    const err = normalizeApiError({
      payload: null,
    });

    expect(err.message).toBe("Something went wrong. Please try again.");
    expect(err.code).toBe("UNKNOWN");
  });
});
