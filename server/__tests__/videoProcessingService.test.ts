/**
 * @fileoverview Unit tests for video processing service
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProcessUploadInput, ProcessUploadResult } from "../services/videoProcessingService";

// ============================================================================
// Mocks
// ============================================================================

const mockSetFn = vi.fn().mockReturnValue(Promise.resolve());
const mockUpdateFn = vi.fn((...args: any[]) => ({ set: mockSetFn }));
const mockInsertFn = vi.fn(() => ({ values: mockValuesFn, returning: mockReturningFn }));
const mockValuesFn = vi.fn(() => ({ returning: mockReturningFn }));
const mockReturningFn = vi.fn().mockResolvedValue([{
  id: 1,
  videoUrl: "https://example.com/video.mp4",
  thumbnailUrl: "https://example.com/thumb.jpg",
  status: "ready",
}]);

const mockDbChain: any = {
  insert: mockInsertFn,
  update: (...args: any[]) => {
    mockUpdateFn(...args);
    return { set: mockSetFn };
  },
  where: vi.fn().mockReturnThis(),
};

const mockGetDb = vi.fn(() => mockDbChain);

vi.mock("../db", () => ({
  getDb: () => mockGetDb(),
}));

vi.mock("@shared/schema", () => ({
  trickClips: {
    id: "id",
    userId: "userId",
    status: "status",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

const mockValidateUploadedFile = vi.fn();
const mockGetPublicUrl = vi.fn((path: string) => `https://example.com/${path}`);

vi.mock("../services/storageService", () => ({
  validateUploadedFile: (...args: any[]) => mockValidateUploadedFile(...args),
  getPublicUrl: (path: string) => mockGetPublicUrl(path),
}));

vi.mock("../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import after mocks are set up
const { processUpload, confirmDirectUpload, markClipFailed } = await import(
  "../services/videoProcessingService"
);

// ============================================================================
// Tests
// ============================================================================

describe("Video Processing Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("processUpload", () => {
    it("should successfully process a valid upload", async () => {
      mockValidateUploadedFile.mockResolvedValue({
        valid: true,
        metadata: { size: 1024, contentType: "video/mp4" },
      });

      const input: ProcessUploadInput = {
        userId: "user-1",
        userName: "TestUser",
        trickName: "Kickflip",
        videoPath: "videos/test.mp4",
        isPublic: true,
      };

      const result = await processUpload(input);

      expect(result.success).toBe(true);
      expect(result.clip).toBeDefined();
      expect(result.clip?.id).toBe(1);
    });

    it("should fail when video validation fails", async () => {
      mockValidateUploadedFile.mockResolvedValue({
        valid: false,
        error: "Invalid video format",
      });

      const input: ProcessUploadInput = {
        userId: "user-1",
        userName: "TestUser",
        trickName: "Kickflip",
        videoPath: "videos/invalid.mp4",
      };

      const result = await processUpload(input);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid video format");
    });
  });

  describe("confirmDirectUpload", () => {
    it("should successfully confirm a direct upload", async () => {
      const input = {
        userId: "user-1",
        userName: "TestUser",
        trickName: "Heelflip",
        videoUrl: "https://example.com/video.mp4",
        videoDurationMs: 5000,
        isPublic: true,
      };

      const result = await confirmDirectUpload(input);

      expect(result.success).toBe(true);
      expect(result.clip).toBeDefined();
    });

    it("should fail when video exceeds duration limit", async () => {
      const input = {
        userId: "user-1",
        userName: "TestUser",
        trickName: "Heelflip",
        videoUrl: "https://example.com/video.mp4",
        videoDurationMs: 60000, // 60 seconds, exceeds 30s limit
        isPublic: true,
      };

      const result = await confirmDirectUpload(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain("exceeds maximum duration");
    });
  });

  describe("markClipFailed", () => {
    it("should mark a clip as failed", async () => {
      await markClipFailed(1, "Transcoding failed");

      expect(mockUpdateFn).toHaveBeenCalled();
      expect(mockSetFn).toHaveBeenCalled();
    });
  });
});
