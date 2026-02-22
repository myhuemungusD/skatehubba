/**
 * @fileoverview Targeted coverage tests for uncovered lines across 8 route files.
 *
 * Tests are organized by route module. All route modules share a single set of
 * vi.mock declarations (since vitest hoists them). Runtime flags control behavior
 * per test.
 *
 * Covered gaps:
 * - filmer.ts: error paths in respond/list (lines 23, 91, 108)
 * - moderation.ts: missing admin ID checks (lines 100, 139)
 * - metrics.ts: catch blocks in votes-per-battle, crew-join-rate, retention (lines 146, 163, 195-196)
 * - trickmint.ts: catch blocks in GET /:id and DELETE /:id (lines 418-419, 458-459)
 * - games-challenges.ts: catch blocks in create/respond (lines 94-98, 174-179)
 * - admin.ts: date validation, tier override paths (lines 302, 308, 328, 358)
 * - profile.ts: avatar upload flow + error cleanup (lines 223, 232-253, 264)
 * - remoteSkate.ts: auth failure paths (lines 100, 112)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Hoisted mock state — accessible to both vi.mock factories and tests
// =============================================================================

const mocks = vi.hoisted(() => {
  // Filmer
  const createFilmerRequest = vi.fn();
  const respondToFilmerRequest = vi.fn();
  const listFilmerRequests = vi.fn();

  // Moderation
  const createReport = vi.fn();
  const listReports = vi.fn();
  const applyModerationAction = vi.fn();
  const setProVerificationStatus = vi.fn();

  // Database
  const mockExecute = vi.fn();
  // Mutable reference so tests can set db to null
  const dbState: { db: any; dbAvailable: boolean } = {
    db: { execute: mockExecute },
    dbAvailable: true,
  };

  // getDb chain
  const dbChain: any = {};
  const chainMethods = [
    "select",
    "from",
    "where",
    "orderBy",
    "limit",
    "offset",
    "update",
    "set",
    "returning",
    "insert",
    "values",
    "delete",
    "onConflictDoUpdate",
  ];
  for (const m of chainMethods) {
    dbChain[m] = vi.fn().mockReturnValue(dbChain);
  }
  // Default: return empty array (thenable)
  dbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);
  dbChain.offset.mockResolvedValue([]);
  dbChain.returning.mockResolvedValue([]);

  // Firebase admin
  const verifyIdToken = vi.fn();
  const mockTransaction = vi.fn();
  const fileSave = vi.fn().mockResolvedValue(undefined);
  const fileDelete = vi.fn().mockResolvedValue(undefined);

  // Profile service
  const isAvailable = vi.fn().mockResolvedValue(true);
  const reserve = vi.fn().mockResolvedValue(true);
  const ensure = vi.fn().mockResolvedValue(true);
  const release = vi.fn().mockResolvedValue(undefined);
  const createProfileWithRollback = vi.fn();

  // Game notification
  const sendGameNotificationToUser = vi.fn().mockResolvedValue(undefined);

  // Video processing
  const processUpload = vi.fn();
  const confirmDirectUpload = vi.fn();
  const generateUploadUrls = vi.fn();
  const getUserDisplayName = vi.fn().mockResolvedValue("TestUser");

  return {
    createFilmerRequest,
    respondToFilmerRequest,
    listFilmerRequests,
    createReport,
    listReports,
    applyModerationAction,
    setProVerificationStatus,
    mockExecute,
    dbState,
    dbChain,
    verifyIdToken,
    mockTransaction,
    fileSave,
    fileDelete,
    isAvailable,
    reserve,
    ensure,
    release,
    createProfileWithRollback,
    sendGameNotificationToUser,
    processUpload,
    confirmDirectUpload,
    generateUploadUrls,
    getUserDisplayName,
  };
});

// =============================================================================
// vi.mock declarations (hoisted to top of file by vitest)
// =============================================================================

// --- Filmer service ---
vi.mock("../../services/filmerRequests", () => {
  class FilmerRequestError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
      this.name = "FilmerRequestError";
    }
  }
  return {
    createFilmerRequest: (...a: any[]) => mocks.createFilmerRequest(...a),
    respondToFilmerRequest: (...a: any[]) => mocks.respondToFilmerRequest(...a),
    listFilmerRequests: (...a: any[]) => mocks.listFilmerRequests(...a),
    FilmerRequestError,
  };
});

vi.mock("@shared/validation/filmer", () => ({
  FilmerRequestInput: {
    safeParse: (body: any) => {
      if (!body?.checkInId || !body?.filmerUid)
        return { success: false, error: { flatten: () => ({}) } };
      return { success: true, data: body };
    },
  },
  FilmerRespondInput: {
    safeParse: (body: any) => {
      if (!body?.requestId || !body?.action)
        return { success: false, error: { flatten: () => ({}) } };
      return { success: true, data: body };
    },
  },
  FilmerRequestsQuery: {
    safeParse: (query: any) => {
      if (query?.status === "__invalid__")
        return { success: false, error: { flatten: () => ({}) } };
      return {
        success: true,
        data: { status: query.status, role: query.role, limit: query.limit },
      };
    },
  },
}));

vi.mock("../../auth/audit", () => ({
  getClientIP: () => "127.0.0.1",
}));

// --- Moderation service ---
vi.mock("../../services/moderationStore", () => ({
  createReport: (...a: any[]) => mocks.createReport(...a),
  listReports: (...a: any[]) => mocks.listReports(...a),
  applyModerationAction: (...a: any[]) => mocks.applyModerationAction(...a),
  setProVerificationStatus: (...a: any[]) => mocks.setProVerificationStatus(...a),
}));

// --- Auth middleware (pass-through, let tests set currentUser) ---
vi.mock("../../auth/middleware", () => ({
  authenticateUser: (req: any, _res: any, next: any) => {
    req.currentUser = req.currentUser ?? null;
    next();
  },
  requireAdmin: (_req: any, _res: any, next: any) => next(),
  requireRecentAuth: vi.fn((_req: any, _res: any, next: any) => next()),
}));

vi.mock("../../middleware/trustSafety", () => ({
  enforceTrustAction: () => (_req: any, _res: any, next: any) => next(),
  enforceAdminRateLimit: () => (_req: any, _res: any, next: any) => next(),
  enforceNotBanned: () => (_req: any, _res: any, next: any) => next(),
}));

// --- Database (shared by metrics/admin/trickmint/games/profile) ---
vi.mock("../../db", () => ({
  get db() {
    return mocks.dbState.db;
  },
  getDb: () => mocks.dbChain,
  isDatabaseAvailable: () => mocks.dbState.dbAvailable,
  getUserDisplayName: (...a: any[]) => mocks.getUserDisplayName(...a),
}));

// --- Firebase admin (shared by remoteSkate + profile) ---
vi.mock("../../admin", () => ({
  admin: {
    auth: () => ({
      verifyIdToken: (...a: any[]) => mocks.verifyIdToken(...a),
    }),
    storage: () => ({
      bucket: (name?: string) => ({
        name: name || "test-bucket",
        file: () => ({
          save: (...a: any[]) => mocks.fileSave(...a),
          delete: (...a: any[]) => mocks.fileDelete(...a),
        }),
      }),
    }),
    firestore: Object.assign(
      () => ({
        collection: () => ({
          doc: (id: string) => ({
            collection: () => ({
              doc: (subId?: string) => ({ id: subId || "new-round-id" }),
            }),
          }),
        }),
        runTransaction: (...a: any[]) => mocks.mockTransaction(...a),
      }),
      { FieldValue: { serverTimestamp: () => "SERVER_TIMESTAMP" } }
    ),
  },
}));

// --- Profile-specific ---
vi.mock("../../config/env", () => ({
  env: { FIREBASE_STORAGE_BUCKET: "test-bucket" },
}));

vi.mock("@shared/schema", () => ({
  onboardingProfiles: { uid: "uid" },
  trickClips: {
    _table: "trick_clips",
    id: "id",
    userId: "userId",
    isPublic: "isPublic",
    status: "status",
    views: "views",
    createdAt: "createdAt",
  },
  usernames: {},
  customUsers: {
    id: "id",
    email: "email",
    firstName: "firstName",
    lastName: "lastName",
    accountTier: "accountTier",
    trustLevel: "trustLevel",
    isActive: "isActive",
    isEmailVerified: "isEmailVerified",
    lastLoginAt: "lastLoginAt",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    proAwardedBy: "proAwardedBy",
    premiumPurchasedAt: "premiumPurchasedAt",
  },
  games: { id: "id", player1Id: "player1Id", player2Id: "player2Id", status: "status" },
  moderationProfiles: {
    userId: "userId",
    isBanned: "isBanned",
    banExpiresAt: "banExpiresAt",
    reputationScore: "reputationScore",
    proVerificationStatus: "proVerificationStatus",
    isProVerified: "isProVerified",
    trustLevel: "trustLevel",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
  moderationReports: { id: "id", status: "status" },
  modActions: { id: "id", createdAt: "createdAt" },
  auditLogs: {
    id: "id",
    eventType: "eventType",
    userId: "userId",
    success: "success",
    createdAt: "createdAt",
  },
  orders: {},
}));

vi.mock("@shared/validation/profile", () => ({
  profileCreateSchema: {
    safeParse: (body: any) => {
      if (!body) return { success: false, error: { flatten: () => ({}) } };
      return { success: true, data: body };
    },
  },
  usernameSchema: {
    safeParse: (val: any) => {
      if (!val || val.length < 3) return { success: false };
      return { success: true, data: val };
    },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  sql: Object.assign((strings: TemplateStringsArray, ..._v: any[]) => ({ _sql: true }), {
    raw: (s: string) => ({ _sql: true, raw: s }),
  }),
  count: vi.fn(),
  ilike: vi.fn(),
  or: vi.fn(),
  inArray: vi.fn(),
}));

vi.mock("nanoid", () => ({ customAlphabet: () => () => "abcd1234" }));

vi.mock("../../middleware/firebaseUid", () => ({
  requireFirebaseUid: (req: any, _res: any, next: any) => {
    req.firebaseUid = req.firebaseUid || "test-uid";
    next();
  },
}));

vi.mock("../../middleware/security", () => ({
  profileCreateLimiter: (_req: any, _res: any, next: any) => next(),
  usernameCheckLimiter: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../../services/profileService", () => ({
  createUsernameStore: () => ({
    isAvailable: (...a: any[]) => mocks.isAvailable(...a),
    reserve: (...a: any[]) => mocks.reserve(...a),
    ensure: (...a: any[]) => mocks.ensure(...a),
    release: (...a: any[]) => mocks.release(...a),
  }),
  createProfileWithRollback: (...a: any[]) => mocks.createProfileWithRollback(...a),
}));

vi.mock("../../config/constants", () => ({
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
  DEFAULT_AUDIT_PAGE_SIZE: 50,
  MAX_AUDIT_PAGE_SIZE: 100,
  MAX_AVATAR_BYTES: 5 * 1024 * 1024,
  MAX_USERNAME_GENERATION_ATTEMPTS: 5,
}));

vi.mock("../../utils/apiError", () => ({
  Errors: {
    validation: (res: any, issues: any, code?: string, msg?: string) =>
      res
        .status(400)
        .json({ error: code || "VALIDATION_ERROR", message: msg, details: { issues } }),
    unauthorized: (res: any) => res.status(401).json({ error: "UNAUTHORIZED" }),
    forbidden: (res: any, code?: string, msg?: string) =>
      res.status(403).json({ error: code || "FORBIDDEN", message: msg }),
    badRequest: (res: any, code: string, msg: string, details?: any) =>
      res.status(400).json({ error: code, message: msg, details }),
    notFound: (res: any, code?: string, msg?: string) =>
      res.status(404).json({ error: code || "NOT_FOUND", message: msg }),
    conflict: (res: any, code: string, msg: string, details?: any) =>
      res.status(409).json({ error: code, message: msg }),
    tooLarge: (res: any, code: string, msg: string) =>
      res.status(413).json({ error: code, message: msg }),
    internal: (res: any, code?: string, msg?: string) =>
      res.status(500).json({ error: code || "INTERNAL_ERROR", message: msg }),
    dbUnavailable: (res: any) => res.status(503).json({ error: "DATABASE_UNAVAILABLE" }),
    unavailable: (res: any, code: string, msg: string) =>
      res.status(503).json({ error: code, message: msg }),
  },
}));

vi.mock("../../services/gameNotificationService", () => ({
  sendGameNotificationToUser: (...a: any[]) => mocks.sendGameNotificationToUser(...a),
}));

vi.mock("../../services/storageService", () => ({
  generateUploadUrls: (...a: any[]) => mocks.generateUploadUrls(...a),
  UPLOAD_LIMITS: {
    MAX_VIDEO_SIZE_BYTES: 50 * 1024 * 1024,
    MAX_THUMBNAIL_SIZE_BYTES: 2 * 1024 * 1024,
    ALLOWED_VIDEO_MIME_TYPES: ["video/webm", "video/mp4", "video/quicktime"],
    ALLOWED_THUMBNAIL_MIME_TYPES: ["image/jpeg", "image/png", "image/webp"],
    SIGNED_URL_EXPIRY_MS: 900000,
  },
}));

vi.mock("../../services/videoProcessingService", () => ({
  processUpload: (...a: any[]) => mocks.processUpload(...a),
  confirmDirectUpload: (...a: any[]) => mocks.confirmDirectUpload(...a),
  VIDEO_LIMITS: { MAX_VIDEO_DURATION_MS: 60000 },
}));

vi.mock("../../middleware/feedCache", () => ({
  feedCache: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../../services/videoTranscoder", () => ({}));

vi.mock("../../analytics/queries", () => ({
  WAB_AU_SNAPSHOT: "SELECT_WAB_AU",
  WAB_AU_TREND_12_WEEKS: "SELECT_TREND",
  UPLOADS_WITH_RESPONSE_48H: "SELECT_RESPONSE",
  VOTES_PER_BATTLE: "SELECT_VOTES",
  CREW_JOIN_RATE: "SELECT_CREW",
  D7_RETENTION: "SELECT_RETENTION",
  KPI_DASHBOARD: "SELECT_KPI",
}));

vi.mock("../../routes/games-shared", () => ({
  createGameSchema: {
    safeParse: (data: any) => {
      if (!data?.opponentId)
        return {
          success: false,
          error: { flatten: () => ({ fieldErrors: { opponentId: ["required"] } }) },
        };
      return { success: true, data: { opponentId: data.opponentId } };
    },
  },
  respondGameSchema: {
    safeParse: (data: any) => {
      if (typeof data?.accept !== "boolean")
        return {
          success: false,
          error: { flatten: () => ({ fieldErrors: { accept: ["required"] } }) },
        };
      return { success: true, data: { accept: data.accept } };
    },
  },
  getUserDisplayName: vi.fn().mockResolvedValue("TestPlayer"),
  TURN_DEADLINE_MS: 24 * 60 * 60 * 1000,
}));

vi.mock("../../logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock("../../middleware/auditLog", () => ({
  auditMiddleware: vi.fn(() => vi.fn((_req: any, _res: any, next: any) => next())),
  emitAuditLog: vi.fn(),
}));

// --- Express Router mock (captures all route registrations) ---
// Each Router() call gets a unique ID so colliding paths (e.g. POST /create in
// both profile and games-challenges) don't overwrite each other.
const routeHandlers: Record<string, any[][]> = {};
let _routerCounter = 0;

vi.mock("express", () => ({
  Router: () => {
    const routerId = _routerCounter++;
    const register = (method: string) =>
      vi.fn((path: string, ...handlers: any[]) => {
        const key = `${method} ${path}`;
        if (!routeHandlers[key]) routeHandlers[key] = [];
        routeHandlers[key].push(handlers);
      });
    return {
      get: register("GET"),
      post: register("POST"),
      put: register("PUT"),
      delete: register("DELETE"),
      patch: register("PATCH"),
      use: vi.fn(),
    };
  },
}));

// =============================================================================
// Imports — all route modules (after mocks are declared)
// =============================================================================

// Filmer exports handler functions directly (not via Router)
const { handleFilmerRequest, handleFilmerRespond, handleFilmerRequestsList } =
  await import("../../routes/filmer");

// Router-based route modules — each registers handlers in routeHandlers
await import("../../routes/moderation");
await import("../../routes/metrics");
await import("../../routes/trickmint");
await import("../../routes/games-challenges");
await import("../../routes/admin");
await import("../../routes/profile");
await import("../../routes/remoteSkate");

// =============================================================================
// Helpers
// =============================================================================

function createReq(overrides: any = {}) {
  return {
    currentUser: { id: "user-1", roles: ["admin"], trustLevel: 1, isActive: true },
    firebaseUid: "test-uid",
    body: {},
    query: {},
    params: {},
    headers: { authorization: "Bearer valid-token" },
    get: vi.fn().mockReturnValue(undefined),
    preferredQuality: undefined,
    ...overrides,
  };
}

function createRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

/**
 * Call a captured route handler. When multiple Router instances register the same
 * path (e.g. POST /create in both profile and games-challenges), pass `index`
 * to select which registration to invoke (0 = first registered, 1 = second, etc.).
 */
