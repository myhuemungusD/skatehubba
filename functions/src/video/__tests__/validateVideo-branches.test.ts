/**
 * @fileoverview Branch-coverage tests for video/validateVideo.ts
 *
 * Targets the uncovered branch:
 * - Lines 35-40: oversized file guard (fileSize > MAX_FILE_SIZE_BYTES)
 *   Deletes the file and returns early when uploaded file exceeds 500 MB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Hoisted mock state
// ============================================================================

const mocks = vi.hoisted(() => {
  const bucketFile = {
    download: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };

  const bucket = {
    file: vi.fn().mockReturnValue(bucketFile),
  };

  const storageInstance = {
    bucket: vi.fn().mockReturnValue(bucket),
  };

  const ffprobeFn = vi.fn();

  const logger = {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  return {
    bucketFile,
    bucket,
    storageInstance,
    ffprobeFn,
    logger,
  };
});

// ============================================================================
// Module mocks
// ============================================================================

vi.mock("firebase-functions", () => ({
  logger: mocks.logger,
  storage: {
    object: () => ({
      onFinalize: vi.fn((handler: any) => handler),
    }),
  },
}));

vi.mock("firebase-admin", () => {
  const mod = {
    apps: [{ name: "mock" }],
    initializeApp: vi.fn(),
    storage: vi.fn(() => mocks.storageInstance),
  };

  return { ...mod, default: mod };
});

vi.mock("@ffprobe-installer/ffprobe", () => ({
  default: { path: "/mock/ffprobe" },
}));

vi.mock("fluent-ffmpeg", () => ({
  default: Object.assign(vi.fn(), {
    setFfprobePath: vi.fn(),
    ffprobe: mocks.ffprobeFn,
  }),
}));

// ============================================================================
// Import after mocks
// ============================================================================

const { validateChallengeVideo } = await import("../validateVideo");

// ============================================================================
// Tests
// ============================================================================

describe("validateChallengeVideo — uncovered branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bucket.file.mockReturnValue(mocks.bucketFile);
    mocks.storageInstance.bucket.mockReturnValue(mocks.bucket);
    mocks.bucketFile.download.mockResolvedValue(undefined);
    mocks.bucketFile.delete.mockResolvedValue(undefined);
  });

  describe("lines 35-40: oversized file guard", () => {
    it("deletes file exceeding 500 MB and returns early", async () => {
      const oversizeBytes = 500 * 1024 * 1024 + 1; // 500 MB + 1 byte

      await (validateChallengeVideo as any)({
        name: "challenges/oversized.mp4",
        contentType: "video/mp4",
        bucket: "test-bucket",
        size: String(oversizeBytes),
      });

      // Should delete the oversized file
      expect(mocks.bucketFile.delete).toHaveBeenCalled();
      // Should log a warning
      expect(mocks.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("[validateChallengeVideo] Deleted oversized file")
      );
      // Should NOT download the file for ffprobe analysis
      expect(mocks.bucketFile.download).not.toHaveBeenCalled();
      expect(mocks.ffprobeFn).not.toHaveBeenCalled();
    });

    it("deletes file exactly at 501 MB", async () => {
      const oversizeBytes = 501 * 1024 * 1024;

      await (validateChallengeVideo as any)({
        name: "challenges/huge.mp4",
        contentType: "video/mp4",
        bucket: "test-bucket",
        size: String(oversizeBytes),
      });

      expect(mocks.bucketFile.delete).toHaveBeenCalled();
      expect(mocks.logger.warn).toHaveBeenCalled();
      expect(mocks.bucketFile.download).not.toHaveBeenCalled();
    });

    it("does NOT delete file exactly at 500 MB (boundary)", async () => {
      const exactLimit = 500 * 1024 * 1024; // exactly 500 MB

      mocks.ffprobeFn.mockImplementation((_p: string, cb: any) => {
        cb(null, { format: { duration: 15.0 } });
      });

      await (validateChallengeVideo as any)({
        name: "challenges/exact500mb.mp4",
        contentType: "video/mp4",
        bucket: "test-bucket",
        size: String(exactLimit),
      });

      // Should proceed to download and ffprobe, not early-delete
      expect(mocks.bucketFile.download).toHaveBeenCalled();
    });

    it("handles undefined size as 0 (passes size check)", async () => {
      mocks.ffprobeFn.mockImplementation((_p: string, cb: any) => {
        cb(null, { format: { duration: 15.0 } });
      });

      await (validateChallengeVideo as any)({
        name: "challenges/nosize.mp4",
        contentType: "video/mp4",
        bucket: "test-bucket",
        // size is undefined
      });

      // Should proceed to download and ffprobe
      expect(mocks.bucketFile.download).toHaveBeenCalled();
    });
  });
});
