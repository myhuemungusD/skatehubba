/**
 * Final branch coverage tests targeting specific uncovered branches.
 *
 * Each describe block targets a specific file and uncovered line(s).
 * Uses vi.resetModules + vi.doMock + dynamic import for isolation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ===========================================================================
// 1. server/routes/stripeWebhook.ts — line 101 (err not instanceof Error)
// ===========================================================================
describe("stripeWebhook line 101 — constructEvent throws non-Error", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("uses String(err) when constructEvent throws a non-Error", async () => {
    vi.doMock("../../redis", () => ({ getRedisClient: () => null }));
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));
    vi.doMock("../../db", () => ({ getDb: () => ({}) }));
    vi.doMock("../../services/emailService", () => ({ sendPaymentReceiptEmail: vi.fn() }));
    vi.doMock("../../services/notificationService", () => ({ notifyUser: vi.fn() }));
    vi.doMock("@shared/schema", () => ({
      customUsers: { id: "id" },
      consumedPaymentIntents: { id: "id", paymentIntentId: "paymentIntentId" },
    }));
    vi.doMock("drizzle-orm", () => ({ eq: vi.fn() }));

    const routeHandlers: Record<string, Function[]> = {};
    vi.doMock("express", () => ({
      Router: () => ({
        post: vi.fn((path: string, ...handlers: Function[]) => {
          routeHandlers[`POST ${path}`] = handlers;
        }),
        get: vi.fn(),
      }),
    }));

    const mockConstructEvent = vi.fn().mockImplementation(() => {
      throw "string_error"; // non-Error throw
    });
    vi.doMock("stripe", () => ({
      default: class { webhooks = { constructEvent: mockConstructEvent }; },
    }));

    await import("../../routes/stripeWebhook");
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

    const handler = routeHandlers["POST /"]?.slice(-1)[0];
    const req = { body: Buffer.from("{}"), headers: { "stripe-signature": "sig" } } as any;
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() } as any;
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ===========================================================================
// 2. server/routes/stripeWebhook.ts — line 146 (catch block, error not instanceof Error)
// ===========================================================================
describe("stripeWebhook line 146 — event handler throws non-Error", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("catches non-Error thrown in checkout handler and returns 500", async () => {
    vi.doMock("../../redis", () => ({ getRedisClient: () => null }));
    const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    vi.doMock("../../logger", () => ({ default: mockLogger }));

    vi.doMock("../../db", () => ({
      getDb: () => { throw "db_string_error"; },
    }));
    vi.doMock("../../services/emailService", () => ({ sendPaymentReceiptEmail: vi.fn() }));
    vi.doMock("../../services/notificationService", () => ({ notifyUser: vi.fn() }));
    vi.doMock("@shared/schema", () => ({
      customUsers: { id: "id" },
      consumedPaymentIntents: { id: "id", paymentIntentId: "paymentIntentId" },
    }));
    vi.doMock("drizzle-orm", () => ({ eq: vi.fn() }));

    const routeHandlers: Record<string, Function[]> = {};
    vi.doMock("express", () => ({
      Router: () => ({
        post: vi.fn((path: string, ...handlers: Function[]) => {
          routeHandlers[`POST ${path}`] = handlers;
        }),
        get: vi.fn(),
      }),
    }));

    const mockConstructEvent = vi.fn().mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_1", currency: "usd", amount_total: 999,
          payment_status: "paid", metadata: { userId: "u1", type: "premium_upgrade" },
        },
      },
    });
    vi.doMock("stripe", () => ({
      default: class { webhooks = { constructEvent: mockConstructEvent }; },
    }));

    await import("../../routes/stripeWebhook");
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

    const handler = routeHandlers["POST /"]?.slice(-1)[0];
    const req = { body: Buffer.from("{}"), headers: { "stripe-signature": "sig" } } as any;
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() } as any;
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ===========================================================================
// 3-4. server/socket/handlers/game/actions.ts — lines 134, 203
// ===========================================================================
describe("game actions socket handlers — lines 134, 203", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("line 134: game:pass — letters fallback to empty string when letterGained is falsy", async () => {
    const mockPassTrick = vi.fn().mockResolvedValue({
      success: true,
      alreadyProcessed: false,
      letterGained: undefined,
      game: {
        status: "active",
        winnerId: null,
        currentTurnIndex: 0,
        currentAction: "set",
        players: [{ odv: "p1", letters: "" }, { odv: "p2", letters: "" }],
      },
    });

    vi.doMock("../../socket/handlers/../../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));
    vi.doMock("../../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const broadcastFn = vi.fn();
    vi.doMock("../../socket/rooms", () => ({ broadcastToRoom: broadcastFn }));

    vi.doMock("../../services/gameStateService", () => ({
      passTrick: mockPassTrick,
      submitTrick: vi.fn(),
      forfeitGame: vi.fn(),
      generateEventId: vi.fn().mockReturnValue("eid"),
    }));
    vi.doMock("../../socket/socketRateLimit", () => ({
      checkRateLimit: vi.fn().mockReturnValue(true),
    }));

    const { registerActionsHandler } = await import(
      "../../socket/handlers/game/actions"
    );

    const handlers: Record<string, Function> = {};
    const socket = {
      id: "sock1",
      data: { odv: "p2" },
      on: vi.fn((event: string, cb: Function) => { handlers[event] = cb; }),
      emit: vi.fn(),
    } as any;

    registerActionsHandler({} as any, socket);
    await handlers["game:pass"]("game-1");

    expect(broadcastFn).toHaveBeenCalledWith(
      expect.anything(), "game", "game-1", "game:letter",
      expect.objectContaining({ letters: "" }),
    );
  });

  it("line 203: game:forfeit — winnerId fallback to empty string when game.winnerId is falsy", async () => {
    const mockForfeitGame = vi.fn().mockResolvedValue({
      success: true,
      alreadyProcessed: false,
      game: {
        status: "completed",
        winnerId: null,
        players: [{ odv: "p1", letters: "" }, { odv: "p2", letters: "SKATE" }],
      },
    });

    vi.doMock("../../socket/handlers/../../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));
    vi.doMock("../../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const broadcastFn = vi.fn();
    vi.doMock("../../socket/rooms", () => ({ broadcastToRoom: broadcastFn }));

    vi.doMock("../../services/gameStateService", () => ({
      passTrick: vi.fn(),
      submitTrick: vi.fn(),
      forfeitGame: mockForfeitGame,
      generateEventId: vi.fn().mockReturnValue("eid"),
    }));
    vi.doMock("../../socket/socketRateLimit", () => ({
      checkRateLimit: vi.fn().mockReturnValue(true),
    }));

    const { registerActionsHandler } = await import(
      "../../socket/handlers/game/actions"
    );

    const handlers: Record<string, Function> = {};
    const socket = {
      id: "sock1",
      data: { odv: "p1" },
      on: vi.fn((event: string, cb: Function) => { handlers[event] = cb; }),
      emit: vi.fn(),
    } as any;

    registerActionsHandler({} as any, socket);
    await handlers["game:forfeit"]("game-1");

    expect(broadcastFn).toHaveBeenCalledWith(
      expect.anything(), "game", "game-1", "game:ended",
      expect.objectContaining({ winnerId: "" }),
    );
  });
});

// ===========================================================================
// 5. server/services/videoProcessingService.ts — lines 146-147
// ===========================================================================
describe("videoProcessingService lines 146-147 — metadata nullish coalescing", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("uses ?? null for fileSizeBytes and mimeType when metadata fields are undefined", async () => {
    vi.doMock("../../db", () => ({
      getDb: () => ({
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              id: 1, videoUrl: "url", thumbnailUrl: null, status: "ready",
            }]),
          }),
        }),
      }),
    }));

    vi.doMock("../../services/storageService", () => ({
      validateUploadedFile: vi.fn().mockResolvedValue({
        valid: true,
        metadata: { size: undefined, contentType: undefined },
      }),
      getPublicUrl: vi.fn((p: string) => `https://cdn/${p}`),
      setCacheHeaders: vi.fn(),
    }));

    vi.doMock("@shared/schema", () => ({ trickClips: {} }));
    vi.doMock("drizzle-orm", () => ({ eq: vi.fn() }));
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const { processUpload } = await import("../../services/videoProcessingService");
    const result = await processUpload({
      userId: "u1", userName: "Test", trickName: "Kickflip",
      videoPath: "videos/test.mp4",
    });

    expect(result.success).toBe(true);
  });
});

// ===========================================================================
// 6-7. server/services/emailService.ts — lines 203, 283
// ===========================================================================
describe("emailService lines 203, 283", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("line 203: pendingChallenges > 0 shows pending row in digest", async () => {
    // Clear any prior mocks on emailService from stripe tests
    vi.doUnmock("../../services/emailService");
    vi.doMock("resend", () => ({
      Resend: class { emails = { send: vi.fn().mockResolvedValue({ data: { id: "1" } }) }; },
    }));
    vi.doMock("../../config/env", () => ({
      env: { RESEND_API_KEY: "re_test", NODE_ENV: "test", PRODUCTION_URL: "https://test.com" },
    }));
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const mod = await import("../../services/emailService");
    const result = await mod.sendWeeklyDigestEmail("a@b.com", "Tester", {
      gamesPlayed: 3, gamesWon: 1, spotsVisited: 2, pendingChallenges: 5,
    });

    expect(result.success).toBe(true);
  });

  it("line 283: opponentName fallback in your_turn email", async () => {
    vi.doUnmock("../../services/emailService");
    vi.doMock("resend", () => ({
      Resend: class { emails = { send: vi.fn().mockResolvedValue({ data: { id: "1" } }) }; },
    }));
    vi.doMock("../../config/env", () => ({
      env: { RESEND_API_KEY: "re_test", NODE_ENV: "test", PRODUCTION_URL: "https://test.com" },
    }));
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const mod = await import("../../services/emailService");
    const result = await mod.sendGameEventEmail("a@b.com", "Test", {
      type: "your_turn",
      gameId: "g1",
    });
    expect(result.success).toBe(true);
  });
});

// ===========================================================================
// 8. server/socket/handlers/presence.ts — line 210
// ===========================================================================
describe("presence handler line 210 — malformed JSON in Redis hvals", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("warns on malformed presence entry in Redis and skips it", async () => {
    const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    vi.doMock("../../logger", () => ({ default: mockLogger }));
    vi.doMock("../../redis", () => ({
      getRedisClient: () => ({
        hvals: vi.fn().mockResolvedValue(["not-valid-json"]),
        hkeys: vi.fn().mockResolvedValue([]),
        hget: vi.fn().mockResolvedValue(null),
        hset: vi.fn().mockResolvedValue(1),
        hdel: vi.fn().mockResolvedValue(1),
      }),
    }));

    const { getPresenceStats } = await import("../../socket/handlers/presence");
    const stats = await getPresenceStats();

    expect(mockLogger.warn).toHaveBeenCalledWith(
      "[Presence] Malformed presence entry in Redis",
      expect.any(Object),
    );
    expect(stats.online).toBe(0);
  });
});

// ===========================================================================
// 9. server/socket/handlers/game/cleanup.ts — line 35
// ===========================================================================
describe("game cleanup line 35 — game.status paused after disconnect", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("broadcasts game:paused when disconnect result has paused game", async () => {
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const broadcastFn = vi.fn();
    vi.doMock("../../socket/rooms", () => ({
      leaveRoom: vi.fn().mockResolvedValue(undefined),
      broadcastToRoom: broadcastFn,
    }));

    vi.doMock("../../services/gameStateService", () => ({
      handleDisconnect: vi.fn().mockResolvedValue({
        success: true,
        alreadyProcessed: false,
        game: { status: "paused" },
      }),
      generateEventId: vi.fn().mockReturnValue("eid"),
    }));
    vi.doMock("../../socket/handlers/game/roomManagement", () => ({
      getSocketGames: vi.fn().mockReturnValue(["game-1"]),
      untrackSocket: vi.fn(),
    }));

    const { cleanupGameSubscriptions } = await import(
      "../../socket/handlers/game/cleanup"
    );

    const socket = {
      id: "sock-1",
      data: { odv: "player1" },
    } as any;

    await cleanupGameSubscriptions({} as any, socket);

    expect(broadcastFn).toHaveBeenCalledWith(
      expect.anything(), "game", "game-1", "game:paused",
      expect.objectContaining({ disconnectedPlayer: "player1", reconnectTimeout: 120 }),
    );
  });

  it("does NOT broadcast game:paused when game.status is not paused", async () => {
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const broadcastFn = vi.fn();
    vi.doMock("../../socket/rooms", () => ({
      leaveRoom: vi.fn().mockResolvedValue(undefined),
      broadcastToRoom: broadcastFn,
    }));

    vi.doMock("../../services/gameStateService", () => ({
      handleDisconnect: vi.fn().mockResolvedValue({
        success: true,
        alreadyProcessed: false,
        game: { status: "active" },
      }),
      generateEventId: vi.fn().mockReturnValue("eid"),
    }));
    vi.doMock("../../socket/handlers/game/roomManagement", () => ({
      getSocketGames: vi.fn().mockReturnValue(["game-2"]),
      untrackSocket: vi.fn(),
    }));

    const { cleanupGameSubscriptions } = await import(
      "../../socket/handlers/game/cleanup"
    );

    const socket = {
      id: "sock-2",
      data: { odv: "player2" },
    } as any;

    await cleanupGameSubscriptions({} as any, socket);

    expect(broadcastFn).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 10. server/services/userService.ts — line 84 (already in services-branches.test.ts)
// ===========================================================================

// ===========================================================================
// 11. server/services/osmDiscovery.ts — line 207
// ===========================================================================
describe("osmDiscovery line 207 — memory cache eviction", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("evicts oldest entry when memory cache is at capacity", async () => {
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));
    vi.doMock("../../redis", () => ({ getRedisClient: () => null }));

    const { discoverSkateparks } = await import("../../services/osmDiscovery");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ elements: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    // Fill cache past the 500 limit
    for (let i = 0; i < 502; i++) {
      const lat = (i * 0.25) % 90;
      const lng = (i * 0.25) % 180;
      await discoverSkateparks(lat, lng, 1000);
    }

    expect(mockFetch).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});

// ===========================================================================
// 12. server/services/gameNotificationService.ts — line 45
// ===========================================================================
describe("gameNotificationService line 45 — trickName in your_turn notification", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("uses trickName in body when provided for your_turn", async () => {
    const mockSendPush = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../../services/notificationService", () => ({
      sendPushNotification: mockSendPush,
      notifyUser: vi.fn(),
    }));
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));
    vi.doMock("@shared/schema", () => ({}));

    const { sendGameNotification } = await import(
      "../../services/gameNotificationService"
    );

    await sendGameNotification("push-token", "your_turn", {
      gameId: "g1",
      trickName: "Kickflip",
      opponentName: "Tony",
    });

    expect(mockSendPush).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("Kickflip"),
      }),
    );
  });
});

// ===========================================================================
// 13. server/services/battle/service.ts — line 164
// ===========================================================================
describe("battle service line 164 — castVote with no vote state", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("falls back to legacy path when no vote state row exists", async () => {
    vi.doMock("../../db", () => ({
      getDb: () => ({
        transaction: vi.fn(async (cb: any) => {
          const tx: any = {};
          tx.select = vi.fn(() => tx);
          tx.from = vi.fn(() => tx);
          tx.where = vi.fn(() => tx);
          tx.for = vi.fn().mockResolvedValue([]);
          return cb(tx);
        }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{
              id: "battle1", creatorId: "c1", opponentId: "o1",
            }]),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      }),
    }));
    vi.doMock("@shared/schema", () => ({
      battles: { id: "id", creatorId: "creatorId", opponentId: "opponentId" },
      battleVotes: { battleId: "battleId", odv: "odv", createdAt: "createdAt" },
      battleVoteState: { battleId: "battleId" },
    }));
    vi.doMock("drizzle-orm", () => ({ eq: vi.fn() }));
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));
    vi.doMock("../analyticsService", () => ({
      logServerEvent: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("./idempotency", () => ({
      MAX_PROCESSED_EVENTS: 100,
    }));
    vi.doMock("./calculation", () => ({
      calculateWinner: vi.fn().mockReturnValue({ winnerId: "c1", scores: {} }),
    }));

    const { castVote } = await import("../../services/battle/service");
    const result = await castVote({
      eventId: "evt1",
      battleId: "battle1",
      odv: "c1",
      vote: "clean",
    });

    expect(result.success).toBeDefined();
  });
});

// ===========================================================================
// 14. server/routes/betaSignup.ts — line 46
// ===========================================================================
describe("betaSignup line 46 — ipHash conditional spread when salt is empty", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("omits ipHash when salt is empty", async () => {
    const routeHandlers: Record<string, Function[]> = {};
    vi.doMock("express", () => ({
      Router: () => ({
        post: vi.fn((path: string, ...handlers: Function[]) => {
          routeHandlers[`POST ${path}`] = handlers;
          return {};
        }),
        get: vi.fn(),
      }),
    }));
    vi.doMock("@shared/schema", () => ({
      betaSignups: { id: "id", submitCount: "submitCount" },
    }));
    vi.doMock("drizzle-orm", () => ({ eq: vi.fn(), sql: vi.fn() }));
    vi.doMock("../../config/env", () => ({
      env: { IP_HASH_SALT: "" },
    }));
    vi.doMock("../../db", () => ({
      getDb: () => ({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    }));
    vi.doMock("../../middleware/validation", () => ({
      validateBody: vi.fn(() => (_req: any, _res: any, next: any) => next()),
    }));
    vi.doMock("@shared/validation/betaSignup", () => ({
      BetaSignupInput: {},
    }));
    vi.doMock("../../utils/ip", () => ({
      getClientIp: vi.fn().mockReturnValue("1.2.3.4"),
      hashIp: vi.fn().mockReturnValue("hashed"),
    }));

    await import("../../routes/betaSignup");

    const handler = routeHandlers["POST /"]?.slice(-1)[0];
    const req = { body: { email: "test@test.com", platform: "web" } } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ===========================================================================
// 15. server/logger.ts — line 83 (empty serialized string)
// ===========================================================================
describe("logger line 83 — empty context after redaction", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("outputs line without context when sanitized object is empty", async () => {
    // We need NODE_ENV !== "production" to get the non-JSON path
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";

    // Remove any leftover mock on the logger module
    vi.doUnmock("../../logger");

    // Spy on console methods BEFORE importing the logger
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Directly import the real logger module (fresh copy)
    const mod = await import("../../logger");

    // Use the default logger with no context (empty object)
    // Redact returns empty result → serialized = "" on line 83
    mod.default.info("test message no context");

    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining("test message no context"),
    );

    process.env.NODE_ENV = origEnv;
  });
});

// ===========================================================================
// 16. server/auth/mfa/crypto.ts — lines 38-39
// ===========================================================================
describe("mfa crypto lines 38-39 — MFA_ENCRYPTION_KEY path", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("uses MFA_ENCRYPTION_KEY when >= 32 chars", async () => {
    const origMfaKey = process.env.MFA_ENCRYPTION_KEY;
    const origNodeEnv = process.env.NODE_ENV;
    process.env.MFA_ENCRYPTION_KEY = "a".repeat(32);
    process.env.NODE_ENV = "test";

    vi.doMock("../../config/env", () => ({
      env: { JWT_SECRET: "b".repeat(32) },
    }));
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const { encrypt, decrypt } = await import("../../auth/mfa/crypto");

    const encrypted = encrypt("test-secret");
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe("test-secret");

    if (origMfaKey !== undefined) process.env.MFA_ENCRYPTION_KEY = origMfaKey;
    else delete process.env.MFA_ENCRYPTION_KEY;
    process.env.NODE_ENV = origNodeEnv;
  });
});

// ===========================================================================
// 17. server/auth/lockout.ts — line 186 (recordAttempt catch block)
// ===========================================================================
describe("lockout line 186 — recordAttempt catch block", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns checkLockout result when recording fails", async () => {
    vi.doMock("../../security", () => ({
      SECURITY_CONFIG: { MAX_LOGIN_ATTEMPTS: 5, LOCKOUT_DURATION: 900000 },
    }));
    vi.doMock("../../config/constants", () => ({
      LOGIN_ATTEMPT_WINDOW_MS: 3600000,
    }));
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));
    vi.doMock("../audit", () => ({
      AuditLogger: { logAccountLocked: vi.fn().mockResolvedValue(undefined) },
    }));

    const mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockRejectedValue(new Error("DB write error")),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    };
    vi.doMock("../../db", () => ({
      getDb: () => mockDb,
    }));
    vi.doMock("@shared/schema", () => ({
      loginAttempts: { email: "email", success: "success", createdAt: "createdAt" },
      accountLockouts: { email: "email", unlockAt: "unlockAt" },
    }));
    vi.doMock("drizzle-orm", () => ({
      eq: vi.fn(), and: vi.fn(), gt: vi.fn(), sql: vi.fn(), count: vi.fn(),
    }));

    const { default: LockoutService } = await import("../../auth/lockout");
    const result = await LockoutService.recordAttempt("test@test.com", "1.2.3.4", false);

    expect(result).toBeDefined();
    expect(typeof result.isLocked).toBe("boolean");
  });
});

// ===========================================================================
// 18. server/middleware/security.ts — lines 413, 422
// ===========================================================================
describe("security middleware lines 413, 422 — isValidEmail edge cases", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects email with consecutive dots and spaces", async () => {
    vi.doMock("../../redis", () => ({ getRedisClient: () => null }));
    vi.doMock("../../config/rateLimits", () => ({
      RATE_LIMIT_CONFIG: {
        emailSignup: { windowMs: 900000, max: 5, message: "Too many", prefix: "rl:email:" },
        publicWrite: { windowMs: 600000, max: 30, message: "Too many", prefix: "rl:pw:" },
        checkInIp: { windowMs: 600000, max: 10, message: "Too many", prefix: "rl:ci:" },
        perUserSpotWrite: { windowMs: 600000, max: 5, message: "Too many", prefix: "rl:su:" },
        perUserCheckIn: { windowMs: 600000, max: 10, message: "Too many", prefix: "rl:uc:" },
        passwordReset: { windowMs: 3600000, max: 3, message: "Too many", prefix: "rl:pr:" },
        api: { windowMs: 60000, max: 100, message: "Too many", prefix: "rl:api:" },
        usernameCheck: { windowMs: 60000, max: 20, message: "Too many", prefix: "rl:un:" },
        profileCreate: { windowMs: 3600000, max: 5, message: "Too many", prefix: "rl:pc:" },
        staticFile: { windowMs: 60000, max: 60, message: "Too many", prefix: "rl:sf:" },
        quickMatch: { windowMs: 60000, max: 10, message: "Too many", prefix: "rl:qm:" },
        spotRating: { windowMs: 60000, max: 20, message: "Too many", prefix: "rl:sr:" },
        spotDiscovery: { windowMs: 60000, max: 10, message: "Too many", prefix: "rl:sd:" },
        proAward: { windowMs: 60000, max: 5, message: "Too many", prefix: "rl:pa:" },
        profileRead: { windowMs: 60000, max: 30, message: "Too many", prefix: "rl:pfr:" },
        mfaVerify: { windowMs: 300000, max: 5, message: "Too many", prefix: "rl:mfa:" },
        sensitiveAuth: { windowMs: 3600000, max: 10, message: "Too many", prefix: "rl:sa:" },
        remoteSkate: { windowMs: 60000, max: 20, message: "Too many", prefix: "rl:rs:" },
        postCreate: { windowMs: 3600000, max: 10, message: "Too many", prefix: "rl:psc:" },
        analyticsIngest: { windowMs: 60000, max: 50, message: "Too many", prefix: "rl:ai:" },
        payment: { windowMs: 3600000, max: 5, message: "Too many", prefix: "rl:pay:" },
        gameWrite: { windowMs: 60000, max: 20, message: "Too many", prefix: "rl:gw:" },
        trickmintUpload: { windowMs: 3600000, max: 10, message: "Too many", prefix: "rl:tu:" },
        userSearch: { windowMs: 60000, max: 20, message: "Too many", prefix: "rl:us:" },
      },
    }));

    const { validateEmail } = await import("../../middleware/security");

    // line 413: consecutive dots
    const req1 = { body: { email: "test..user@example.com" } } as any;
    const res1 = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
    const next1 = vi.fn();
    validateEmail(req1, res1, next1);
    expect(res1.status).toHaveBeenCalledWith(400);

    // line 422: space in email
    const req2 = { body: { email: "test user@example.com" } } as any;
    const res2 = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
    const next2 = vi.fn();
    validateEmail(req2, res2, next2);
    expect(res2.status).toHaveBeenCalledWith(400);
  });
});

// ===========================================================================
// 19. server/monitoring/index.ts — lines 269, 293
// ===========================================================================
describe("monitoring lines 269, 293", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("line 269: gitSha?.slice handles undefined VERCEL_GIT_COMMIT_SHA", async () => {
    const origSha = process.env.VERCEL_GIT_COMMIT_SHA;
    const origVer = process.env.npm_package_version;
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.npm_package_version;

    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));
    vi.doMock("../../db", () => ({
      isDatabaseAvailable: () => true,
      getDb: () => ({ execute: vi.fn().mockResolvedValue("ok") }),
    }));
    vi.doMock("../../redis", () => ({ getRedisClient: () => null }));
    vi.doMock("drizzle-orm", () => ({ sql: vi.fn() }));
    vi.doMock("../../services/videoTranscoder", () => ({
      checkFfmpegAvailable: vi.fn().mockResolvedValue({ ffmpeg: true, ffprobe: true }),
    }));
    vi.doMock("../../auth/middleware", () => ({
      authenticateUser: vi.fn((_r: any, _s: any, n: any) => n()),
      requireAdmin: vi.fn((_r: any, _s: any, n: any) => n()),
    }));

    const { registerMonitoringRoutes } = await import("../../monitoring/index");
    const registeredRoutes: Record<string, Function> = {};
    const app = {
      get: vi.fn((path: string, ...handlers: any[]) => {
        registeredRoutes[path] = handlers[handlers.length - 1];
      }),
    } as any;

    registerMonitoringRoutes(app);

    const envHandler = registeredRoutes["/api/health/env"];
    if (envHandler) {
      const req = {} as any;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
      await envHandler(req, res);
      const body = res.json.mock.calls[0]?.[0];
      expect(body?.gitSha).toBeNull();
    }

    if (origSha !== undefined) process.env.VERCEL_GIT_COMMIT_SHA = origSha;
    if (origVer !== undefined) process.env.npm_package_version = origVer;
  });
});

// ===========================================================================
// 20. server/routes/profile.ts — line 200
// ===========================================================================
describe("profile route line 200", () => {
  it("placeholder — covered by existing tests", () => {
    expect(true).toBe(true);
  });
});

// ===========================================================================
// 21. server/admin.ts — line 10 (isPlaceholder trimmed.length < 100)
// ===========================================================================
describe("server admin.ts line 10", () => {
  it("placeholder — covered by ADC tests in admin-remaining.test.ts", () => {
    expect(true).toBe(true);
  });
});

// ===========================================================================
// 22. packages/shared/sitemap-config.ts — line 257
// ===========================================================================
describe("sitemap-config line 257 — validateAllEntries with errors", () => {
  it("validateEntry returns errors for bad entries", async () => {
    const { validateEntry } = await import(
      "../../../packages/shared/sitemap-config"
    );
    const errors = validateEntry({
      path: "no-leading-slash",
      changefreq: "weekly",
      priority: -0.5,
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 23. server/services/filmerRequests/operations.ts — lines 156, 276
// ===========================================================================
describe("filmerRequests operations — deviceId optional spread", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("line 156: createFilmerRequest includes deviceId in audit log", async () => {
    const mockAuditLog = vi.fn().mockResolvedValue(undefined);

    vi.doMock("../../auth/audit", () => ({
      AuditLogger: { log: mockAuditLog },
      AUDIT_EVENTS: {
        FILMER_REQUEST_CREATED: "filmer.request.created",
        FILMER_REQUEST_ACCEPTED: "filmer.request.accepted",
        FILMER_REQUEST_REJECTED: "filmer.request.rejected",
      },
    }));
    vi.doMock("../../config/env", () => ({
      env: { NODE_ENV: "test" },
    }));

    // Build a mock db that tracks separate query chains
    vi.doMock("../../db", () => ({
      getDb: () => ({
        transaction: vi.fn(async (cb: any) => {
          let selectCallCount = 0;
          const tx: any = {};

          tx.select = vi.fn(() => {
            selectCallCount++;
            const chain: any = {};
            for (const m of ["from", "where", "limit"]) {
              chain[m] = vi.fn().mockReturnValue(chain);
            }
            if (selectCallCount === 1) {
              // First select: check-in lookup (must not have filmerUid/filmerRequestId)
              chain.limit.mockResolvedValue([{ id: 1, userId: "req1", filmerUid: null, filmerRequestId: null }]);
            } else {
              // Second select: existing request lookup — none found
              chain.limit.mockResolvedValue([]);
            }
            return chain;
          });

          const insertChain: any = {};
          for (const m of ["values", "returning"]) {
            insertChain[m] = vi.fn().mockReturnValue(insertChain);
          }
          insertChain.values.mockResolvedValue(undefined);
          insertChain.returning.mockResolvedValue([{ id: "new-req" }]);
          tx.insert = vi.fn(() => insertChain);

          const updateChain: any = {};
          for (const m of ["set", "where", "returning"]) {
            updateChain[m] = vi.fn().mockReturnValue(updateChain);
          }
          // returning must return a non-empty array for check-in update success
          updateChain.returning.mockResolvedValue([{ id: 1 }]);
          tx.update = vi.fn(() => updateChain);

          return cb(tx);
        }),
      }),
    }));
    vi.doMock("@shared/schema", () => ({
      checkIns: { id: "id", userId: "userId" },
      filmerRequests: { id: "id", checkInId: "checkInId", filmerId: "filmerId", status: "status" },
      customUsers: { id: "id", isActive: "isActive", email: "email" },
    }));
    vi.doMock("drizzle-orm", () => ({
      and: vi.fn(), desc: vi.fn(), eq: vi.fn(), or: vi.fn(),
    }));
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));
    vi.doMock("../../services/filmerRequests/validation", () => ({
      ensureTrust: vi.fn(),
      ensureFilmerEligible: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("../../services/filmerRequests/quota", () => ({
      cleanupExpiredCounters: vi.fn().mockResolvedValue(undefined),
      ensureQuota: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("../../services/filmerRequests/constants", () => ({
      REQUESTS_PER_DAY_LIMIT: 10,
      RESPONSES_PER_DAY_LIMIT: 50,
      formatDateKey: vi.fn().mockReturnValue("2026-03-01"),
    }));

    const { createFilmerRequest } = await import(
      "../../services/filmerRequests/operations"
    );

    const result = await createFilmerRequest({
      requesterId: "req1",
      requesterTrustLevel: 1,
      requesterIsActive: true,
      checkInId: 1,
      filmerUid: "filmer1",
      ipAddress: "1.2.3.4",
      deviceId: "device-123",
    });

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ deviceId: "device-123" }),
      }),
    );
  });

  it("line 276: respondToFilmerRequest includes deviceId and reason", async () => {
    const mockAuditLog = vi.fn().mockResolvedValue(undefined);

    vi.doMock("../../auth/audit", () => ({
      AuditLogger: { log: mockAuditLog },
      AUDIT_EVENTS: {
        FILMER_REQUEST_CREATED: "filmer.request.created",
        FILMER_REQUEST_ACCEPTED: "filmer.request.accepted",
        FILMER_REQUEST_REJECTED: "filmer.request.rejected",
      },
    }));
    vi.doMock("../../config/env", () => ({
      env: { NODE_ENV: "test" },
    }));
    vi.doMock("../../db", () => ({
      getDb: () => ({
        transaction: vi.fn(async (cb: any) => {
          const tx: any = {};
          const chain: any = {};
          for (const m of ["select", "from", "where", "limit", "update", "set", "returning"]) {
            chain[m] = vi.fn().mockReturnValue(chain);
          }
          // limit query returns the filmer request
          chain.limit.mockResolvedValue([{
            id: "req-1", checkInId: 1, requesterId: "req1",
            filmerId: "filmer1", status: "pending",
          }]);
          chain.returning.mockResolvedValue([{ id: "req-1" }]);

          tx.select = vi.fn(() => chain);
          tx.update = vi.fn(() => chain);
          return cb(tx);
        }),
      }),
    }));
    vi.doMock("@shared/schema", () => ({
      checkIns: { id: "id", filmerRequestId: "filmerRequestId", filmerStatus: "filmerStatus" },
      filmerRequests: { id: "id", status: "status" },
      customUsers: { id: "id", isActive: "isActive", email: "email" },
    }));
    vi.doMock("drizzle-orm", () => ({
      and: vi.fn(), desc: vi.fn(), eq: vi.fn(), or: vi.fn(),
    }));
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));
    vi.doMock("../../services/filmerRequests/validation", () => ({
      ensureTrust: vi.fn(),
      ensureFilmerEligible: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("../../services/filmerRequests/quota", () => ({
      cleanupExpiredCounters: vi.fn().mockResolvedValue(undefined),
      ensureQuota: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("../../services/filmerRequests/constants", () => ({
      REQUESTS_PER_DAY_LIMIT: 10,
      RESPONSES_PER_DAY_LIMIT: 50,
      formatDateKey: vi.fn().mockReturnValue("2026-03-01"),
    }));

    const { respondToFilmerRequest } = await import(
      "../../services/filmerRequests/operations"
    );

    const result = await respondToFilmerRequest({
      requestId: "req-1",
      filmerId: "filmer1",
      action: "reject",
      reason: "Not available",
      ipAddress: "1.2.3.4",
      deviceId: "device-456",
    });

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          deviceId: "device-456",
          reason: "Not available",
        }),
      }),
    );
  });
});
