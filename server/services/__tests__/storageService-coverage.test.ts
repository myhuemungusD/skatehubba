/**
 * Unit tests for Storage Service - covering uncovered lines:
 * - Line 44: getBucket() throws when FIREBASE_STORAGE_BUCKET is not configured
 * - Line 188: getPublicUrl() throws when FIREBASE_STORAGE_BUCKET is not configured
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEnv = vi.hoisted(() => ({
  FIREBASE_STORAGE_BUCKET: "",
}));

vi.mock("../../config/env", () => ({
  env: mockEnv,
}));

vi.mock("../../admin", () => ({
  admin: {
    storage: vi.fn().mockReturnValue({
      bucket: vi.fn().mockReturnValue({
        file: vi.fn().mockReturnValue({
          getSignedUrl: vi.fn().mockResolvedValue(["https://signed-url"]),
          exists: vi.fn().mockResolvedValue([true]),
          getMetadata: vi.fn().mockResolvedValue([{ size: 1000, contentType: "video/mp4" }]),
          setMetadata: vi.fn().mockResolvedValue(undefined),
          delete: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    }),
  },
}));

vi.mock("../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { getPublicUrl } from "../storageService";

describe("storageService - missing bucket config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Line 44: getBucket() throws when FIREBASE_STORAGE_BUCKET is empty
   */
  it("getBucket throws when FIREBASE_STORAGE_BUCKET is not configured", async () => {
    mockEnv.FIREBASE_STORAGE_BUCKET = "";

    // getBucket is called internally by generateUploadUrls, getSignedDownloadUrl, etc.
    // We can test it via generateUploadUrls import
    vi.resetModules();

    vi.doMock("../../config/env", () => ({
      env: { FIREBASE_STORAGE_BUCKET: "" },
    }));

    vi.doMock("../../admin", () => ({
      admin: {
        storage: vi.fn().mockReturnValue({
          bucket: vi.fn(),
        }),
      },
    }));

    vi.doMock("../../logger", () => ({
      default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
    }));

    const { generateUploadUrls } = await import("../storageService");

    await expect(generateUploadUrls("user-1")).rejects.toThrow(
      "FIREBASE_STORAGE_BUCKET is not configured"
    );
  });

  /**
   * Line 188: getPublicUrl() throws when FIREBASE_STORAGE_BUCKET is empty
   */
  it("getPublicUrl throws when FIREBASE_STORAGE_BUCKET is not configured", () => {
    mockEnv.FIREBASE_STORAGE_BUCKET = "";

    expect(() => getPublicUrl("trickmint/user-1/video.webm")).toThrow(
      "FIREBASE_STORAGE_BUCKET is not configured"
    );
  });

  it("getPublicUrl returns correct URL when bucket is configured", () => {
    mockEnv.FIREBASE_STORAGE_BUCKET = "my-bucket";

    const url = getPublicUrl("trickmint/user-1/video.webm");

    expect(url).toBe(
      `https://firebasestorage.googleapis.com/v0/b/my-bucket/o/${encodeURIComponent("trickmint/user-1/video.webm")}?alt=media`
    );
  });
});
