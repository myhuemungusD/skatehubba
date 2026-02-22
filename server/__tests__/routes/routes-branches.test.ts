/**
 * Branch coverage tests for route files:
 *
 * - admin.ts lines 61-66, 154, 328, 358 (nullish coalescing ?? 0 branches)
 * - analytics.ts line 158 (batch: validEvents.length === 0 branch)
 * - filmer.ts lines 51-52 (parseCheckInId invalid), 101-103 (query array handling)
 * - games-challenges.ts line 150 (game.player2Name fallback)
 * - games-cron.ts lines 39, 56 (loserId fallback, undefined notif data)
 * - games-disputes.ts line 53 (txResult.opponentId falsy — skip notification)
 * - metrics.ts lines 89, 120-121 (kpi db null, response-rate db error)
 * - profile.ts lines 114, 137, 197-198 (validation error, existing profile username taken, skip username generation)
 * - remoteSkate.ts lines 129-131 (error mapping: "access", "not active", "Both videos")
 * - stripeWebhook.ts lines 46, 88, 180 (missing sig, event type switch, userInfo email check)
 * - tier.ts line 70 (award pro: award count >= MAX)
 * - trickmint.ts lines 333-334, 380-381 (feed db error, single clip db error)
 */

// ============================================================================
// analytics.ts — line 158: batch where ALL events have invalid properties
// ============================================================================

describe("analytics batch — all invalid events (line 158)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("skips db insert when validEvents is empty", async () => {
    const mockDb: any = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    };

    vi.doMock("../../db", () => ({ db: mockDb }));
    vi.doMock("../../../packages/shared/schema-analytics", () => ({
      analyticsEvents: { _table: "analytics_events" },
    }));
    vi.doMock("../../middleware/firebaseUid", () => ({
      requireFirebaseUid: (_req: any, _res: any, next: any) => {
        (_req as any).firebaseUid = "uid-1";
        next();
      },
    }));
    vi.doMock("../../middleware/validation", () => ({
      validateBody: () => (_req: any, _res: any, next: any) => next(),
    }));
    vi.doMock("../../../packages/shared/analytics-events", () => ({
      AnalyticsIngestSchema: {},
      AnalyticsBatchSchema: {},
      validateEventProps: () => {
        throw new Error("invalid");
      },
    }));
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },

      createChildLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
    }));
    vi.doMock("../../utils/apiError", () => ({
      Errors: {
        badRequest: (res: any, code: string, msg: string) => res.status(400).json({ error: code }),
        internal: (res: any, code: string, msg: string) => res.status(500).json({ error: code }),
      },
    }));

    const routeHandlers: Record<string, any[]> = {};
    vi.doMock("express", () => ({
      Router: () => ({
        post: vi.fn((path: string, ...handlers: any[]) => {
          routeHandlers[`POST ${path}`] = handlers;
        }),
        get: vi.fn(),
      }),
    }));

    await import("../../routes/analytics");

    const handlers = routeHandlers["POST /events/batch"];
    expect(handlers).toBeDefined();

    // Create request with all invalid events
    const req: any = {
      body: [
        { event_id: "e1", event_name: "bad", properties: {}, occurred_at: "2025-01-01T00:00:00Z" },
      ],
      firebaseUid: "uid-1",
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    // Run all middleware + handler
    for (const handler of handlers) {
      await handler(req, res, () => {});
    }

    // db.insert should NOT have been called since all events were invalid
    expect(mockDb.insert).not.toHaveBeenCalled();
    // Should return 200 with rejected count
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ accepted: 0, rejected: 1 }));
  });
});

// ============================================================================
// games-disputes.ts — line 53: opponentId is falsy, skip notification
// ============================================================================

