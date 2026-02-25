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
mockDbChain.delete = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);

const mockGetDbFn = vi.fn();
const mockSaveFn = vi.fn().mockResolvedValue(undefined);
const mockDeleteFn = vi.fn().mockResolvedValue(undefined);

vi.mock("../../db", () => ({
  getDb: (...args: any[]) => mockGetDbFn(...args),
}));

vi.mock("../../admin", () => ({
  admin: {
    storage: () => ({
      bucket: (name?: string) => ({
        name: name || "test-bucket",
        file: () => ({
          save: (...args: any[]) => mockSaveFn(...args),
          delete: (...args: any[]) => mockDeleteFn(...args),
        }),
      }),
    }),
  },
}));

vi.mock("../../config/env", () => ({
  env: { FIREBASE_STORAGE_BUCKET: "test-bucket" },
}));

vi.mock("@shared/schema", () => ({
  onboardingProfiles: { uid: "uid" },
  userProfiles: { id: "id" },
  closetItems: { userId: "userId" },
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

const mockIsAvailable = vi.fn().mockResolvedValue(true);
const mockReserve = vi.fn().mockResolvedValue(true);
const mockEnsure = vi.fn().mockResolvedValue(true);
const mockRelease = vi.fn().mockResolvedValue(undefined);
const mockCreateProfileWithRollback = vi.fn();

vi.mock("../../services/profileService", () => ({
  createUsernameStore: () => ({
    isAvailable: (...args: any[]) => mockIsAvailable(...args),
    reserve: (...args: any[]) => mockReserve(...args),
    ensure: (...args: any[]) => mockEnsure(...args),
    release: (...args: any[]) => mockRelease(...args),
  }),
  createProfileWithRollback: (...args: any[]) => mockCreateProfileWithRollback(...args),
}));

const mockDeleteUser = vi.fn().mockResolvedValue(undefined);
vi.mock("../../services/userService", () => ({
  deleteUser: (...args: any[]) => mockDeleteUser(...args),
}));

vi.mock("../../auth/middleware", () => ({
  authenticateUser: (req: any, _res: any, next: any) => {
    req.currentUser = req.currentUser || { id: "user-1" };
    next();
  },
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

vi.mock("../../config/constants", () => ({
  MAX_AVATAR_BYTES: 5 * 1024 * 1024,
  MAX_USERNAME_GENERATION_ATTEMPTS: 5,
}));

vi.mock("../../utils/apiError", () => ({
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
    delete: vi.fn((path: string, ...handlers: any[]) => {
      routeHandlers[`DELETE ${path}`] = handlers;
    }),
    use: vi.fn(),
  }),
}));

await import("../../routes/profile");

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
  res.send = vi.fn().mockReturnValue(res);
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
    mockGetDbFn.mockReturnValue(mockDbChain);
    mockSaveFn.mockResolvedValue(undefined);
    mockDeleteFn.mockResolvedValue(undefined);
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

    it("should return 500 when db unavailable (getDb throws, caught by route)", async () => {
      mockGetDbFn.mockImplementation(() => {
        throw new Error("Database not configured");
      });
      const req = createReq();
      const res = createRes();
      await callHandler("GET /me", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it("should return 500 when db query throws", async () => {
      mockDbChain.then = (_resolve: any, reject: any) =>
        Promise.reject(new Error("DB error")).then(undefined, reject);
      const req = createReq();
      const res = createRes();
      await callHandler("GET /me", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
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
      mockGetDbFn.mockImplementation(() => {
        throw new Error("Database not configured");
      });
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

    it("should return 503 when availability check throws", async () => {
      mockIsAvailable.mockRejectedValue(new Error("DB error"));
      const req = createReq({ query: { username: "testuser" } });
      const res = createRes();
      await callHandler("GET /username-check", req, res);
      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  describe("POST /create", () => {
    it("should throw when db unavailable (global handler returns 503)", async () => {
      mockGetDbFn.mockImplementation(() => {
        throw new Error("Database not configured");
      });
      const req = createReq({ body: { username: "newuser", stance: "regular" } });
      const res = createRes();
      await expect(callHandler("POST /create", req, res)).rejects.toThrow(
        "Database not configured"
      );
    });

    it("should return 400 when profile body fails validation", async () => {
      const req = createReq({ body: null });
      const res = createRes();
      await callHandler("POST /create", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should throw when getDb throws (global handler returns 503)", async () => {
      mockGetDbFn.mockImplementation(() => {
        throw new Error("No DB connection");
      });
      const req = createReq({ body: { username: "newuser", stance: "regular" } });
      const res = createRes();
      await expect(callHandler("POST /create", req, res)).rejects.toThrow("No DB connection");
    });

    it("should return 500 when db select throws during profile check", async () => {
      mockDbChain.then = (_resolve: any, reject: any) =>
        Promise.reject(new Error("DB select failed")).then(undefined, reject);
      const req = createReq({ body: { username: "newuser", stance: "regular" } });
      const res = createRes();
      await callHandler("POST /create", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
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

    it("should return 409 when existing profile username cannot be ensured", async () => {
      const now = new Date();
      const existingProfile = {
        uid: "test-uid",
        username: "existing-username",
        createdAt: now,
        updatedAt: now,
      };
      mockDbChain.then = (resolve: any) => Promise.resolve([existingProfile]).then(resolve);
      mockEnsure.mockResolvedValue(false);
      const req = createReq({ body: { username: "newuser", stance: "regular" } });
      const res = createRes();
      await callHandler("POST /create", req, res);
      expect(res.status).toHaveBeenCalledWith(409);
    });

    it("should return 500 when ensure throws for existing profile", async () => {
      const now = new Date();
      const existingProfile = {
        uid: "test-uid",
        username: "existing-username",
        createdAt: now,
        updatedAt: now,
      };
      mockDbChain.then = (resolve: any) => Promise.resolve([existingProfile]).then(resolve);
      mockEnsure.mockRejectedValue(new Error("Ensure failed"));
      const req = createReq({ body: { username: "newuser", stance: "regular" } });
      const res = createRes();
      await callHandler("POST /create", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
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

    it("should return 500 when reserve throws", async () => {
      mockReserve.mockRejectedValue(new Error("Reserve failed"));
      const req = createReq({ body: { username: "newuser", stance: "regular" } });
      const res = createRes();
      await callHandler("POST /create", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
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

    it("should handle avatar with invalid MIME type (non-image prefix)", async () => {
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

    it("should return 400 when avatar MIME type is image/tiff (not in allowed set)", async () => {
      mockReserve.mockResolvedValue(true);
      const req = createReq({
        body: {
          username: "newuser",
          stance: "regular",
          avatarBase64: "data:image/tiff;base64,dGVzdA==",
        },
      });
      const res = createRes();
      await callHandler("POST /create", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "INVALID_AVATAR_TYPE" })
      );
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

    it("should log error when release throws during creation rollback", async () => {
      mockReserve.mockResolvedValue(true);
      mockCreateProfileWithRollback.mockRejectedValue(new Error("DB error"));
      mockRelease.mockRejectedValue(new Error("Release failed"));
      const logger = await import("../../logger");
      const req = createReq({ body: { username: "newuser", stance: "regular" } });
      const res = createRes();
      await callHandler("POST /create", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(logger.default.error).toHaveBeenCalledWith(
        "[Profile] Failed to release username during rollback",
        expect.any(Object)
      );
    });

    it("should log error when avatar file delete fails after creation error", async () => {
      mockReserve.mockResolvedValue(true);
      mockDeleteFn.mockRejectedValue(new Error("Delete failed"));
      mockCreateProfileWithRollback.mockRejectedValue(new Error("DB error"));
      const logger = await import("../../logger");
      const req = createReq({
        body: {
          username: "newuser",
          stance: "regular",
          avatarBase64: "data:image/png;base64,dGVzdA==",
        },
      });
      const res = createRes();
      await callHandler("POST /create", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(logger.default.error).toHaveBeenCalledWith(
        "[Profile] Failed to clean up avatar after error",
        expect.any(Object)
      );
    });
  });

  describe("DELETE /", () => {
    it("should delete user and all related data — returns 204", async () => {
      const req = createReq();
      const res = createRes();
      await callHandler("DELETE /", req, res);

      expect(mockDbChain.delete).toHaveBeenCalled();
      expect(mockDeleteUser).toHaveBeenCalledWith("user-1");
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it("should throw when db is unavailable (getDb is outside try/catch)", async () => {
      mockGetDbFn.mockImplementation(() => {
        throw new Error("Database not configured");
      });
      const req = createReq();
      const res = createRes();
      await expect(callHandler("DELETE /", req, res)).rejects.toThrow("Database not configured");
    });

    it("should return 500 when deleteUser throws", async () => {
      mockDeleteUser.mockRejectedValue(new Error("Delete failed"));
      const req = createReq();
      const res = createRes();
      await callHandler("DELETE /", req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
