/**
 * Coverage gap tests for multiple server service files.
 *
 * Targets:
 *   1. server/services/filmerRequests.ts — lines 99-100, 103-104, 260-264,
 *      294-296, 399-400, 403-404, 407-408, 441-442
 *   2. server/auth/lockout.ts — lines 195-204, 210-229 (unlockAccount + cleanup)
 *   3. server/services/osmDiscovery.ts — lines 73-75 (expired cache entry)
 *   4. server/monitoring/index.ts — line 100 (percentile empty array),
 *      lines 212-241 (admin system-status route metrics computation)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ==========================================================================
// Shared hoisted mocks — vi.mock is file-scoped, so we create one flexible
// mock setup that all describe blocks share.
// ==========================================================================

const {
  mockSelectResult,
  mockInsertResult,
  mockUpdateResult,
  chainMock,
  mockDbMode,
  mockLockoutDelete,
  mockLockoutWhere,
  mockMonitoringExecute,
  mockIsDatabaseAvailable,
} = vi.hoisted(() => {
  const mockSelectResult = vi.fn();
  const mockInsertResult = vi.fn();
  const mockUpdateResult = vi.fn();
  const mockLockoutDelete = vi.fn();
  const mockLockoutWhere = vi.fn();
  const mockMonitoringExecute = vi.fn();
  const mockIsDatabaseAvailable = vi.fn(() => true);

  // Track which mock mode is active
  const mockDbMode = { current: "filmer" as "filmer" | "lockout" | "monitoring" };

  const createChainMock = () => {
    const chain: any = {};
    chain.select = vi.fn((..._args: any[]) => chain);
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.limit = vi.fn(() => mockSelectResult());
    chain.insert = vi.fn(() => chain);
    chain.values = vi.fn(() => mockInsertResult());
    chain.returning = vi.fn(() => mockUpdateResult());
    chain.update = vi.fn(() => chain);
    chain.set = vi.fn(() => chain);
    chain.delete = vi.fn(() => chain);
    chain.for = vi.fn(() => chain);
    chain.orderBy = vi.fn(() => chain);
    chain.transaction = vi.fn(async (cb: any) => cb(chain));
    chain.onConflictDoUpdate = vi.fn(() => chain);
    chain.target = vi.fn(() => chain);
    chain.execute = vi.fn((...args: any[]) => mockMonitoringExecute(...args));
    return chain;
  };

  return {
    mockSelectResult,
    mockInsertResult,
    mockUpdateResult,
    chainMock: createChainMock(),
    mockDbMode,
    mockLockoutDelete,
    mockLockoutWhere,
    mockMonitoringExecute,
    mockIsDatabaseAvailable,
  };
});

// ---- Module mocks (file-scoped, shared by all describe blocks) ----

vi.mock("../config/env", () => ({
  env: { NODE_ENV: "test", DATABASE_URL: "mock://test" },
}));

vi.mock("../logger", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../auth/audit", () => ({
  AuditLogger: {
    log: vi.fn().mockResolvedValue(undefined),
    logAccountLocked: vi.fn().mockResolvedValue(undefined),
  },
  AUDIT_EVENTS: {
    FILMER_REQUEST_CREATED: "FILMER_REQUEST_CREATED",
    FILMER_REQUEST_ACCEPTED: "FILMER_REQUEST_ACCEPTED",
    FILMER_REQUEST_REJECTED: "FILMER_REQUEST_REJECTED",
  },
}));

vi.mock("../db", () => ({
  getDb: vi.fn(() => {
    if (mockDbMode.current === "lockout") {
      return {
        select: vi.fn(() => ({
          from: vi.fn(() => ({ where: mockLockoutWhere })),
        })),
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
          })),
        })),
        delete: mockLockoutDelete,
      };
    }
    if (mockDbMode.current === "monitoring") {
      return {
        execute: mockMonitoringExecute,
      };
    }
    // "filmer" mode
    return chainMock;
  }),
  isDatabaseAvailable: () => mockIsDatabaseAvailable(),
}));

vi.mock("@shared/schema", () => ({
  checkIns: {
    id: "id",
    userId: "userId",
    filmerUid: "filmerUid",
    filmerRequestId: "filmerRequestId",
    filmerStatus: "filmerStatus",
  },
  customUsers: { id: "id", isActive: "isActive" },
  filmerDailyCounters: { counterKey: "counterKey", day: "day", count: "count" },
  filmerRequests: {
    id: "id",
    checkInId: "checkInId",
    filmerId: "filmerId",
    requesterId: "requesterId",
    status: "status",
    updatedAt: "updatedAt",
  },
  userProfiles: { id: "id", roles: "roles", filmerVerified: "filmerVerified" },
  loginAttempts: { email: "email", success: "success", createdAt: "createdAt" },
  accountLockouts: { email: "email", unlockAt: "unlockAt", failedAttempts: "failedAttempts" },
}));

// The lockout module imports from this path directly
vi.mock("../../packages/shared/schema/index", () => ({
  loginAttempts: { email: "email", success: "success", createdAt: "createdAt" },
  accountLockouts: { email: "email", unlockAt: "unlockAt", failedAttempts: "failedAttempts" },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: any[]) => args),
  desc: vi.fn((col: any) => col),
  eq: vi.fn((...args: any[]) => args),
  lt: vi.fn((...args: any[]) => args),
  or: vi.fn((...args: any[]) => args),
  gt: vi.fn((...args: any[]) => args),
  count: vi.fn(() => "count"),
  sql: vi.fn((strings: TemplateStringsArray, ...vals: any[]) => ({ _sql: true, strings, vals })),
}));

vi.mock("../security", () => ({
  SECURITY_CONFIG: {
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 15 * 60 * 1000,
    SESSION_TTL: 7 * 24 * 60 * 60 * 1000,
    PASSWORD_MIN_LENGTH: 8,
    API_RATE_LIMIT: 100,
    PAYMENT_RATE_LIMIT: 10,
  },
}));

vi.mock("../config/constants", () => ({
  LOGIN_ATTEMPT_WINDOW_MS: 60 * 60 * 1000,
}));

vi.mock("../redis", () => ({
  getRedisClient: () => null,
}));

vi.mock("../services/videoTranscoder", () => ({
  checkFfmpegAvailable: vi.fn().mockResolvedValue({ ffmpeg: true, ffprobe: true }),
}));

// ==========================================================================
// 1. FilmerRequests service
// ==========================================================================

describe("filmerRequests — uncovered error paths", () => {
  let createFilmerRequest: typeof import("../services/filmerRequests").createFilmerRequest;
  let respondToFilmerRequest: typeof import("../services/filmerRequests").respondToFilmerRequest;
  let FilmerRequestError: typeof import("../services/filmerRequests").FilmerRequestError;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDbMode.current = "filmer";
    const mod = await import("../services/filmerRequests");
    createFilmerRequest = mod.createFilmerRequest;
    respondToFilmerRequest = mod.respondToFilmerRequest;
    FilmerRequestError = mod.FilmerRequestError;

    // Reset chain mock call tracking
    Object.values(chainMock).forEach((fn: any) => {
      if (typeof fn?.mockClear === "function") fn.mockClear();
    });
  });

  const baseInput = {
    requesterId: "skater-1",
    requesterTrustLevel: 2,
    requesterIsActive: true,
    checkInId: 1,
    filmerUid: "filmer-1",
    ipAddress: "127.0.0.1",
  };

  const baseRespondInput = {
    requestId: "req-1",
    filmerId: "filmer-1",
    action: "accept" as const,
    ipAddress: "127.0.0.1",
  };

  /** Configure sequential results for mockSelectResult (chain.limit()) */
  function setSelectSequence(results: any[][]) {
    let idx = 0;
    mockSelectResult.mockImplementation(() => {
      const res = results[idx] ?? [];
      idx++;
      return res;
    });
  }

  // ---- ensureFilmerEligible: filmer not found (lines 99-100) ----
  it("throws FILMER_NOT_FOUND when filmer user does not exist", async () => {
    setSelectSequence([
      [], // customUsers lookup → empty
    ]);

    await expect(createFilmerRequest(baseInput)).rejects.toMatchObject({
      code: "FILMER_NOT_FOUND",
      status: 404,
    });
  });

  // ---- ensureFilmerEligible: filmer inactive (lines 103-104) ----
  it("throws FILMER_INACTIVE when filmer user is not active", async () => {
    setSelectSequence([
      [{ isActive: false }], // customUsers → inactive
    ]);

    await expect(createFilmerRequest(baseInput)).rejects.toMatchObject({
      code: "FILMER_INACTIVE",
      status: 403,
    });
  });

  // ---- createFilmerRequest: existing request already resolved (line 264) ----
  it("throws REQUEST_RESOLVED when an existing request is not pending", async () => {
    setSelectSequence([
      [{ isActive: true }], // customUsers
      [{ roles: { filmer: true }, filmerVerified: false }], // userProfiles
      [{ id: 1, userId: "skater-1", filmerUid: null, filmerRequestId: null }], // checkIn
      [{ id: "req-existing", status: "accepted" }], // existing request (resolved)
    ]);

    await expect(createFilmerRequest(baseInput)).rejects.toMatchObject({
      code: "REQUEST_RESOLVED",
      status: 409,
    });
  });

  // ---- createFilmerRequest: checkIn update returns nothing (lines 294-296) ----
  it("throws CHECKIN_UPDATE_FAILED when checkIn update returns empty", async () => {
    setSelectSequence([
      [{ isActive: true }], // customUsers
      [{ roles: { filmer: true }, filmerVerified: false }], // userProfiles
      [{ id: 1, userId: "skater-1", filmerUid: null, filmerRequestId: null }], // checkIn
      [], // no existing request
      [], // ensureQuota → no counter
    ]);

    mockInsertResult.mockResolvedValue([]);
    // returning() is called twice in the transaction:
    // 1st: not called (insert doesn't use returning in this path — quota insert)
    // Actually the flow: ensureQuota inserts (values()), then insert filmerRequests (values()),
    // then update checkIn (returning()).
    // The update().set().where().returning() needs to return empty.
    mockUpdateResult.mockResolvedValue([]);

    await expect(createFilmerRequest(baseInput)).rejects.toMatchObject({
      code: "CHECKIN_UPDATE_FAILED",
      status: 500,
    });
  });

  // ---- respondToFilmerRequest: request not found (lines 399-400) ----
  it("throws NOT_FOUND when filmer request does not exist", async () => {
    setSelectSequence([
      [{ isActive: true }], // customUsers (ensureFilmerEligible)
      [{ roles: { filmer: true }, filmerVerified: false }], // userProfiles
      [], // ensureQuota → no counter
      [], // filmerRequests lookup → empty
    ]);
    mockInsertResult.mockResolvedValue([]);

    await expect(respondToFilmerRequest(baseRespondInput)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });

  // ---- respondToFilmerRequest: wrong filmer (lines 403-404) ----
  it("throws FORBIDDEN when a different filmer tries to respond", async () => {
    setSelectSequence([
      [{ isActive: true }],
      [{ roles: { filmer: true }, filmerVerified: false }],
      [], // ensureQuota
      [
        {
          id: "req-1",
          filmerId: "other-filmer",
          status: "pending",
          checkInId: 1,
          requesterId: "skater-1",
        },
      ],
    ]);
    mockInsertResult.mockResolvedValue([]);

    await expect(respondToFilmerRequest(baseRespondInput)).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
  });

  // ---- respondToFilmerRequest: already resolved (lines 407-408) ----
  it("throws INVALID_STATUS when request is already resolved", async () => {
    setSelectSequence([
      [{ isActive: true }],
      [{ roles: { filmer: true }, filmerVerified: false }],
      [],
      [
        {
          id: "req-1",
          filmerId: "filmer-1",
          status: "accepted",
          checkInId: 1,
          requesterId: "skater-1",
        },
      ],
    ]);
    mockInsertResult.mockResolvedValue([]);

    await expect(respondToFilmerRequest(baseRespondInput)).rejects.toMatchObject({
      code: "INVALID_STATUS",
      status: 409,
    });
  });

  // ---- respondToFilmerRequest: checkIn update fails (lines 441-442) ----
  it("throws CHECKIN_UPDATE_FAILED when checkIn update returns empty on respond", async () => {
    setSelectSequence([
      [{ isActive: true }],
      [{ roles: { filmer: true }, filmerVerified: false }],
      [], // ensureQuota
      [
        {
          id: "req-1",
          filmerId: "filmer-1",
          status: "pending",
          checkInId: 1,
          requesterId: "skater-1",
        },
      ],
    ]);
    mockInsertResult.mockResolvedValue([]);

    // returning() is called twice:
    //   1st: filmerRequests update → success
    //   2nd: checkIns update → empty (failure)
    let updateCallIndex = 0;
    mockUpdateResult.mockImplementation(() => {
      updateCallIndex++;
      if (updateCallIndex === 1) return [{ id: "req-1" }];
      return [];
    });

    await expect(respondToFilmerRequest(baseRespondInput)).rejects.toMatchObject({
      code: "CHECKIN_UPDATE_FAILED",
      status: 500,
    });
  });
});