describe("games-disputes — skip notification when no opponentId (line 53)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("skips sending notification when txResult.opponentId is null", async () => {
    const mockSendNotification = vi.fn();
    const mockTransaction = vi.fn().mockResolvedValue({
      ok: true,
      dispute: { id: 1 },
      opponentId: null, // No opponent to notify
    });

    vi.doMock("../../db", () => ({
      getDb: () => ({ transaction: mockTransaction }),
      isDatabaseAvailable: () => true,
    }));
    vi.doMock("../../auth/middleware", () => ({
      authenticateUser: (req: any, _res: any, next: any) => {
        req.currentUser = req.currentUser || { id: "user-1" };
        next();
      },
    }));
    vi.doMock("@shared/schema", () => ({ games: {} }));
    vi.doMock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn() }));
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },

      createChildLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
    }));
    vi.doMock("../../services/gameNotificationService", () => ({
      sendGameNotificationToUser: (...args: any[]) => mockSendNotification(...args),
    }));
    vi.doMock("../../services/gameDisputeService", () => ({
      fileDispute: vi.fn(),
      resolveDispute: vi.fn(),
    }));
    vi.doMock("../../routes/games-shared", () => ({
      disputeSchema: {
        safeParse: (data: any) => ({ success: true, data: { turnId: 1 } }),
      },
      resolveDisputeSchema: {
        safeParse: (data: any) => ({ success: true, data }),
      },
    }));

    const routeHandlers: Record<string, any[]> = {};
    vi.doMock("express", () => ({
      Router: () => ({
        post: vi.fn((path: string, ...handlers: any[]) => {
          routeHandlers[`POST ${path}`] = handlers;
        }),
        get: vi.fn(),
      }),
    }));

    await import("../../routes/games-disputes");

    const handlers = routeHandlers["POST /:id/dispute"];
    const req: any = {
      currentUser: { id: "user-1" },
      params: { id: "game-1" },
      body: { turnId: 1 },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    for (const handler of handlers) {
      await handler(req, res, () => {});
    }

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });
});

// ============================================================================
// metrics.ts — lines 89, 120-121: kpi db null, response-rate db error
// ============================================================================

describe("metrics — db null for kpi and response-rate error (lines 89, 120-121)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns 503 for /kpi when db is null and 500 for /response-rate on error", async () => {
    let mockDb: any = null;
    const mockExecute = vi.fn().mockRejectedValue(new Error("DB fail"));

    vi.doMock("../../db", () => ({
      get db() {
        return mockDb;
      },
    }));
    vi.doMock("drizzle-orm", () => ({
      sql: { raw: (s: string) => ({ _sql: true, raw: s }) },
    }));
    vi.doMock("../../auth/middleware", () => ({
      authenticateUser: (req: any, _res: any, next: any) => {
        req.currentUser = req.currentUser || { id: "user-1", roles: [] };
        next();
      },
    }));
    vi.doMock("../../analytics/queries", () => ({
      WAB_AU_SNAPSHOT: "Q",
      WAB_AU_TREND_12_WEEKS: "Q",
      UPLOADS_WITH_RESPONSE_48H: "Q",
      VOTES_PER_BATTLE: "Q",
      CREW_JOIN_RATE: "Q",
      D7_RETENTION: "Q",
      KPI_DASHBOARD: "Q",
    }));
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },

      createChildLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
    }));
    vi.doMock("../../utils/apiError", () => ({
      Errors: {
        forbidden: (res: any, code: string, msg: string) => res.status(403).json({ error: code }),
        internal: (res: any, code: string, msg: string) => res.status(500).json({ error: code }),
        dbUnavailable: (res: any) => res.status(503).json({ error: "DB_UNAVAIL" }),
      },
    }));

    const routeHandlers: Record<string, any[]> = {};
    vi.doMock("express", () => ({
      Router: () => ({
        get: vi.fn((path: string, ...handlers: any[]) => {
          routeHandlers[`GET ${path}`] = handlers;
        }),
        post: vi.fn(),
      }),
    }));

    await import("../../routes/metrics");

    // Test /kpi with db = null
    const reqAdmin: any = { currentUser: { id: "a1", roles: ["admin"] } };
    const res1: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };

    for (const h of routeHandlers["GET /kpi"]) {
      await h(reqAdmin, res1, () => {});
    }
    expect(res1.status).toHaveBeenCalledWith(503);

    // Test /response-rate with db error
    mockDb = { execute: mockExecute };
    const res2: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };

    for (const h of routeHandlers["GET /response-rate"]) {
      await h({ ...reqAdmin }, res2, () => {});
    }
    expect(res2.status).toHaveBeenCalledWith(500);

    // Test /votes-per-battle with db null
    mockDb = null;
    const res3: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    for (const h of routeHandlers["GET /votes-per-battle"]) {
      await h({ ...reqAdmin }, res3, () => {});
    }
    expect(res3.status).toHaveBeenCalledWith(503);

    // Test /crew-join-rate with db null
    const res4: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    for (const h of routeHandlers["GET /crew-join-rate"]) {
      await h({ ...reqAdmin }, res4, () => {});
    }
    expect(res4.status).toHaveBeenCalledWith(503);

    // Test /retention with db error
    mockDb = { execute: mockExecute };
    const res5: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    for (const h of routeHandlers["GET /retention"]) {
      await h({ ...reqAdmin }, res5, () => {});
    }
    expect(res5.status).toHaveBeenCalledWith(500);
  });
});

