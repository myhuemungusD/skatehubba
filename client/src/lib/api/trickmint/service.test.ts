/**
 * Tests for client/src/lib/api/trickmint/service.ts
 *
 * Covers: trickmintApi methods — requestUploadUrl, confirmUpload,
 * submitDirect, getMyClips, getFeed, getClip, deleteClip.
 *
 * Strategy: mock the apiRequest dependency and verify each service
 * method passes the correct method, path, and body.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock ───────────────────────────────────────────────────────────────────

const apiRequestMock = vi.fn();

vi.mock("../client", () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));

// ── Import (resolved AFTER mock) ──────────────────────────────────────────

import { trickmintApi } from "./service";

// ── Tests ──────────────────────────────────────────────────────────────────

describe("trickmintApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiRequestMock.mockResolvedValue({});
  });

  // ────────────────────────────────────────────────────────────────────────
  // requestUploadUrl
  // ────────────────────────────────────────────────────────────────────────

  describe("requestUploadUrl", () => {
    it("sends POST to /api/trickmint/request-upload with default webm extension", async () => {
      const mockResponse = {
        uploadId: "u1",
        videoUploadUrl: "https://storage.example.com/video",
        thumbnailUploadUrl: "https://storage.example.com/thumb",
        videoPath: "videos/u1.webm",
        thumbnailPath: "thumbnails/u1.jpg",
        expiresAt: "2026-01-01T00:00:00Z",
        limits: { maxVideoSizeBytes: 100_000_000 },
      };
      apiRequestMock.mockResolvedValue(mockResponse);

      const result = await trickmintApi.requestUploadUrl();

      expect(apiRequestMock).toHaveBeenCalledWith({
        method: "POST",
        path: "/api/trickmint/request-upload",
        body: { fileExtension: "webm" },
      });
      expect(result).toEqual(mockResponse);
    });

    it("supports mp4 file extension", async () => {
      await trickmintApi.requestUploadUrl("mp4");

      expect(apiRequestMock).toHaveBeenCalledWith({
        method: "POST",
        path: "/api/trickmint/request-upload",
        body: { fileExtension: "mp4" },
      });
    });

    it("supports mov file extension", async () => {
      await trickmintApi.requestUploadUrl("mov");

      expect(apiRequestMock).toHaveBeenCalledWith({
        method: "POST",
        path: "/api/trickmint/request-upload",
        body: { fileExtension: "mov" },
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // confirmUpload
  // ────────────────────────────────────────────────────────────────────────

  describe("confirmUpload", () => {
    it("sends POST to /api/trickmint/confirm-upload with request data", async () => {
      const data = {
        trickName: "Kickflip",
        description: "Clean kickflip at the park",
        videoPath: "videos/u1.webm",
        thumbnailPath: "thumbnails/u1.jpg",
        videoDurationMs: 5000,
        spotId: 42,
        isPublic: true,
      };
      const mockResponse = {
        clip: {
          id: 1,
          videoUrl: "https://cdn.example.com/v.webm",
          thumbnailUrl: null,
          status: "processing",
        },
      };
      apiRequestMock.mockResolvedValue(mockResponse);

      const result = await trickmintApi.confirmUpload(data);

      expect(apiRequestMock).toHaveBeenCalledWith({
        method: "POST",
        path: "/api/trickmint/confirm-upload",
        body: data,
      });
      expect(result).toEqual(mockResponse);
    });

    it("works with minimal required fields", async () => {
      const data = { trickName: "Ollie", videoPath: "videos/u2.mp4" };

      await trickmintApi.confirmUpload(data);

      expect(apiRequestMock).toHaveBeenCalledWith({
        method: "POST",
        path: "/api/trickmint/confirm-upload",
        body: data,
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // submitDirect
  // ────────────────────────────────────────────────────────────────────────

  describe("submitDirect", () => {
    it("sends POST to /api/trickmint/submit with submission data", async () => {
      const data = {
        trickName: "Heelflip",
        videoUrl: "https://firebase.storage.example.com/video.webm",
        thumbnailUrl: "https://firebase.storage.example.com/thumb.jpg",
        videoDurationMs: 3000,
        fileSizeBytes: 5_000_000,
        mimeType: "video/webm",
        spotId: 10,
        isPublic: false,
      };
      const mockResponse = {
        clip: {
          id: 2,
          videoUrl: data.videoUrl,
          thumbnailUrl: data.thumbnailUrl,
          status: "processing",
        },
      };
      apiRequestMock.mockResolvedValue(mockResponse);

      const result = await trickmintApi.submitDirect(data);

      expect(apiRequestMock).toHaveBeenCalledWith({
        method: "POST",
        path: "/api/trickmint/submit",
        body: data,
      });
      expect(result).toEqual(mockResponse);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // getMyClips
  // ────────────────────────────────────────────────────────────────────────

  describe("getMyClips", () => {
    it("sends GET with default limit and offset", async () => {
      const mockResponse = { clips: [], total: 0, limit: 20, offset: 0 };
      apiRequestMock.mockResolvedValue(mockResponse);

      const result = await trickmintApi.getMyClips();

      expect(apiRequestMock).toHaveBeenCalledWith({
        method: "GET",
        path: "/api/trickmint/my-clips?limit=20&offset=0",
      });
      expect(result).toEqual(mockResponse);
    });

    it("sends GET with custom limit and offset", async () => {
      await trickmintApi.getMyClips(10, 5);

      expect(apiRequestMock).toHaveBeenCalledWith({
        method: "GET",
        path: "/api/trickmint/my-clips?limit=10&offset=5",
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // getFeed
  // ────────────────────────────────────────────────────────────────────────

  describe("getFeed", () => {
    it("sends GET with default limit and offset", async () => {
      const mockResponse = { clips: [], total: 0, limit: 20, offset: 0 };
      apiRequestMock.mockResolvedValue(mockResponse);

      const result = await trickmintApi.getFeed();

      expect(apiRequestMock).toHaveBeenCalledWith({
        method: "GET",
        path: "/api/trickmint/feed?limit=20&offset=0",
      });
      expect(result).toEqual(mockResponse);
    });

    it("sends GET with custom limit and offset", async () => {
      await trickmintApi.getFeed(50, 100);

      expect(apiRequestMock).toHaveBeenCalledWith({
        method: "GET",
        path: "/api/trickmint/feed?limit=50&offset=100",
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // getClip
  // ────────────────────────────────────────────────────────────────────────

  describe("getClip", () => {
    it("sends GET to /api/trickmint/:id", async () => {
      const mockClip = {
        clip: {
          id: 42,
          userId: "user-1",
          userName: "sk8r",
          trickName: "Kickflip",
          description: null,
          videoUrl: "https://cdn.example.com/v.webm",
          status: "ready",
        },
      };
      apiRequestMock.mockResolvedValue(mockClip);

      const result = await trickmintApi.getClip(42);

      expect(apiRequestMock).toHaveBeenCalledWith({
        method: "GET",
        path: "/api/trickmint/42",
      });
      expect(result).toEqual(mockClip);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // deleteClip
  // ────────────────────────────────────────────────────────────────────────

  describe("deleteClip", () => {
    it("sends DELETE to /api/trickmint/:id", async () => {
      const mockResponse = { message: "Clip deleted" };
      apiRequestMock.mockResolvedValue(mockResponse);

      const result = await trickmintApi.deleteClip(42);

      expect(apiRequestMock).toHaveBeenCalledWith({
        method: "DELETE",
        path: "/api/trickmint/42",
      });
      expect(result).toEqual(mockResponse);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Error propagation
  // ────────────────────────────────────────────────────────────────────────

  describe("error propagation", () => {
    it("propagates errors from apiRequest", async () => {
      const apiError = new Error("Unauthorized");
      apiRequestMock.mockRejectedValue(apiError);

      await expect(trickmintApi.getMyClips()).rejects.toThrow("Unauthorized");
    });

    it("propagates errors from POST requests", async () => {
      apiRequestMock.mockRejectedValue(new Error("Server error"));

      await expect(
        trickmintApi.confirmUpload({ trickName: "Ollie", videoPath: "v.webm" })
      ).rejects.toThrow("Server error");
    });
  });
});