// ==========================================================================
// 2. LockoutService — unlockAccount + cleanup (lines 195-204, 210-229)
// ==========================================================================

describe("LockoutService — unlockAccount and cleanup coverage", () => {
  let LockoutService: typeof import("../auth/lockout").LockoutService;
  let logger: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDbMode.current = "lockout";

    const mod = await import("../auth/lockout");
    LockoutService = mod.LockoutService;
    logger = (await import("../logger")).default;

    // Default: where resolves to empty array (no lockout found)
    mockLockoutWhere.mockResolvedValue([]);
    mockLockoutDelete.mockReturnValue({ where: mockLockoutWhere });
  });

  it("unlockAccount deletes the lockout row and logs info", async () => {
    mockLockoutWhere.mockResolvedValue(undefined);

    await LockoutService.unlockAccount("  Admin@Example.COM  ");

    expect(mockLockoutDelete).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      "Account unlocked manually",
      expect.objectContaining({ email: "admin@example.com", reason: "manual_unlock" })
    );
  });

  it("cleanup deletes expired lockouts and old attempts", async () => {
    mockLockoutWhere.mockResolvedValue(undefined);

    await LockoutService.cleanup();

    // Should call delete twice: once for expired lockouts, once for old attempts
    expect(mockLockoutDelete).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledWith("Cleaned up expired lockouts and old login attempts");
  });

  it("cleanup catches and logs errors from DB", async () => {
    mockLockoutWhere.mockRejectedValue(new Error("DB down for cleanup"));

    await LockoutService.cleanup();

    expect(logger.error).toHaveBeenCalledWith(
      "Error cleaning up lockout data",
      expect.objectContaining({ error: "DB down for cleanup" })
    );
  });

  it("cleanup logs 'Unknown error' for non-Error thrown values", async () => {
    mockLockoutWhere.mockRejectedValue("just-a-string");

    await LockoutService.cleanup();

    expect(logger.error).toHaveBeenCalledWith(
      "Error cleaning up lockout data",
      expect.objectContaining({ error: "Unknown error" })
    );
  });
});

