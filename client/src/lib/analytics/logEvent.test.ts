/**
 * Tests for client/src/lib/analytics/logEvent.ts
 *
 * Covers: logEvent, logEventBatch, and the internal helpers
 * generateEventId and getSessionId (tested indirectly through the public API).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@shared/analytics-events", () => {
  const safeParseMock = vi.fn();
  return {
    AnalyticsIngestSchema: { safeParse: safeParseMock },
    EVENT_NAMES: ["battle_created", "battle_voted", "app_opened"] as const,
  };
});

vi.mock("../firebase", () => ({
  auth: {
    currentUser: null,
  },
}));

vi.mock("@skatehubba/config", () => ({
  getAppConfig: vi.fn(() => ({ version: "1.0.0-test" })),
}));

vi.mock("../logger", () => ({
  logger: {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Imports (resolved AFTER mocks are hoisted) ─────────────────────────────

import { logEvent, logEventBatch } from "./logEvent";
import { AnalyticsIngestSchema } from "@shared/analytics-events";
import { auth } from "../firebase";
import { logger } from "../logger";

// ── Helpers ────────────────────────────────────────────────────────────────

const mockUser = (token = "mock-id-token") => {
  (auth as { currentUser: unknown }).currentUser = {
    getIdToken: vi.fn().mockResolvedValue(token),
  };
};

const clearUser = () => {
  (auth as { currentUser: unknown }).currentUser = null;
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("logEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearUser();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

    // Default: schema validation passes
    vi.mocked(AnalyticsIngestSchema.safeParse).mockReturnValue({
      success: true,
      data: {},
    } as any);

    // Provide crypto.randomUUID for event ID generation
    if (!globalThis.crypto) {
      (globalThis as any).crypto = {};
    }
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "mock-uuid-1234-5678-9abc-def012345678" as `${string}-${string}-${string}-${string}-${string}`
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ────────────────────────────────────────────────────────────────────────
  // Authentication guard
  // ────────────────────────────────────────────────────────────────────────

  describe("authentication guard", () => {
    it("does nothing when user is not authenticated", async () => {
      clearUser();

      await logEvent("battle_created", { battle_id: "abc" });

      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("proceeds when user is authenticated", async () => {
      mockUser();

      await logEvent("battle_created", { battle_id: "abc" });

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Payload construction
  // ────────────────────────────────────────────────────────────────────────

  describe("payload construction", () => {
    it("sends correct payload shape to the server", async () => {
      mockUser("my-token-123");

      await logEvent("battle_created", { battle_id: "xyz" });

      expect(AnalyticsIngestSchema.safeParse).toHaveBeenCalledWith(
        expect.objectContaining({
          event_id: expect.any(String),
          event_name: "battle_created",
          occurred_at: expect.any(String),
          session_id: expect.any(String),
          source: "web",
          app_version: "1.0.0-test",
          properties: { battle_id: "xyz" },
        })
      );
    });

    it("defaults properties to empty object", async () => {
      mockUser();

      await logEvent("app_opened");

      expect(AnalyticsIngestSchema.safeParse).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: {},
        })
      );
    });

    it("sends Authorization header with bearer token", async () => {
      mockUser("token-abc");

      await logEvent("battle_created", {});

      const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(init?.headers).toEqual(
        expect.objectContaining({
          Authorization: "Bearer token-abc",
          "Content-Type": "application/json",
        })
      );
    });

    it("uses keepalive to ensure delivery on page unload", async () => {
      mockUser();

      await logEvent("battle_created", {});

      const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(init?.keepalive).toBe(true);
    });

    it("posts to /api/analytics/events", async () => {
      mockUser();

      await logEvent("battle_created", {});

      const [url] = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(url).toBe("/api/analytics/events");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Validation
  // ────────────────────────────────────────────────────────────────────────

  describe("validation", () => {
    it("does not send when schema validation fails", async () => {
      mockUser();
      vi.mocked(AnalyticsIngestSchema.safeParse).mockReturnValue({
        success: false,
        error: { flatten: () => ({ fieldErrors: {} }) },
      } as any);

      await logEvent("battle_created", { invalid: "data" });

      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("logs warning when validation fails", async () => {
      mockUser();
      const flatErrors = { fieldErrors: { event_name: ["required"] } };
      vi.mocked(AnalyticsIngestSchema.safeParse).mockReturnValue({
        success: false,
        error: { flatten: () => flatErrors },
      } as any);

      await logEvent("battle_created", {});

      expect(logger.warn).toHaveBeenCalledWith("[Analytics] Invalid event payload:", flatErrors);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Error handling
  // ────────────────────────────────────────────────────────────────────────

  describe("error handling", () => {
    it("silently catches fetch errors and warns", async () => {
      mockUser();
      const fetchError = new Error("Network failure");
      vi.mocked(globalThis.fetch).mockRejectedValue(fetchError);

      // Should not throw
      await expect(logEvent("battle_created", {})).resolves.toBeUndefined();

      expect(logger.warn).toHaveBeenCalledWith("[Analytics] Failed to log event:", fetchError);
    });

    it("silently catches token retrieval errors", async () => {
      (auth as { currentUser: unknown }).currentUser = {
        getIdToken: vi.fn().mockRejectedValue(new Error("Token expired")),
      };

      await expect(logEvent("battle_created", {})).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Event ID generation (tested indirectly)
  // ────────────────────────────────────────────────────────────────────────

  describe("event ID generation", () => {
    it("generates unique event IDs using crypto.randomUUID", async () => {
      mockUser();

      await logEvent("battle_created", {});

      expect(AnalyticsIngestSchema.safeParse).toHaveBeenCalledWith(
        expect.objectContaining({
          event_id: "mock-uuid-1234-5678-9abc-def012345678",
        })
      );
    });

    it("falls back to crypto.getRandomValues when randomUUID unavailable", async () => {
      mockUser();

      // Remove randomUUID to trigger fallback
      const originalRandomUUID = crypto.randomUUID;
      (crypto as any).randomUUID = undefined;

      const getRandomValuesSpy = vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
        const u32 = array as Uint32Array;
        u32[0] = 0xdeadbeef;
        u32[1] = 0xcafebabe;
        u32[2] = 0x12345678;
        u32[3] = 0xabcdef01;
        return array;
      });

      await logEvent("app_opened", {});

      expect(AnalyticsIngestSchema.safeParse).toHaveBeenCalledWith(
        expect.objectContaining({
          event_id: "deadbeef-cafebabe-12345678-abcdef01",
        })
      );

      // Restore
      crypto.randomUUID = originalRandomUUID;
      getRandomValuesSpy.mockRestore();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Session ID (tested indirectly)
  // ────────────────────────────────────────────────────────────────────────

  describe("session ID persistence", () => {
    it("includes a session_id in the payload", async () => {
      mockUser();

      await logEvent("battle_created", {});

      expect(AnalyticsIngestSchema.safeParse).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: expect.any(String),
        })
      );
    });
  });
});

// ────────────────────────────────────────────────────────────────────────
// logEventBatch
// ────────────────────────────────────────────────────────────────────────

describe("logEventBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearUser();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

    if (!globalThis.crypto) {
      (globalThis as any).crypto = {};
    }
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "batch-uuid-1234" as `${string}-${string}-${string}-${string}-${string}`
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing when user is not authenticated", async () => {
    clearUser();

    await logEventBatch([{ event_name: "battle_created" }]);

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("sends batch to /api/analytics/events/batch", async () => {
    mockUser("batch-token");

    await logEventBatch([
      { event_name: "battle_created", properties: { battle_id: "b1" } },
      { event_name: "battle_voted", properties: { battle_id: "b1", vote: "clean" } },
    ]);

    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url).toBe("/api/analytics/events/batch");
    expect(init?.method).toBe("POST");
    expect(init?.keepalive).toBe(true);

    const body = JSON.parse(init?.body as string);
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual(
      expect.objectContaining({
        event_name: "battle_created",
        properties: { battle_id: "b1" },
        source: "web",
      })
    );
    expect(body[1]).toEqual(
      expect.objectContaining({
        event_name: "battle_voted",
        properties: { battle_id: "b1", vote: "clean" },
      })
    );
  });

  it("defaults properties to empty object when not provided", async () => {
    mockUser();

    await logEventBatch([{ event_name: "app_opened" }]);

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body[0].properties).toEqual({});
  });

  it("silently catches errors and warns", async () => {
    mockUser();
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error("Batch failure"));

    await expect(logEventBatch([{ event_name: "battle_created" }])).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      "[Analytics] Failed to log event batch:",
      expect.any(Error)
    );
  });

  it("sends Authorization header with bearer token", async () => {
    mockUser("batch-token-xyz");

    await logEventBatch([{ event_name: "app_opened" }]);

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(init?.headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer batch-token-xyz",
      })
    );
  });
});
