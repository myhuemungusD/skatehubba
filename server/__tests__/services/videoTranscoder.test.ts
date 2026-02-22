/**
 * @fileoverview Unit tests for VideoTranscoder service
 * @module server/__tests__/videoTranscoder.test
 *
 * Tests all video transcoding functions:
 * - probeVideo (ffprobe metadata extraction)
 * - transcodeVideo (ffmpeg transcoding)
 * - generateThumbnail
 * - processVideoJob (full orchestration)
 * - checkFfmpegAvailable
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock environment
vi.mock("../../config/env", () => ({
  env: {
    DATABASE_URL: "mock://test",
    NODE_ENV: "test",
  },
}));

// Mock logger
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

// Track execFileAsync calls
const execFileAsyncMock = vi.fn();

// Mock child_process
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

// Mock util.promisify to return our mock
vi.mock("node:util", () => ({
  promisify: () => execFileAsyncMock,
}));

// Mock fs/promises
const mockMkdtemp = vi.fn();
const mockRm = vi.fn();
const mockStat = vi.fn();

vi.mock("node:fs/promises", () => ({
  mkdtemp: (...args: any[]) => mockMkdtemp(...args),
  rm: (...args: any[]) => mockRm(...args),
  stat: (...args: any[]) => mockStat(...args),
}));

// Mock os
vi.mock("node:os", () => ({
  tmpdir: () => "/tmp",
}));

// Mock path
vi.mock("node:path", () => ({
  join: (...parts: string[]) => parts.join("/"),
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
  },
}));

// Mock db
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();

vi.mock("../../db", () => ({
  getDb: () => ({
    update: (...args: any[]) => {
      mockUpdate(...args);
      return {
        set: (...setArgs: any[]) => {
          mockSet(...setArgs);
          return {
            where: (...whereArgs: any[]) => {
              mockWhere(...whereArgs);
              return Promise.resolve();
            },
          };
        },
      };
    },
  }),
}));

// Import after mocking
const {
  probeVideo,
  transcodeVideo,
  generateThumbnail,
  processVideoJob,
  checkFfmpegAvailable,
  transcodeMultiQuality,
  QUALITY_PRESETS,
  DEFAULT_QUALITY,
} = await import("../../services/videoTranscoder");

describe("VideoTranscoder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdtemp.mockResolvedValue("/tmp/skate-transcode-abc");
    mockRm.mockResolvedValue(undefined);
    mockStat.mockResolvedValue({ size: 1024000 });
  });

  // ===========================================================================
  // probeVideo
  // ===========================================================================

  describe("probeVideo", () => {
    it("should parse ffprobe output correctly for a valid video", async () => {
      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: { duration: "15.5", size: "2048000", bit_rate: "1000000" },
          streams: [
            {
              codec_type: "video",
              codec_name: "h264",
              width: 1920,
              height: 1080,
              r_frame_rate: "30/1",
            },
            { codec_type: "audio", codec_name: "aac" },
          ],
        }),
      });

      const result = await probeVideo("/test/video.mp4");

      expect(result.isCorrupt).toBe(false);
      expect(result.durationMs).toBe(15500);
      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
      expect(result.codec).toBe("h264");
      expect(result.audioCodec).toBe("aac");
      expect(result.fps).toBe(30);
      expect(result.hasAudio).toBe(true);
      expect(result.fileSize).toBe(1024000);
    });

    it("should handle video with no audio stream", async () => {
      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: { duration: "10", size: "500000", bit_rate: "500000" },
          streams: [
            {
              codec_type: "video",
              codec_name: "vp9",
              width: 720,
              height: 1280,
              r_frame_rate: "60/1",
            },
          ],
        }),
      });

      const result = await probeVideo("/test/silent.mp4");

      expect(result.hasAudio).toBe(false);
      expect(result.audioCodec).toBeNull();
      expect(result.codec).toBe("vp9");
      expect(result.fps).toBe(60);
    });

    it("should return corrupt result when no video stream found", async () => {
      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: { duration: "5" },
          streams: [{ codec_type: "audio", codec_name: "mp3" }],
        }),
      });

      const result = await probeVideo("/test/audio-only.mp3");

      expect(result.isCorrupt).toBe(true);
      expect(result.errors).toContain("No video stream found");
      expect(result.width).toBe(0);
      expect(result.height).toBe(0);
    });

    it("should handle ffprobe failure gracefully", async () => {
      execFileAsyncMock.mockRejectedValueOnce(new Error("ffprobe not found"));

      const result = await probeVideo("/test/bad-file.mp4");

      expect(result.isCorrupt).toBe(true);
      expect(result.errors[0]).toContain("ffprobe error:");
      expect(result.durationMs).toBe(0);
    });

    it("should handle non-Error thrown objects", async () => {
      execFileAsyncMock.mockRejectedValueOnce("string error");

      const result = await probeVideo("/test/fail.mp4");

      expect(result.isCorrupt).toBe(true);
      expect(result.errors[0]).toContain("ffprobe error: string error");
    });

    it("should handle fractional frame rate", async () => {
      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: { duration: "10" },
          streams: [
            {
              codec_type: "video",
              codec_name: "h264",
              width: 1920,
              height: 1080,
              r_frame_rate: "30000/1001",
            },
          ],
        }),
      });

      const result = await probeVideo("/test/ntsc.mp4");

      expect(result.fps).toBe(30); // 30000/1001 ≈ 29.97 → rounds to 30
    });

    it("should handle missing frame rate", async () => {
      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: { duration: "5" },
          streams: [
            {
              codec_type: "video",
              codec_name: "h264",
              width: 640,
              height: 480,
            },
          ],
        }),
      });

      const result = await probeVideo("/test/nofps.mp4");

      expect(result.fps).toBe(30); // default
    });

    it("should use format size when stat fails", async () => {
      mockStat.mockRejectedValueOnce(new Error("ENOENT"));

      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: { duration: "10", size: "999888", bit_rate: "500000" },
          streams: [
            {
              codec_type: "video",
              codec_name: "h264",
              width: 1920,
              height: 1080,
              r_frame_rate: "30/1",
            },
          ],
        }),
      });

      const result = await probeVideo("/test/video.mp4");

      expect(result.fileSize).toBe(999888);
    });

    it("should handle empty format and streams", async () => {
      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({}),
      });

      const result = await probeVideo("/test/empty.mp4");

      expect(result.isCorrupt).toBe(true);
      expect(result.errors).toContain("No video stream found");
    });
  });

  // ===========================================================================
  // transcodeVideo
  // ===========================================================================

  describe("transcodeVideo", () => {
    it("should transcode successfully with default options", async () => {
      execFileAsyncMock.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const result = await transcodeVideo("/input.mp4", "/output.mp4");

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(execFileAsyncMock).toHaveBeenCalledWith(
        "ffmpeg",
        expect.arrayContaining(["-i", "/input.mp4"]),
        expect.objectContaining({ timeout: 120000 })
      );
    });

    it("should handle transcoding with custom options", async () => {
      execFileAsyncMock.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const result = await transcodeVideo("/input.mp4", "/output.mp4", {
        maxDurationMs: 15000,
        targetBitrate: "1M",
        audioEnabled: false,
      });

      expect(result.success).toBe(true);
      expect(execFileAsyncMock).toHaveBeenCalledWith(
        "ffmpeg",
        expect.arrayContaining(["-an"]),
        expect.any(Object)
      );
    });

    it("should handle audio enabled transcoding", async () => {
      execFileAsyncMock.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const result = await transcodeVideo("/input.mp4", "/output.mp4", {
        audioEnabled: true,
      });

      expect(result.success).toBe(true);
      expect(execFileAsyncMock).toHaveBeenCalledWith(
        "ffmpeg",
        expect.arrayContaining(["-c:a", "aac"]),
        expect.any(Object)
      );
    });

    it("should return error on ffmpeg failure", async () => {
      execFileAsyncMock.mockRejectedValueOnce(new Error("Encoding failed"));

      const result = await transcodeVideo("/input.mp4", "/output.mp4");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Encoding failed");
    });

    it("should handle non-Error thrown objects in transcode", async () => {
      execFileAsyncMock.mockRejectedValueOnce("raw string error");

      const result = await transcodeVideo("/input.mp4", "/output.mp4");

      expect(result.success).toBe(false);
      expect(result.error).toBe("raw string error");
    });
  });

  // ===========================================================================
  // generateThumbnail
  // ===========================================================================

  describe("generateThumbnail", () => {
    it("should generate thumbnail successfully", async () => {
      execFileAsyncMock.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const result = await generateThumbnail("/input.mp4", "/thumb.jpg");

      expect(result.success).toBe(true);
      expect(execFileAsyncMock).toHaveBeenCalledWith(
        "ffmpeg",
        expect.arrayContaining(["-i", "/input.mp4", "-vframes", "1"]),
        expect.any(Object)
      );
    });

    it("should use custom timestamp", async () => {
      execFileAsyncMock.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const result = await generateThumbnail("/input.mp4", "/thumb.jpg", 2.5);

      expect(result.success).toBe(true);
      expect(execFileAsyncMock).toHaveBeenCalledWith(
        "ffmpeg",
        expect.arrayContaining(["-ss", "2.5"]),
        expect.any(Object)
      );
    });

    it("should handle thumbnail generation failure", async () => {
      execFileAsyncMock.mockRejectedValueOnce(new Error("Frame extraction failed"));

      const result = await generateThumbnail("/input.mp4", "/thumb.jpg");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Frame extraction failed");
    });

    it("should handle non-Error thrown objects", async () => {
      execFileAsyncMock.mockRejectedValueOnce("raw error");

      const result = await generateThumbnail("/input.mp4", "/thumb.jpg");

      expect(result.success).toBe(false);
      expect(result.error).toBe("raw error");
    });
  });

  // ===========================================================================
  // processVideoJob
  // ===========================================================================

  describe("processVideoJob", () => {
    it("should fail for corrupt video", async () => {
      // Probe returns corrupt
      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: {},
          streams: [],
        }),
      });

      const result = await processVideoJob(1, "/test/corrupt.mp4");

      expect(result.success).toBe(false);
      expect(result.error).toContain("corrupt");
    });

    it("should fail when video exceeds duration limit", async () => {
      // Probe returns valid but long video
      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: { duration: "45", size: "5000000", bit_rate: "1000000" },
          streams: [
            {
              codec_type: "video",
              codec_name: "h264",
              width: 1080,
              height: 1920,
              r_frame_rate: "30/1",
            },
          ],
        }),
      });

      const result = await processVideoJob(1, "/test/long.mp4");

      expect(result.success).toBe(false);
      expect(result.error).toContain("too long");
    });

    it("should skip transcoding for conformant h264 video", async () => {
      // Probe: valid h264, within resolution limits
      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: { duration: "10", size: "2000000", bit_rate: "1000000" },
          streams: [
            {
              codec_type: "video",
              codec_name: "h264",
              width: 720,
              height: 1280,
              r_frame_rate: "30/1",
            },
          ],
        }),
      });
      // Thumbnail
      execFileAsyncMock.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const result = await processVideoJob(2, "/test/conformant.mp4");

      expect(result.success).toBe(true);
      expect(result.outputPath).toBe("/test/conformant.mp4");
      expect(result.thumbnailPath).toBeDefined();
    });

    it("should transcode non-h264 video", async () => {
      // Probe: vp9 codec — needs transcoding
      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: { duration: "10", size: "2000000", bit_rate: "1000000" },
          streams: [
            {
              codec_type: "video",
              codec_name: "vp9",
              width: 720,
              height: 1280,
              r_frame_rate: "30/1",
            },
          ],
        }),
      });
      // Transcode succeeds
      execFileAsyncMock.mockResolvedValueOnce({ stdout: "", stderr: "" });
      // Thumbnail
      execFileAsyncMock.mockResolvedValueOnce({ stdout: "", stderr: "" });
      // Final probe after transcode
      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: { duration: "10", size: "1800000", bit_rate: "900000" },
          streams: [
            {
              codec_type: "video",
              codec_name: "h264",
              width: 720,
              height: 1280,
              r_frame_rate: "30/1",
            },
          ],
        }),
      });

      const result = await processVideoJob(3, "/test/vp9.webm");

      expect(result.success).toBe(true);
    });

    it("should handle transcoding failure", async () => {
      // Probe: needs transcode
      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: { duration: "10", size: "2000000", bit_rate: "1000000" },
          streams: [
            {
              codec_type: "video",
              codec_name: "vp9",
              width: 720,
              height: 1280,
              r_frame_rate: "30/1",
            },
          ],
        }),
      });
      // Transcode fails
      execFileAsyncMock.mockRejectedValueOnce(new Error("ffmpeg crashed"));

      const result = await processVideoJob(4, "/test/fail.webm");

      expect(result.success).toBe(false);
      expect(result.error).toBe("ffmpeg crashed");
    });

    it("should handle thumbnail failure gracefully and still succeed", async () => {
      // Probe: conformant
      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: { duration: "10", size: "2000000", bit_rate: "1000000" },
          streams: [
            {
              codec_type: "video",
              codec_name: "h264",
              width: 720,
              height: 1280,
              r_frame_rate: "30/1",
            },
          ],
        }),
      });
      // Thumbnail fails
      execFileAsyncMock.mockRejectedValueOnce(new Error("no frame"));

      const result = await processVideoJob(5, "/test/nothumb.mp4");

      expect(result.success).toBe(true);
      expect(result.thumbnailPath).toBeUndefined();
    });

    it("should clean up temp directory even on error", async () => {
      // Probe throws unexpected error
      execFileAsyncMock.mockRejectedValueOnce(new Error("unexpected"));

      await processVideoJob(6, "/test/crash.mp4");

      expect(mockRm).toHaveBeenCalledWith(expect.stringContaining("skate-transcode"), {
        recursive: true,
        force: true,
      });
    });

    it("should transcode oversized video", async () => {
      // Probe: h264 but too large resolution
      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: { duration: "10", size: "2000000", bit_rate: "1000000" },
          streams: [
            {
              codec_type: "video",
              codec_name: "h264",
              width: 3840,
              height: 2160,
              r_frame_rate: "30/1",
            },
          ],
        }),
      });
      // Transcode
      execFileAsyncMock.mockResolvedValueOnce({ stdout: "", stderr: "" });
      // Thumbnail
      execFileAsyncMock.mockResolvedValueOnce({ stdout: "", stderr: "" });
      // Final probe
      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: { duration: "10", size: "1800000", bit_rate: "900000" },
          streams: [
            {
              codec_type: "video",
              codec_name: "h264",
              width: 1080,
              height: 1920,
              r_frame_rate: "30/1",
            },
          ],
        }),
      });

      const result = await processVideoJob(7, "/test/4k.mp4");

      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // Quality presets & constants
  // ===========================================================================

  describe("QUALITY_PRESETS", () => {
    it("should define low, medium, and high presets", () => {
      expect(QUALITY_PRESETS.low).toBeDefined();
      expect(QUALITY_PRESETS.medium).toBeDefined();
      expect(QUALITY_PRESETS.high).toBeDefined();
    });

    it("should have increasing widths across tiers", () => {
      expect(QUALITY_PRESETS.low.maxWidth).toBeLessThan(QUALITY_PRESETS.medium.maxWidth);
      expect(QUALITY_PRESETS.medium.maxWidth).toBeLessThan(QUALITY_PRESETS.high.maxWidth);
    });

    it("should export medium as default quality", () => {
      expect(DEFAULT_QUALITY).toBe("medium");
    });
  });

  // ===========================================================================
  // transcodeMultiQuality
  // ===========================================================================

  describe("transcodeMultiQuality", () => {
    it("should return failure for corrupt source", async () => {
      // Probe returns corrupt
      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({ format: {}, streams: [] }),
      });

      const result = await transcodeMultiQuality("/test/corrupt.mp4", "/tmp/work");
      expect(result.success).toBe(false);
      expect(result.error).toContain("corrupt");
    });

    it("should skip transcoding when source fits within tier bounds", async () => {
      // Probe returns small video (480x360 — fits within low tier 480x854)
      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: { duration: "10", size: "500000", bit_rate: "400000" },
          streams: [
            {
              codec_type: "video",
              codec_name: "h264",
              width: 480,
              height: 360,
              r_frame_rate: "30/1",
            },
          ],
        }),
      });
      // Thumbnail generation
      execFileAsyncMock.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const result = await transcodeMultiQuality("/test/small.mp4", "/tmp/work", {
        tiers: ["low"],
      });

      expect(result.success).toBe(true);
      expect(result.outputs.low).toBeDefined();
      expect(result.outputs.low!.path).toBe("/test/small.mp4"); // Uses source directly
    });

    it("should transcode when source exceeds tier bounds", async () => {
      // Source: 1920x1080 — exceeds low (480x854) so transcode is needed
      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: { duration: "10", size: "5000000", bit_rate: "2000000" },
          streams: [
            {
              codec_type: "video",
              codec_name: "h264",
              width: 1920,
              height: 1080,
              r_frame_rate: "30/1",
            },
          ],
        }),
      });
      // Transcode for "low" tier
      execFileAsyncMock.mockResolvedValueOnce({ stdout: "", stderr: "" });
      // Probe output of transcoded file
      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: { duration: "10", size: "1000000", bit_rate: "800000" },
          streams: [
            {
              codec_type: "video",
              codec_name: "h264",
              width: 480,
              height: 270,
              r_frame_rate: "30/1",
            },
          ],
        }),
      });
      // Thumbnail generation
      execFileAsyncMock.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const result = await transcodeMultiQuality("/test/hd.mp4", "/tmp/work", {
        tiers: ["low"],
      });

      expect(result.success).toBe(true);
      expect(result.outputs.low).toBeDefined();
      expect(result.thumbnailPath).toBeDefined();
    });

    it("should handle transcode failure for a tier", async () => {
      // Source: large
      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: { duration: "10", size: "5000000", bit_rate: "2000000" },
          streams: [
            {
              codec_type: "video",
              codec_name: "h264",
              width: 1920,
              height: 1080,
              r_frame_rate: "30/1",
            },
          ],
        }),
      });
      // Transcode fails
      execFileAsyncMock.mockRejectedValueOnce(new Error("ffmpeg error"));

      const result = await transcodeMultiQuality("/test/hd.mp4", "/tmp/work", {
        tiers: ["low"],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("low");
    });

    it("should use default tiers when none specified", async () => {
      // Source fits within low and medium
      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: { duration: "5", size: "200000", bit_rate: "300000" },
          streams: [
            {
              codec_type: "video",
              codec_name: "h264",
              width: 320,
              height: 240,
              r_frame_rate: "30/1",
            },
          ],
        }),
      });
      // Thumbnail
      execFileAsyncMock.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const result = await transcodeMultiQuality("/test/tiny.mp4", "/tmp/work");

      expect(result.success).toBe(true);
      // Default tiers are ["low", "medium"] — source is smaller than both
      expect(result.outputs.low).toBeDefined();
      expect(result.outputs.medium).toBeDefined();
    });
  });

  // ===========================================================================
  // checkFfmpegAvailable
  // ===========================================================================

  describe("checkFfmpegAvailable", () => {
    it("should return true for both when available", async () => {
      execFileAsyncMock.mockResolvedValueOnce({ stdout: "ffmpeg version..." });
      execFileAsyncMock.mockResolvedValueOnce({ stdout: "ffprobe version..." });

      const result = await checkFfmpegAvailable();

      expect(result.ffmpeg).toBe(true);
      expect(result.ffprobe).toBe(true);
    });

    it("should return false when ffmpeg is not available", async () => {
      execFileAsyncMock.mockRejectedValueOnce(new Error("not found"));
      execFileAsyncMock.mockResolvedValueOnce({ stdout: "ffprobe version..." });

      const result = await checkFfmpegAvailable();

      expect(result.ffmpeg).toBe(false);
      expect(result.ffprobe).toBe(true);
    });

    it("should return false for both when neither is available", async () => {
      execFileAsyncMock.mockRejectedValueOnce(new Error("not found"));
      execFileAsyncMock.mockRejectedValueOnce(new Error("not found"));

      const result = await checkFfmpegAvailable();

      expect(result.ffmpeg).toBe(false);
      expect(result.ffprobe).toBe(false);
    });
  });
});
