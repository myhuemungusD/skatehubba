import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ============================================================================
// Mock state (hoisted)
// ============================================================================

const mockGetVideoUrl = vi.fn();

vi.mock("@/lib/firebase.config", () => ({
  functions: {},
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn(() => mockGetVideoUrl),
}));

// Import AFTER mocks
import { useVideoUrl, clearUrlCache, getUrlCacheSize } from "./useVideoUrl";

// ============================================================================
// Helpers
// ============================================================================

function signedUrlResponse(url: string, expiresInMs: number = 60 * 60 * 1000) {
  return {
    data: {
      signedUrl: url,
      expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("useVideoUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearUrlCache();
    mockGetVideoUrl.mockReset();
  });

  afterEach(() => {
    clearUrlCache();
  });

  // ---------- Fallback behaviour (no storagePath) ----------

  describe("fallback to clipUrl", () => {
    it("returns fallbackClipUrl immediately when storagePath is null", () => {
      const { result } = renderHook(() =>
        useVideoUrl(null, "game-1", "https://legacy.url/clip.mp4")
      );

      expect(result.current.url).toBe("https://legacy.url/clip.mp4");
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(mockGetVideoUrl).not.toHaveBeenCalled();
    });

    it("returns fallbackClipUrl immediately when storagePath is undefined", () => {
      const { result } = renderHook(() =>
        useVideoUrl(undefined, "game-1", "https://legacy.url/clip.mp4")
      );

      expect(result.current.url).toBe("https://legacy.url/clip.mp4");
      expect(result.current.isLoading).toBe(false);
      expect(mockGetVideoUrl).not.toHaveBeenCalled();
    });

    it("returns null when storagePath is null and no fallback given", () => {
      const { result } = renderHook(() => useVideoUrl(null, "game-1"));

      expect(result.current.url).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    it("returns fallbackClipUrl when gameId is empty", () => {
      const { result } = renderHook(() =>
        useVideoUrl("videos/u/g/round_1/f.mp4", "", "https://fallback.url")
      );

      expect(result.current.url).toBe("https://fallback.url");
      expect(mockGetVideoUrl).not.toHaveBeenCalled();
    });
  });

  // ---------- Signed URL fetching ----------

  describe("signed URL resolution", () => {
    it("fetches signed URL and returns it", async () => {
      mockGetVideoUrl.mockResolvedValue(
        signedUrlResponse("https://signed.url/video.mp4")
      );

      const { result } = renderHook(() =>
        useVideoUrl("videos/uid/gid/round_1/abc.mp4", "game-1")
      );

      // Initially null while loading
      expect(result.current.url).toBeNull();

      await waitFor(() => {
        expect(result.current.url).toBe("https://signed.url/video.mp4");
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(mockGetVideoUrl).toHaveBeenCalledWith({
        gameId: "game-1",
        storagePath: "videos/uid/gid/round_1/abc.mp4",
      });
    });

    it("caches the URL and serves from cache on re-render", async () => {
      mockGetVideoUrl.mockResolvedValue(
        signedUrlResponse("https://signed.url/cached.mp4")
      );

      const { result, rerender } = renderHook(() =>
        useVideoUrl("videos/uid/gid/round_1/abc.mp4", "game-1")
      );

      await waitFor(() => {
        expect(result.current.url).toBe("https://signed.url/cached.mp4");
      });

      expect(getUrlCacheSize()).toBe(1);

      // Clear mock to verify no new call
      mockGetVideoUrl.mockClear();

      // Re-render — should serve from cache
      rerender();

      expect(result.current.url).toBe("https://signed.url/cached.mp4");
      expect(mockGetVideoUrl).not.toHaveBeenCalled();
    });
  });

  // ---------- Error handling ----------

  describe("error handling", () => {
    it("sets error message and falls back to clipUrl on Cloud Function error", async () => {
      mockGetVideoUrl.mockRejectedValue(new Error("Permission denied"));

      const { result } = renderHook(() =>
        useVideoUrl(
          "videos/uid/gid/round_1/abc.mp4",
          "game-1",
          "https://fallback.url/clip.mp4"
        )
      );

      await waitFor(() => {
        expect(result.current.error).toBe("Permission denied");
      });

      expect(result.current.url).toBe("https://fallback.url/clip.mp4");
      expect(result.current.isLoading).toBe(false);
    });

    it("sets generic error message for non-Error exceptions", async () => {
      mockGetVideoUrl.mockRejectedValue("string error");

      const { result } = renderHook(() =>
        useVideoUrl("videos/uid/gid/round_1/abc.mp4", "game-1")
      );

      await waitFor(() => {
        expect(result.current.error).toBe("Failed to load video");
      });

      expect(result.current.url).toBeNull();
    });

    it("returns null url on error when no fallback provided", async () => {
      mockGetVideoUrl.mockRejectedValue(new Error("fail"));

      const { result } = renderHook(() =>
        useVideoUrl("videos/uid/gid/round_1/abc.mp4", "game-1")
      );

      await waitFor(() => {
        expect(result.current.error).toBe("fail");
      });

      expect(result.current.url).toBeNull();
    });
  });

  // ---------- Refresh ----------

  describe("refresh", () => {
    it("re-fetches signed URL when refresh is called", async () => {
      mockGetVideoUrl
        .mockResolvedValueOnce(signedUrlResponse("https://first.url"))
        .mockResolvedValueOnce(signedUrlResponse("https://second.url"));

      const { result } = renderHook(() =>
        useVideoUrl("videos/uid/gid/round_1/abc.mp4", "game-1")
      );

      await waitFor(() => {
        expect(result.current.url).toBe("https://first.url");
      });

      // Clear cache so refresh actually fetches
      clearUrlCache();

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.url).toBe("https://second.url");
      expect(mockGetVideoUrl).toHaveBeenCalledTimes(2);
    });
  });

  // ---------- Cache utilities ----------

  describe("cache utilities", () => {
    it("clearUrlCache empties the cache", async () => {
      mockGetVideoUrl.mockResolvedValue(
        signedUrlResponse("https://signed.url")
      );

      const { result } = renderHook(() =>
        useVideoUrl("videos/uid/gid/round_1/abc.mp4", "game-1")
      );

      await waitFor(() => {
        expect(result.current.url).toBe("https://signed.url");
      });

      expect(getUrlCacheSize()).toBe(1);
      clearUrlCache();
      expect(getUrlCacheSize()).toBe(0);
    });

    it("getUrlCacheSize returns correct count", () => {
      expect(getUrlCacheSize()).toBe(0);
    });
  });

  // ---------- Input changes ----------

  describe("input changes", () => {
    it("fetches new URL when storagePath changes", async () => {
      mockGetVideoUrl
        .mockResolvedValueOnce(signedUrlResponse("https://url-a.mp4"))
        .mockResolvedValueOnce(signedUrlResponse("https://url-b.mp4"));

      let storagePath = "videos/uid/gid/round_1/a.mp4";
      const { result, rerender } = renderHook(() =>
        useVideoUrl(storagePath, "game-1")
      );

      await waitFor(() => {
        expect(result.current.url).toBe("https://url-a.mp4");
      });

      // Change storagePath
      storagePath = "videos/uid/gid/round_1/b.mp4";
      rerender();

      await waitFor(() => {
        expect(result.current.url).toBe("https://url-b.mp4");
      });

      expect(mockGetVideoUrl).toHaveBeenCalledTimes(2);
    });

    it("switches to fallback when storagePath becomes null", async () => {
      mockGetVideoUrl.mockResolvedValue(
        signedUrlResponse("https://signed.url")
      );

      let storagePath: string | null = "videos/uid/gid/round_1/a.mp4";
      const fallback = "https://legacy.url";

      const { result, rerender } = renderHook(() =>
        useVideoUrl(storagePath, "game-1", fallback)
      );

      await waitFor(() => {
        expect(result.current.url).toBe("https://signed.url");
      });

      // StoragePath becomes null (e.g., game state changes)
      storagePath = null;
      rerender();

      await waitFor(() => {
        expect(result.current.url).toBe("https://legacy.url");
      });
    });
  });
});
