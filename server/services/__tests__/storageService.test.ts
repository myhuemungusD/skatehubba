/**
 * Behavior tests for Storage Service
 *
 * Tests the video upload pipeline: signed URL generation, file validation,
 * public URL construction, cache headers, deletion, and quality variants.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────

const {
  mockEnv,
  mockGetSignedUrl,
  mockExists,
  mockGetMetadata,
  mockSetMetadata,
  mockDelete,
  mockFile,
} = vi.hoisted(() => {
  const mockGetSignedUrl = vi.fn().mockResolvedValue(["https://signed-url"]);
  const mockExists = vi.fn().mockResolvedValue([true]);
  const mockGetMetadata = vi.fn().mockResolvedValue([{ size: 1000, contentType: "video/mp4" }]);
  const mockSetMetadata = vi.fn().mockResolvedValue(undefined);
  const mockDelete = vi.fn().mockResolvedValue(undefined);

  const mockFile = vi.fn().mockReturnValue({
    getSignedUrl: mockGetSignedUrl,
    exists: mockExists,
    getMetadata: mockGetMetadata,
    setMetadata: mockSetMetadata,
    delete: mockDelete,
  });

  return {
    mockEnv: { FIREBASE_STORAGE_BUCKET: "test-bucket" },
    mockGetSignedUrl,
    mockExists,
    mockGetMetadata,
    mockSetMetadata,
    mockDelete,
    mockFile,
  };
});

vi.mock("../../config/env", () => ({
  env: mockEnv,
}));

vi.mock("../../admin", () => ({
  admin: {
    storage: vi.fn().mockReturnValue({
      bucket: vi.fn().mockReturnValue({
        file: mockFile,
      }),
    }),
  },
}));

vi.mock("../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  generateUploadUrls,
  getSignedDownloadUrl,
  validateUploadedFile,
  getPublicUrl,
  setCacheHeaders,
  deleteFile,
  isOwnStorageUrl,
  getQualityVariantPath,
  getQualityVideoUrl,
  buildQualityUrls,
} from "../storageService";

// ── Tests ────────────────────────────────────────────────────────────────

describe("Storage Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.FIREBASE_STORAGE_BUCKET = "test-bucket";
  });

  describe("generateUploadUrls", () => {
    it("returns signed upload URLs for video and thumbnail", async () => {
      const result = await generateUploadUrls("user-123");

      expect(result.uploadId).toBeDefined();
      expect(result.videoUploadUrl).toBe("https://signed-url");
      expect(result.thumbnailUploadUrl).toBe("https://signed-url");
      expect(result.videoPath).toContain("trickmint/user-123/");
      expect(result.thumbnailPath).toContain("_thumb.jpg");
      expect(result.expiresAt).toBeDefined();
    });

    it("uses webm extension by default", async () => {
      const result = await generateUploadUrls("user-123");
      expect(result.videoPath).toMatch(/\.webm$/);
    });

    it("uses specified file extension", async () => {
      const result = await generateUploadUrls("user-123", "mp4");
      expect(result.videoPath).toMatch(/\.mp4$/);
    });

    it("throws when FIREBASE_STORAGE_BUCKET is not configured", async () => {
      mockEnv.FIREBASE_STORAGE_BUCKET = "";
      await expect(generateUploadUrls("user-1")).rejects.toThrow(
        "FIREBASE_STORAGE_BUCKET is not configured"
      );
    });
  });

  describe("getSignedDownloadUrl", () => {
    it("returns a signed download URL for the given path", async () => {
      const url = await getSignedDownloadUrl("trickmint/user-1/video.webm");
      expect(url).toBe("https://signed-url");
      expect(mockFile).toHaveBeenCalledWith("trickmint/user-1/video.webm");
    });
  });

  describe("validateUploadedFile", () => {
    it("returns valid for a file within size and type constraints", async () => {
      mockGetMetadata.mockResolvedValueOnce([{ size: 5_000_000, contentType: "video/mp4" }]);

      const result = await validateUploadedFile("video.mp4", "video");

      expect(result.valid).toBe(true);
      expect(result.metadata).toEqual({
        size: 5_000_000,
        contentType: "video/mp4",
        exists: true,
      });
    });

    it("rejects a file that does not exist in storage", async () => {
      mockExists.mockResolvedValueOnce([false]);

      const result = await validateUploadedFile("missing.mp4", "video");

      expect(result.valid).toBe(false);
      expect(result.error).toBe("File not found in storage");
    });

    it("rejects a video exceeding the 50MB size limit", async () => {
      mockGetMetadata.mockResolvedValueOnce([{ size: 60 * 1024 * 1024, contentType: "video/mp4" }]);

      const result = await validateUploadedFile("big.mp4", "video");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds maximum size");
    });

    it("rejects a thumbnail exceeding the 2MB size limit", async () => {
      mockGetMetadata.mockResolvedValueOnce([{ size: 3 * 1024 * 1024, contentType: "image/jpeg" }]);

      const result = await validateUploadedFile("big.jpg", "thumbnail");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds maximum size");
    });

    it("rejects a file with a disallowed MIME type", async () => {
      mockGetMetadata.mockResolvedValueOnce([{ size: 1000, contentType: "application/pdf" }]);

      const result = await validateUploadedFile("file.pdf", "video");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid file type");
    });

    it("handles storage errors gracefully", async () => {
      mockExists.mockRejectedValueOnce(new Error("GCS unavailable"));

      const result = await validateUploadedFile("video.mp4", "video");

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Failed to validate file");
    });
  });

  describe("getPublicUrl", () => {
    it("constructs a Firebase Storage public URL with encoded path", () => {
      const url = getPublicUrl("trickmint/user-1/video.webm");

      expect(url).toBe(
        `https://firebasestorage.googleapis.com/v0/b/test-bucket/o/${encodeURIComponent("trickmint/user-1/video.webm")}?alt=media`
      );
    });

    it("throws when FIREBASE_STORAGE_BUCKET is not configured", () => {
      mockEnv.FIREBASE_STORAGE_BUCKET = "";

      expect(() => getPublicUrl("trickmint/user-1/video.webm")).toThrow(
        "FIREBASE_STORAGE_BUCKET is not configured"
      );
    });
  });

  describe("setCacheHeaders", () => {
    it("sets immutable cache headers on video files", async () => {
      await setCacheHeaders("video.webm", "video");

      expect(mockSetMetadata).toHaveBeenCalledWith({
        cacheControl: "public, max-age=31536000, immutable",
      });
    });

    it("sets immutable cache headers on thumbnail files", async () => {
      await setCacheHeaders("thumb.jpg", "thumbnail");

      expect(mockSetMetadata).toHaveBeenCalledWith({
        cacheControl: "public, max-age=31536000, immutable",
      });
    });

    it("silently handles metadata update failures", async () => {
      mockSetMetadata.mockRejectedValueOnce(new Error("GCS error"));

      await expect(setCacheHeaders("video.webm", "video")).resolves.toBeUndefined();
    });
  });

  describe("deleteFile", () => {
    it("deletes a file that exists in storage", async () => {
      await deleteFile("video.webm");

      expect(mockExists).toHaveBeenCalled();
      expect(mockDelete).toHaveBeenCalled();
    });

    it("skips deletion for files that do not exist", async () => {
      mockExists.mockResolvedValueOnce([false]);

      await deleteFile("gone.webm");

      expect(mockDelete).not.toHaveBeenCalled();
    });

    it("silently handles deletion errors", async () => {
      mockExists.mockRejectedValueOnce(new Error("GCS error"));

      await expect(deleteFile("video.webm")).resolves.toBeUndefined();
    });
  });

  describe("isOwnStorageUrl", () => {
    it("returns true for Firebase Storage URLs matching our bucket", () => {
      expect(
        isOwnStorageUrl("https://firebasestorage.googleapis.com/v0/b/test-bucket/o/video.webm")
      ).toBe(true);
    });

    it("returns true for GCS direct URLs matching our bucket", () => {
      expect(isOwnStorageUrl("https://storage.googleapis.com/test-bucket/video.webm")).toBe(true);
    });

    it("returns false for URLs from other buckets", () => {
      expect(
        isOwnStorageUrl("https://firebasestorage.googleapis.com/v0/b/other-bucket/o/video.webm")
      ).toBe(false);
    });

    it("returns false when FIREBASE_STORAGE_BUCKET is not configured", () => {
      mockEnv.FIREBASE_STORAGE_BUCKET = "";
      expect(isOwnStorageUrl("https://some-url.com/video.webm")).toBe(false);
    });
  });

  describe("getQualityVariantPath", () => {
    it("appends quality tier suffix before the extension", () => {
      expect(getQualityVariantPath("trickmint/user/abc.webm", "low")).toBe(
        "trickmint/user/abc_low.mp4"
      );
    });

    it("always produces .mp4 output regardless of input format", () => {
      expect(getQualityVariantPath("video.webm", "medium")).toBe("video_medium.mp4");
    });

    it("handles paths without an extension", () => {
      expect(getQualityVariantPath("video", "low")).toBe("video_low.mp4");
    });
  });

  describe("getQualityVideoUrl", () => {
    it("returns the original URL for high quality tier", () => {
      const original = "https://original-url.com/video.webm";
      expect(getQualityVideoUrl(original, "path.webm", "high")).toBe(original);
    });

    it("returns a public URL for lower quality tiers", () => {
      const url = getQualityVideoUrl("https://original.com", "path.webm", "low");
      expect(url).toContain("path_low.mp4");
    });
  });

  describe("buildQualityUrls", () => {
    it("returns URLs for all three quality tiers", () => {
      const urls = buildQualityUrls("https://original.com", "trickmint/user/vid.webm");

      expect(urls.high).toBe("https://original.com");
      expect(urls.low).toContain("vid_low.mp4");
      expect(urls.medium).toContain("vid_medium.mp4");
    });
  });
});
