/**
 * Coverage tests for client/src/lib/remoteSkate/videoUpload.ts
 *
 * Targets the readVideoDuration function (lines 96-131), specifically:
 *   - Lines 118-128: The second onloadedmetadata handler (with clearTimeout)
 *     - line 123: if (!isFinite(video.duration) || video.duration <= 0) -> reject
 *     - line 127: resolve(durationMs) with a valid duration
 *
 * readVideoDuration is not exported, so we exercise it through the exported
 * validateVideo function. Since there is no real DOM in vitest/node, we mock
 * document.createElement and URL.createObjectURL/revokeObjectURL.
 *
 * NOTE: The source assigns video.onloadedmetadata TWICE (lines 96 and 118).
 * The second assignment (line 118) is the one that takes effect at runtime,
 * because it overwrites the first before video.src is set (line 130).
 * This test targets lines 118-128 (the second handler that includes clearTimeout).
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
 *
 * The mock element has a mutable `duration` that must be set BEFORE the
 * handler fires so the code under test reads the intended value.
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
            // Fire onloadedmetadata asynchronously, just like a real browser
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

// ── Import module under test AFTER mocks ───────────────────────────────────

// Set up a default document stub so the module can import cleanly
stubDocumentWithDuration(10);
(globalThis.URL as any).createObjectURL = mockCreateObjectURL;
(globalThis.URL as any).revokeObjectURL = mockRevokeObjectURL;

const { validateVideo } = await import("../../remoteSkate/videoUpload");

// ── Tests ──────────────────────────────────────────────────────────────────

describe("readVideoDuration — coverage for lines 118-128", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    // Re-attach URL stubs for subsequent tests
    (globalThis.URL as any).createObjectURL = mockCreateObjectURL;
    (globalThis.URL as any).revokeObjectURL = mockRevokeObjectURL;
  });

  // ──────────────────────────────────────────────────────────────────────
  // Lines 123-126: reject path — duration is Infinity
  // ──────────────────────────────────────────────────────────────────────

  it("rejects when video.duration is Infinity (line 123 — !isFinite)", async () => {
    stubDocumentWithDuration(Infinity);

    const file = createMockFile("video/mp4", 1024 * 1024);
    const result = await validateVideo(file);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Could not determine video duration");
  });

  // ──────────────────────────────────────────────────────────────────────
  // Lines 123-126: reject path — duration is 0
  // ──────────────────────────────────────────────────────────────────────

  it("rejects when video.duration is 0 (line 123 — <= 0)", async () => {
    stubDocumentWithDuration(0);

    const file = createMockFile("video/mp4", 1024 * 1024);
    const result = await validateVideo(file);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Could not determine video duration");
  });

  // ──────────────────────────────────────────────────────────────────────
  // Lines 123-126: reject path — duration is negative
  // ──────────────────────────────────────────────────────────────────────

  it("rejects when video.duration is negative (line 123 — <= 0)", async () => {
    stubDocumentWithDuration(-1);

    const file = createMockFile("video/mp4", 1024 * 1024);
    const result = await validateVideo(file);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Could not determine video duration");
  });

  // ──────────────────────────────────────────────────────────────────────
  // Lines 123-126: reject path — duration is NaN
  // ──────────────────────────────────────────────────────────────────────

  it("rejects when video.duration is NaN (line 123 — !isFinite)", async () => {
    stubDocumentWithDuration(NaN);

    const file = createMockFile("video/mp4", 1024 * 1024);
    const result = await validateVideo(file);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Could not determine video duration");
  });

  // ──────────────────────────────────────────────────────────────────────
  // Line 127: resolve path — valid duration (5.5s -> 5500ms)
  // ──────────────────────────────────────────────────────────────────────

  it("resolves with durationMs when video.duration is a valid positive number (line 127)", async () => {
    stubDocumentWithDuration(5.5);

    const file = createMockFile("video/mp4", 1024 * 1024);
    const result = await validateVideo(file);

    expect(result.valid).toBe(true);
    expect(result.durationMs).toBe(5500);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Line 127: resolve path — valid duration right at 60s boundary
  // ──────────────────────────────────────────────────────────────────────

  it("resolves with durationMs=60000 for exactly 60s video (boundary)", async () => {
    stubDocumentWithDuration(60);

    const file = createMockFile("video/mp4", 1024 * 1024);
    const result = await validateVideo(file);

    // 60s = 60000ms, which is exactly MAX_DURATION_MS, so valid
    expect(result.valid).toBe(true);
    expect(result.durationMs).toBe(60000);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Verify cleanup is called (URL.revokeObjectURL and video.remove)
  // ──────────────────────────────────────────────────────────────────────

  it("calls URL.revokeObjectURL and video.remove during cleanup", async () => {
    stubDocumentWithDuration(10);

    const file = createMockFile("video/mp4", 1024 * 1024);
    await validateVideo(file);

    expect(mockRevokeObjectURL).toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────
  // onerror path — video triggers error event
  // ──────────────────────────────────────────────────────────────────────

  it("rejects with metadata error when onerror fires", async () => {
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
              // Fire onerror instead of onloadedmetadata
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

  // ──────────────────────────────────────────────────────────────────────
  // timeout path — neither event fires within 10s
  // ──────────────────────────────────────────────────────────────────────

  it("rejects with timeout error when neither event fires within 10s", async () => {
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

    // Fast-forward past the 10s timeout
    vi.advanceTimersByTime(10_000);

    const result = await resultPromise;

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Timed out reading video duration");
  });
});