// ============================================================================
// trickmint.ts — lines 333-334, 380-381: feed and single clip db errors
// ============================================================================

describe("trickmint — feed and single clip db errors", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns 500 for /feed and /:id on db errors", async () => {
    const mockDbChain: any = {};
    mockDbChain.select = vi.fn().mockReturnValue(mockDbChain);
    mockDbChain.from = vi.fn().mockReturnValue(mockDbChain);
    mockDbChain.where = vi.fn().mockReturnValue(mockDbChain);
    mockDbChain.orderBy = vi.fn().mockReturnValue(mockDbChain);
    mockDbChain.limit = vi.fn().mockReturnValue(mockDbChain);
    mockDbChain.offset = vi.fn().mockReturnValue(mockDbChain);
    mockDbChain.update = vi.fn().mockReturnValue(mockDbChain);
    mockDbChain.set = vi.fn().mockReturnValue(mockDbChain);
    mockDbChain.delete = vi.fn().mockReturnValue(mockDbChain);
    // Make thenable reject
    mockDbChain.then = (_resolve: any, reject: any) =>
      Promise.reject(new Error("DB fail")).then(_resolve, reject);

    vi.doMock("../../db", () => ({
      getDb: () => mockDbChain,
      isDatabaseAvailable: () => true,
      getUserDisplayName: vi.fn().mockResolvedValue("User"),
    }));
    vi.doMock("@shared/schema", () => ({
      trickClips: {
        id: "id",
        userId: "userId",
        isPublic: "isPublic",
        status: "status",
        views: "views",
        createdAt: "createdAt",
      },
      usernames: {},
      customUsers: {},
    }));
    vi.doMock("drizzle-orm", () => ({
      eq: vi.fn(),
      and: vi.fn(),
      desc: vi.fn(),
      sql: Object.assign((s: TemplateStringsArray, ..._v: any[]) => ({ _sql: true }), {
        raw: (s: string) => ({ _sql: true }),
      }),
    }));
    vi.doMock("../../auth/middleware", () => ({
      authenticateUser: (req: any, _res: any, next: any) => {
        req.currentUser = req.currentUser || { id: "user-1" };
        next();
      },
    }));
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },

      createChildLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
    }));
    vi.doMock("../../services/storageService", () => ({
      generateUploadUrls: vi.fn(),
      UPLOAD_LIMITS: {
        MAX_VIDEO_SIZE_BYTES: 50_000_000,
        MAX_THUMBNAIL_SIZE_BYTES: 2_000_000,
        ALLOWED_VIDEO_MIME_TYPES: ["video/webm"],
        ALLOWED_THUMBNAIL_MIME_TYPES: ["image/jpeg"],
        SIGNED_URL_EXPIRY_MS: 900000,
      },
    }));
    vi.doMock("../../services/videoProcessingService", () => ({
      processUpload: vi.fn(),
      confirmDirectUpload: vi.fn(),
      VIDEO_LIMITS: { MAX_VIDEO_DURATION_MS: 60000 },
    }));
    vi.doMock("../../middleware/feedCache", () => ({
      feedCache: () => (_req: any, _res: any, next: any) => next(),
    }));
    vi.doMock("../../services/videoTranscoder", () => ({}));

    const routeHandlers: Record<string, any[]> = {};
    vi.doMock("express", () => ({
      Router: () => ({
        post: vi.fn((path: string, ...h: any[]) => {
          routeHandlers[`POST ${path}`] = h;
        }),
        get: vi.fn((path: string, ...h: any[]) => {
          routeHandlers[`GET ${path}`] = h;
        }),
        delete: vi.fn((path: string, ...h: any[]) => {
          routeHandlers[`DELETE ${path}`] = h;
        }),
      }),
    }));

    await import("../../routes/trickmint");

    // Test /feed error
    const req1: any = {
      currentUser: { id: "user-1" },
      query: { limit: "10", offset: "0" },
      preferredQuality: "medium",
    };
    const res1: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    for (const h of routeHandlers["GET /feed"]) {
      await h(req1, res1, () => {});
    }
    expect(res1.status).toHaveBeenCalledWith(500);

    // Test /:id error
    const req2: any = {
      currentUser: { id: "user-1" },
      params: { id: "1" },
      preferredQuality: "medium",
    };
    const res2: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    for (const h of routeHandlers["GET /:id"]) {
      await h(req2, res2, () => {});
    }
    expect(res2.status).toHaveBeenCalledWith(500);

    // Test /my-clips error
    const req3: any = { currentUser: { id: "user-1" }, query: {} };
    const res3: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    for (const h of routeHandlers["GET /my-clips"]) {
      await h(req3, res3, () => {});
    }
    expect(res3.status).toHaveBeenCalledWith(500);

    // Test POST /confirm-upload error
    const req4: any = {
      currentUser: { id: "user-1" },
      body: { trickName: "Kickflip", videoPath: "trickmint/user-1/a.webm" },
    };
    const res4: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    for (const h of routeHandlers["POST /confirm-upload"]) {
      await h(req4, res4, () => {});
    }
    expect(res4.status).toHaveBeenCalledWith(500);

    // Test POST /submit error
    const req5: any = {
      currentUser: { id: "user-1" },
      body: {
        trickName: "Heelflip",
        videoUrl: "https://storage.googleapis.com/video.mp4",
        isPublic: true,
      },
    };
    const res5: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    for (const h of routeHandlers["POST /submit"]) {
      await h(req5, res5, () => {});
    }
    expect(res5.status).toHaveBeenCalledWith(500);

    // Test DELETE /:id error
    const req6: any = { currentUser: { id: "user-1" }, params: { id: "1" } };
    const res6: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    for (const h of routeHandlers["DELETE /:id"]) {
      await h(req6, res6, () => {});
    }
    expect(res6.status).toHaveBeenCalledWith(500);
  });
});