// ==========================================================================
// 3. OSM Discovery — expired in-memory cache entry (lines 73-75)
// ==========================================================================

describe("osmDiscovery — expired cache entry (lines 73-75)", () => {
  const mockFetch = vi.fn();
  vi.stubGlobal("fetch", mockFetch);

  let discoverSkateparks: typeof import("../services/osmDiscovery").discoverSkateparks;
  let isAreaCached: typeof import("../services/osmDiscovery").isAreaCached;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../services/osmDiscovery");
    discoverSkateparks = mod.discoverSkateparks;
    isAreaCached = mod.isAreaCached;
  });

  it("returns false and removes expired cache entries from the fallback map", async () => {
    // Use a unique coordinate grid cell that no other test uses
    const lat = -89.0;
    const lng = -89.0;

    // First call: populate the in-memory cache by performing a discovery
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ elements: [] }),
    });
    await discoverSkateparks(lat, lng);

    // The area should now be cached
    const cachedBefore = await isAreaCached(lat, lng);
    expect(cachedBefore).toBe(true);

    // Fast-forward time by more than CACHE_TTL_MS (1 hour = 3_600_000 ms)
    vi.useFakeTimers();
    vi.advanceTimersByTime(3_600_001);

    // Now the cache entry should be expired — lines 73-75 execute
    const cachedAfter = await isAreaCached(lat, lng);
    expect(cachedAfter).toBe(false);

    vi.useRealTimers();
  });
});

