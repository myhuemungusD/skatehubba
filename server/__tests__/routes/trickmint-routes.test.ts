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
mockDbChain.insert = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.values = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.set = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.delete = vi.fn().mockReturnValue(mockDbChain);
mockDbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);

const mockGetUserDisplayName = vi.fn().mockResolvedValue("TestUser");
let mockGetDb: () => any;

vi.mock("../../db", () => ({
  getDb: () => mockGetDb(),
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
  clipViews: {
    _table: "clip_views",
    clipId: "clipId",
    userId: "userId",
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

vi.mock("../../auth/middleware", () => ({
  authenticateUser: (req: any, _res: any, next: any) => {
    req.currentUser = req.currentUser || { id: "user-1" };
    next();
  },
  requireRecentAuth: vi.fn((_req: any, _res: any, next: any) => next()),
}));

vi.mock("../../middleware/security", () => ({
  trickmintUploadLimiter: vi.fn((_r: any, _s: any, n: any) => n()),
}));

vi.mock("../../logger", () => ({
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
vi.mock("../../services/storageService", () => ({
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
vi.mock("../../services/videoProcessingService", () => ({
  processUpload: (...args: any[]) => mockProcessUpload(...args),
  confirmDirectUpload: (...args: any[]) => mockConfirmDirectUpload(...args),
  VIDEO_LIMITS: { MAX_VIDEO_DURATION_MS: 60000 },
}));

// Mock feedCache — passthrough middleware in tests
vi.mock("../../middleware/feedCache", () => ({
  feedCache: () => (_req: any, _res: any, next: any) => next(),
}));

// Mock videoTranscoder type import
vi.mock("../../services/videoTranscoder", () => ({}));

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

const { recordClipView } = await import("../../routes/trickmint");

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
    mockGetDb = () => mockDbChain;
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

    it("should return 500 when db is unavailable", async () => {
      mockGetDb = () => {
        throw new Error("Database not configured");
      };
      const req = createReq({
        body: { trickName: "Kickflip", videoPath: "trickmint/user-1/abc.webm" },
      });
      const res = createRes();
      await callHandler("POST /confirm-upload", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
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

    it("should return 403 when path contains '..' (path traversal)", async () => {
      const req = createReq({
        body: {
          trickName: "Kickflip",
          videoPath: "trickmint/user-1/../other-user/abc.webm",
        },
      });
      const res = createRes();
      await callHandler("POST /confirm-upload", req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 403 when path contains '//' (double slash)", async () => {
      const req = createReq({
        body: {
          trickName: "Kickflip",
          videoPath: "trickmint/user-1//abc.webm",
        },
      });
      const res = createRes();
      await callHandler("POST /confirm-upload", req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 403 when path fails safe path regex", async () => {
      const req = createReq({
        body: {
          trickName: "Kickflip",
          videoPath: "trickmint/user-1/abc file.webm",
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

    it("should return 500 when db unavailable", async () => {
      mockGetDb = () => {
        throw new Error("Database not configured");
      };
      const req = createReq({
        body: {
          trickName: "Heelflip",
          videoUrl: "https://storage.googleapis.com/video.mp4",
        },
      });
      const res = createRes();
      await callHandler("POST /submit", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
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

    it("should return total 0 when count result is empty (line 332)", async () => {
      let callCount = 0;
      mockDbChain.then = (resolve: any) => {
        callCount++;
        if (callCount === 1) return Promise.resolve([]).then(resolve);
        // countResult is undefined/empty
        return Promise.resolve([]).then(resolve);
      };

      const req = createReq({ query: {} });
      const res = createRes();
      await callHandler("GET /my-clips", req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ clips: [], total: 0 })
      );
    });

    it("should return 500 when db unavailable", async () => {
      mockGetDb = () => {
        throw new Error("Database not configured");
      };
      const req = createReq({ query: {} });
      const res = createRes();
      await callHandler("GET /my-clips", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
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

    it("should derive quality variant URL from Firebase storage URL with extension (lines 60-65)", async () => {
      const firebaseUrl =
        "https://firebasestorage.googleapis.com/v0/b/bucket/o/trickmint%2Fuser-1%2Fvideo.mp4?alt=media";
      const clips = [{ id: 2, isPublic: true, status: "ready", videoUrl: firebaseUrl }];
      let callCount = 0;
      mockDbChain.then = (resolve: any) => {
        callCount++;
        if (callCount === 1) return Promise.resolve(clips).then(resolve);
        return Promise.resolve([{ total: 1 }]).then(resolve);
      };

      // preferredQuality = "low" triggers the variant URL derivation
      const req = createReq({ query: {}, preferredQuality: "low" });
      const res = createRes();
      await callHandler("GET /feed", req, res);

      const result = res.json.mock.calls[0][0];
      const clip = result.clips[0];
      expect(clip.preferredQuality).toBe("low");
      // The variant URL should contain _low.mp4
      expect(clip.videoUrlForQuality).toContain("_low.mp4");
    });

    it("should handle Firebase URL without file extension (dotIdx === -1, line 62)", async () => {
      // URL with an encoded path that has no extension
      const firebaseUrl =
        "https://firebasestorage.googleapis.com/v0/b/bucket/o/trickmint%2Fuser-1%2Fnoextfile?alt=media";
      const clips = [{ id: 3, isPublic: true, status: "ready", videoUrl: firebaseUrl }];
      let callCount = 0;
      mockDbChain.then = (resolve: any) => {
        callCount++;
        if (callCount === 1) return Promise.resolve(clips).then(resolve);
        return Promise.resolve([{ total: 1 }]).then(resolve);
      };

      const req = createReq({ query: {}, preferredQuality: "low" });
      const res = createRes();
      await callHandler("GET /feed", req, res);

      const result = res.json.mock.calls[0][0];
      const clip = result.clips[0];
      // When there's no dot, the entire original path is used as the base
      expect(clip.videoUrlForQuality).toContain("_low.mp4");
      expect(clip.preferredQuality).toBe("low");
    });

    it("should skip quality variant derivation when preferredQuality is 'high'", async () => {
      const firebaseUrl =
        "https://firebasestorage.googleapis.com/v0/b/bucket/o/trickmint%2Fuser-1%2Fvideo.mp4?alt=media";
      const clips = [{ id: 4, isPublic: true, status: "ready", videoUrl: firebaseUrl }];
      let callCount = 0;
      mockDbChain.then = (resolve: any) => {
        callCount++;
        if (callCount === 1) return Promise.resolve(clips).then(resolve);
        return Promise.resolve([{ total: 1 }]).then(resolve);
      };

      const req = createReq({ query: {}, preferredQuality: "high" });
      const res = createRes();
      await callHandler("GET /feed", req, res);

      const result = res.json.mock.calls[0][0];
      const clip = result.clips[0];
      // When quality is "high", videoUrlForQuality should be the same as videoUrl
      expect(clip.videoUrlForQuality).toBe(firebaseUrl);
      expect(clip.preferredQuality).toBe("high");
    });

    it("should return total 0 when count result is empty (line 375)", async () => {
      let callCount = 0;
      mockDbChain.then = (resolve: any) => {
        callCount++;
        if (callCount === 1) return Promise.resolve([]).then(resolve);
        // countResult is undefined/empty
        return Promise.resolve([]).then(resolve);
      };

      const req = createReq({ query: {} });
      const res = createRes();
      await callHandler("GET /feed", req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ clips: [], total: 0 })
      );
    });

    it("should return videoUrl unchanged when URL does not match Firebase /o/ pattern", async () => {
      const nonFirebaseUrl = "https://cdn.example.com/videos/clip.mp4";
      const clips = [{ id: 5, isPublic: true, status: "ready", videoUrl: nonFirebaseUrl }];
      let callCount = 0;
      mockDbChain.then = (resolve: any) => {
        callCount++;
        if (callCount === 1) return Promise.resolve(clips).then(resolve);
        return Promise.resolve([{ total: 1 }]).then(resolve);
      };

      const req = createReq({ query: {}, preferredQuality: "low" });
      const res = createRes();
      await callHandler("GET /feed", req, res);

      const result = res.json.mock.calls[0][0];
      const clip = result.clips[0];
      // Non-Firebase URLs should not be modified
      expect(clip.videoUrlForQuality).toBe(nonFirebaseUrl);
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

  // ==========================================================================
  // recordClipView — M11 per-user deduplication
  // ==========================================================================

  describe("recordClipView", () => {
    it("should insert view record and increment counter on first view", async () => {
      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });
      const db: any = { insert: mockInsert, update: mockUpdate };

      await recordClipView(db, 42, "user-1");

      // Should have inserted into clipViews
      expect(mockInsert).toHaveBeenCalled();
      // Should have incremented the views counter
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("should silently skip on duplicate view (unique constraint violation 23505)", async () => {
      const uniqueError: any = new Error("duplicate key value violates unique constraint");
      uniqueError.code = "23505";

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockRejectedValue(uniqueError),
      });
      const mockUpdate = vi.fn();
      const db: any = { insert: mockInsert, update: mockUpdate };

      // Should not throw
      await recordClipView(db, 42, "user-1");

      // Insert was attempted
      expect(mockInsert).toHaveBeenCalled();
      // Counter should NOT have been incremented
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("should log non-unique-constraint errors without throwing", async () => {
      const dbError = new Error("connection refused");

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockRejectedValue(dbError),
      });
      const mockUpdate = vi.fn();
      const db: any = { insert: mockInsert, update: mockUpdate };

      const logger = (await import("../../logger")).default;

      // Should not throw
      await recordClipView(db, 42, "user-1");

      // Counter should NOT have been incremented
      expect(mockUpdate).not.toHaveBeenCalled();
      // Error should be logged
      expect(logger.error).toHaveBeenCalledWith(
        "[TrickMint] View recording failed",
        expect.objectContaining({ clipId: 42, userId: "user-1" })
      );
    });

    it("should stringify non-Error thrown values (line 100)", async () => {
      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockRejectedValue("string error"),
      });
      const mockUpdate = vi.fn();
      const db: any = { insert: mockInsert, update: mockUpdate };

      const logger = (await import("../../logger")).default;

      await recordClipView(db, 99, "user-2");

      expect(mockUpdate).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        "[TrickMint] View recording failed",
        expect.objectContaining({ clipId: 99, userId: "user-2", error: "string error" })
      );
    });
  });
});