async function callHandler(routeKey: string, req: any, res: any, index = 0) {
  const registrations = routeHandlers[routeKey];
  if (!registrations || !registrations[index]) {
    const available = Object.keys(routeHandlers).sort().join(", ");
    throw new Error(
      `Route ${routeKey}[${index}] not registered. Available: ${available}` +
        (registrations ? ` (${registrations.length} registrations)` : "")
    );
  }
  const handlers = registrations[index];
  for (const handler of handlers) {
    await handler(req, res, () => {});
  }
}

function resetDbChain() {
  const methods = [
    "select",
    "from",
    "where",
    "orderBy",
    "limit",
    "offset",
    "update",
    "set",
    "returning",
    "insert",
    "values",
    "delete",
    "onConflictDoUpdate",
  ];
  for (const m of methods) {
    mocks.dbChain[m] = vi.fn().mockReturnValue(mocks.dbChain);
  }
  mocks.dbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);
  mocks.dbChain.offset.mockResolvedValue([]);
  mocks.dbChain.returning.mockResolvedValue([]);
}

// =============================================================================
// 1. FILMER ROUTES — error paths (lines 23, 91, 108)
// =============================================================================

describe("Filmer Routes — uncovered error paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handleFilmerRequest should handle FilmerRequestError (covers line 23)", async () => {
    const { FilmerRequestError } = await import("../../services/filmerRequests");
    mocks.createFilmerRequest.mockRejectedValue(
      new FilmerRequestError("INVALID_CHECKIN", "Invalid check-in ID", 400)
    );
    const req = createReq({ body: { checkInId: "not-a-number", filmerUid: "filmer-1" } });
    const res = createRes();
    await handleFilmerRequest(req as any, res as any);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "INVALID_CHECKIN" }));
  });

  it("handleFilmerRespond should handle FilmerRequestError (covers line 91)", async () => {
    const { FilmerRequestError } = await import("../../services/filmerRequests");
    mocks.respondToFilmerRequest.mockRejectedValue(
      new FilmerRequestError("NOT_FOUND", "Request not found", 404)
    );
    const req = createReq({ body: { requestId: "req-1", action: "accept" } });
    const res = createRes();
    await handleFilmerRespond(req as any, res as any);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "NOT_FOUND" }));
  });

  it("handleFilmerRespond should handle unexpected errors with 500 (line 91 generic)", async () => {
    mocks.respondToFilmerRequest.mockRejectedValue(new Error("DB crash"));
    const req = createReq({ body: { requestId: "req-1", action: "accept" } });
    const res = createRes();
    await handleFilmerRespond(req as any, res as any);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "SERVER_ERROR" });
  });

  it("handleFilmerRequestsList should return 400 for invalid query (covers line 108)", async () => {
    const req = createReq({ query: { status: "__invalid__" } });
    const res = createRes();
    await handleFilmerRequestsList(req as any, res as any);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "VALIDATION_ERROR" }));
  });

  it("handleFilmerRequestsList should handle FilmerRequestError from service", async () => {
    const { FilmerRequestError } = await import("../../services/filmerRequests");
    mocks.listFilmerRequests.mockRejectedValue(
      new FilmerRequestError("FORBIDDEN", "Not allowed", 403)
    );
    const req = createReq({ query: {} });
    const res = createRes();
    await handleFilmerRequestsList(req as any, res as any);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// =============================================================================
// 2. MODERATION ROUTES — missing admin ID checks (lines 100, 139)
// =============================================================================

describe("Moderation Routes — missing adminId checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.applyModerationAction.mockResolvedValue({ id: "action-1" });
    mocks.setProVerificationStatus.mockResolvedValue({ id: "action-2" });
  });

  it("POST /admin/mod-action returns 401 when adminId missing (covers line 100)", async () => {
    const req = createReq({
      currentUser: { roles: ["admin"] }, // no id field
      body: { targetUserId: "user-2", actionType: "warn", reasonCode: "spam_violation" },
    });
    const res = createRes();
    await callHandler("POST /admin/mod-action", req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("POST /admin/pro-verify returns 401 when adminId missing (covers line 139)", async () => {
    const req = createReq({
      currentUser: { roles: ["admin"] }, // no id field
      body: { userId: "user-3", status: "verified", evidence: ["proof"] },
    });
    const res = createRes();
    await callHandler("POST /admin/pro-verify", req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("POST /admin/mod-action succeeds when adminId present", async () => {
    const req = createReq({
      currentUser: { id: "admin-1", roles: ["admin"] },
      body: { targetUserId: "user-2", actionType: "warn", reasonCode: "spam_violation" },
    });
    const res = createRes();
    await callHandler("POST /admin/mod-action", req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ modActionId: "action-1" });
  });

  it("POST /admin/pro-verify succeeds when adminId present", async () => {
    const req = createReq({
      currentUser: { id: "admin-1", roles: ["admin"] },
      body: { userId: "user-3", status: "verified", evidence: ["proof"] },
    });
    const res = createRes();
    await callHandler("POST /admin/pro-verify", req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ modActionId: "action-2" });
  });
});

// =============================================================================
// 3. METRICS ROUTES — catch blocks (lines 146, 163, 195-196)
// =============================================================================

describe("Metrics Routes — uncovered catch blocks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dbState.db = { execute: mocks.mockExecute };
    mocks.dbState.dbAvailable = true;
    mocks.mockExecute.mockResolvedValue({ rows: [{ value: 1 }] });
  });

  it("GET /votes-per-battle returns 500 on db error (covers line 146)", async () => {
    mocks.mockExecute.mockRejectedValue(new Error("query timeout"));
    const req = createReq();
    const res = createRes();
    await callHandler("GET /votes-per-battle", req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "QUERY_FAILED" }));
  });

  it("GET /crew-join-rate returns 503 when db is null (covers line 163)", async () => {
    mocks.dbState.db = null;
    const req = createReq();
    const res = createRes();
    await callHandler("GET /crew-join-rate", req, res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it("GET /retention returns 500 on db error (covers lines 195-196)", async () => {
    mocks.mockExecute.mockRejectedValue(new Error("retention query failed"));
    const req = createReq();
    const res = createRes();
    await callHandler("GET /retention", req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "QUERY_FAILED" }));
  });

  it("GET /response-rate returns 503 when db is null", async () => {
    mocks.dbState.db = null;
    const req = createReq();
    const res = createRes();
    await callHandler("GET /response-rate", req, res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it("GET /kpi returns 500 on db error", async () => {
    mocks.mockExecute.mockRejectedValue(new Error("kpi failed"));
    const req = createReq();
    const res = createRes();
    await callHandler("GET /kpi", req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("GET /votes-per-battle returns 503 when db is null", async () => {
    mocks.dbState.db = null;
    const req = createReq();
    const res = createRes();
    await callHandler("GET /votes-per-battle", req, res);
    expect(res.status).toHaveBeenCalledWith(503);
  });
});

// =============================================================================
// 4. TRICKMINT ROUTES — catch blocks (lines 418-419, 458-459)
// =============================================================================

describe("Trickmint Routes — uncovered catch blocks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dbState.dbAvailable = true;
    resetDbChain();
  });

  it("GET /:id returns 500 when db throws (covers lines 418-419)", async () => {
    // The chain for GET /:id is: select().from().where().limit(1)
    // Make limit() return a rejected thenable so `await` hits the catch block
    const rejected = Promise.reject(new Error("connection refused"));
    rejected.catch(() => {}); // prevent unhandled rejection warning
    mocks.dbChain.limit.mockReturnValue(rejected);
    const req = createReq({ params: { id: "1" } });
    const res = createRes();
    await callHandler("GET /:id", req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed to fetch clip" });
  });

  it("DELETE /:id returns 500 when db throws (covers lines 458-459)", async () => {
    // The chain for DELETE /:id is: select().from().where().limit(1) then delete().where()
    // Make limit() reject on the select
    const rejected = Promise.reject(new Error("connection refused"));
    rejected.catch(() => {}); // prevent unhandled rejection warning
    mocks.dbChain.limit.mockReturnValue(rejected);
    const req = createReq({ params: { id: "1" } });
    const res = createRes();
    await callHandler("DELETE /:id", req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed to delete clip" });
  });
});

// =============================================================================
// 5. GAMES-CHALLENGES ROUTES — catch blocks (lines 94-98, 174-179)
// =============================================================================

describe("Games Challenges Routes — uncovered catch blocks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dbState.dbAvailable = true;
    resetDbChain();
  });

  it("POST /create returns 500 when db query fails (covers lines 94-98)", async () => {
    // POST /create flow:
    // 1. db.select().from().where().limit(1) -> must return [{id: "opponent-1"}]
    // 2. getUserDisplayName x2 -> already mocked to return "TestPlayer"
    // 3. db.insert().values().returning() -> must reject
    //
    // Make limit() first return opponent, then insert path rejects via returning()
    let limitCallCount = 0;
    mocks.dbChain.limit.mockImplementation(() => {
      limitCallCount++;
      if (limitCallCount === 1) {
        // Return thenable resolving with opponent found
        return { then: (resolve: any) => resolve([{ id: "opponent-1" }]) };
      }
      return mocks.dbChain;
    });

    const rejected = Promise.reject(new Error("DB pool exhausted"));
    rejected.catch(() => {}); // suppress unhandled warning
    mocks.dbChain.returning.mockReturnValue(rejected);

    const req = createReq({ body: { opponentId: "opponent-1" } });
    const res = createRes();
    // games-challenges registers POST /create at index 0 (imported before profile)
    await callHandler("POST /create", req, res, 0);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "GAME_CREATE_FAILED" }));
  });

  it("POST /:id/respond returns 500 when db query fails (covers lines 174-179)", async () => {
    // POST /:id/respond calls: db.select().from().where().limit(1) first
    // Make limit() return a rejected promise to trigger the catch
    const rejected = Promise.reject(new Error("DB pool exhausted"));
    rejected.catch(() => {}); // suppress unhandled warning
    mocks.dbChain.limit.mockReturnValue(rejected);
    const req = createReq({
      params: { id: "game-1" },
      body: { accept: true },
    });
    const res = createRes();
    await callHandler("POST /:id/respond", req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "GAME_RESPOND_FAILED" })
    );
  });
});