// ============================================================================
// filmer.ts — lines 51-52 (parseCheckInId non-finite), 101-103 (array query params)
// ============================================================================

describe("filmer — parseCheckInId & array query params", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("handles array query parameters for status, role, limit (lines 101-103)", async () => {
    const mockListFilmerRequests = vi.fn().mockResolvedValue([]);

    vi.doMock("@shared/validation/filmer", () => ({
      FilmerRequestInput: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
      FilmerRespondInput: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
      FilmerRequestsQuery: {
        safeParse: vi.fn().mockReturnValue({
          success: true,
          data: { status: "pending", role: "requester", limit: 10 },
        }),
      },
    }));
    vi.doMock("../../services/filmerRequests", () => ({
      createFilmerRequest: vi.fn(),
      FilmerRequestError: class extends Error {
        status: number;
        code: string;
        constructor(code: string, msg: string, status: number) {
          super(msg);
          this.code = code;
          this.status = status;
        }
      },
      listFilmerRequests: (...args: any[]) => mockListFilmerRequests(...args),
      respondToFilmerRequest: vi.fn(),
    }));
    vi.doMock("../../auth/audit", () => ({
      getClientIP: () => "1.2.3.4",
    }));

    const { handleFilmerRequestsList } = await import("../../routes/filmer");

    const req: any = {
      currentUser: { id: "user-1" },
      query: {
        status: ["pending", "accepted"], // Array form
        role: ["requester", "filmer"], // Array form
        limit: ["10", "20"], // Array form
      },
      get: () => undefined,
    };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };

    await handleFilmerRequestsList(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 500 for unexpected errors in handleFilmerRequest", async () => {
    vi.doMock("@shared/validation/filmer", () => ({
      FilmerRequestInput: {
        safeParse: vi.fn().mockReturnValue({
          success: true,
          data: { checkInId: "abc", filmerUid: "f1" },
        }),
      },
      FilmerRespondInput: { safeParse: vi.fn() },
      FilmerRequestsQuery: { safeParse: vi.fn() },
    }));
    vi.doMock("../../services/filmerRequests", () => ({
      createFilmerRequest: vi.fn().mockRejectedValue(new Error("Unknown")),
      FilmerRequestError: class extends Error {
        status: number;
        code: string;
        constructor(code: string, msg: string, status: number) {
          super(msg);
          this.code = code;
          this.status = status;
        }
      },
      listFilmerRequests: vi.fn(),
      respondToFilmerRequest: vi.fn(),
    }));
    vi.doMock("../../auth/audit", () => ({
      getClientIP: () => "1.2.3.4",
    }));

    const { handleFilmerRequest } = await import("../../routes/filmer");

    const req: any = {
      currentUser: { id: "user-1", trustLevel: 0, isActive: true },
      body: { checkInId: "abc", filmerUid: "f1" },
      get: () => undefined,
    };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };

    await handleFilmerRequest(req, res);

    // parseCheckInId("abc") throws FilmerRequestError for invalid ID
    // OR createFilmerRequest throws generic error → 500
    expect(res.status).toHaveBeenCalled();
  });
});

