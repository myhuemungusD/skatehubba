/**
 * Branch coverage tests for service files:
 * - server/services/videoProcessingService.ts (2 uncovered)
 * - server/services/video/multiQuality.ts (lines 49, 75)
 * - server/services/userService.ts (lines 84, 139)
 * - server/services/storageService.ts (lines 151-152)
 * - server/services/emailService.ts (2 uncovered)
 * - server/services/battle/service.ts (lines 164, 312)
 * - server/services/battle/timeout.ts (line 39)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ===========================================================================
// storageService — branch coverage (lines 151-152)
// ===========================================================================
describe("storageService branches — metadata defaults", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function setupStorageTest(metadataResponse: any) {
    const mockFileExists = vi.fn().mockResolvedValue([true]);
    const mockFileGetMetadata = vi.fn().mockResolvedValue([metadataResponse]);
    const mockGetSignedUrl = vi.fn().mockResolvedValue(["https://signed-url"]);

    vi.doMock("../../admin", () => ({
      admin: {
        storage: () => ({
          bucket: () => ({
            file: vi.fn().mockReturnValue({
              exists: mockFileExists,
              getMetadata: mockFileGetMetadata,
              getSignedUrl: mockGetSignedUrl,
              delete: vi.fn(),
              save: vi.fn(),
              setMetadata: vi.fn(),
            }),
            name: "test-bucket",
          }),
        }),
      },
    }));

    vi.doMock("../../config/env", () => ({
      env: { FIREBASE_STORAGE_BUCKET: "test-bucket" },
    }));

    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const mod = await import("../../services/storageService");
    return mod;
  }

  it("should default size to 0 when metadata.size is undefined", async () => {
    // metadata.size is undefined -> Number(undefined || 0) = 0
    const { validateUploadedFile } = await setupStorageTest({ contentType: "video/mp4" });

    const result = await validateUploadedFile("path/video.mp4", "video");

    // Size 0 is under the limit, contentType is valid
    expect(result.valid).toBe(true);
    expect(result.metadata?.size).toBe(0);
  });

  it("should default contentType to empty string when metadata.contentType is undefined", async () => {
    // metadata.contentType is undefined -> String(undefined || "") = ""
    const { validateUploadedFile } = await setupStorageTest({ size: 1000 });

    const result = await validateUploadedFile("path/video.mp4", "video");

    // Empty contentType won't be in allowed types
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid file type");
  });

  it("should handle both metadata.size and metadata.contentType missing", async () => {
    const { validateUploadedFile } = await setupStorageTest({});

    const result = await validateUploadedFile("path/video.mp4", "video");

    // size=0 (ok), contentType="" (not in allowed) => invalid
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid file type");
  });
});

// ===========================================================================
// emailService — branch coverage
// ===========================================================================
describe("emailService branches", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("should handle sendEmail error returning non-Error object", async () => {
    const mockSend = vi.fn().mockRejectedValue("string error not an Error instance");

    vi.doMock("resend", () => ({
      Resend: class MockResend {
        emails = { send: mockSend };
      },
    }));

    vi.doMock("../../config/env", () => ({
      env: {
        RESEND_API_KEY: "re_test_key",
        NODE_ENV: "test",
        PRODUCTION_URL: "https://skatehubba.com",
      },
    }));

    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const { sendWelcomeEmail } = await import("../../services/emailService");
    const result = await sendWelcomeEmail("test@test.com", "Test");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Unknown error");
  });

  it("should handle weekly digest with hasActivity = false", async () => {
    vi.doMock("resend", () => ({
      Resend: class MockResend {
        emails = { send: vi.fn() };
      },
    }));

    vi.doMock("../../config/env", () => ({
      env: {
        RESEND_API_KEY: null,
        NODE_ENV: "test",
        PRODUCTION_URL: "https://skatehubba.com",
      },
    }));

    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const { sendWeeklyDigestEmail } = await import("../../services/emailService");
    const result = await sendWeeklyDigestEmail("test@test.com", "TestUser", {
      gamesPlayed: 0,
      gamesWon: 0,
      spotsVisited: 0,
      pendingChallenges: 0,
    });

    // Without RESEND_API_KEY, returns success: true (debug path)
    expect(result.success).toBe(true);
  });
});

// ===========================================================================
// userService — branch coverage (lines 84, 139)
// ===========================================================================
describe("userService branches", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("Line 84: getUserByEmail returns null when no results", async () => {
    vi.doMock("../../db", () => ({
      db: null,
      requireDb: vi.fn().mockReturnValue({
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn().mockResolvedValue([]),
          })),
        })),
      }),
    }));
    vi.doMock("@shared/schema", () => ({
      customUsers: { id: "id", email: "email" },
    }));
    vi.doMock("drizzle-orm", () => ({ eq: vi.fn() }));
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));

    const { getUserByEmail } = await import("../../services/userService");
    const result = await getUserByEmail("nonexistent@test.com");
    expect(result).toBeNull();
  });

  it("Line 139: getOrCreateUser rethrows when re-read also fails after unique constraint", async () => {
    vi.doMock("../../db", () => ({
      db: null,
      requireDb: vi.fn().mockReturnValue({
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn().mockResolvedValue([]),
          })),
        })),
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: vi.fn().mockRejectedValue({ code: "23505" }),
          })),
        })),
      }),
    }));
    vi.doMock("@shared/schema", () => ({
      customUsers: { id: "id", email: "email" },
    }));
    vi.doMock("drizzle-orm", () => ({ eq: vi.fn() }));
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));

    const { getOrCreateUser } = await import("../../services/userService");

    await expect(
      getOrCreateUser({ id: "u1", email: "test@test.com", passwordHash: "hash" })
    ).rejects.toEqual({ code: "23505" });
  });
});

// ===========================================================================
// battle/service — branch coverage (lines 164, 312)
// ===========================================================================
describe("battle/service branches", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("Line 164: castVote — battle not found in legacy path returns false", async () => {
    const mockTx: any = {};
    mockTx.select = vi.fn(() => mockTx);
    mockTx.from = vi.fn(() => mockTx);
    mockTx.where = vi.fn(() => mockTx);
    mockTx.for = vi.fn().mockResolvedValue([]); // No vote state row => legacy path

    const mockDb: any = {
      transaction: vi.fn(async (fn: any) => fn(mockTx)),
      select: vi.fn(function (this: any) {
        return this;
      }),
      from: vi.fn(function (this: any) {
        return this;
      }),
      where: vi.fn().mockResolvedValue([]), // Legacy: battle not found
    };

    vi.doMock("../../db", () => ({ getDb: vi.fn().mockReturnValue(mockDb) }));
    vi.doMock("@shared/schema", () => ({
      battles: { id: "id", status: "status" },
      battleVotes: { battleId: "battleId", odv: "odv" },
      battleVoteState: { battleId: "battleId", status: "status" },
    }));
    vi.doMock("drizzle-orm", () => ({ eq: vi.fn() }));
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.doMock("../../services/analyticsService", () => ({
      logServerEvent: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("../../services/battle/idempotency", () => ({
      MAX_PROCESSED_EVENTS: 100,
    }));
    vi.doMock("../../services/battle/calculation", () => ({
      calculateWinner: vi.fn().mockReturnValue({ winnerId: "p1", scores: {} }),
    }));

    const { castVote } = await import("../../services/battle/service");
    const result = await castVote({
      eventId: "evt-1",
      battleId: "battle-1",
      odv: "p1",
      vote: "clean",
    });

    expect(result.success).toBe(false);
  });

  it("Line 312: legacy path — winnerId is null uses creatorId as fallback", async () => {
    const mockLogServerEvent = vi.fn().mockResolvedValue(undefined);
    const battleRow = {
      id: "battle-1",
      creatorId: "creator-1",
      opponentId: "opponent-1",
      status: "active",
    };

    const mockTx: any = {};
    mockTx.select = vi.fn(() => mockTx);
    mockTx.from = vi.fn(() => mockTx);
    mockTx.where = vi.fn(() => mockTx);
    mockTx.for = vi.fn().mockResolvedValue([]); // No vote state => legacy

    let dbSelectCount = 0;
    const mockDb: any = {
      transaction: vi.fn(async (fn: any) => fn(mockTx)),
      select: vi.fn(function () {
        return mockDb;
      }),
      from: vi.fn(function () {
        return mockDb;
      }),
      insert: vi.fn(function () {
        return mockDb;
      }),
      values: vi.fn(function () {
        return mockDb;
      }),
      onConflictDoUpdate: vi.fn(function () {
        return mockDb;
      }),
      update: vi.fn(function () {
        return mockDb;
      }),
      set: vi.fn(function () {
        return mockDb;
      }),
      returning: vi.fn(function () {
        return Promise.resolve([battleRow]);
      }),
    };

    mockDb.where = vi.fn(function () {
      dbSelectCount++;
      if (dbSelectCount === 1) return Promise.resolve([battleRow]); // Battle lookup
      if (dbSelectCount === 2)
        return Promise.resolve([
          // Both voted
          { odv: "creator-1", vote: "clean", createdAt: new Date() },
          { odv: "opponent-1", vote: "sketch", createdAt: new Date() },
        ]);
      return Promise.resolve([]);
    });

    vi.doMock("../../db", () => ({ getDb: vi.fn().mockReturnValue(mockDb) }));
    vi.doMock("@shared/schema", () => ({
      battles: { id: "id", status: "status" },
      battleVotes: { battleId: "battleId", odv: "odv" },
      battleVoteState: { battleId: "battleId", status: "status" },
    }));
    vi.doMock("drizzle-orm", () => ({ eq: vi.fn() }));
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.doMock("../../services/analyticsService", () => ({
      logServerEvent: mockLogServerEvent,
    }));
    vi.doMock("../../services/battle/idempotency", () => ({
      MAX_PROCESSED_EVENTS: 100,
    }));
    vi.doMock("../../services/battle/calculation", () => ({
      calculateWinner: vi.fn().mockReturnValue({ winnerId: null, scores: {} }),
    }));

    const { castVote } = await import("../../services/battle/service");
    const result = await castVote({
      eventId: "evt-2",
      battleId: "battle-1",
      odv: "creator-1",
      vote: "clean",
    });

    expect(result.success).toBe(true);
    expect(result.battleComplete).toBe(true);
  });
});

// ===========================================================================
// battle/timeout — branch coverage (line 39)
// ===========================================================================
describe("battle/timeout branches", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("Line 39: should skip when fresh row is null (already processed)", async () => {
    const mockTx: any = {};
    mockTx.select = vi.fn(() => mockTx);
    mockTx.from = vi.fn(() => mockTx);
    mockTx.where = vi.fn(() => mockTx);
    mockTx.for = vi.fn().mockResolvedValue([]); // No fresh row

    const mockDb: any = {
      select: vi.fn(() => mockDb),
      from: vi.fn(() => mockDb),
      where: vi.fn().mockResolvedValue([
        {
          battleId: "battle-1",
          status: "voting",
          voteDeadlineAt: new Date(Date.now() - 10000),
          processedEventIds: [],
          votes: [],
          creatorId: "c1",
          opponentId: "o1",
        },
      ]),
      transaction: vi.fn(async (fn: any) => fn(mockTx)),
      update: vi.fn(() => mockDb),
      set: vi.fn(() => mockDb),
    };

    vi.doMock("../../db", () => ({ getDb: vi.fn().mockReturnValue(mockDb) }));
    vi.doMock("@shared/schema", () => ({
      battles: { id: "id", status: "status" },
      battleVoteState: { battleId: "battleId", status: "status", voteDeadlineAt: "voteDeadlineAt" },
    }));
    vi.doMock("drizzle-orm", () => ({
      eq: vi.fn(),
      and: vi.fn(),
      lt: vi.fn(),
    }));
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.doMock("../../services/analyticsService", () => ({
      logServerEvent: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("../../services/battle/idempotency", () => ({
      generateEventId: vi.fn().mockReturnValue("timeout-evt-1"),
      MAX_PROCESSED_EVENTS: 100,
    }));

    const { processVoteTimeouts } = await import("../../services/battle/timeout");
    await processVoteTimeouts();

    // Should not update battles table
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// videoProcessingService — branch coverage
// ===========================================================================
describe("videoProcessingService branches", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("should handle duration validation when video is too short", async () => {
    vi.doMock("../../db", () => ({
      getDb: vi.fn().mockReturnValue({
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: 1 }]),
          })),
        })),
      }),
    }));
    vi.doMock("@shared/schema", () => ({ trickClips: {} }));
    vi.doMock("drizzle-orm", () => ({ eq: vi.fn() }));
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.doMock("../../services/storageService", () => ({
      validateUploadedFile: vi.fn().mockResolvedValue({
        valid: true,
        metadata: { size: 100, contentType: "video/webm" },
      }),
      getPublicUrl: vi.fn().mockReturnValue("http://example.com/video.webm"),
      setCacheHeaders: vi.fn(),
    }));

    const { processUpload } = await import("../../services/videoProcessingService");
    const result = await processUpload({
      userId: "u1",
      userName: "User",
      trickName: "kickflip",
      videoPath: "path/to/video.webm",
      videoDurationMs: 100, // Too short
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("too short");
  });

  it("should handle thumbnail validation failure (non-fatal, uses video still)", async () => {
    vi.doMock("../../db", () => ({
      getDb: vi.fn().mockReturnValue({
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([
              {
                id: 1,
                videoUrl: "http://example.com/video.webm",
                thumbnailUrl: null,
                status: "ready",
              },
            ]),
          })),
        })),
      }),
    }));
    vi.doMock("@shared/schema", () => ({ trickClips: {} }));
    vi.doMock("drizzle-orm", () => ({ eq: vi.fn() }));
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.doMock("../../services/storageService", () => ({
      validateUploadedFile: vi
        .fn()
        .mockResolvedValueOnce({ valid: true, metadata: { size: 100, contentType: "video/webm" } })
        .mockResolvedValueOnce({ valid: false, error: "Thumbnail not found" }),
      getPublicUrl: vi.fn().mockReturnValue("http://example.com/video.webm"),
      setCacheHeaders: vi.fn(),
    }));

    const { processUpload } = await import("../../services/videoProcessingService");
    const result = await processUpload({
      userId: "u1",
      userName: "User",
      trickName: "kickflip",
      videoPath: "path/to/video.webm",
      thumbnailPath: "path/to/thumb.jpg",
    });

    expect(result.success).toBe(true);
  });
});

// ===========================================================================
// multiQuality — branch coverage (lines 49, 75)
// ===========================================================================
describe("multiQuality branches", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("Line 49: maxDurationMs = 0 triggers || fallback to DEFAULT_OPTIONS", async () => {
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.doMock("../../services/video/ffprobe", () => ({
      probeVideo: vi
        .fn()
        .mockResolvedValueOnce({ isCorrupt: false, width: 1920, height: 1080 })
        .mockResolvedValueOnce({ isCorrupt: false, width: 640, height: 360 }),
    }));
    vi.doMock("../../services/video/ffmpeg", () => ({
      transcodeVideo: vi.fn().mockResolvedValue({ success: true }),
      generateThumbnail: vi.fn().mockResolvedValue({ success: true }),
    }));
    vi.doMock("../../services/video/quality", () => ({
      QUALITY_PRESETS: {
        low: { maxWidth: 640, maxHeight: 360, targetBitrate: "500k", audioBitrate: "64k" },
      },
      DEFAULT_OPTIONS: { maxDurationMs: 15000 },
    }));

    const { transcodeMultiQuality } = await import("../../services/video/multiQuality");
    const result = await transcodeMultiQuality("/input.mp4", "/work", {
      maxDurationMs: 0,
      tiers: ["low"],
    });

    expect(result.success).toBe(true);
  });

  it("Line 75: thumbnail generation fails (non-fatal)", async () => {
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.doMock("../../services/video/ffprobe", () => ({
      probeVideo: vi
        .fn()
        .mockResolvedValueOnce({ isCorrupt: false, width: 1920, height: 1080 })
        .mockResolvedValueOnce({ isCorrupt: false, width: 640, height: 360 }),
    }));
    vi.doMock("../../services/video/ffmpeg", () => ({
      transcodeVideo: vi.fn().mockResolvedValue({ success: true }),
      generateThumbnail: vi.fn().mockResolvedValue({ success: false, error: "ffmpeg failed" }),
    }));
    vi.doMock("../../services/video/quality", () => ({
      QUALITY_PRESETS: {
        low: { maxWidth: 640, maxHeight: 360, targetBitrate: "500k", audioBitrate: "64k" },
      },
      DEFAULT_OPTIONS: { maxDurationMs: 15000 },
    }));

    const { transcodeMultiQuality } = await import("../../services/video/multiQuality");
    const result = await transcodeMultiQuality("/input.mp4", "/work", { tiers: ["low"] });

    expect(result.success).toBe(true);
    expect(result.thumbnailPath).toBeUndefined();
  });
});
