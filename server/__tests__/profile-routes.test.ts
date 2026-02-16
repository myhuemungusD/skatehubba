/**
 * @fileoverview Unit tests for profile routes
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const mockDbChain: any = {};
mockDbChain.select = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.from = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.where = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.limit = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.insert = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.values = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.returning = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);

const mockIsDatabaseAvailable = vi.fn().mockReturnValue(true);

vi.mock("../db", () => ({
  getDb: () => mockDbChain,
  isDatabaseAvailable: () => mockIsDatabaseAvailable(),
}));

vi.mock("../admin", () => ({
  admin: {
    storage: () => ({
      bucket: (name?: string) => ({
        name: name || "test-bucket",
        file: () => ({
          save: vi.fn().mockResolvedValue(undefined),
          delete: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    }),
  },
}));

vi.mock("../config/env", () => ({
  env: { FIREBASE_STORAGE_BUCKET: "test-bucket" },
}));

vi.mock("@shared/schema", () => ({
  onboardingProfiles: { uid: "uid" },
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
}));

vi.mock("nanoid", () => ({
  customAlphabet: () => () => "abcd1234",
}));

vi.mock("../middleware/firebaseUid", () => ({
  requireFirebaseUid: (req: any, _res: any, next: any) => {
    req.firebaseUid = req.firebaseUid || "test-uid";
    next();
  },
}));

vi.mock("../middleware/security", () => ({
  profileCreateLimiter: (_req: any, _res: any, next: any) => next(),
  usernameCheckLimiter: (_req: any, _res: any, next: any) => next(),
}));

const mockIsAvailable = vi.fn().mockResolvedValue(true);
const mockReserve = vi.fn().mockResolvedValue(true);
const mockEnsure = vi.fn().mockResolvedValue(true);
const mockRelease = vi.fn().mockResolvedValue(undefined);
const mockCreateProfileWithRollback = vi.fn();

vi.mock("../services/profileService", () => ({
  createUsernameStore: () => ({
    isAvailable: (...args: any[]) => mockIsAvailable(...args),
    reserve: (...args: any[]) => mockReserve(...args),
    ensure: (...args: any[]) => mockEnsure(...args),
    release: (...args: any[]) => mockRelease(...args),
  }),
  createProfileWithRollback: (...args: any[]) => mockCreateProfileWithRollback(...args),
}));

vi.mock("../logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock("../config/constants", () => ({
  MAX_AVATAR_BYTES: 5 * 1024 * 1024,
  MAX_USERNAME_GENERATION_ATTEMPTS: 5,
}));

vi.mock("../utils/apiError", () => ({
  Errors: {
    notFound: (res: any, code: string, msg: string) =>
      res.status(404).json({ error: code, message: msg }),
    internal: (res: any, code: string, msg: string) =>
      res.status(500).json({ error: code, message: msg }),
    dbUnavailable: (res: any) => res.status(503).json({ error: "DATABASE_UNAVAILABLE" }),
    badRequest: (res: any, code: string, msg: string, details?: any) =>
      res.status(400).json({ error: code, message: msg, details }),
    validation: (res: any, issues: any, code: string, msg: string) =>
      res.status(400).json({ error: code, message: msg }),
    conflict: (res: any, code: string, msg: string, details?: any) =>
      res.status(409).json({ error: code, message: msg }),
    tooLarge: (res: any, code: string, msg: string) =>
      res.status(413).json({ error: code, message: msg }),
    unavailable: (res: any, code: string, msg: string) =>
      res.status(503).json({ error: code, message: msg }),
  },
}));

// Capture route handlers
const routeHandlers: Record<string, any[]> = {};

vi.mock("express", () => ({
  Router: () => ({
    get: vi.fn((path: string, ...handlers: any[]) => {
      routeHandlers[`GET ${path}`] = handlers;
    }),
    post: vi.fn((path: string, ...handlers: any[]) => {
      routeHandlers[`POST ${path}`] = handlers;
    }),
    put: vi.fn(),
    delete: vi.fn(),
    use: vi.fn(),
  }),
}));

await import("../routes/profile");

// ============================================================================
// Helpers
// ============================================================================

function createReq(overrides: any = {}) {
  return {
    firebaseUid: "test-uid",
    body: {},
    query: {},
    currentUser: { id: "user-1" },
    ...overrides,
  };
}

function createRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

async function callHandler(routeKey: string, req: any, res: any) {
  const handlers = routeHandlers[routeKey];
  if (!handlers) throw new Error(`Route ${routeKey} not registered`);
  for (const handler of handlers) {
    await handler(req, res, () => {});
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("Profile Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDatabaseAvailable.mockReturnValue(true);
    mockDbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);
  });

  describe("GET /me", () => {
    it("should return profile when found", async () => {
      const now = new Date();
      const profile = { uid: "test-uid", username: "skater1", createdAt: now, updatedAt: now };
      mockDbChain.then = (resolve: any) => Promise.resolve([profile]).then(resolve);

      const req = createReq();
      const res = createRes();
      await callHandler("GET /me", req, res);
      expect(res.json).toHaveBeenCalledWith({
        profile: expect.objectContaining({ uid: "test-uid", username: "skater1" }),
      });
    });

    it("should return 404 when profile not found", async () => {
      mockDbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);
      const req = createReq();
      const res = createRes();
      await callHandler("GET /me", req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 503 when db unavailable", async () => {
      mockIsDatabaseAvailable.mockReturnValue(false);
      const req = createReq();
      const res = createRes();
      await callHandler("GET /me", req, res);
      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  describe("GET /username-check", () => {
    it("should check username availability", async () => {
      const req = createReq({ query: { username: "testuser" } });
      const res = createRes();
      await callHandler("GET /username-check", req, res);
      expect(res.json).toHaveBeenCalledWith({ available: true });
    });

    it("should return 503 when db unavailable", async () => {
      mockIsDatabaseAvailable.mockReturnValue(false);
      const req = createReq({ query: { username: "testuser" } });
      const res = createRes();
      await callHandler("GET /username-check", req, res);
      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should return 400 for invalid username format", async () => {
      const req = createReq({ query: { username: "ab" } });
      const res = createRes();
      await callHandler("GET /username-check", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should handle array query param", async () => {
      const req = createReq({ query: { username: ["testuser", "other"] } });
      const res = createRes();
      await callHandler("GET /username-check", req, res);
      expect(res.json).toHaveBeenCalledWith({ available: true });
    });
  });

  describe("POST /create", () => {
    it("should return 503 when db unavailable", async () => {
      mockIsDatabaseAvailable.mockReturnValue(false);
      const req = createReq({ body: { username: "newuser", stance: "regular" } });
      const res = createRes();
      await callHandler("POST /create", req, res);
      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should return existing profile if one exists", async () => {
      const now = new Date();
      const existingProfile = {
        uid: "test-uid",
        username: "existing",
        createdAt: now,
        updatedAt: now,
      };
      mockDbChain.then = (resolve: any) => Promise.resolve([existingProfile]).then(resolve);

      const req = createReq({ body: { username: "newuser", stance: "regular" } });
      const res = createRes();
      await callHandler("POST /create", req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 400 when no username and not skipping", async () => {
      const req = createReq({ body: { stance: "regular" } });
      const res = createRes();
      await callHandler("POST /create", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 409 when username is taken", async () => {
      mockReserve.mockResolvedValue(false);
      const req = createReq({ body: { username: "taken", stance: "regular" } });
      const res = createRes();
      await callHandler("POST /create", req, res);
      expect(res.status).toHaveBeenCalledWith(409);
    });

    it("should create profile with reserved username", async () => {
      mockReserve.mockResolvedValue(true);
      const createdProfile = { uid: "test-uid", username: "newuser" };
      mockCreateProfileWithRollback.mockResolvedValue(createdProfile);

      const req = createReq({ body: { username: "newuser", stance: "regular" } });
      const res = createRes();
      await callHandler("POST /create", req, res);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("should generate username when skip=true", async () => {
      mockReserve.mockResolvedValue(true);
      const createdProfile = { uid: "test-uid", username: "skaterabcd1234" };
      mockCreateProfileWithRollback.mockResolvedValue(createdProfile);

      const req = createReq({ body: { skip: true, stance: "regular" } });
      const res = createRes();
      await callHandler("POST /create", req, res);
      expect(mockReserve).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("should handle avatar upload with invalid format", async () => {
      mockReserve.mockResolvedValue(true);
      const req = createReq({
        body: { username: "newuser", stance: "regular", avatarBase64: "not-a-data-url" },
      });
      const res = createRes();
      await callHandler("POST /create", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should handle avatar with invalid MIME type", async () => {
      mockReserve.mockResolvedValue(true);
      const req = createReq({
        body: {
          username: "newuser",
          stance: "regular",
          avatarBase64: "data:application/pdf;base64,dGVzdA==",
        },
      });
      const res = createRes();
      await callHandler("POST /create", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should handle avatar that is too large", async () => {
      mockReserve.mockResolvedValue(true);
      // Create large base64 string (> 5MB when decoded)
      const largeBase64 = Buffer.alloc(6 * 1024 * 1024).toString("base64");
      const req = createReq({
        body: {
          username: "newuser",
          stance: "regular",
          avatarBase64: `data:image/png;base64,${largeBase64}`,
        },
      });
      const res = createRes();
      await callHandler("POST /create", req, res);
      expect(res.status).toHaveBeenCalledWith(413);
    });

    it("should release username on profile creation error", async () => {
      mockReserve.mockResolvedValue(true);
      mockCreateProfileWithRollback.mockRejectedValue(new Error("DB error"));
      const req = createReq({ body: { username: "newuser", stance: "regular" } });
      const res = createRes();
      await callHandler("POST /create", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(mockRelease).toHaveBeenCalled();
    });
  });
});