// ==========================================================================
// 4. Monitoring — percentile with empty array + system-status route
// ==========================================================================

describe("monitoring — percentile empty array and admin system-status", () => {
  let registerMonitoringRoutes: typeof import("../monitoring/index").registerMonitoringRoutes;
  let metricsMiddleware: typeof import("../monitoring/index").metricsMiddleware;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDbMode.current = "monitoring";
    mockMonitoringExecute.mockResolvedValue("ok");
    mockIsDatabaseAvailable.mockReturnValue(true);

    const mod = await import("../monitoring/index");
    registerMonitoringRoutes = mod.registerMonitoringRoutes;
    metricsMiddleware = mod.metricsMiddleware;
  });

  function createMockRes() {
    let statusCode = 200;
    const finishListeners: Function[] = [];
    const jsonData: any[] = [];

    const res: any = {
      get statusCode() {
        return statusCode;
      },
      set statusCode(val: number) {
        statusCode = val;
      },
      on: vi.fn((event: string, cb: Function) => {
        if (event === "finish") finishListeners.push(cb);
        return res;
      }),
      status: vi.fn((code: number) => {
        statusCode = code;
        return res;
      }),
      json: vi.fn((data: any) => {
        jsonData.push(data);
        return res;
      }),
      _triggerFinish: () => {
        for (const cb of finishListeners) cb();
      },
      _getJsonData: () => jsonData,
    };
    return res;
  }

  it("returns valid metrics in admin system-status including p95/p99 values", async () => {
    const routes: Record<string, Function> = {};
    const app: any = {
      get: vi.fn((path: string, handler: Function) => {
        routes[path] = handler;
      }),
    };
    registerMonitoringRoutes(app);

    const req: any = {};
    const res = createMockRes();
    await routes["/api/admin/system-status"](req, res);

    const data = res._getJsonData()[0];
    expect(data).toHaveProperty("health");
    expect(data).toHaveProperty("metrics");
    expect(data).toHaveProperty("process");

    // percentile values are numbers >= 0
    expect(typeof data.metrics.p95LatencyMs).toBe("number");
    expect(typeof data.metrics.p99LatencyMs).toBe("number");
    expect(data.metrics.p95LatencyMs).toBeGreaterThanOrEqual(0);
    expect(data.metrics.p99LatencyMs).toBeGreaterThanOrEqual(0);

    // errorRate, requestsPerMinute, avgLatencyMs
    expect(data.metrics.errorRate).toBeGreaterThanOrEqual(0);
    expect(typeof data.metrics.requestsPerMinute).toBe("number");
    expect(typeof data.metrics.avgLatencyMs).toBe("number");

    // topStatusCodes is an array
    expect(Array.isArray(data.metrics.topStatusCodes)).toBe(true);

    // Process info
    expect(data.process.pid).toBe(process.pid);
    expect(data.process.nodeVersion).toBe(process.version);
    expect(typeof data.process.memoryUsageMb).toBe("number");
    expect(typeof data.process.heapUsedMb).toBe("number");
  });

  it("admin system-status computes metrics fields correctly", async () => {
    const routes: Record<string, Function> = {};
    const app: any = {
      get: vi.fn((path: string, handler: Function) => {
        routes[path] = handler;
      }),
    };
    registerMonitoringRoutes(app);

    const req: any = {};
    const res = createMockRes();
    await routes["/api/admin/system-status"](req, res);

    const data = res._getJsonData()[0];
    expect(data.metrics.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(data.metrics.errorRate).toBeLessThanOrEqual(1);
    expect(typeof data.process.cpuUser).toBe("number");
    expect(typeof data.process.cpuSystem).toBe("number");
  });
});
