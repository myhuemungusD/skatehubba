/**
 * @fileoverview Unit tests for VideoProcessingService
 * @module server/__tests__/videoProcessingService.test
 *
 * Tests:
 * - processUpload (validation + DB record creation)
 * - confirmDirectUpload
 * - markClipFailed
 * - Duration validation
 * - Thumbnail handling
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock environment
vi.mock("../config/env", () => ({
  env: { DATABASE_URL: "mock://test", NODE_ENV: "test" },
}));

// Mock logger
vi.mock("../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ _op: "eq", col, val }),
}));

// Mock schema
vi.mock("@shared/schema", () => ({
  trickClips: {
    _table: "trickClips",
    id: { name: "id", _isPrimary: true },
    views: { name: "views" },
  },
}));

// Storage service mock
let mockValidateResult: any = {
  valid: true,
  metadata: { size: 1024000, contentType: "video/mp4" },
};
let mockThumbValidateResult: any = { valid: true };

vi.mock("../services/storageService", () => ({
  validateUploadedFile: vi.fn(async (_path: string, type: string) => {
    if (type === "thumbnail") return mockThumbValidateResult;
    return mockValidateResult;
  }),
  getPublicUrl: vi.fn((path: string) => `https://cdn.example.com/${path}`),
  generateUploadUrls: vi.fn(),
  UPLOAD_LIMITS: { maxFileSize: 50 * 1024 * 1024 },
}));

// DB mock
let mockInsertResult: any = [
  { id: 1, videoUrl: "https://cdn.example.com/video.mp4", thumbnailUrl: null, status: "ready" },
];
let mockDbError: any = null;

const mockWhere = vi.fn().mockResolvedValue(undefined);
const mockSetFn = vi.fn(() => ({ where: mockWhere }));
const mockUpdateFn = vi.fn(() => ({ set: mockSetFn }));

vi.mock("../db", () => ({
  getDb: () => ({
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => {
          if (mockDbError) throw mockDbError;
          return mockInsertResult;
        }),
      })),
    })),
    update: (table: any) => {
      mockUpdateFn(table);
      return { set: mockSetFn };
    },
  }),
}));

// Import after mocking
const { processUpload, confirmDirectUpload, markClipFailed, VIDEO_LIMITS } =
  await import("../services/videoProcessingService");

describe("VideoProcessingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateResult = { valid: true, metadata: { size: 1024000, contentType: "video/mp4" } };
    mockThumbValidateResult = { valid: true };
    mockInsertResult = [
      { id: 1, videoUrl: "https://cdn.example.com/video.mp4", thumbnailUrl: null, status: "ready" },
    ];
    mockDbError = null;
  });

  // ===========================================================================
  // processUpload
  // ===========================================================================

  describe("processUpload", () => {
    const baseInput = {
      userId: "user-1",
      userName: "TestSkater",
      trickName: "Kickflip",
      videoPath: "uploads/video.mp4",
    };

    it("should successfully process a valid upload", async () => {
      const result = await processUpload(baseInput);

      expect(result.success).toBe(true);
      expect(result.clip).toBeDefined();
      expect(result.clip!.id).toBe(1);
      expect(result.clip!.status).toBe("ready");
    });

    it("should fail when video validation fails", async () => {
      mockValidateResult = { valid: false, error: "File not found" };

      const result = await processUpload(baseInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe("File not found");
    });

    it("should handle thumbnail validation gracefully", async () => {
      mockThumbValidateResult = { valid: false, error: "Thumbnail corrupt" };

      const result = await processUpload({
        ...baseInput,
        thumbnailPath: "uploads/thumb.jpg",
      });

      // Should still succeed (thumbnail failure is non-fatal)
      expect(result.success).toBe(true);
    });

    it("should include thumbnail URL when validation passes", async () => {
      mockInsertResult = [
        {
          id: 2,
          videoUrl: "https://cdn.example.com/video.mp4",
          thumbnailUrl: "https://cdn.example.com/uploads/thumb.jpg",
          status: "ready",
        },
      ];

      const result = await processUpload({
        ...baseInput,
        thumbnailPath: "uploads/thumb.jpg",
      });

      expect(result.success).toBe(true);
    });

    it("should reject video exceeding max duration", async () => {
      const result = await processUpload({
        ...baseInput,
        videoDurationMs: 60000, // 60s, exceeds 30s limit
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("maximum duration");
    });

    it("should reject video that is too short", async () => {
      const result = await processUpload({
        ...baseInput,
        videoDurationMs: 100, // 100ms, below 500ms minimum
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("too short");
    });

    it("should accept video within duration limits", async () => {
      const result = await processUpload({
        ...baseInput,
        videoDurationMs: 15000,
      });

      expect(result.success).toBe(true);
    });

    it("should handle DB error gracefully", async () => {
      mockDbError = new Error("connection failed");

      const result = await processUpload(baseInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to save clip");
    });

    it("should pass optional fields correctly", async () => {
      const result = await processUpload({
        ...baseInput,
        description: "  Clean kickflip  ",
        spotId: 42,
        gameId: "game-1",
        gameTurnId: 3,
        isPublic: false,
      });

      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // confirmDirectUpload
  // ===========================================================================

  describe("confirmDirectUpload", () => {
    const baseInput = {
      userId: "user-1",
      userName: "TestSkater",
      trickName: "Heelflip",
      videoUrl: "https://storage.example.com/video.mp4",
    };

    it("should successfully confirm a direct upload", async () => {
      const result = await confirmDirectUpload(baseInput);

      expect(result.success).toBe(true);
      expect(result.clip).toBeDefined();
    });

    it("should reject video exceeding max duration", async () => {
      const result = await confirmDirectUpload({
        ...baseInput,
        videoDurationMs: 60000,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("maximum duration");
    });

    it("should reject video exceeding 50MB size limit", async () => {
      const result = await confirmDirectUpload({
        ...baseInput,
        fileSizeBytes: 60 * 1024 * 1024, // 60MB
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("50MB");
    });

    it("should handle DB error gracefully", async () => {
      mockDbError = new Error("insert failed");

      const result = await confirmDirectUpload(baseInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to save clip");
    });

    it("should accept valid file size", async () => {
      const result = await confirmDirectUpload({
        ...baseInput,
        fileSizeBytes: 10 * 1024 * 1024,
        videoDurationMs: 10000,
        mimeType: "video/mp4",
        thumbnailUrl: "https://cdn.example.com/thumb.jpg",
        spotId: 5,
      });

      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // markClipFailed
  // ===========================================================================

  describe("markClipFailed", () => {
    it("should update clip status to failed", async () => {
      await markClipFailed(1, "Transcoding error");

      expect(mockUpdateFn).toHaveBeenCalled();
    });

    it("should handle DB error gracefully", async () => {
      mockSetFn.mockImplementationOnce(() => {
        throw new Error("DB error");
      });

      // Should not throw
      await markClipFailed(1, "error");
    });
  });

  // ===========================================================================
  // VIDEO_LIMITS
  // ===========================================================================

  describe("VIDEO_LIMITS", () => {
    it("should export video limit constants", () => {
      expect(VIDEO_LIMITS.MAX_VIDEO_DURATION_MS).toBe(30000);
      expect(VIDEO_LIMITS.MIN_VIDEO_DURATION_MS).toBe(500);
    });
  });
});
