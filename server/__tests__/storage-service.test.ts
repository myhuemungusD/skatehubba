/**
 * @fileoverview Unit tests for storage service
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const mockGetSignedUrl = vi.fn();
const mockFileExists = vi.fn();
const mockFileGetMetadata = vi.fn();
const mockFileDelete = vi.fn();
const mockFileSave = vi.fn();

const mockFile = () => ({
  getSignedUrl: mockGetSignedUrl,
  exists: mockFileExists,
  getMetadata: mockFileGetMetadata,
  delete: mockFileDelete,
  save: mockFileSave,
});

const mockBucketFile = vi.fn().mockReturnValue(mockFile());

vi.mock("../admin", () => ({
  admin: {
    storage: () => ({
      bucket: () => ({ file: mockBucketFile, name: "test-bucket" }),
    }),
  },
}));

vi.mock("../config/env", () => ({
  env: {
    FIREBASE_STORAGE_BUCKET: "test-bucket",
  },
}));

vi.mock("../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const {
  generateUploadUrls,
  getSignedDownloadUrl,
  validateUploadedFile,
  getPublicUrl,
  deleteFile,
  isOwnStorageUrl,
  UPLOAD_LIMITS,
} = await import("../services/storageService");

// ============================================================================
// Tests
// ============================================================================

describe("Storage Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSignedUrl.mockResolvedValue(["https://storage.googleapis.com/signed-url"]);
    mockBucketFile.mockReturnValue(mockFile());
  });

  describe("generateUploadUrls", () => {
    it("should generate video and thumbnail upload URLs", async () => {
      const result = await generateUploadUrls("user-1", "webm");
      expect(result.uploadId).toBeDefined();
      expect(result.videoUploadUrl).toBe("https://storage.googleapis.com/signed-url");
      expect(result.thumbnailUploadUrl).toBe("https://storage.googleapis.com/signed-url");
      expect(result.videoPath).toContain("trickmint/user-1/");
      expect(result.videoPath).toContain(".webm");
      expect(result.thumbnailPath).toContain("_thumb.jpg");
      expect(result.expiresAt).toBeDefined();
    });

    it("should generate mp4 content type for mp4 extension", async () => {
      await generateUploadUrls("user-1", "mp4");
      const firstCall = mockGetSignedUrl.mock.calls[0][0];
      expect(firstCall.contentType).toBe("video/mp4");
    });

    it("should default to webm content type", async () => {
      await generateUploadUrls("user-1");
      const firstCall = mockGetSignedUrl.mock.calls[0][0];
      expect(firstCall.contentType).toBe("video/webm");
    });

    it("should set 15-minute expiry", async () => {
      const before = Date.now();
      const result = await generateUploadUrls("user-1");
      const expiresAt = new Date(result.expiresAt).getTime();
      expect(expiresAt - before).toBeGreaterThan(14 * 60 * 1000);
      expect(expiresAt - before).toBeLessThan(16 * 60 * 1000);
    });
  });

  describe("getSignedDownloadUrl", () => {
    it("should return a signed download URL", async () => {
      const url = await getSignedDownloadUrl("trickmint/user-1/video.webm");
      expect(url).toBe("https://storage.googleapis.com/signed-url");
      expect(mockGetSignedUrl).toHaveBeenCalledWith(expect.objectContaining({ action: "read" }));
    });
  });

  describe("validateUploadedFile", () => {
    it("should validate a valid video file", async () => {
      mockFileExists.mockResolvedValue([true]);
      mockFileGetMetadata.mockResolvedValue([
        { size: 10 * 1024 * 1024, contentType: "video/webm" },
      ]);

      const result = await validateUploadedFile("path/video.webm", "video");
      expect(result.valid).toBe(true);
      expect(result.metadata).toEqual({
        size: 10 * 1024 * 1024,
        contentType: "video/webm",
        exists: true,
      });
    });

    it("should reject non-existent file", async () => {
      mockFileExists.mockResolvedValue([false]);
      const result = await validateUploadedFile("path/missing.webm", "video");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("File not found in storage");
    });

    it("should reject video exceeding max size", async () => {
      mockFileExists.mockResolvedValue([true]);
      mockFileGetMetadata.mockResolvedValue([
        { size: 60 * 1024 * 1024, contentType: "video/webm" },
      ]);

      const result = await validateUploadedFile("path/large.webm", "video");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds maximum size");
    });

    it("should reject thumbnail exceeding max size", async () => {
      mockFileExists.mockResolvedValue([true]);
      mockFileGetMetadata.mockResolvedValue([{ size: 5 * 1024 * 1024, contentType: "image/jpeg" }]);

      const result = await validateUploadedFile("path/thumb.jpg", "thumbnail");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds maximum size");
    });

    it("should reject invalid MIME type for video", async () => {
      mockFileExists.mockResolvedValue([true]);
      mockFileGetMetadata.mockResolvedValue([{ size: 1024, contentType: "video/mpeg" }]);

      const result = await validateUploadedFile("path/video.mpeg", "video");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid file type");
    });

    it("should reject invalid MIME type for thumbnail", async () => {
      mockFileExists.mockResolvedValue([true]);
      mockFileGetMetadata.mockResolvedValue([{ size: 1024, contentType: "image/gif" }]);

      const result = await validateUploadedFile("path/thumb.gif", "thumbnail");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid file type");
    });

    it("should handle validation errors gracefully", async () => {
      mockFileExists.mockRejectedValue(new Error("Network error"));
      const result = await validateUploadedFile("path/video.webm", "video");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Failed to validate file");
    });

    it("should accept valid thumbnail", async () => {
      mockFileExists.mockResolvedValue([true]);
      mockFileGetMetadata.mockResolvedValue([{ size: 500 * 1024, contentType: "image/jpeg" }]);

      const result = await validateUploadedFile("path/thumb.jpg", "thumbnail");
      expect(result.valid).toBe(true);
    });
  });

  describe("getPublicUrl", () => {
    it("should construct correct Firebase Storage public URL", () => {
      const url = getPublicUrl("trickmint/user-1/video.webm");
      expect(url).toBe(
        "https://firebasestorage.googleapis.com/v0/b/test-bucket/o/trickmint%2Fuser-1%2Fvideo.webm?alt=media"
      );
    });

    it("should encode special characters in path", () => {
      const url = getPublicUrl("path with spaces/file.mp4");
      expect(url).toContain("path%20with%20spaces");
    });
  });

  describe("deleteFile", () => {
    it("should delete existing file", async () => {
      mockFileExists.mockResolvedValue([true]);
      mockFileDelete.mockResolvedValue(undefined);
      await deleteFile("path/to/file.webm");
      expect(mockFileDelete).toHaveBeenCalled();
    });

    it("should skip deletion for non-existent file", async () => {
      mockFileExists.mockResolvedValue([false]);
      await deleteFile("path/to/missing.webm");
      expect(mockFileDelete).not.toHaveBeenCalled();
    });

    it("should handle deletion errors gracefully", async () => {
      mockFileExists.mockRejectedValue(new Error("Network error"));
      // Should not throw
      await deleteFile("path/to/file.webm");
    });
  });

  describe("isOwnStorageUrl", () => {
    it("should return true for own Firebase Storage URL", () => {
      expect(
        isOwnStorageUrl("https://firebasestorage.googleapis.com/v0/b/test-bucket/o/path")
      ).toBe(true);
    });

    it("should return true for Google Storage URL", () => {
      expect(isOwnStorageUrl("https://storage.googleapis.com/test-bucket/path")).toBe(true);
    });

    it("should return false for external URL", () => {
      expect(isOwnStorageUrl("https://example.com/video.mp4")).toBe(false);
    });

    it("should return false for different bucket", () => {
      expect(
        isOwnStorageUrl("https://firebasestorage.googleapis.com/v0/b/other-bucket/o/path")
      ).toBe(false);
    });
  });

  describe("UPLOAD_LIMITS", () => {
    it("should export correct video size limit", () => {
      expect(UPLOAD_LIMITS.MAX_VIDEO_SIZE_BYTES).toBe(50 * 1024 * 1024);
    });

    it("should export correct thumbnail size limit", () => {
      expect(UPLOAD_LIMITS.MAX_THUMBNAIL_SIZE_BYTES).toBe(2 * 1024 * 1024);
    });

    it("should include allowed video types", () => {
      expect(UPLOAD_LIMITS.ALLOWED_VIDEO_MIME_TYPES).toContain("video/webm");
      expect(UPLOAD_LIMITS.ALLOWED_VIDEO_MIME_TYPES).toContain("video/mp4");
      expect(UPLOAD_LIMITS.ALLOWED_VIDEO_MIME_TYPES).toContain("video/quicktime");
    });
  });
});