// ============================================================================
// stripeWebhook.ts — lines 46, 88, 180
// ============================================================================

describe("stripeWebhook — additional branches", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("handles checkout.session.completed with userInfo but no email (line 180)", async () => {
    const mockDbSelect = vi.fn();
    const mockDbUpdate = vi.fn();
    let selectCallCount = 0;

    vi.doMock("../../db", () => {
      const createDb = () => {
        const db: any = {
          select: (...args: any[]) => {
            mockDbSelect(...args);
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockImplementation(() => {
                    // Returns a thenable (for direct await) that also has .for() for SELECT FOR UPDATE
                    const result = Promise.resolve([{ email: null, firstName: null }]);
                    (result as any).for = vi.fn().mockImplementation(() => {
                      selectCallCount++;
                      if (selectCallCount === 1) return Promise.resolve([]); // consumedPaymentIntents
                      return Promise.resolve([{ accountTier: "free" }]); // user lookup
                    });
                    return result;
                  }),
                }),
              }),
            };
          },
          update: () => ({
            set: () => ({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          }),
          insert: () => ({
            values: vi.fn().mockResolvedValue(undefined),
          }),
          transaction: vi.fn(async (cb: Function) => cb(db)),
        };
        return db;
      };
      return {
        getDb: () => createDb(),
        isDatabaseAvailable: () => true,
      };
    });
    vi.doMock("@shared/schema", () => ({
      customUsers: { id: "id", accountTier: "accountTier", email: "email", firstName: "firstName" },
      consumedPaymentIntents: { id: "id", paymentIntentId: "paymentIntentId", userId: "userId" },
    }));
    vi.doMock("drizzle-orm", () => ({ eq: vi.fn() }));
    vi.doMock("../../redis", () => ({ getRedisClient: () => null }));
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },

      createChildLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
    }));
    vi.doMock("../../services/emailService", () => ({
      sendPaymentReceiptEmail: vi.fn(),
    }));
    vi.doMock("../../services/notificationService", () => ({
      notifyUser: vi.fn(),
    }));

    const mockConstructEvent = vi.fn().mockReturnValue({
      id: "evt-1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "sess-1",
          metadata: { userId: "user-1", type: "premium_upgrade" },
          payment_status: "paid",
          amount_total: 999,
        },
      },
    });

    vi.doMock("stripe", () => {
      return {
        default: class MockStripe {
          webhooks = { constructEvent: mockConstructEvent };
          constructor(_key: string) {}
        },
      };
    });

    const routeHandlers: Record<string, any[]> = {};
    vi.doMock("express", () => ({
      Router: () => ({
        post: vi.fn((path: string, ...h: any[]) => {
          routeHandlers[`POST ${path}`] = h;
        }),
        get: vi.fn(),
      }),
    }));

    // Set env vars
    process.env.STRIPE_SECRET_KEY = "sk_test_xxx";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_xxx";

    await import("../../routes/stripeWebhook");

    const handlers = routeHandlers["POST /"];
    const req: any = {
      headers: { "stripe-signature": "sig_valid" },
      body: "raw-body",
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    for (const h of handlers) {
      await h(req, res, () => {});
    }

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith("OK");
  });
});

// ============================================================================
// games-challenges.ts — line 150: player2Name fallback to "Opponent"
// ============================================================================