// =============================================================================
// 6. ADMIN ROUTES — date validation + tier overrides (lines 302, 308, 328, 358)
// =============================================================================

describe("Admin Routes — date validation & tier override", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dbState.dbAvailable = true;
    resetDbChain();
  });

  function setupAuditLogDb() {
    // The audit-logs endpoint does two queries via Promise.all:
    // 1. select().from().where().orderBy().limit().offset() -> returns logs
    // 2. select({ value: count() }).from().where() -> returns [{value: 0}]
    // Both go through the same chain, so we make offset resolve to []
    // and the chain .then resolve to [{value: 0}]
    let selectCallCount = 0;
    mocks.dbChain.select.mockImplementation(() => {
      selectCallCount++;
      const inner: any = {};
      inner.from = vi.fn().mockReturnValue(inner);
      inner.where = vi.fn().mockReturnValue(inner);
      inner.orderBy = vi.fn().mockReturnValue(inner);
      inner.limit = vi.fn().mockReturnValue(inner);
      inner.offset = vi.fn().mockReturnValue(inner);
      inner.then =
        selectCallCount % 2 === 1
          ? (resolve: any) => resolve([])
          : (resolve: any) => resolve([{ value: 0 }]);
      return inner;
    });
  }

  it("GET /audit-logs handles invalid 'from' date (covers line 302)", async () => {
    setupAuditLogDb();
    const req = createReq({ query: { from: "not-a-valid-date" } });
    const res = createRes();
    await callHandler("GET /audit-logs", req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ logs: [], total: 0, page: 1 }));
  });

  it("GET /audit-logs handles invalid 'to' date (covers line 308)", async () => {
    setupAuditLogDb();
    const req = createReq({ query: { to: "invalid-date-string" } });
    const res = createRes();
    await callHandler("GET /audit-logs", req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ logs: [], total: 0, page: 1 }));
  });

  it("GET /audit-logs handles both invalid from and to dates together", async () => {
    setupAuditLogDb();
    const req = createReq({ query: { from: "abc", to: "xyz" } });
    const res = createRes();
    await callHandler("GET /audit-logs", req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ logs: [], total: 0 }));
  });

  it("GET /audit-logs handles success=false filter (covers line 298 branch)", async () => {
    setupAuditLogDb();
    const req = createReq({ query: { success: "false" } });
    const res = createRes();
    await callHandler("GET /audit-logs", req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ logs: [], total: 0 }));
  });

  it("PATCH /users/:userId/tier with 'free' clears pro fields (covers line 397)", async () => {
    const updateChain: any = {};
    updateChain.set = vi.fn().mockReturnValue(updateChain);
    updateChain.where = vi.fn().mockReturnValue(updateChain);
    updateChain.returning = vi.fn().mockResolvedValue([{ id: "target-1" }]);
    mocks.dbChain.update.mockReturnValue(updateChain);

    const req = createReq({
      params: { userId: "target-1" },
      body: { accountTier: "free" },
    });
    const res = createRes();
    await callHandler("PATCH /users/:userId/tier", req, res);
    expect(updateChain.set).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, accountTier: "free" })
    );
  });

  it("PATCH /users/:userId/tier with 'premium' sets premiumPurchasedAt (covers line 396)", async () => {
    const updateChain: any = {};
    updateChain.set = vi.fn().mockReturnValue(updateChain);
    updateChain.where = vi.fn().mockReturnValue(updateChain);
    updateChain.returning = vi.fn().mockResolvedValue([{ id: "target-1" }]);
    mocks.dbChain.update.mockReturnValue(updateChain);

    const req = createReq({
      params: { userId: "target-1" },
      body: { accountTier: "premium" },
    });
    const res = createRes();
    await callHandler("PATCH /users/:userId/tier", req, res);
    expect(updateChain.set).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, accountTier: "premium" })
    );
  });

  it("GET /mod-actions returns 500 on db error (covers line 358 area)", async () => {
    mocks.dbChain.select.mockImplementation(() => {
      throw new Error("query exploded");
    });
    const req = createReq({ query: {} });
    const res = createRes();
    await callHandler("GET /mod-actions", req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "QUERY_FAILED" }));
  });
});

