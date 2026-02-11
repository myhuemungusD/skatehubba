/**
 * Tests for client/src/lib/video/thumbnailExtractor.ts
 *
 * Covers: extractThumbnail function — thumbnail extraction from video blobs
 * using browser DOM APIs (video element, canvas, URL.createObjectURL).
 *
 * Strategy: stub all DOM globals (document, URL) since vitest runs
 * in a Node environment without JSDOM.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── DOM Mocks ──────────────────────────────────────────────────────────────

interface MockVideoElement {
  muted: boolean;
  playsInline: boolean;
  preload: string;
  src: string;
  currentTime: number;
  duration: number;
  videoWidth: number;
  videoHeight: number;
  onloadedmetadata: (() => void) | null;
  onseeked: (() => void) | null;
  onerror: (() => void) | null;
  removeAttribute: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
}

interface MockCanvasContext {
  drawImage: ReturnType<typeof vi.fn>;
}

interface MockCanvasElement {
  width: number;
  height: number;
  getContext: ReturnType<typeof vi.fn>;
  toBlob: ReturnType<typeof vi.fn>;
}

let mockVideo: MockVideoElement;
let mockCanvas: MockCanvasElement;
let mockCtx: MockCanvasContext;

function createMockVideo(): MockVideoElement {
  return {
    muted: false,
    playsInline: false,
    preload: "",
    src: "",
    currentTime: 0,
    duration: 10,
    videoWidth: 1920,
    videoHeight: 1080,
    onloadedmetadata: null,
    onseeked: null,
    onerror: null,
    removeAttribute: vi.fn(),
    load: vi.fn(),
  };
}

function createMockCanvas(): MockCanvasElement {
  return {
    width: 0,
    height: 0,
    getContext: vi.fn(),
    toBlob: vi.fn(),
  };
}

function createMockCtx(): MockCanvasContext {
  return {
    drawImage: vi.fn(),
  };
}

// ── Stub document and URL globally ────────────────────────────────────────

const createObjectURLMock = vi.fn().mockReturnValue("blob:mock-url");
const revokeObjectURLMock = vi.fn();

beforeEach(() => {
  mockVideo = createMockVideo();
  mockCanvas = createMockCanvas();
  mockCtx = createMockCtx();

  mockCanvas.getContext.mockReturnValue(mockCtx);

  const createElementMock = vi.fn((tag: string) => {
    if (tag === "video") return mockVideo;
    if (tag === "canvas") return mockCanvas;
    throw new Error(`Unexpected element: ${tag}`);
  });

  vi.stubGlobal("document", {
    createElement: createElementMock,
  });

  createObjectURLMock.mockReturnValue("blob:mock-url");
  revokeObjectURLMock.mockClear();

  vi.stubGlobal("URL", {
    createObjectURL: createObjectURLMock,
    revokeObjectURL: revokeObjectURLMock,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── Import (after mock setup — vitest hoists vi.stubGlobal) ───────────────

import { extractThumbnail } from "./thumbnailExtractor";

// ── Tests ──────────────────────────────────────────────────────────────────

describe("extractThumbnail", () => {
  // ────────────────────────────────────────────────────────────────────────
  // Happy path
  // ────────────────────────────────────────────────────────────────────────

  describe("successful extraction", () => {
    it("extracts a JPEG thumbnail from a video blob", async () => {
      const videoBlob = new Blob(["fake-video-data"], { type: "video/webm" });
      const thumbnailBlob = new Blob(["jpeg-data"], { type: "image/jpeg" });

      mockCanvas.toBlob.mockImplementation((callback: (blob: Blob | null) => void) => {
        callback(thumbnailBlob);
      });

      const promise = extractThumbnail(videoBlob);

      // Simulate the video element lifecycle
      expect(mockVideo.src).toBe("blob:mock-url");
      mockVideo.onloadedmetadata!();
      mockVideo.onseeked!();

      const result = await promise;

      expect(result).toBe(thumbnailBlob);
    });

    it("creates object URL from the video blob", async () => {
      const videoBlob = new Blob(["video"], { type: "video/webm" });
      const thumbnailBlob = new Blob(["thumb"], { type: "image/jpeg" });

      mockCanvas.toBlob.mockImplementation((cb: (b: Blob | null) => void) => cb(thumbnailBlob));

      const promise = extractThumbnail(videoBlob);
      mockVideo.onloadedmetadata!();
      mockVideo.onseeked!();

      await promise;

      expect(createObjectURLMock).toHaveBeenCalledWith(videoBlob);
    });

    it("sets video properties correctly (muted, playsInline, preload)", async () => {
      const videoBlob = new Blob(["video"], { type: "video/mp4" });
      const thumbnailBlob = new Blob(["thumb"], { type: "image/jpeg" });

      mockCanvas.toBlob.mockImplementation((cb: (b: Blob | null) => void) => cb(thumbnailBlob));

      const promise = extractThumbnail(videoBlob);

      expect(mockVideo.muted).toBe(true);
      expect(mockVideo.playsInline).toBe(true);
      expect(mockVideo.preload).toBe("auto");

      mockVideo.onloadedmetadata!();
      mockVideo.onseeked!();
      await promise;
    });

    it("seeks to the specified time (capped at half duration)", async () => {
      const videoBlob = new Blob(["video"], { type: "video/webm" });
      const thumbnailBlob = new Blob(["thumb"], { type: "image/jpeg" });

      mockCanvas.toBlob.mockImplementation((cb: (b: Blob | null) => void) => cb(thumbnailBlob));
      mockVideo.duration = 10;

      const promise = extractThumbnail(videoBlob, 0.5);
      mockVideo.onloadedmetadata!();

      // min(0.5, 10 * 0.5) = min(0.5, 5) = 0.5
      expect(mockVideo.currentTime).toBe(0.5);

      mockVideo.onseeked!();
      await promise;
    });

    it("caps seek time to half the video duration for short videos", async () => {
      const videoBlob = new Blob(["video"], { type: "video/webm" });
      const thumbnailBlob = new Blob(["thumb"], { type: "image/jpeg" });

      mockCanvas.toBlob.mockImplementation((cb: (b: Blob | null) => void) => cb(thumbnailBlob));
      mockVideo.duration = 0.5;

      const promise = extractThumbnail(videoBlob, 2.0);
      mockVideo.onloadedmetadata!();

      // min(2.0, 0.5 * 0.5) = min(2.0, 0.25) = 0.25
      expect(mockVideo.currentTime).toBe(0.25);

      mockVideo.onseeked!();
      await promise;
    });

    it("renders thumbnail at 360px width preserving aspect ratio", async () => {
      const videoBlob = new Blob(["video"], { type: "video/webm" });
      const thumbnailBlob = new Blob(["thumb"], { type: "image/jpeg" });

      mockCanvas.toBlob.mockImplementation((cb: (b: Blob | null) => void) => cb(thumbnailBlob));
      mockVideo.videoWidth = 1920;
      mockVideo.videoHeight = 1080;

      const promise = extractThumbnail(videoBlob);
      mockVideo.onloadedmetadata!();
      mockVideo.onseeked!();

      await promise;

      expect(mockCanvas.width).toBe(360);
      expect(mockCanvas.height).toBe(Math.round(360 * (1080 / 1920)));
    });

    it("draws the video frame onto the canvas", async () => {
      const videoBlob = new Blob(["video"], { type: "video/webm" });
      const thumbnailBlob = new Blob(["thumb"], { type: "image/jpeg" });

      mockCanvas.toBlob.mockImplementation((cb: (b: Blob | null) => void) => cb(thumbnailBlob));

      const promise = extractThumbnail(videoBlob);
      mockVideo.onloadedmetadata!();
      mockVideo.onseeked!();
      await promise;

      expect(mockCtx.drawImage).toHaveBeenCalledWith(
        mockVideo,
        0,
        0,
        mockCanvas.width,
        mockCanvas.height
      );
    });

    it("exports as JPEG with 0.8 quality", async () => {
      const videoBlob = new Blob(["video"], { type: "video/webm" });
      const thumbnailBlob = new Blob(["thumb"], { type: "image/jpeg" });

      mockCanvas.toBlob.mockImplementation((cb: (b: Blob | null) => void) => cb(thumbnailBlob));

      const promise = extractThumbnail(videoBlob);
      mockVideo.onloadedmetadata!();
      mockVideo.onseeked!();
      await promise;

      expect(mockCanvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.8);
    });

    it("cleans up by revoking object URL", async () => {
      const videoBlob = new Blob(["video"], { type: "video/webm" });
      const thumbnailBlob = new Blob(["thumb"], { type: "image/jpeg" });

      mockCanvas.toBlob.mockImplementation((cb: (b: Blob | null) => void) => cb(thumbnailBlob));

      const promise = extractThumbnail(videoBlob);
      mockVideo.onloadedmetadata!();
      mockVideo.onseeked!();
      await promise;

      expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:mock-url");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Error handling
  // ────────────────────────────────────────────────────────────────────────

  describe("error handling", () => {
    it("returns null when video errors", async () => {
      const videoBlob = new Blob(["bad-video"], { type: "video/webm" });

      const promise = extractThumbnail(videoBlob);
      mockVideo.onerror!();

      const result = await promise;

      expect(result).toBeNull();
      expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:mock-url");
    });

    it("returns null when canvas 2d context is unavailable", async () => {
      const videoBlob = new Blob(["video"], { type: "video/webm" });

      mockCanvas.getContext.mockReturnValue(null);

      const promise = extractThumbnail(videoBlob);
      mockVideo.onloadedmetadata!();
      mockVideo.onseeked!();

      const result = await promise;

      expect(result).toBeNull();
    });

    it("returns null when canvas.toBlob produces null", async () => {
      const videoBlob = new Blob(["video"], { type: "video/webm" });

      mockCanvas.toBlob.mockImplementation((cb: (b: Blob | null) => void) => cb(null));

      const promise = extractThumbnail(videoBlob);
      mockVideo.onloadedmetadata!();
      mockVideo.onseeked!();

      const result = await promise;

      expect(result).toBeNull();
    });

    it("returns null on timeout (10 seconds)", async () => {
      vi.useFakeTimers();

      const videoBlob = new Blob(["slow-video"], { type: "video/webm" });

      const promise = extractThumbnail(videoBlob);

      // Advance past the 10 second timeout
      vi.advanceTimersByTime(10_000);

      const result = await promise;

      expect(result).toBeNull();
      expect(revokeObjectURLMock).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it("returns null when onseeked throws", async () => {
      const videoBlob = new Blob(["video"], { type: "video/webm" });

      // Make getContext throw to trigger the catch block
      mockCanvas.getContext.mockImplementation(() => {
        throw new Error("Canvas error");
      });

      const promise = extractThumbnail(videoBlob);
      mockVideo.onloadedmetadata!();
      mockVideo.onseeked!();

      const result = await promise;

      expect(result).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Default seek time
  // ────────────────────────────────────────────────────────────────────────

  describe("default seek time", () => {
    it("defaults to 0.5 seconds seek time", async () => {
      const videoBlob = new Blob(["video"], { type: "video/webm" });
      const thumbnailBlob = new Blob(["thumb"], { type: "image/jpeg" });

      mockCanvas.toBlob.mockImplementation((cb: (b: Blob | null) => void) => cb(thumbnailBlob));
      mockVideo.duration = 30;

      const promise = extractThumbnail(videoBlob);
      mockVideo.onloadedmetadata!();

      // min(0.5, 30 * 0.5) = 0.5
      expect(mockVideo.currentTime).toBe(0.5);

      mockVideo.onseeked!();
      await promise;
    });
  });
});
