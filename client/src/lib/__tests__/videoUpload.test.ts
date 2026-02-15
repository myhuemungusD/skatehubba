/**
 * @fileoverview Tests for videoUpload module
 *
 * Tests:
 * - validateFileType
 * - validateFileSize
 * - validateVideo (full pipeline)
 * - getExtension
 * - uploadVideo (resumable upload flow)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock firebase modules
vi.mock("firebase/storage", () => ({
  ref: vi.fn(),
  uploadBytesResumable: vi.fn(),
  getDownloadURL: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  setDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  serverTimestamp: vi.fn(() => ({ _serverTimestamp: true })),
}));

vi.mock("../firebase", () => ({
  storage: {},
  db: {},
}));

vi.mock("../logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
  },
}));

// Mock DOM APIs for video duration reading
const mockCreateObjectURL = vi.fn(() => "blob:mock-url");
const mockRevokeObjectURL = vi.fn();

// Setup DOM mocks - preserve URL constructor while adding static methods

vi.stubGlobal("document", {
  createElement: (tag: string) => {
    if (tag === "video") {
      const el: any = {
        preload: "",
        src: "",
        onloadedmetadata: null,
        onerror: null,
        duration: 10,
        remove: vi.fn(),
      };
      // Trigger loadedmetadata on next tick when src is set
      Object.defineProperty(el, "src", {
        set(val: string) {
          el._src = val;
          setTimeout(() => {
            if (el.onloadedmetadata) el.onloadedmetadata();
          }, 0);
        },
        get() {
          return el._src;
        },
      });
      return el;
    }
    return {};
  },
});

// Attach static methods to the real URL constructor
(globalThis.URL as any).createObjectURL = mockCreateObjectURL;
(globalThis.URL as any).revokeObjectURL = mockRevokeObjectURL;

const { validateVideo, uploadVideo } = await import("../remoteSkate/videoUpload");

describe("Video Upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validateVideo", () => {
    function createMockFile(type: string, size: number, name: string = "test.mp4"): File {
      return {
        type,
        size,
        name,
      } as File;
    }

    it("should accept a valid MP4 file", async () => {
      const file = createMockFile("video/mp4", 1024 * 1024);
      const result = await validateVideo(file);
      expect(result.valid).toBe(true);
      expect(result.durationMs).toBe(10000);
    });

    it("should accept a valid WebM file", async () => {
      const file = createMockFile("video/webm", 1024 * 1024);
      const result = await validateVideo(file);
      expect(result.valid).toBe(true);
    });

    it("should accept a valid MOV file", async () => {
      const file = createMockFile("video/quicktime", 1024 * 1024);
      const result = await validateVideo(file);
      expect(result.valid).toBe(true);
    });

    it("should reject unsupported file type", async () => {
      const file = createMockFile("video/avi", 1024);
      const result = await validateVideo(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Unsupported file type");
    });

    it("should reject unknown file type", async () => {
      const file = createMockFile("", 1024);
      const result = await validateVideo(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Unsupported file type: unknown");
    });

    it("should reject file exceeding 100MB", async () => {
      const file = createMockFile("video/mp4", 101 * 1024 * 1024);
      const result = await validateVideo(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("File too large");
    });

    it("should reject empty file", async () => {
      const file = createMockFile("video/mp4", 0);
      const result = await validateVideo(file);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("File is empty.");
    });

    it("should reject video exceeding 60 seconds", async () => {
      // Override createElement to return a video with long duration
      vi.stubGlobal("document", {
        createElement: () => {
          const el: any = {
            preload: "",
            src: "",
            onloadedmetadata: null,
            onerror: null,
            duration: 65,
            remove: vi.fn(),
          };
          Object.defineProperty(el, "src", {
            set(val: string) {
              el._src = val;
              setTimeout(() => {
                if (el.onloadedmetadata) el.onloadedmetadata();
              }, 0);
            },
            get() {
              return el._src;
            },
          });
          return el;
        },
      });

      const file = createMockFile("video/mp4", 1024 * 1024);
      const result = await validateVideo(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Video too long");
    });

    it("should reject video when duration cannot be determined", async () => {
      vi.stubGlobal("document", {
        createElement: () => {
          const el: any = {
            preload: "",
            src: "",
            onloadedmetadata: null,
            onerror: null,
            duration: Infinity,
            remove: vi.fn(),
          };
          Object.defineProperty(el, "src", {
            set(val: string) {
              el._src = val;
              setTimeout(() => {
                if (el.onloadedmetadata) el.onloadedmetadata();
              }, 0);
            },
            get() {
              return el._src;
            },
          });
          return el;
        },
      });

      const file = createMockFile("video/mp4", 1024 * 1024);
      const result = await validateVideo(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Could not determine video duration");
    });

    it("should reject video when duration is zero", async () => {
      vi.stubGlobal("document", {
        createElement: () => {
          const el: any = {
            preload: "",
            src: "",
            onloadedmetadata: null,
            onerror: null,
            duration: 0,
            remove: vi.fn(),
          };
          Object.defineProperty(el, "src", {
            set(val: string) {
              el._src = val;
              setTimeout(() => {
                if (el.onloadedmetadata) el.onloadedmetadata();
              }, 0);
            },
            get() {
              return el._src;
            },
          });
          return el;
        },
      });

      const file = createMockFile("video/mp4", 1024 * 1024);
      const result = await validateVideo(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Could not determine video duration");
    });

    it("should reject video when duration is negative", async () => {
      vi.stubGlobal("document", {
        createElement: () => {
          const el: any = {
            preload: "",
            src: "",
            onloadedmetadata: null,
            onerror: null,
            duration: -5,
            remove: vi.fn(),
          };
          Object.defineProperty(el, "src", {
            set(val: string) {
              el._src = val;
              setTimeout(() => {
                if (el.onloadedmetadata) el.onloadedmetadata();
              }, 0);
            },
            get() {
              return el._src;
            },
          });
          return el;
        },
      });

      const file = createMockFile("video/mp4", 1024 * 1024);
      const result = await validateVideo(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Could not determine video duration");
    });

    it("should reject video on error event", async () => {
      vi.stubGlobal("document", {
        createElement: () => {
          const el: any = {
            preload: "",
            src: "",
            onloadedmetadata: null,
            onerror: null,
            duration: 0,
            remove: vi.fn(),
          };
          Object.defineProperty(el, "src", {
            set(val: string) {
              el._src = val;
              setTimeout(() => {
                if (el.onerror) el.onerror();
              }, 0);
            },
            get() {
              return el._src;
            },
          });
          return el;
        },
      });

      const file = createMockFile("video/mp4", 1024 * 1024);
      const result = await validateVideo(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Could not read video metadata");
    });
  });

  describe("uploadVideo", () => {
    it("should create upload task with correct parameters", async () => {
      const { ref, uploadBytesResumable } = await import("firebase/storage");
      const { doc, setDoc } = await import("firebase/firestore");
      const mockUploadTask = {
        on: vi.fn(),
      };
      (uploadBytesResumable as any).mockReturnValue(mockUploadTask);
      (ref as any).mockReturnValue({});
      (doc as any).mockReturnValue({});

      const file = { type: "video/mp4", size: 1024 } as File;
      const params = {
        file,
        uid: "user-1",
        gameId: "game-1",
        roundId: "round-1",
        videoId: "video-1",
        role: "set" as const,
      };

      const task = uploadVideo(params, 10000);

      expect(task).toBeDefined();
      expect(setDoc).toHaveBeenCalled();
      expect(uploadBytesResumable).toHaveBeenCalled();
      expect(mockUploadTask.on).toHaveBeenCalledWith(
        "state_changed",
        expect.any(Function),
        expect.any(Function),
        expect.any(Function)
      );
    });

    it("should call onProgress callback", async () => {
      const { ref, uploadBytesResumable } = await import("firebase/storage");
      const { doc } = await import("firebase/firestore");
      (doc as any).mockReturnValue({});
      (ref as any).mockReturnValue({});

      let progressCb: any;
      (uploadBytesResumable as any).mockReturnValue({
        on: vi.fn((_event: string, onProgress: any) => {
          progressCb = onProgress;
        }),
      });

      const onProgress = vi.fn();
      const file = { type: "video/mp4", size: 1024 } as File;
      uploadVideo(
        {
          file,
          uid: "u1",
          gameId: "g1",
          roundId: "r1",
          videoId: "v1",
          role: "set",
        },
        10000,
        { onProgress }
      );

      progressCb({ bytesTransferred: 512, totalBytes: 1024 });
      expect(onProgress).toHaveBeenCalledWith(50);
    });

    it("should handle upload error", async () => {
      const { ref, uploadBytesResumable } = await import("firebase/storage");
      const { doc, updateDoc } = await import("firebase/firestore");
      (doc as any).mockReturnValue({});
      (ref as any).mockReturnValue({});
      (updateDoc as any).mockResolvedValue(undefined);

      let errorCb: any;
      (uploadBytesResumable as any).mockReturnValue({
        on: vi.fn((_event: string, _progress: any, onError: any) => {
          errorCb = onError;
        }),
      });

      const onError = vi.fn();
      const file = { type: "video/mp4", size: 1024 } as File;
      uploadVideo(
        {
          file,
          uid: "u1",
          gameId: "g1",
          roundId: "r1",
          videoId: "v1",
          role: "set",
        },
        10000,
        { onError }
      );

      await errorCb({ code: "storage/canceled", message: "Upload canceled" });
      expect(onError).toHaveBeenCalled();
      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: "failed" })
      );
    });

    it("should handle successful upload completion", async () => {
      const { ref, uploadBytesResumable, getDownloadURL } = await import("firebase/storage");
      const { doc, updateDoc } = await import("firebase/firestore");
      (doc as any).mockReturnValue({});
      (ref as any).mockReturnValue({});
      (getDownloadURL as any).mockResolvedValue("https://download.example.com/video.mp4");
      (updateDoc as any).mockResolvedValue(undefined);

      let successCb: any;
      (uploadBytesResumable as any).mockReturnValue({
        on: vi.fn((_event: string, _progress: any, _error: any, onSuccess: any) => {
          successCb = onSuccess;
        }),
      });

      const onComplete = vi.fn();
      const file = { type: "video/mp4", size: 1024 } as File;
      uploadVideo(
        {
          file,
          uid: "u1",
          gameId: "g1",
          roundId: "r1",
          videoId: "v1",
          role: "reply",
        },
        10000,
        { onComplete }
      );

      await successCb();
      expect(onComplete).toHaveBeenCalledWith("https://download.example.com/video.mp4");
    });

    it("should handle post-upload processing failure", async () => {
      const { ref, uploadBytesResumable, getDownloadURL } = await import("firebase/storage");
      const { doc, updateDoc } = await import("firebase/firestore");
      (doc as any).mockReturnValue({});
      (ref as any).mockReturnValue({});
      (getDownloadURL as any).mockRejectedValue(new Error("URL fetch failed"));
      (updateDoc as any).mockResolvedValue(undefined);

      let successCb: any;
      (uploadBytesResumable as any).mockReturnValue({
        on: vi.fn((_event: string, _progress: any, _error: any, onSuccess: any) => {
          successCb = onSuccess;
        }),
      });

      const onError = vi.fn();
      const file = { type: "video/mp4", size: 1024 } as File;
      uploadVideo(
        {
          file,
          uid: "u1",
          gameId: "g1",
          roundId: "r1",
          videoId: "v1",
          role: "set",
        },
        10000,
        { onError }
      );

      await successCb();
      expect(onError).toHaveBeenCalled();
    });

    it("should handle setDoc failing when creating video doc (line 224)", async () => {
      const { ref, uploadBytesResumable } = await import("firebase/storage");
      const { doc, setDoc } = await import("firebase/firestore");
      const { logger } = await import("../logger");
      (doc as any).mockReturnValue({});
      (ref as any).mockReturnValue({});
      (setDoc as any).mockRejectedValue(new Error("Firestore write failed"));

      const mockUploadTask = { on: vi.fn() };
      (uploadBytesResumable as any).mockReturnValue(mockUploadTask);

      const file = { type: "video/mp4", size: 1024 } as File;
      uploadVideo(
        { file, uid: "u1", gameId: "g1", roundId: "r1", videoId: "v1", role: "set" },
        10000
      );

      // Wait for the rejected setDoc promise to settle
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(logger.error).toHaveBeenCalledWith(
        "[VideoUpload] Failed to create video doc",
        expect.any(Error)
      );
    });

    it("should handle updateDoc failing in error handler (line 264)", async () => {
      const { ref, uploadBytesResumable } = await import("firebase/storage");
      const { doc, updateDoc } = await import("firebase/firestore");
      const { logger } = await import("../logger");
      (doc as any).mockReturnValue({});
      (ref as any).mockReturnValue({});
      (updateDoc as any).mockRejectedValue(new Error("Update doc failed"));

      let errorCb: any;
      (uploadBytesResumable as any).mockReturnValue({
        on: vi.fn((_event: string, _progress: any, onError: any) => {
          errorCb = onError;
        }),
      });

      const onError = vi.fn();
      const file = { type: "video/mp4", size: 1024 } as File;
      uploadVideo(
        { file, uid: "u1", gameId: "g1", roundId: "r1", videoId: "v1", role: "set" },
        10000,
        { onError }
      );

      // Trigger upload error, which tries updateDoc (which fails)
      await errorCb({ code: "storage/canceled", message: "Upload canceled" });

      expect(logger.error).toHaveBeenCalledWith(
        "[VideoUpload] Failed to update video doc on error",
        expect.any(Error)
      );
      expect(onError).toHaveBeenCalled();
    });

    it("should handle updateDoc failing in post-upload success handler (line 297)", async () => {
      const { ref, uploadBytesResumable, getDownloadURL } = await import("firebase/storage");
      const { doc, updateDoc } = await import("firebase/firestore");
      const { logger } = await import("../logger");
      (doc as any).mockReturnValue({});
      (ref as any).mockReturnValue({});
      (getDownloadURL as any).mockRejectedValue(new Error("getDownloadURL failed"));
      // Make the first updateDoc (for status="failed") also fail
      (updateDoc as any).mockRejectedValue(new Error("Failed to update video doc"));

      let successCb: any;
      (uploadBytesResumable as any).mockReturnValue({
        on: vi.fn((_event: string, _progress: any, _error: any, onSuccess: any) => {
          successCb = onSuccess;
        }),
      });

      const onError = vi.fn();
      const file = { type: "video/mp4", size: 1024 } as File;
      uploadVideo(
        { file, uid: "u1", gameId: "g1", roundId: "r1", videoId: "v1", role: "set" },
        10000,
        { onError }
      );

      await successCb();

      expect(logger.error).toHaveBeenCalledWith(
        "[VideoUpload] Failed to update video doc after post-upload error",
        expect.any(Error)
      );
      expect(onError).toHaveBeenCalled();
    });

    it("should use 'mov' extension for video/quicktime mime type (line 179)", async () => {
      const { ref, uploadBytesResumable } = await import("firebase/storage");
      const { doc } = await import("firebase/firestore");
      (doc as any).mockReturnValue({});
      (ref as any).mockReturnValue({});

      const mockUploadTask = { on: vi.fn() };
      (uploadBytesResumable as any).mockReturnValue(mockUploadTask);

      const file = { type: "video/quicktime", size: 1024 } as File;
      uploadVideo(
        { file, uid: "u1", gameId: "g1", roundId: "r1", videoId: "v1", role: "set" },
        10000
      );

      expect(ref).toHaveBeenCalledWith(expect.anything(), "videos/u1/g1/r1/v1.mov");
    });

    it("should use 'webm' extension for video/webm mime type (line 181)", async () => {
      const { ref, uploadBytesResumable } = await import("firebase/storage");
      const { doc } = await import("firebase/firestore");
      (doc as any).mockReturnValue({});
      (ref as any).mockReturnValue({});

      const mockUploadTask = { on: vi.fn() };
      (uploadBytesResumable as any).mockReturnValue(mockUploadTask);

      const file = { type: "video/webm", size: 1024 } as File;
      uploadVideo(
        { file, uid: "u1", gameId: "g1", roundId: "r1", videoId: "v1", role: "set" },
        10000
      );

      expect(ref).toHaveBeenCalledWith(expect.anything(), "videos/u1/g1/r1/v1.webm");
    });

    it("should use 'mp4' extension for video/mp4 mime type", async () => {
      const { ref, uploadBytesResumable } = await import("firebase/storage");
      const { doc } = await import("firebase/firestore");
      (doc as any).mockReturnValue({});
      (ref as any).mockReturnValue({});

      const mockUploadTask = { on: vi.fn() };
      (uploadBytesResumable as any).mockReturnValue(mockUploadTask);

      const file = { type: "video/mp4", size: 1024 } as File;
      uploadVideo(
        { file, uid: "u1", gameId: "g1", roundId: "r1", videoId: "v1", role: "set" },
        10000
      );

      expect(ref).toHaveBeenCalledWith(expect.anything(), "videos/u1/g1/r1/v1.mp4");
    });

    it("should use default extension 'mp4' for unknown mime type (line 183)", async () => {
      const { ref, uploadBytesResumable } = await import("firebase/storage");
      const { doc } = await import("firebase/firestore");
      (doc as any).mockReturnValue({});
      (ref as any).mockReturnValue({});

      const mockUploadTask = { on: vi.fn() };
      (uploadBytesResumable as any).mockReturnValue(mockUploadTask);

      const file = { type: "video/x-unknown", size: 1024 } as File;
      uploadVideo(
        { file, uid: "u1", gameId: "g1", roundId: "r1", videoId: "v1", role: "set" },
        10000
      );

      // The storage path should end with .mp4 (default extension)
      expect(ref).toHaveBeenCalledWith(expect.anything(), "videos/u1/g1/r1/v1.mp4");
    });

    it("should handle non-Error thrown in post-upload (line 300-301)", async () => {
      const { ref, uploadBytesResumable, getDownloadURL } = await import("firebase/storage");
      const { doc, updateDoc } = await import("firebase/firestore");
      (doc as any).mockReturnValue({});
      (ref as any).mockReturnValue({});
      (getDownloadURL as any).mockRejectedValue("string-error"); // non-Error throw
      (updateDoc as any).mockResolvedValue(undefined);

      let successCb: any;
      (uploadBytesResumable as any).mockReturnValue({
        on: vi.fn((_event: string, _progress: any, _error: any, onSuccess: any) => {
          successCb = onSuccess;
        }),
      });

      const onError = vi.fn();
      const file = { type: "video/mp4", size: 1024 } as File;
      uploadVideo(
        { file, uid: "u1", gameId: "g1", roundId: "r1", videoId: "v1", role: "set" },
        10000,
        { onError }
      );

      await successCb();

      // When non-Error is thrown, errorMessage should be "Post-upload processing failed"
      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: "failed",
          errorCode: "post_upload_error",
          errorMessage: "Post-upload processing failed",
        })
      );
      // onError should receive a new Error wrapping the non-Error throw
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it("should handle video duration timeout in readVideoDuration", async () => {
      // Override createElement to simulate a timeout (no onloadedmetadata fires)
      vi.stubGlobal("document", {
        createElement: () => {
          const el: any = {
            preload: "",
            src: "",
            onloadedmetadata: null,
            onerror: null,
            duration: 0,
            remove: vi.fn(),
          };
          // Don't fire any event - simulate timeout
          Object.defineProperty(el, "src", {
            set(val: string) {
              el._src = val;
              // Don't fire onloadedmetadata or onerror - let the timeout trigger
            },
            get() {
              return el._src;
            },
          });
          return el;
        },
      });

      // Use fake timers to fast-forward past the 10s timeout
      vi.useFakeTimers();
      const file = { type: "video/mp4", size: 1024 * 1024 } as File;
      const resultPromise = validateVideo(file);

      // Fast-forward 10 seconds
      vi.advanceTimersByTime(10_000);

      const result = await resultPromise;
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Timed out reading video duration");

      vi.useRealTimers();
    });
  });
});
