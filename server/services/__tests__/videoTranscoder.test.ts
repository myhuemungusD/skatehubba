/**
 * Behavior tests for Video Transcoder Service
 *
 * Tests the video processing pipeline: probe detection of corrupt files,
 * transcoding failures, successful pass-through of compatible codecs,
 * and graceful handling of DB and filesystem errors.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────

const mockExecFileAsync = vi.hoisted(() => vi.fn());
const mockGetDb = vi.hoisted(() => vi.fn());
const mockMkdtemp = vi.hoisted(() => vi.fn());
const mockRm = vi.hoisted(() => vi.fn());
const mockStat = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:util", () => ({
  promisify: () => mockExecFileAsync,
}));

vi.mock("node:fs/promises", () => ({
  mkdtemp: mockMkdtemp,
  rm: mockRm,
  stat: mockStat,
}));

vi.mock("node:os", () => ({
  tmpdir: () => "/tmp",
}));

vi.mock("node:path", () => ({
  join: (...parts: string[]) => parts.join("/"),
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@shared/schema", () => ({
  trickClips: {
    id: { name: "id" },
    status: { name: "status" },
    videoDurationMs: { name: "videoDurationMs" },
    fileSizeBytes: { name: "fileSizeBytes" },
    updatedAt: { name: "updatedAt" },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ _op: "eq", col, val }),
}));

import { processVideoJob } from "../videoTranscoder";
import logger from "../../logger";

// ── Tests ────────────────────────────────────────────────────────────────

describe("Video Transcoder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdtemp.mockResolvedValue("/tmp/skate-transcode-abc");
    mockRm.mockResolvedValue(undefined);
    mockStat.mockResolvedValue({ size: 5000000 });
  });

  function createMockDb(options?: { updateThrows?: boolean }) {
    const mockUpdateWhere = vi.fn().mockResolvedValue([{ id: 1 }]);
    const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
    const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

    if (options?.updateThrows) {
      mockUpdate.mockImplementation(() => {
        throw new Error("DB connection lost");
      });
    }

    return { update: mockUpdate, _mockUpdateWhere: mockUpdateWhere };
  }

  function mockSuccessfulProbe() {
    mockExecFileAsync.mockResolvedValueOnce({
      stdout: JSON.stringify({
        format: { duration: "10.5", size: "5000000", bit_rate: "2000000" },
        streams: [
          {
            codec_type: "video",
            codec_name: "h264",
            width: 1080,
            height: 1920,
            r_frame_rate: "30/1",
          },
          { codec_type: "audio", codec_name: "aac" },
        ],
      }),
    });
  }

  describe("corrupt file detection", () => {
    it("marks a video as failed when ffprobe detects corruption", async () => {
      const mockDb = createMockDb();
      mockGetDb.mockReturnValue(mockDb);

      mockExecFileAsync.mockRejectedValueOnce(new Error("Unexpected ffprobe crash"));

      const result = await processVideoJob(1, "/tmp/video.webm");

      expect(result.success).toBe(false);
    });

    it("marks a video as corrupt when no video stream is found", async () => {
      mockExecFileAsync.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: {},
          streams: [],
        }),
      });

      const mockUpdate = vi.fn().mockImplementation(() => {
        throw new Error("DB update status failed");
      });
      mockGetDb.mockReturnValue({ update: mockUpdate });

      const result = await processVideoJob(1, "/tmp/corrupt.webm");

      expect(result.success).toBe(false);
      expect(result.probe?.isCorrupt).toBe(true);
      expect(logger.error).toHaveBeenCalledWith(
        "[Transcoder] Failed to update clip status",
        expect.objectContaining({ clipId: 1, status: "failed" })
      );
    });
  });

  describe("transcoding", () => {
    it("skips transcoding for H.264 videos and returns the original path", async () => {
      mockSuccessfulProbe();
      mockExecFileAsync.mockResolvedValueOnce({ stdout: "" }); // thumbnail generation

      const mockDb = createMockDb();
      mockGetDb.mockReturnValue(mockDb);

      const result = await processVideoJob(1, "/tmp/video.webm");

      expect(result.success).toBe(true);
      expect(result.outputPath).toBe("/tmp/video.webm");
    });

    it("returns failure when ffmpeg transcoding crashes", async () => {
      // VP9 codec triggers transcoding
      mockExecFileAsync.mockResolvedValueOnce({
        stdout: JSON.stringify({
          format: { duration: "10.5", size: "5000000", bit_rate: "2000000" },
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

      mockExecFileAsync.mockRejectedValueOnce(new Error("ffmpeg crashed"));

      const mockDb = createMockDb();
      mockGetDb.mockReturnValue(mockDb);

      const result = await processVideoJob(1, "/tmp/video.webm");

      expect(result.success).toBe(false);
      expect(result.error).toBe("ffmpeg crashed");
    });
  });

  describe("DB error resilience", () => {
    it("continues processing when clip metadata DB write fails", async () => {
      mockSuccessfulProbe();
      mockExecFileAsync.mockResolvedValueOnce({ stdout: "" }); // thumbnail

      let updateCallCount = 0;
      const mockUpdateWhere = vi.fn().mockResolvedValue([{ id: 1 }]);
      const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
      const mockUpdate = vi.fn().mockImplementation(() => {
        updateCallCount++;
        if (updateCallCount === 1) {
          throw new Error("Metadata DB write failed");
        }
        return { set: mockUpdateSet };
      });

      mockGetDb.mockReturnValue({ update: mockUpdate });

      await processVideoJob(1, "/tmp/video.webm");

      expect(logger.error).toHaveBeenCalledWith(
        "[Transcoder] Failed to update clip metadata",
        expect.objectContaining({ clipId: 1 })
      );
    });
  });

  describe("temp directory cleanup", () => {
    it("succeeds even when temp directory cleanup fails", async () => {
      mockSuccessfulProbe();
      mockExecFileAsync.mockResolvedValueOnce({ stdout: "" }); // thumbnail

      const mockDb = createMockDb();
      mockGetDb.mockReturnValue(mockDb);

      mockRm.mockRejectedValueOnce(new Error("ENOENT: temp dir already gone"));

      const result = await processVideoJob(1, "/tmp/video.webm");

      expect(result.success).toBe(true);
      expect(mockRm).toHaveBeenCalled();
    });
  });
});
