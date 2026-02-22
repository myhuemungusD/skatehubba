/**
 * @fileoverview Extended tests for trickmint routes - covers error paths and retry logic
 *
 * Covers uncovered lines:
 * - POST /confirm-upload: missing fields, processUpload throws
 * - POST /submit: confirmDirectUpload fails, confirmDirectUpload throws
 * - GET /my-clips: invalid pagination
 * - GET /feed: 503, invalid pagination
 * - GET /:id: 503
 * - DELETE /:id: 503, invalid ID
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

vi.mock("../../db", () => ({
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

vi.mock("../../auth/middleware", () => ({
  authenticateUser: (req: any, _res: any, next: any) => {
    req.currentUser = req.currentUser || { id: "user-1" };
    next();
  },
  requireRecentAuth: vi.fn((_req: any, _res: any, next: any) => next()),
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
  VIDEO_LIMITS: { MAX_VIDEO_DURATION_MS: 60000, MIN_VIDEO_DURATION_MS: 500 },
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

await import("../../routes/trickmint");

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

describe("Trickmint Routes - Extended Coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDatabaseAvailable.mockReturnValue(true);
    mockDbChain.then = (resolve: any) => Promise.resolve([]).then(resolve);
  });

  describe("POST /confirm-upload - error paths", () => {
    it("should return 400 for missing trickName", async () => {
      const req = createReq({
        body: { videoPath: "trickmint/user-1/abc.webm" },
      });
      const res = createRes();
      await callHandler("POST /confirm-upload", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 500 when processUpload throws", async () => {
      mockProcessUpload.mockRejectedValue(new Error("Unexpected"));
      const req = createReq({
        body: {
          trickName: "Kickflip",
          videoPath: "trickmint/user-1/abc.webm",
        },
      });
      const res = createRes();
      await callHandler("POST /confirm-upload", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("POST /submit - error paths", () => {
    it("should return 400 when confirmDirectUpload returns failure", async () => {
      mockConfirmDirectUpload.mockResolvedValue({
        success: false,
        error: "Video too large",
      });
      const req = createReq({
        body: {
          trickName: "Heelflip",
          videoUrl: "https://storage.example.com/video.mp4",
        },
      });
      const res = createRes();
      await callHandler("POST /submit", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 500 when confirmDirectUpload throws", async () => {
      mockConfirmDirectUpload.mockRejectedValue(new Error("Unexpected"));
      const req = createReq({
        body: {
          trickName: "Heelflip",
          videoUrl: "https://storage.example.com/video.mp4",
        },
      });
      const res = createRes();
      await callHandler("POST /submit", req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("GET /my-clips - error paths", () => {
    it("should return 400 for invalid pagination (limit < 1)", async () => {
      const req = createReq({ query: { limit: "-1" } });
      const res = createRes();
      await callHandler("GET /my-clips", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("GET /feed - error paths", () => {
    it("should return 503 when db unavailable", async () => {
      mockIsDatabaseAvailable.mockReturnValue(false);
      const req = createReq({ query: {} });
      const res = createRes();
      await callHandler("GET /feed", req, res);
      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should return 400 for invalid pagination (limit = 0)", async () => {
      const req = createReq({ query: { limit: "0" } });
      const res = createRes();
      await callHandler("GET /feed", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("GET /:id - error paths", () => {
    it("should return 503 when db unavailable", async () => {
      mockIsDatabaseAvailable.mockReturnValue(false);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await callHandler("GET /:id", req, res);
      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  describe("DELETE /:id - error paths", () => {
    it("should return 503 when db unavailable", async () => {
      mockIsDatabaseAvailable.mockReturnValue(false);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await callHandler("DELETE /:id", req, res);
      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should return 400 for non-numeric clip ID", async () => {
      const req = createReq({ params: { id: "xyz" } });
      const res = createRes();
      await callHandler("DELETE /:id", req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
