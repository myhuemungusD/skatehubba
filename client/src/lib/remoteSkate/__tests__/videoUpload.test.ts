/**
 * Behavior tests for video upload validation
 *
 * Tests the validateVideo function which reads video metadata from the browser,
 * including duration detection, invalid duration handling, error/timeout paths,
 * and cleanup of temporary resources.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Firebase / logger mocks ────────────────────────────────────────────────

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

vi.mock("../../firebase", () => ({
  storage: {},
  db: {},
}));

vi.mock("../../logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function createMockFile(type: string, size: number): File {
  return { type, size, name: "test.mp4" } as File;
}

/**
 * Stub document.createElement to return a mock video element whose
 * `src` setter triggers `onloadedmetadata` on the next microtask.
 */
function stubDocumentWithDuration(duration: number) {
  vi.stubGlobal("document", {
    createElement: (tag: string) => {
      if (tag === "video") {
        const el: Record<string, unknown> = {
          preload: "",
          _src: "",
          onloadedmetadata: null as Function | null,
          onerror: null as Function | null,
          duration,
          remove: vi.fn(),
        };

        Object.defineProperty(el, "src", {
          set(val: string) {
            el._src = val;
            setTimeout(() => {
              if (typeof el.onloadedmetadata === "function") {
                el.onloadedmetadata();
              }
            }, 0);
          },
          get() {
            return el._src as string;
          },
        });

        return el;
      }
      return {};
    },
  });
}

// ── URL stubs ──────────────────────────────────────────────────────────────

const mockCreateObjectURL = vi.fn(() => "blob:mock-url");
const mockRevokeObjectURL = vi.fn();

stubDocumentWithDuration(10);
(globalThis.URL as any).createObjectURL = mockCreateObjectURL;
(globalThis.URL as any).revokeObjectURL = mockRevokeObjectURL;

const { validateVideo } = await import("../../remoteSkate/videoUpload");

// ── Tests ──────────────────────────────────────────────────────────────────

describe("Video validation — duration detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    (globalThis.URL as any).createObjectURL = mockCreateObjectURL;
    (globalThis.URL as any).revokeObjectURL = mockRevokeObjectURL;
  });

  it("rejects when video duration is Infinity", async () => {
    stubDocumentWithDuration(Infinity);

    const file = createMockFile("video/mp4", 1024 * 1024);
    const result = await validateVideo(file);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Could not determine video duration");
  });

  it("rejects when video duration is zero", async () => {
    stubDocumentWithDuration(0);

    const file = createMockFile("video/mp4", 1024 * 1024);
    const result = await validateVideo(file);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Could not determine video duration");
  });

  it("rejects when video duration is negative", async () => {
    stubDocumentWithDuration(-1);

    const file = createMockFile("video/mp4", 1024 * 1024);
    const result = await validateVideo(file);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Could not determine video duration");
  });

  it("rejects when video duration is NaN", async () => {
    stubDocumentWithDuration(NaN);

    const file = createMockFile("video/mp4", 1024 * 1024);
    const result = await validateVideo(file);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Could not determine video duration");
  });

  it("accepts a valid video and returns duration in milliseconds", async () => {
    stubDocumentWithDuration(5.5);

    const file = createMockFile("video/mp4", 1024 * 1024);
    const result = await validateVideo(file);

    expect(result.valid).toBe(true);
    expect(result.durationMs).toBe(5500);
  });

  it("accepts a video at exactly the 60-second boundary", async () => {
    stubDocumentWithDuration(60);

    const file = createMockFile("video/mp4", 1024 * 1024);
    const result = await validateVideo(file);

    expect(result.valid).toBe(true);
    expect(result.durationMs).toBe(60000);
  });

  it("cleans up object URLs after validation", async () => {
    stubDocumentWithDuration(10);

    const file = createMockFile("video/mp4", 1024 * 1024);
    await validateVideo(file);

    expect(mockRevokeObjectURL).toHaveBeenCalled();
  });

  it("rejects with metadata error when video element triggers onerror", async () => {
    vi.stubGlobal("document", {
      createElement: (tag: string) => {
        if (tag === "video") {
          const el: Record<string, unknown> = {
            preload: "",
            _src: "",
            onloadedmetadata: null as Function | null,
            onerror: null as Function | null,
            duration: 0,
            remove: vi.fn(),
          };

          Object.defineProperty(el, "src", {
            set(val: string) {
              el._src = val;
              setTimeout(() => {
                if (typeof el.onerror === "function") {
                  el.onerror();
                }
              }, 0);
            },
            get() {
              return el._src as string;
            },
          });

          return el;
        }
        return {};
      },
    });

    const file = createMockFile("video/mp4", 1024 * 1024);
    const result = await validateVideo(file);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Could not read video metadata");
  });

  it("rejects with timeout error when no metadata loads within 10 seconds", async () => {
    vi.stubGlobal("document", {
      createElement: (tag: string) => {
        if (tag === "video") {
          const el: Record<string, unknown> = {
            preload: "",
            _src: "",
            onloadedmetadata: null as Function | null,
            onerror: null as Function | null,
            duration: 0,
            remove: vi.fn(),
          };

          Object.defineProperty(el, "src", {
            set(val: string) {
              el._src = val;
              // Don't fire any event — let the timeout trigger
            },
            get() {
              return el._src as string;
            },
          });

          return el;
        }
        return {};
      },
    });

    vi.useFakeTimers();

    const file = createMockFile("video/mp4", 1024 * 1024);
    const resultPromise = validateVideo(file);

    vi.advanceTimersByTime(10_000);

    const result = await resultPromise;

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Timed out reading video duration");
  });
});
