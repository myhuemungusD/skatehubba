/**
 * @fileoverview Branch coverage tests for server/services/video/ffprobe.ts
 *
 * Covers the remaining uncovered branches on lines 61-70, 74:
 * - Line 61: `den` is 0 or falsy in r_frame_rate parsing (e.g. "30/0", "30")
 * - Line 67: `format.duration` is missing/NaN → `|| 0` fallback
 * - Line 68: `videoStream.width` is falsy (0, undefined, null) → `|| 0`
 * - Line 69: `videoStream.height` is falsy → `|| 0`
 * - Line 70: `videoStream.codec_name` is falsy → `|| "unknown"`
 * - Line 74: `fileStat?.size` is falsy AND `format.size` is falsy → double fallback to 0
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
const mockStat = vi.fn();

vi.mock("node:fs/promises", () => ({
  stat: (...args: any[]) => mockStat(...args),
}));

// Import after mocking
const { probeVideo } = await import("../../services/video/ffprobe");

describe("probeVideo — uncovered branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStat.mockResolvedValue({ size: 1024000 });
  });

  // ==========================================================================
  // Line 61: den is 0 or falsy in r_frame_rate → fps stays at default 30
  // ==========================================================================

  describe("frame rate parsing edge cases (line 61)", () => {
    it("falls back to default fps=30 when r_frame_rate denominator is 0", async () => {
      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: { duration: "10", size: "500000", bit_rate: "500000" },
          streams: [
            {
              codec_type: "video",
              codec_name: "h264",
              width: 1920,
              height: 1080,
              r_frame_rate: "30/0",
            },
          ],
        }),
      });

      const result = await probeVideo("/test/zero-den.mp4");

      expect(result.fps).toBe(30);
      expect(result.isCorrupt).toBe(false);
    });

    it("falls back to default fps=30 when r_frame_rate has no denominator", async () => {
      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: { duration: "10", size: "500000", bit_rate: "500000" },
          streams: [
            {
              codec_type: "video",
              codec_name: "h264",
              width: 1920,
              height: 1080,
              r_frame_rate: "30",
            },
          ],
        }),
      });

      const result = await probeVideo("/test/no-den.mp4");

      // "30".split("/") → ["30"] → den = NaN (Number(undefined)) → falsy
      expect(result.fps).toBe(30);
    });
  });

  // ==========================================================================
  // Line 67: format.duration missing → parseFloat returns NaN → || 0
  // ==========================================================================

  describe("missing format fields (lines 67-70)", () => {
    it("returns durationMs=0 when format.duration is missing", async () => {
      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: { size: "500000", bit_rate: "500000" },
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

      const result = await probeVideo("/test/no-duration.mp4");

      expect(result.durationMs).toBe(0);
      expect(result.isCorrupt).toBe(false);
    });

    it("returns width=0 and height=0 when videoStream dimensions are missing", async () => {
      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: { duration: "10", size: "500000", bit_rate: "500000" },
          streams: [
            {
              codec_type: "video",
              codec_name: "h264",
              // width and height are missing
              r_frame_rate: "30/1",
            },
          ],
        }),
      });

      const result = await probeVideo("/test/no-dimensions.mp4");

      expect(result.width).toBe(0);
      expect(result.height).toBe(0);
      expect(result.isCorrupt).toBe(false);
    });

    it("returns codec='unknown' when videoStream.codec_name is missing", async () => {
      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: { duration: "10", size: "500000", bit_rate: "500000" },
          streams: [
            {
              codec_type: "video",
              // codec_name is missing
              width: 1920,
              height: 1080,
              r_frame_rate: "30/1",
            },
          ],
        }),
      });

      const result = await probeVideo("/test/no-codec.mp4");

      expect(result.codec).toBe("unknown");
      expect(result.isCorrupt).toBe(false);
    });
  });

  // ==========================================================================
  // Line 74: fileStat?.size is falsy AND format.size is also falsy → 0
  // ==========================================================================

  describe("fileSize fallback chain (line 74)", () => {
    it("returns fileSize=0 when both stat and format.size are missing", async () => {
      // stat returns null (file not found)
      mockStat.mockRejectedValueOnce(new Error("ENOENT"));

      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: { duration: "10", bit_rate: "500000" },
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

      const result = await probeVideo("/test/no-size.mp4");

      expect(result.fileSize).toBe(0);
    });

    it("returns fileSize=0 when stat returns object with size=0 and format.size is missing", async () => {
      mockStat.mockResolvedValueOnce({ size: 0 });

      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: { duration: "10", bit_rate: "500000" },
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

      const result = await probeVideo("/test/zero-size.mp4");

      // fileStat.size = 0 (falsy) → parseInt(format.size) → NaN (falsy) → 0
      expect(result.fileSize).toBe(0);
    });
  });

  // ==========================================================================
  // Combined edge case: all fields missing from video stream
  // ==========================================================================

  describe("all fallbacks triggered simultaneously", () => {
    it("handles video stream with all optional fields missing", async () => {
      mockStat.mockRejectedValueOnce(new Error("ENOENT"));

      execFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: {},
          streams: [
            {
              codec_type: "video",
              // no codec_name, no width, no height, no r_frame_rate
            },
          ],
        }),
      });

      const result = await probeVideo("/test/bare-minimum.mp4");

      expect(result.isCorrupt).toBe(false);
      expect(result.durationMs).toBe(0);
      expect(result.width).toBe(0);
      expect(result.height).toBe(0);
      expect(result.codec).toBe("unknown");
      expect(result.audioCodec).toBeNull();
      expect(result.fps).toBe(30);
      expect(result.bitrate).toBe(0);
      expect(result.fileSize).toBe(0);
      expect(result.hasAudio).toBe(false);
    });
  });
});
