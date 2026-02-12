import "./types";
import type {
  TrickClip,
  UploadUrlResponse,
  UploadLimits,
  ConfirmUploadRequest,
  SubmitDirectRequest,
  ClipResponse,
  ClipListResponse,
} from "./types";

describe("TrickMint API Types", () => {
  it("allows constructing a TrickClip object", () => {
    const clip: TrickClip = {
      id: 1,
      userId: "user-123",
      userName: "skater_pro",
      trickName: "Kickflip",
      description: "Clean kickflip at the park",
      videoUrl: "https://cdn.example.com/clip.mp4",
      videoDurationMs: 5000,
      thumbnailUrl: "https://cdn.example.com/thumb.jpg",
      fileSizeBytes: 10_000_000,
      mimeType: "video/mp4",
      status: "ready",
      spotId: 42,
      gameId: null,
      gameTurnId: null,
      views: 150,
      likes: 30,
      isPublic: true,
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    };
    expect(clip.status).toBe("ready");
    expect(clip.isPublic).toBe(true);
  });

  it("allows constructing an UploadUrlResponse with limits", () => {
    const limits: UploadLimits = {
      maxVideoSizeBytes: 100_000_000,
      maxThumbnailSizeBytes: 5_000_000,
      maxVideoDurationMs: 60_000,
      allowedVideoTypes: ["video/mp4", "video/webm"],
      allowedThumbnailTypes: ["image/jpeg", "image/png"],
    };

    const response: UploadUrlResponse = {
      uploadId: "upload-001",
      videoUploadUrl: "https://storage.example.com/upload/video",
      thumbnailUploadUrl: "https://storage.example.com/upload/thumb",
      videoPath: "videos/upload-001.mp4",
      thumbnailPath: "thumbnails/upload-001.jpg",
      expiresAt: "2025-01-01T01:00:00Z",
      limits,
    };
    expect(response.limits.allowedVideoTypes).toContain("video/mp4");
  });

  it("allows constructing upload request types", () => {
    const confirm: ConfirmUploadRequest = {
      trickName: "Heelflip",
      videoPath: "videos/upload-001.mp4",
    };

    const direct: SubmitDirectRequest = {
      trickName: "Tre Flip",
      videoUrl: "https://cdn.example.com/tre.mp4",
      videoDurationMs: 4000,
      isPublic: true,
    };

    expect(confirm.trickName).toBe("Heelflip");
    expect(direct.isPublic).toBe(true);
  });

  it("allows constructing a ClipListResponse", () => {
    const response: ClipListResponse = {
      clips: [],
      total: 0,
      limit: 20,
      offset: 0,
    };
    expect(response.total).toBe(0);
  });
});