// =============================================================================
// 7. PROFILE ROUTES — avatar upload + error cleanup (lines 223, 232-253, 264)
// =============================================================================

describe("Profile Routes — avatar upload & error cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dbState.dbAvailable = true;
    resetDbChain();
    mocks.reserve.mockResolvedValue(true);
    mocks.fileSave.mockResolvedValue(undefined);
    mocks.fileDelete.mockResolvedValue(undefined);
  });

  it("should create profile with avatar (covers lines 223, 232-253)", async () => {
    const now = new Date();
    const createdProfile = {
      uid: "test-uid",
      username: "newuser",
      avatarUrl:
        "https://firebasestorage.googleapis.com/v0/b/test-bucket/o/profiles%2Ftest-uid%2Favatar?alt=media",
      createdAt: now,
      updatedAt: now,
    };

    // createProfileWithRollback invokes the writeProfile callback
    mocks.createProfileWithRollback.mockImplementation(async (opts: any) => {
      const result = await opts.writeProfile();
      return result;
    });

    // The select (existing profile check) goes through chain: select().from().where().limit()
    // limit() returns the chain, and await calls chain.then() -> resolves to []
    // (chain.then resolves to [] by default from resetDbChain)

    // The insert path goes: insert().values().returning()
    // returning() is mocked with mockResolvedValue by resetDbChain, so it returns a Promise
    // Override it to return the created profile
    mocks.dbChain.returning.mockResolvedValue([createdProfile]);

    const smallPngBase64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");
    const req = createReq({
      body: {
        username: "newuser",
        stance: "regular",
        avatarBase64: `data:image/png;base64,${smallPngBase64}`,
      },
    });
    const res = createRes();
    // Profile registers POST /create at index 1 (imported after games-challenges)
    await callHandler("POST /create", req, res, 1);

    expect(mocks.fileSave).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        resumable: false,
        metadata: expect.objectContaining({ contentType: "image/png" }),
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("should delete uploaded file on creation error (covers line 264)", async () => {
    // No existing profile
    mocks.dbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);
    // createProfileWithRollback throws after avatar upload
    mocks.createProfileWithRollback.mockRejectedValue(new Error("DB insert failed"));

    const smallPngBase64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");
    const req = createReq({
      body: {
        username: "newuser",
        stance: "regular",
        avatarBase64: `data:image/png;base64,${smallPngBase64}`,
      },
    });
    const res = createRes();
    // Profile registers POST /create at index 1 (imported after games-challenges)
    await callHandler("POST /create", req, res, 1);

    // Should have attempted to clean up the uploaded file
    expect(mocks.fileDelete).toHaveBeenCalledWith({ ignoreNotFound: true });
    // Should have released the username
    expect(mocks.release).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// =============================================================================
// 8. REMOTE SKATE ROUTES — auth failure paths (lines 100, 112)
// =============================================================================

describe("Remote Skate Routes — auth failure paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyIdToken.mockResolvedValue({ uid: "user-1" });
  });

  it("returns 401 when token verification throws (covers line ~40)", async () => {
    mocks.verifyIdToken.mockRejectedValue(new Error("Token expired"));
    const req = createReq();
    const res = createRes();
    await callHandler("POST /:gameId/rounds/:roundId/resolve", req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid authentication token" });
  });

  it("returns 401 when no authorization header (covers line 31)", async () => {
    const req = createReq({ headers: {} });
    const res = createRes();
    await callHandler("POST /:gameId/rounds/:roundId/resolve", req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Authentication required" });
  });

  it("returns 401 when auth header is not Bearer format", async () => {
    const req = createReq({ headers: { authorization: "Token abc123" } });
    const res = createRes();
    await callHandler("POST /:gameId/rounds/:roundId/resolve", req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Authentication required" });
  });

  it("returns 404 for round not found (covers line 100)", async () => {
    mocks.mockTransaction.mockImplementation(async (fn: any) => {
      const gameSnap = {
        exists: true,
        data: () => ({
          playerAUid: "user-1",
          playerBUid: "user-2",
          status: "active",
          letters: {},
        }),
      };
      const roundSnap = { exists: false };
      const transaction = {
        get: vi.fn().mockResolvedValueOnce(gameSnap).mockResolvedValueOnce(roundSnap),
      };
      await fn(transaction);
    });

    const req = createReq({ body: { result: "landed" } });
    const res = createRes();
    await callHandler("POST /:gameId/rounds/:roundId/resolve", req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: "ROUND_NOT_FOUND",
      message: "Round not found.",
    });
  });

  it("returns 400 when round status is not awaiting_reply (covers line 112)", async () => {
    mocks.mockTransaction.mockImplementation(async (fn: any) => {
      const gameSnap = {
        exists: true,
        data: () => ({
          playerAUid: "user-1",
          playerBUid: "user-2",
          status: "active",
          letters: {},
        }),
      };
      const roundSnap = {
        exists: true,
        data: () => ({
          offenseUid: "user-1",
          defenseUid: "user-2",
          status: "awaiting_set", // not "awaiting_reply"
          setVideoId: "vid-1",
          replyVideoId: "vid-2",
        }),
      };
      const transaction = {
        get: vi.fn().mockResolvedValueOnce(gameSnap).mockResolvedValueOnce(roundSnap),
      };
      await fn(transaction);
    });

    const req = createReq({ body: { result: "landed" } });
    const res = createRes();
    await callHandler("POST /:gameId/rounds/:roundId/resolve", req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "INVALID_STATE",
      message: "This action cannot be performed right now.",
    });
  });

  it("returns 500 for unexpected transaction error", async () => {
    mocks.mockTransaction.mockRejectedValue(new Error("Firestore unavailable"));
    const req = createReq({ body: { result: "landed" } });
    const res = createRes();
    await callHandler("POST /:gameId/rounds/:roundId/resolve", req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: "INTERNAL_ERROR",
      message: "Failed to resolve round.",
    });
  });

  it("returns 500 for non-Error thrown in transaction", async () => {
    mocks.mockTransaction.mockRejectedValue("string error");
    const req = createReq({ body: { result: "landed" } });
    const res = createRes();
    await callHandler("POST /:gameId/rounds/:roundId/resolve", req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: "INTERNAL_ERROR",
      message: "Failed to resolve round.",
    });
  });
});
