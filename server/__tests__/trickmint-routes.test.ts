/**
 * @fileoverview Unit tests for trickmint routes (video upload pipeline)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const mockDbChain: any = {};
mockDbChain.select = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.from = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.where = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.orderBy = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.limit = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.offset = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.update = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.set = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.delete = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);

const mockIsDatabaseAvailable = vi.fn().mockReturnValue(true);
const mockGetUserDisplayName = vi.fn().mockResolvedValue("TestUser");

vi.mock("../db", () => ({
  getDb: () => mockDbChain,
  isDatabaseAvailable: () => mockIsDatabaseAvailable(),
  getUserDisplayName: (...args: any[]) => mockGetUserDisplayName(...args),
}));

vi.mock("@shared/schema", () => ({
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
  customUsers: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  sql: Object.assign((strings: TemplateStringsArray, ..._values: any[]) => ({ _sql: true }), {
    raw: (s: string) => ({ _sql: true, raw: s }),
  }),
}));

vi.mock("../auth/middleware", () => ({
  authenticateUser: (req: any, _res: any, next: any) => {
    req.currentUser = req.currentUser || { id: "user-1" };
    next();
  },
}));

vi.mock("../logger", () => ({
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

const mockGenerateUploadUrls = vi.fn();
vi.mock("../services/storageService", () => ({
  generateUploadUrls: (...args: any[]) => mockGenerateUploadUrls(...args),
  UPLOAD_LIMITS: {
    MAX_VIDEO_SIZE_BYTES: 50 * 1024 * 1024,
    MAX_THUMBNAIL_SIZE_BYTES: 2 * 1024 * 1024,
    ALLOWED_VIDEO_MIME_TYPES: ["video/webm", "video/mp4", "video/quicktime"],
    ALLOWED_THUMBNAIL_MIME_TYPES: ["image/jpeg", "image/png", "image/webp"],
    SIGNED_URL_EXPIRY_MS: 900000,
  },
}));

const mockProcessUpload = vi.fn();
const mockConfirmDirectUpload = vi.fn();
vi.mock("../services/videoProcessingService", () => ({
  processUpload: (...args: any[]) => mockProcessUpload(...args),
  confirmDirectUpload: (...args: any[]) => mockConfirmDirectUpload(...args),
  VIDEO_LIMITS: { MAX_VIDEO_DURATION_MS: 60000 },
}));

// Mock feedCache — passthrough middleware in tests
vi.mock("../middleware/feedCache", () => ({
  feedCache: () => (_req: any, _res: any, next: any) => next(),
}));

// Mock videoTranscoder type import
vi.mock("../services/videoTranscoder", () => ({}));

// Capture route handlers
const routeHandlers: Record<string, any[]> = {};

vi.mock("express", () => ({
  Router: () => ({
    post: vi.fn((path: string, ...handlers: any[]) => {
      routeHandlers[`POST ${path}`] = handlers;
    }),
    get: vi.fn((path: string, ...handlers: any[]) => {
      routeHandlers[`GET ${path}`] = handlers;
    }),
    delete: vi.fn((path: string, ...handlers: any[]) => {
      routeHandlers[`DELETE ${path}`] = handlers;
    }),
    put: vi.fn(),
    use: vi.fn(),
  }),
}));

await import("../routes/trickmint");

// ============================================================================
// Helpers
// ============================================================================

function createReq(overrides: any = {}) {
  return {
    currentUser: { id: "user-1" },
    body: {},
    params: {},
    query: {},
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

describe("Trickmint Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDatabaseAvailable.mockReturnValue(true);
  });

  describe("POST /request-upload", () => {
    it("should generate signed upload URLs", async () => {
      const uploadResult = {
        uploadId: "upload-1",
        videoUploadUrl: "https://storage.googleapis.com/video",
        thumbnailUploadUrl: "https://storage.googleapis.com/thumb",
        videoPath: "trickmint/user-1/upload-1.webm",
        thumbnailPath: "trickmint/user-1/upload-1_thumb.jpg",
        expiresAt: "2025-01-01T01:00:00Z",
      };
      mockGenerateUploadUrls.mockResolvedValue(uploadResult);

      const req = createReq({ body: { fileExtension: "webm" } });
      const res = createRes();
      await callHandler("POST /request-upload", req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          uploadId: "upload-1",
          videoUploadUrl: expect.any(String),
        })
      );
    });

    it("should return 400 for invalid extension", async () => {
      const req = createReq({ body: { fileExtension: "avi" } });
      const res = createRes();
      await callHandler("POST /request-upload", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 500 when generateUploadUrls fails", async () => {
      mockGenerateUploadUrls.mockRejectedValue(new Error("Storage error"));
      const req = createReq({ body: { fileExtension: "mp4" } });
      const res = createRes();
      await callHandler("POST /request-upload", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("POST /confirm-upload", () => {
    it("should confirm upload with valid data", async () => {
      mockProcessUpload.mockResolvedValue({ success: true, clip: { id: 1 } });
      const req = createReq({
        body: {
          trickName: "Kickflip",
          videoPath: "trickmint/user-1/abc.webm",
          isPublic: true,
        },
      });
      const res = createRes();
      await callHandler("POST /confirm-upload", req, res);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("should return 503 when db is unavailable", async () => {
      mockIsDatabaseAvailable.mockReturnValue(false);
      const req = createReq({
        body: { trickName: "Kickflip", videoPath: "trickmint/user-1/abc.webm" },
      });
      const res = createRes();
      await callHandler("POST /confirm-upload", req, res);
      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should return 403 when path does not belong to user", async () => {
      const req = createReq({
        body: {
          trickName: "Kickflip",
          videoPath: "trickmint/other-user/abc.webm",
        },
      });
      const res = createRes();
      await callHandler("POST /confirm-upload", req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 400 when processUpload fails", async () => {
      mockProcessUpload.mockResolvedValue({ success: false, error: "Invalid file" });
      const req = createReq({
        body: {
          trickName: "Kickflip",
          videoPath: "trickmint/user-1/abc.webm",
        },
      });
      const res = createRes();
      await callHandler("POST /confirm-upload", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("POST /submit", () => {
    it("should submit direct upload with valid data", async () => {
      mockConfirmDirectUpload.mockResolvedValue({ success: true, clip: { id: 2 } });
      const req = createReq({
        body: {
          trickName: "Heelflip",
          videoUrl: "https://storage.googleapis.com/video.mp4",
          isPublic: true,
        },
      });
      const res = createRes();
      await callHandler("POST /submit", req, res);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("should return 503 when db unavailable", async () => {
      mockIsDatabaseAvailable.mockReturnValue(false);
      const req = createReq({
        body: {
          trickName: "Heelflip",
          videoUrl: "https://storage.googleapis.com/video.mp4",
        },
      });
      const res = createRes();
      await callHandler("POST /submit", req, res);
      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should return 400 for invalid URL", async () => {
      const req = createReq({
        body: { trickName: "Heelflip", videoUrl: "not-a-url" },
      });
      const res = createRes();
      await callHandler("POST /submit", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("GET /my-clips", () => {
    it("should list user clips with pagination", async () => {
      const clips = [{ id: 1, trickName: "Kickflip" }];
      let callCount = 0;
      mockDbChain.then = (resolve: any) => {
        callCount++;
        if (callCount === 1) return Promise.resolve(clips).then(resolve);
        return Promise.resolve([{ total: 1 }]).then(resolve);
      };

      const req = createReq({ query: { limit: "10", offset: "0" } });
      const res = createRes();
      await callHandler("GET /my-clips", req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ clips, total: 1, limit: 10, offset: 0 })
      );
    });

    it("should return 503 when db unavailable", async () => {
      mockIsDatabaseAvailable.mockReturnValue(false);
      const req = createReq({ query: {} });
      const res = createRes();
      await callHandler("GET /my-clips", req, res);
      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  describe("GET /feed", () => {
    it("should return public feed", async () => {
      const clips = [
        { id: 1, isPublic: true, status: "ready", videoUrl: "https://example.com/v.mp4" },
      ];
      let callCount = 0;
      mockDbChain.then = (resolve: any) => {
        callCount++;
        if (callCount === 1) return Promise.resolve(clips).then(resolve);
        return Promise.resolve([{ total: 1 }]).then(resolve);
      };

      const req = createReq({ query: {} });
      const res = createRes();
      await callHandler("GET /feed", req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          clips: expect.arrayContaining([
            expect.objectContaining({ id: 1, videoUrl: "https://example.com/v.mp4" }),
          ]),
          total: 1,
        })
      );
    });
  });

  describe("GET /:id", () => {
    it("should return a clip and increment views", async () => {
      const clip = {
        id: 1,
        isPublic: true,
        userId: "user-1",
        videoUrl: "https://example.com/v.mp4",
      };
      let callCount = 0;
      mockDbChain.then = (resolve: any) => {
        callCount++;
        if (callCount === 1) return Promise.resolve([clip]).then(resolve);
        return Promise.resolve(undefined).then(resolve);
      };

      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await callHandler("GET /:id", req, res);
      expect(res.json).toHaveBeenCalledWith({
        clip: expect.objectContaining({ id: 1, videoUrl: "https://example.com/v.mp4" }),
      });
    });

    it("should return 400 for invalid clip ID", async () => {
      const req = createReq({ params: { id: "abc" } });
      const res = createRes();
      await callHandler("GET /:id", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 for non-existent clip", async () => {
      mockDbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);
      const req = createReq({ params: { id: "999" } });
      const res = createRes();
      await callHandler("GET /:id", req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 404 for non-public clip by non-owner", async () => {
      const clip = { id: 1, isPublic: false, userId: "other-user" };
      mockDbChain.then = (resolve: any) => Promise.resolve([clip]).then(resolve);

      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await callHandler("GET /:id", req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe("DELETE /:id", () => {
    it("should delete own clip", async () => {
      const clip = { id: 1, userId: "user-1" };
      let callCount = 0;
      mockDbChain.then = (resolve: any) => {
        callCount++;
        if (callCount === 1) return Promise.resolve([clip]).then(resolve);
        return Promise.resolve(undefined).then(resolve);
      };

      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await callHandler("DELETE /:id", req, res);
      expect(res.json).toHaveBeenCalledWith({ message: "Clip deleted." });
    });

    it("should return 403 for other user's clip", async () => {
      const clip = { id: 1, userId: "other-user" };
      mockDbChain.then = (resolve: any) => Promise.resolve([clip]).then(resolve);

      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await callHandler("DELETE /:id", req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 404 for non-existent clip", async () => {
      mockDbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);
      const req = createReq({ params: { id: "999" } });
      const res = createRes();
      await callHandler("DELETE /:id", req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe("GET /upload/limits", () => {
    it("should return upload limits", async () => {
      const req = createReq();
      const res = createRes();
      await callHandler("GET /upload/limits", req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          maxVideoSizeBytes: 50 * 1024 * 1024,
          maxThumbnailSizeBytes: 2 * 1024 * 1024,
        })
      );
    });
  });
});