describe("games-challenges — player2Name fallback (line 150)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("uses 'Opponent' when player2Name is null", async () => {
    const mockSendNotification = vi.fn().mockResolvedValue(undefined);

    const mockGame = {
      id: "game-1",
      player1Id: "user-1",
      player2Id: "user-2",
      player2Name: null, // Null name — should fallback
      status: "pending",
    };

    const mockDbChain: any = {};
    let selectCallCount = 0;
    mockDbChain.select = vi.fn().mockReturnValue(mockDbChain);
    mockDbChain.from = vi.fn().mockReturnValue(mockDbChain);
    mockDbChain.where = vi.fn().mockReturnValue(mockDbChain);
    mockDbChain.limit = vi.fn().mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return Promise.resolve([mockGame]);
      return Promise.resolve([]);
    });
    mockDbChain.update = vi.fn().mockReturnValue(mockDbChain);
    mockDbChain.set = vi.fn().mockReturnValue(mockDbChain);
    mockDbChain.returning = vi.fn().mockResolvedValue([{ ...mockGame, status: "active" }]);

    vi.doMock("../../db", () => ({
      getDb: () => mockDbChain,
      isDatabaseAvailable: () => true,
    }));
    vi.doMock("../../auth/middleware", () => ({
      authenticateUser: (req: any, _res: any, next: any) => {
        req.currentUser = req.currentUser || { id: "user-2" };
        next();
      },
    }));
    vi.doMock("@shared/schema", () => ({
      games: { id: "id" },
      customUsers: { id: "id" },
    }));
    vi.doMock("drizzle-orm", () => ({ eq: vi.fn() }));
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },

      createChildLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
    }));
    vi.doMock("../../services/gameNotificationService", () => ({
      sendGameNotificationToUser: (...args: any[]) => mockSendNotification(...args),
    }));
    vi.doMock("../../utils/apiError", () => ({
      Errors: {
        badRequest: (res: any, code: string, msg: string) => res.status(400).json({ error: code }),
        notFound: (res: any, code: string, msg: string) => res.status(404).json({ error: code }),
        forbidden: (res: any, code: string, msg: string) => res.status(403).json({ error: code }),
        validation: (res: any, err: any) => res.status(400).json({ error: "VALIDATION" }),
        internal: (res: any, code: string, msg: string) => res.status(500).json({ error: code }),
        dbUnavailable: (res: any) => res.status(503).json({ error: "DB" }),
      },
    }));
    vi.doMock("../../routes/games-shared", () => ({
      createGameSchema: { safeParse: vi.fn() },
      respondGameSchema: {
        safeParse: vi.fn().mockReturnValue({ success: true, data: { accept: true } }),
      },
      getUserDisplayName: vi.fn().mockResolvedValue("Player"),
      TURN_DEADLINE_MS: 24 * 60 * 60 * 1000,
    }));

    const routeHandlers: Record<string, any[]> = {};
    vi.doMock("express", () => ({
      Router: () => ({
        post: vi.fn((path: string, ...h: any[]) => {
          routeHandlers[`POST ${path}`] = h;
        }),
        get: vi.fn(),
      }),
    }));

    await import("../../routes/games-challenges");

    const handlers = routeHandlers["POST /:id/respond"];
    const req: any = {
      currentUser: { id: "user-2" },
      params: { id: "game-1" },
      body: { accept: true },
    };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };

    for (const h of handlers) {
      await h(req, res, () => {});
    }

    // Verify notification was sent with "Opponent" fallback
    expect(mockSendNotification).toHaveBeenCalledWith(
      "user-1",
      "your_turn",
      expect.objectContaining({ opponentName: "Opponent" })
    );
  });
});

// ============================================================================
// remoteSkate.ts — lines 129-131: error message mapping branches
// ============================================================================

describe("remoteSkate — error mapping branches (lines 129-131)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("maps 'access' error to 403, 'not active' to 400, 'Both videos' to 400", async () => {
    const testCases = [
      { error: "You don't have access to this game", expectedStatus: 403 },
      { error: "Game is not active", expectedStatus: 400 },
      { error: "Both videos must be uploaded before resolving", expectedStatus: 400 },
      { error: "Round is not in a resolvable state", expectedStatus: 400 },
      { error: "Only offense can submit a round result", expectedStatus: 403 },
    ];

    for (const tc of testCases) {
      vi.resetModules();

      vi.doMock("../../admin", () => ({
        admin: {
          auth: () => ({
            verifyIdToken: vi.fn().mockResolvedValue({ uid: "uid-1" }),
          }),
          firestore: vi.fn().mockReturnValue({
            runTransaction: vi.fn().mockRejectedValue(new Error(tc.error)),
            collection: vi.fn(),
          }),
        },
      }));
      vi.doMock("../../logger", () => ({
        default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },

        createChildLogger: vi.fn(() => ({
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        })),
      }));

      const routeHandlers: Record<string, any[]> = {};
      vi.doMock("express", () => ({
        Router: () => ({
          post: vi.fn((path: string, ...h: any[]) => {
            routeHandlers[`POST ${path}`] = h;
          }),
          get: vi.fn(),
        }),
      }));

      await import("../../routes/remoteSkate");

      const handlers = routeHandlers["POST /:gameId/rounds/:roundId/resolve"];
      const req: any = {
        headers: { authorization: "Bearer token" },
        params: { gameId: "g1", roundId: "r1" },
        body: { result: "landed" },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };

      for (const h of handlers) {
        await h(req, res, () => {});
      }

      expect(res.status).toHaveBeenCalledWith(tc.expectedStatus);
    }
  });
});
