import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Hoisted mock state (available inside vi.mock factories)
// ============================================================================

const mocks = vi.hoisted(() => {
  const transaction = {
    get: vi.fn(),
    update: vi.fn(),
    set: vi.fn(),
  };

  const runTransaction = vi.fn(async (fn: any) => fn(transaction));

  const docRef: Record<string, any> = {
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({ exists: false, data: () => ({}), get: () => null }),
    update: vi.fn().mockResolvedValue(undefined),
  };

  const collectionRef: Record<string, any> = {
    add: vi.fn().mockResolvedValue({ id: "audit-log-id" }),
    doc: vi.fn().mockReturnValue(docRef),
    where: vi.fn(),
    get: vi.fn().mockResolvedValue({ docs: [] }),
  };
  collectionRef.where.mockReturnValue(collectionRef);

  const firestoreInstance = {
    collection: vi.fn().mockReturnValue(collectionRef),
    doc: vi.fn().mockReturnValue(docRef),
    runTransaction,
  };

  const authInstance = {
    getUser: vi.fn(),
    setCustomUserClaims: vi.fn().mockResolvedValue(undefined),
  };

  const messagingInstance = {
    send: vi.fn().mockResolvedValue("message-id"),
  };

  const bucketFile = {
    download: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getSignedUrl: vi.fn().mockResolvedValue(["https://storage.example.com/signed?token=abc"]),
  };

  const bucket = {
    file: vi.fn().mockReturnValue(bucketFile),
  };

  const storageInstance = {
    bucket: vi.fn().mockReturnValue(bucket),
  };

  const ffprobeFn = vi.fn();

  const logger = {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  return {
    transaction,
    runTransaction,
    collectionRef,
    docRef,
    firestoreInstance,
    authInstance,
    messagingInstance,
    bucketFile,
    bucket,
    storageInstance,
    ffprobeFn,
    logger,
  };
});

// ============================================================================
// Module mocks (hoisted above imports by vitest)
// ============================================================================

vi.mock("firebase-functions", () => ({
  https: {
    HttpsError: class HttpsError extends Error {
      code: string;
      constructor(code: string, message: string) {
        super(message);
        this.code = code;
      }
    },
    onCall: vi.fn((handler: any) => handler),
  },
  config: () => ({}),
  logger: mocks.logger,
  storage: {
    object: () => ({
      onFinalize: vi.fn((handler: any) => handler),
    }),
  },
}));

vi.mock("firebase-functions/v2/scheduler", () => ({
  onSchedule: vi.fn((_schedule: string, handler: any) => handler),
}));

vi.mock("firebase-admin", () => {
  const firestoreFn = Object.assign(
    vi.fn(() => mocks.firestoreInstance),
    {
      FieldValue: {
        serverTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
        arrayUnion: vi.fn((...args: any[]) => args),
      },
      Timestamp: {
        fromDate: vi.fn((date: Date) => ({ toMillis: () => date.getTime() })),
        now: vi.fn(() => ({ toMillis: () => Date.now() })),
      },
    }
  );

  const mod = {
    apps: [{ name: "mock" }],
    initializeApp: vi.fn(),
    auth: vi.fn(() => mocks.authInstance),
    firestore: firestoreFn,
    storage: vi.fn(() => mocks.storageInstance),
    messaging: vi.fn(() => mocks.messagingInstance),
  };

  return { ...mod, default: mod };
});

vi.mock("@ffprobe-installer/ffprobe", () => ({
  default: { path: "/mock/ffprobe" },
}));

vi.mock("fluent-ffmpeg", () => ({
  default: Object.assign(vi.fn(), {
    setFfprobePath: vi.fn(),
    ffprobe: mocks.ffprobeFn,
  }),
}));

// Mock shared modules to isolate unit tests from cross-cutting concerns.
// The Firestore-based rate limiter would otherwise consume transaction mock
// state that game function tests rely on.
vi.mock("./shared/rateLimiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
}));

// Mock commerce modules re-exported by index.ts to avoid Express/Stripe side-effects
vi.mock("./commerce/holdAndCreateIntent", () => ({
  holdAndCreatePaymentIntent: vi.fn(),
}));

vi.mock("./commerce/stripeWebhook", () => ({
  stripeWebhook: vi.fn(),
}));

vi.mock("./commerce/expireHolds", () => ({
  expireHolds: vi.fn(),
}));

// ============================================================================
// Import the module under test (AFTER all vi.mock calls)
// ============================================================================

import {
  manageUserRole,
  getUserRoles,
  submitTrick,
  judgeTrick,
  getVideoUrl,
  validateChallengeVideo,
  processVoteTimeouts,
} from "./index";

import * as functions from "firebase-functions";

const mockLogger = functions.logger as unknown as {
  log: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
};

// ============================================================================
// Test helpers
// ============================================================================

function makeContext(
  overrides: {
    uid?: string;
    roles?: string[];
    email?: string;
    app?: boolean;
  } = {}
): any {
  const { uid = "caller-uid", roles = [], email = "caller@test.com", app = true } = overrides;
  return {
    auth: uid ? { uid, token: { roles, email } } : null,
    app: app ? { appId: "test-app" } : undefined,
  };
}

function noAuthContext(): any {
  return { auth: null, app: undefined };
}

/** Unique UID generator to avoid rate-limit cross-pollution between tests */
let uidCounter = 0;
function freshUid(prefix = "u") {
  return `${prefix}-${Date.now()}-${uidCounter++}`;
}

// ============================================================================
// Tests
// ============================================================================

describe("SkateHubba Cloud Functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Restore default chainable mocks that clearAllMocks resets
    mocks.collectionRef.where.mockReturnValue(mocks.collectionRef);
    mocks.collectionRef.doc.mockReturnValue(mocks.docRef);
    mocks.collectionRef.get.mockResolvedValue({ docs: [] });
    mocks.firestoreInstance.collection.mockReturnValue(mocks.collectionRef);
    mocks.firestoreInstance.doc.mockReturnValue(mocks.docRef);
    mocks.runTransaction.mockImplementation(async (fn: any) => fn(mocks.transaction));
    mocks.bucket.file.mockReturnValue(mocks.bucketFile);
    mocks.storageInstance.bucket.mockReturnValue(mocks.bucket);
    mocks.docRef.get.mockResolvedValue({ exists: false, data: () => ({}), get: () => null });
    mocks.docRef.set.mockResolvedValue(undefined);
    mocks.docRef.update.mockResolvedValue(undefined);
    mocks.collectionRef.add.mockResolvedValue({ id: "log-id" });
    mocks.authInstance.setCustomUserClaims.mockResolvedValue(undefined);
    mocks.bucketFile.download.mockResolvedValue(undefined);
    mocks.bucketFile.delete.mockResolvedValue(undefined);
    mocks.bucketFile.getSignedUrl.mockResolvedValue([
      "https://storage.example.com/signed?token=abc",
    ]);
    mocks.messagingInstance.send.mockResolvedValue("msg-id");
  });

  // ==========================================================================
  // maskEmail  (internal, tested via getUserRoles which returns masked email)
  // ==========================================================================

  describe("maskEmail (via getUserRoles)", () => {
    const adminCtx = () => makeContext({ uid: freshUid("mask"), roles: ["admin"] });

    it("masks a normal email: j***@gmail.com", async () => {
      mocks.authInstance.getUser.mockResolvedValue({
        email: "john.doe@gmail.com",
        customClaims: { roles: [] },
      });
      const res = await (getUserRoles as any)({ targetUid: "t1" }, adminCtx());
      expect(res.email).toBe("j***@gmail.com");
    });

    it("masks a single-char local part: a***@b.com", async () => {
      mocks.authInstance.getUser.mockResolvedValue({
        email: "a@b.com",
        customClaims: { roles: [] },
      });
      const res = await (getUserRoles as any)({ targetUid: "t2" }, adminCtx());
      expect(res.email).toBe("a***@b.com");
    });

    it("returns *** for undefined email", async () => {
      mocks.authInstance.getUser.mockResolvedValue({
        email: undefined,
        customClaims: { roles: [] },
      });
      const res = await (getUserRoles as any)({ targetUid: "t3" }, adminCtx());
      expect(res.email).toBe("***");
    });

    it("returns *** for email without @ sign", async () => {
      mocks.authInstance.getUser.mockResolvedValue({
        email: "noatsign",
        customClaims: { roles: [] },
      });
      const res = await (getUserRoles as any)({ targetUid: "t4" }, adminCtx());
      expect(res.email).toBe("***");
    });
  });

  // ==========================================================================
  // checkRateLimit  (Firestore-based, tested via mock integration)
  // Rate limiter has its own unit tests in shared/__tests__/rateLimiter.test.ts
  // ==========================================================================

  describe("checkRateLimit (via manageUserRole)", () => {
    function setupSuccessfulRoleChange() {
      mocks.authInstance.getUser.mockResolvedValue({
        email: "target@test.com",
        customClaims: { roles: [] },
      });
    }

    it("allows up to 10 requests per window", async () => {
      setupSuccessfulRoleChange();
      const uid = freshUid("rl-ok");
      const ctx = makeContext({ uid, roles: ["admin"] });
      const data = { targetUid: "tgt", role: "moderator", action: "grant" };

      for (let i = 0; i < 10; i++) {
        await expect((manageUserRole as any)(data, ctx)).resolves.toBeDefined();
      }
    });

    it("throws resource-exhausted when rate limiter rejects", async () => {
      setupSuccessfulRoleChange();

      // Temporarily make the rate limiter mock reject
      const { checkRateLimit: mockRateLimit } = await import("./shared/rateLimiter");
      (mockRateLimit as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new (functions.https.HttpsError as any)(
          "resource-exhausted",
          "Too many requests. Please try again later."
        )
      );

      const uid = freshUid("rl-exceed");
      const ctx = makeContext({ uid, roles: ["admin"] });
      const data = { targetUid: "tgt", role: "moderator", action: "grant" };

      await expect((manageUserRole as any)(data, ctx)).rejects.toThrow("Too many requests");
    });
  });

  // ==========================================================================
  // verifyAppCheck  (internal, tested via manageUserRole)
  // ==========================================================================

  describe("verifyAppCheck (via manageUserRole)", () => {
    function setupSuccessfulRoleChange() {
      mocks.authInstance.getUser.mockResolvedValue({
        email: "t@t.com",
        customClaims: { roles: [] },
      });
    }

    it("logs warning when App Check token is missing", async () => {
      setupSuccessfulRoleChange();
      const uid = freshUid("ac-warn");
      const ctx = makeContext({ uid, roles: ["admin"], app: false });
      await (manageUserRole as any)({ targetUid: "tgt", role: "moderator", action: "grant" }, ctx);
      expect(mocks.logger.warn).toHaveBeenCalledWith(expect.stringContaining("[Security]"), uid);
    });

    it("does not warn when App Check token is present", async () => {
      setupSuccessfulRoleChange();
      const uid = freshUid("ac-ok");
      const ctx = makeContext({ uid, roles: ["admin"], app: true });
      await (manageUserRole as any)({ targetUid: "tgt", role: "moderator", action: "grant" }, ctx);
      expect(mocks.logger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining("[Security]"),
        expect.anything()
      );
    });
  });

  // ==========================================================================
  // manageUserRole
  // ==========================================================================

  describe("manageUserRole", () => {
    it("rejects unauthenticated caller", async () => {
      await expect(
        (manageUserRole as any)({ targetUid: "t", role: "admin", action: "grant" }, noAuthContext())
      ).rejects.toThrow("You must be logged in");
    });

    it("rejects non-admin caller", async () => {
      const ctx = makeContext({ uid: freshUid("mr"), roles: ["moderator"] });
      await expect(
        (manageUserRole as any)({ targetUid: "t", role: "admin", action: "grant" }, ctx)
      ).rejects.toThrow("Only Admins can manage user roles");
    });

    it("rejects caller with no roles in token", async () => {
      const ctx = {
        auth: { uid: freshUid("mr-nr"), token: { email: "x@x.com" } },
        app: { appId: "a" },
      };
      await expect(
        (manageUserRole as any)({ targetUid: "t", role: "admin", action: "grant" }, ctx)
      ).rejects.toThrow("Only Admins can manage user roles");
    });

    it("rejects invalid role", async () => {
      const ctx = makeContext({ uid: freshUid("mr"), roles: ["admin"] });
      await expect(
        (manageUserRole as any)({ targetUid: "t", role: "superuser", action: "grant" }, ctx)
      ).rejects.toThrow("Role must be one of");
    });

    it("rejects empty targetUid", async () => {
      const ctx = makeContext({ uid: freshUid("mr"), roles: ["admin"] });
      await expect(
        (manageUserRole as any)({ targetUid: "", role: "admin", action: "grant" }, ctx)
      ).rejects.toThrow("Invalid Target User ID");
    });

    it("rejects non-string targetUid", async () => {
      const ctx = makeContext({ uid: freshUid("mr"), roles: ["admin"] });
      await expect(
        (manageUserRole as any)({ targetUid: 42, role: "admin", action: "grant" }, ctx)
      ).rejects.toThrow("Invalid Target User ID");
    });

    it("rejects invalid action", async () => {
      const ctx = makeContext({ uid: freshUid("mr"), roles: ["admin"] });
      await expect(
        (manageUserRole as any)({ targetUid: "t", role: "admin", action: "promote" }, ctx)
      ).rejects.toThrow('Action must be "grant" or "revoke"');
    });

    it("prevents admin from revoking their own admin role", async () => {
      const uid = freshUid("mr-self");
      const ctx = makeContext({ uid, roles: ["admin"] });
      await expect(
        (manageUserRole as any)({ targetUid: uid, role: "admin", action: "revoke" }, ctx)
      ).rejects.toThrow("cannot remove your own admin privileges");
    });

    it("grants a new role successfully", async () => {
      mocks.authInstance.getUser.mockResolvedValue({
        email: "target@test.com",
        customClaims: { roles: [] },
      });
      const ctx = makeContext({ uid: freshUid("mr"), roles: ["admin"] });
      const res = await (manageUserRole as any)(
        { targetUid: "target-uid", role: "moderator", action: "grant" },
        ctx
      );
      expect(res.success).toBe(true);
      expect(res.roles).toContain("moderator");
      expect(mocks.authInstance.setCustomUserClaims).toHaveBeenCalledWith(
        "target-uid",
        expect.objectContaining({ roles: ["moderator"] })
      );
    });

    it("does not duplicate an existing role on grant", async () => {
      mocks.authInstance.getUser.mockResolvedValue({
        email: "target@test.com",
        customClaims: { roles: ["moderator"] },
      });
      const ctx = makeContext({ uid: freshUid("mr"), roles: ["admin"] });
      const res = await (manageUserRole as any)(
        { targetUid: "target-uid", role: "moderator", action: "grant" },
        ctx
      );
      expect(res.roles).toEqual(["moderator"]);
    });

    it("revokes an existing role", async () => {
      mocks.authInstance.getUser.mockResolvedValue({
        email: "target@test.com",
        customClaims: { roles: ["admin", "moderator"] },
      });
      const ctx = makeContext({ uid: freshUid("mr"), roles: ["admin"] });
      const res = await (manageUserRole as any)(
        { targetUid: "target-uid", role: "moderator", action: "revoke" },
        ctx
      );
      expect(res.success).toBe(true);
      expect(res.roles).toEqual(["admin"]);
    });

    it("revokes a role the user does not have (no-op)", async () => {
      mocks.authInstance.getUser.mockResolvedValue({
        email: "target@test.com",
        customClaims: { roles: ["admin"] },
      });
      const ctx = makeContext({ uid: freshUid("mr"), roles: ["admin"] });
      const res = await (manageUserRole as any)(
        { targetUid: "target-uid", role: "moderator", action: "revoke" },
        ctx
      );
      expect(res.roles).toEqual(["admin"]);
    });

    it("preserves non-role custom claims when updating", async () => {
      mocks.authInstance.getUser.mockResolvedValue({
        email: "target@test.com",
        customClaims: { roles: [], verified: true, tier: "pro" },
      });
      const ctx = makeContext({ uid: freshUid("mr"), roles: ["admin"] });
      await (manageUserRole as any)(
        { targetUid: "target-uid", role: "moderator", action: "grant" },
        ctx
      );
      expect(mocks.authInstance.setCustomUserClaims).toHaveBeenCalledWith("target-uid", {
        roles: ["moderator"],
        verified: true,
        tier: "pro",
      });
    });

    it("handles user with null customClaims", async () => {
      mocks.authInstance.getUser.mockResolvedValue({
        email: "target@test.com",
        customClaims: null,
      });
      const ctx = makeContext({ uid: freshUid("mr"), roles: ["admin"] });
      const res = await (manageUserRole as any)(
        { targetUid: "target-uid", role: "admin", action: "grant" },
        ctx
      );
      expect(res.roles).toEqual(["admin"]);
    });

    it("syncs roles to Firestore users collection", async () => {
      mocks.authInstance.getUser.mockResolvedValue({
        email: "target@test.com",
        customClaims: { roles: [] },
      });
      const ctx = makeContext({ uid: freshUid("mr"), roles: ["admin"] });
      await (manageUserRole as any)(
        { targetUid: "target-uid", role: "moderator", action: "grant" },
        ctx
      );
      expect(mocks.firestoreInstance.collection).toHaveBeenCalledWith("users");
      expect(mocks.docRef.set).toHaveBeenCalledWith(
        expect.objectContaining({ roles: ["moderator"] }),
        { merge: true }
      );
    });

    it("creates audit log entry", async () => {
      mocks.authInstance.getUser.mockResolvedValue({
        email: "target@test.com",
        customClaims: { roles: [] },
      });
      const uid = freshUid("mr");
      const ctx = makeContext({ uid, roles: ["admin"], email: "admin@x.com" });
      await (manageUserRole as any)(
        { targetUid: "target-uid", role: "verified_pro", action: "grant" },
        ctx
      );
      expect(mocks.firestoreInstance.collection).toHaveBeenCalledWith("audit_logs");
      expect(mocks.collectionRef.add).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "role_change",
          targetUid: "target-uid",
          role: "verified_pro",
          changeType: "grant",
          performedBy: uid,
        })
      );
    });

    it("throws not-found for nonexistent target user", async () => {
      mocks.authInstance.getUser.mockRejectedValue({ code: "auth/user-not-found" });
      const ctx = makeContext({ uid: freshUid("mr"), roles: ["admin"] });
      await expect(
        (manageUserRole as any)({ targetUid: "ghost", role: "moderator", action: "grant" }, ctx)
      ).rejects.toThrow("Target user not found");
    });

    it("throws internal on unexpected error", async () => {
      mocks.authInstance.getUser.mockRejectedValue(new Error("Network down"));
      const ctx = makeContext({ uid: freshUid("mr"), roles: ["admin"] });
      await expect(
        (manageUserRole as any)(
          { targetUid: "target-uid", role: "moderator", action: "grant" },
          ctx
        )
      ).rejects.toThrow("Failed to update user roles");
    });
  });

  // ==========================================================================
  // getUserRoles
  // ==========================================================================

  describe("getUserRoles", () => {
    it("rejects unauthenticated caller", async () => {
      await expect((getUserRoles as any)({ targetUid: "t" }, noAuthContext())).rejects.toThrow(
        "Must be logged in"
      );
    });

    it("rejects non-admin caller", async () => {
      const ctx = makeContext({ uid: freshUid("gr"), roles: [] });
      await expect((getUserRoles as any)({ targetUid: "t" }, ctx)).rejects.toThrow(
        "Only Admins can view user roles"
      );
    });

    it("rejects empty targetUid", async () => {
      const ctx = makeContext({ uid: freshUid("gr"), roles: ["admin"] });
      await expect((getUserRoles as any)({ targetUid: "" }, ctx)).rejects.toThrow(
        "Target UID required"
      );
    });

    it("returns uid, masked email, and roles on success", async () => {
      mocks.authInstance.getUser.mockResolvedValue({
        email: "target@example.com",
        customClaims: { roles: ["moderator", "verified_pro"] },
      });
      const ctx = makeContext({ uid: freshUid("gr"), roles: ["admin"] });
      const res = await (getUserRoles as any)({ targetUid: "tgt-123" }, ctx);
      expect(res).toEqual({
        uid: "tgt-123",
        email: "t***@example.com",
        roles: ["moderator", "verified_pro"],
      });
    });

    it("returns empty roles when user has no claims", async () => {
      mocks.authInstance.getUser.mockResolvedValue({
        email: "x@y.com",
        customClaims: {},
      });
      const ctx = makeContext({ uid: freshUid("gr"), roles: ["admin"] });
      const res = await (getUserRoles as any)({ targetUid: "tgt" }, ctx);
      expect(res.roles).toEqual([]);
    });

    it("throws not-found for nonexistent user", async () => {
      mocks.authInstance.getUser.mockRejectedValue({ code: "auth/user-not-found" });
      const ctx = makeContext({ uid: freshUid("gr"), roles: ["admin"] });
      await expect((getUserRoles as any)({ targetUid: "ghost" }, ctx)).rejects.toThrow(
        "User not found"
      );
    });
  });

  // ==========================================================================
  // submitTrick
  // ==========================================================================

  describe("submitTrick", () => {
    const baseGame = (overrides: Record<string, any> = {}) => ({
      player1Id: "p1",
      player2Id: "p2",
      currentTurn: "p1",
      currentAttacker: "p1",
      turnPhase: "attacker_recording",
      roundNumber: 1,
      moves: [],
      processedIdempotencyKeys: [],
      currentSetMove: null,
      player1Letters: [],
      player2Letters: [],
      status: "active",
      ...overrides,
    });

    it("rejects unauthenticated caller", async () => {
      await expect(
        (submitTrick as any)(
          { gameId: "g", clipUrl: "u", trickName: null, isSetTrick: true, idempotencyKey: "k" },
          noAuthContext()
        )
      ).rejects.toThrow("Not logged in");
    });

    it("rejects missing gameId", async () => {
      const ctx = makeContext({ uid: freshUid("st") });
      await expect(
        (submitTrick as any)(
          { gameId: "", clipUrl: "u", trickName: null, isSetTrick: true, idempotencyKey: "k" },
          ctx
        )
      ).rejects.toThrow("Missing gameId, clipUrl/storagePath, or idempotencyKey");
    });

    it("rejects missing clipUrl and storagePath", async () => {
      const ctx = makeContext({ uid: freshUid("st") });
      await expect(
        (submitTrick as any)(
          { gameId: "g", clipUrl: "", trickName: null, isSetTrick: true, idempotencyKey: "k" },
          ctx
        )
      ).rejects.toThrow("Missing gameId, clipUrl/storagePath, or idempotencyKey");
    });

    it("accepts storagePath when clipUrl is empty", async () => {
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => baseGame() });
      const ctx = makeContext({ uid: "p1" });
      const res = await (submitTrick as any)(
        {
          gameId: "g",
          clipUrl: "",
          storagePath: "videos/p1/g/round_1/abc.mp4",
          trickName: "kickflip",
          isSetTrick: true,
          idempotencyKey: "k-sp",
        },
        ctx
      );
      expect(res.success).toBe(true);

      const update = mocks.transaction.update.mock.calls[0][1];
      const move = update.moves[0];
      expect(move.storagePath).toBe("videos/p1/g/round_1/abc.mp4");
      expect(move.clipUrl).toBe("");
    });

    it("rejects missing idempotencyKey", async () => {
      const ctx = makeContext({ uid: freshUid("st") });
      await expect(
        (submitTrick as any)(
          { gameId: "g", clipUrl: "u", trickName: null, isSetTrick: true, idempotencyKey: "" },
          ctx
        )
      ).rejects.toThrow("Missing gameId, clipUrl/storagePath, or idempotencyKey");
    });

    it("throws not-found when game does not exist", async () => {
      mocks.transaction.get.mockResolvedValue({ exists: false });
      const ctx = makeContext({ uid: "p1" });
      await expect(
        (submitTrick as any)(
          { gameId: "gone", clipUrl: "u", trickName: null, isSetTrick: true, idempotencyKey: "k" },
          ctx
        )
      ).rejects.toThrow("Game not found");
    });

    it("returns duplicate:true for already-processed idempotency key", async () => {
      const game = baseGame({
        processedIdempotencyKeys: ["dup-key"],
        moves: [{ id: "existing-move", idempotencyKey: "dup-key" }],
      });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });

      const ctx = makeContext({ uid: "p1" });
      const res = await (submitTrick as any)(
        { gameId: "g", clipUrl: "u", trickName: null, isSetTrick: true, idempotencyKey: "dup-key" },
        ctx
      );
      expect(res).toMatchObject({ success: true, duplicate: true, moveId: "existing-move" });
    });

    it("rejects non-participant", async () => {
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => baseGame() });
      const ctx = makeContext({ uid: "outsider" });
      await expect(
        (submitTrick as any)(
          { gameId: "g", clipUrl: "u", trickName: null, isSetTrick: true, idempotencyKey: "k" },
          ctx
        )
      ).rejects.toThrow("Not a participant");
    });

    it("rejects when not the caller's turn", async () => {
      mocks.transaction.get.mockResolvedValue({
        exists: true,
        data: () => baseGame({ currentTurn: "p2" }),
      });
      const ctx = makeContext({ uid: "p1" });
      await expect(
        (submitTrick as any)(
          { gameId: "g", clipUrl: "u", trickName: null, isSetTrick: true, idempotencyKey: "k" },
          ctx
        )
      ).rejects.toThrow("Not your turn");
    });

    it("rejects set trick in defender_recording phase", async () => {
      mocks.transaction.get.mockResolvedValue({
        exists: true,
        data: () => baseGame({ turnPhase: "defender_recording" }),
      });
      const ctx = makeContext({ uid: "p1" });
      await expect(
        (submitTrick as any)(
          {
            gameId: "g",
            clipUrl: "u",
            trickName: "kickflip",
            isSetTrick: true,
            idempotencyKey: "k",
          },
          ctx
        )
      ).rejects.toThrow("Invalid phase");
    });

    it("rejects match trick in attacker_recording phase", async () => {
      const game = baseGame({
        currentTurn: "p2",
        currentAttacker: "p1",
        turnPhase: "attacker_recording",
      });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext({ uid: "p2" });
      await expect(
        (submitTrick as any)(
          { gameId: "g", clipUrl: "u", trickName: null, isSetTrick: false, idempotencyKey: "k" },
          ctx
        )
      ).rejects.toThrow("Invalid phase");
    });

    it("rejects defender trying to set a trick", async () => {
      // p2 is defender but tries isSetTrick=true during attacker_recording
      // For this to reach the role check, it must pass the phase check first.
      // phase check: isSetTrick=true => expected "attacker_recording", game is "attacker_recording" => pass
      // turn check: currentTurn must be p2 => set currentTurn to p2
      const game = baseGame({ currentTurn: "p2", currentAttacker: "p1" });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext({ uid: "p2" });
      await expect(
        (submitTrick as any)(
          {
            gameId: "g",
            clipUrl: "u",
            trickName: "kickflip",
            isSetTrick: true,
            idempotencyKey: "k",
          },
          ctx
        )
      ).rejects.toThrow("Only attacker can set trick");
    });

    it("rejects attacker trying to match a trick", async () => {
      const game = baseGame({
        currentTurn: "p1",
        currentAttacker: "p1",
        turnPhase: "defender_recording",
      });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext({ uid: "p1" });
      await expect(
        (submitTrick as any)(
          {
            gameId: "g",
            clipUrl: "u",
            trickName: "kickflip",
            isSetTrick: false,
            idempotencyKey: "k",
          },
          ctx
        )
      ).rejects.toThrow("Only defender can match trick");
    });

    it("successfully submits a set trick and transitions to defender_recording", async () => {
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => baseGame() });
      const ctx = makeContext({ uid: "p1" });
      const res = await (submitTrick as any)(
        {
          gameId: "g",
          clipUrl: "http://clip",
          trickName: "kickflip",
          isSetTrick: true,
          idempotencyKey: "k1",
        },
        ctx
      );
      expect(res.success).toBe(true);
      expect(res.duplicate).toBe(false);
      expect(res.moveId).toMatch(/^move_p1_/);

      const update = mocks.transaction.update.mock.calls[0][1];
      expect(update.turnPhase).toBe("defender_recording");
      expect(update.currentTurn).toBe("p2");
    });

    it("successfully submits a match trick and transitions to judging with voteDeadline", async () => {
      const game = baseGame({
        currentTurn: "p2",
        currentAttacker: "p1",
        turnPhase: "defender_recording",
        currentSetMove: { id: "set-1" },
      });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext({ uid: "p2" });
      const res = await (submitTrick as any)(
        {
          gameId: "g",
          clipUrl: "http://clip",
          trickName: "kickflip",
          isSetTrick: false,
          idempotencyKey: "k2",
        },
        ctx
      );
      expect(res.success).toBe(true);
      expect(res.duplicate).toBe(false);

      const update = mocks.transaction.update.mock.calls[0][1];
      expect(update.turnPhase).toBe("judging");
      expect(update.currentTurn).toBe("p2"); // turn stays during judging
      expect(update.voteDeadline).toBeDefined();
      expect(update.voteReminderSent).toBe(false);
    });

    it("caps idempotency keys at 50", async () => {
      const keys = Array.from({ length: 50 }, (_, i) => `k${i}`);
      const game = baseGame({ processedIdempotencyKeys: keys });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext({ uid: "p1" });
      await (submitTrick as any)(
        {
          gameId: "g",
          clipUrl: "http://clip",
          trickName: null,
          isSetTrick: true,
          idempotencyKey: "knew",
        },
        ctx
      );
      const update = mocks.transaction.update.mock.calls[0][1];
      expect(update.processedIdempotencyKeys).toHaveLength(50);
      expect(update.processedIdempotencyKeys).toContain("knew");
      expect(update.processedIdempotencyKeys).not.toContain("k0");
    });

    it("handles game with no moves array", async () => {
      const game = baseGame();
      delete (game as any).moves;
      game.processedIdempotencyKeys = ["dup"];
      // The idempotency lookup does (game.moves || []).find(...)
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext({ uid: "p1" });
      const res = await (submitTrick as any)(
        { gameId: "g", clipUrl: "u", trickName: null, isSetTrick: true, idempotencyKey: "dup" },
        ctx
      );
      // Should still find the dup key but move is undefined
      expect(res.duplicate).toBe(true);
      expect(res.moveId).toBe("unknown");
    });
  });

  // ==========================================================================
  // getVideoUrl
  // ==========================================================================

  describe("getVideoUrl", () => {
    it("rejects unauthenticated caller", async () => {
      await expect(
        (getVideoUrl as any)({ gameId: "g", storagePath: "videos/u/g/r/f.mp4" }, noAuthContext())
      ).rejects.toThrow("Not logged in");
    });

    it("rejects missing gameId", async () => {
      const ctx = makeContext({ uid: freshUid("gv") });
      await expect(
        (getVideoUrl as any)({ gameId: "", storagePath: "videos/u/g/r/f.mp4" }, ctx)
      ).rejects.toThrow("Missing gameId or storagePath");
    });

    it("rejects missing storagePath", async () => {
      const ctx = makeContext({ uid: freshUid("gv") });
      await expect((getVideoUrl as any)({ gameId: "g", storagePath: "" }, ctx)).rejects.toThrow(
        "Missing gameId or storagePath"
      );
    });

    it("rejects storagePath not starting with videos/", async () => {
      const uid = freshUid("gv");
      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ player1Id: uid, player2Id: "p2", status: "active" }),
      });
      const ctx = makeContext({ uid });
      await expect(
        (getVideoUrl as any)({ gameId: "g", storagePath: "uploads/u/file.mp4" }, ctx)
      ).rejects.toThrow("Invalid storage path");
    });

    it("rejects storagePath with path traversal", async () => {
      const uid = freshUid("gv");
      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ player1Id: uid, player2Id: "p2", status: "active" }),
      });
      const ctx = makeContext({ uid });
      await expect(
        (getVideoUrl as any)({ gameId: "g", storagePath: "videos/../secrets/key.json" }, ctx)
      ).rejects.toThrow("Invalid storage path");
    });

    it("rejects non-participant in game_sessions", async () => {
      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ player1Id: "p1", player2Id: "p2", status: "active" }),
      });
      const ctx = makeContext({ uid: "outsider" });
      await expect(
        (getVideoUrl as any)({ gameId: "g", storagePath: "videos/p1/g/r/f.mp4" }, ctx)
      ).rejects.toThrow("Not a participant");
    });

    it("returns not-found when game does not exist in either collection", async () => {
      mocks.docRef.get.mockResolvedValue({ exists: false, data: () => ({}) });
      const ctx = makeContext({ uid: freshUid("gv") });
      await expect(
        (getVideoUrl as any)({ gameId: "ghost", storagePath: "videos/u/ghost/r/f.mp4" }, ctx)
      ).rejects.toThrow("Game not found");
    });

    it("returns signed URL for valid participant in game_sessions", async () => {
      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ player1Id: "p1", player2Id: "p2", status: "active" }),
      });
      mocks.bucketFile.getSignedUrl.mockResolvedValue([
        "https://storage.example.com/signed?token=xyz",
      ]);

      const ctx = makeContext({ uid: "p1" });
      const res = await (getVideoUrl as any)(
        { gameId: "g", storagePath: "videos/p1/g/round_1/abc.mp4" },
        ctx
      );

      expect(res.signedUrl).toBe("https://storage.example.com/signed?token=xyz");
      expect(res.expiresAt).toBeDefined();
      expect(new Date(res.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(mocks.bucket.file).toHaveBeenCalledWith("videos/p1/g/round_1/abc.mp4");
      expect(mocks.bucketFile.getSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          version: "v4",
          action: "read",
        })
      );
    });

    it("returns signed URL for player2 in game_sessions", async () => {
      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ player1Id: "p1", player2Id: "p2", status: "active" }),
      });
      mocks.bucketFile.getSignedUrl.mockResolvedValue([
        "https://storage.example.com/signed?token=p2",
      ]);

      const ctx = makeContext({ uid: "p2" });
      const res = await (getVideoUrl as any)(
        { gameId: "g", storagePath: "videos/p1/g/round_1/abc.mp4" },
        ctx
      );

      expect(res.signedUrl).toBe("https://storage.example.com/signed?token=p2");
    });

    it("falls back to web games collection when game_sessions doc missing", async () => {
      // First call (game_sessions) returns not found, second call (games) returns found
      let callCount = 0;
      mocks.docRef.get.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ exists: false, data: () => ({}) });
        }
        return Promise.resolve({
          exists: true,
          data: () => ({ playerAUid: "pA", playerBUid: "pB", status: "active" }),
        });
      });
      mocks.bucketFile.getSignedUrl.mockResolvedValue([
        "https://storage.example.com/signed?web=true",
      ]);

      const ctx = makeContext({ uid: "pA" });
      const res = await (getVideoUrl as any)(
        { gameId: "wg", storagePath: "videos/pA/wg/round_1/abc.mp4" },
        ctx
      );

      expect(res.signedUrl).toBe("https://storage.example.com/signed?web=true");
      // Should have called doc() for both game_sessions and games
      expect(mocks.firestoreInstance.doc).toHaveBeenCalledWith("game_sessions/wg");
      expect(mocks.firestoreInstance.doc).toHaveBeenCalledWith("games/wg");
    });

    it("rejects non-participant in web games collection", async () => {
      let callCount = 0;
      mocks.docRef.get.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ exists: false, data: () => ({}) });
        }
        return Promise.resolve({
          exists: true,
          data: () => ({ playerAUid: "pA", playerBUid: "pB" }),
        });
      });

      const ctx = makeContext({ uid: "outsider" });
      await expect(
        (getVideoUrl as any)({ gameId: "wg", storagePath: "videos/pA/wg/round_1/abc.mp4" }, ctx)
      ).rejects.toThrow("Not a participant");
    });

    it("rejects storagePath with null byte injection", async () => {
      const uid = freshUid("gv");
      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ player1Id: uid, player2Id: "p2", status: "active" }),
      });
      const ctx = makeContext({ uid });
      await expect(
        (getVideoUrl as any)({ gameId: "g", storagePath: "videos/uid/gid/round_1/file\0.mp4" }, ctx)
      ).rejects.toThrow("Invalid storage path");
    });

    it("rejects storagePath missing the round_ prefix", async () => {
      const uid = freshUid("gv");
      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ player1Id: uid, player2Id: "p2", status: "active" }),
      });
      const ctx = makeContext({ uid });
      await expect(
        (getVideoUrl as any)({ gameId: "g", storagePath: "videos/uid/gid/noprefix/file.mp4" }, ctx)
      ).rejects.toThrow("Invalid storage path");
    });

    it("rejects storagePath with too few segments", async () => {
      const uid = freshUid("gv");
      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ player1Id: uid, player2Id: "p2", status: "active" }),
      });
      const ctx = makeContext({ uid });
      await expect(
        (getVideoUrl as any)({ gameId: "g", storagePath: "videos/uid/file.mp4" }, ctx)
      ).rejects.toThrow("Invalid storage path");
    });

    it("rejects storagePath with directory traversal in segments", async () => {
      const uid = freshUid("gv");
      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ player1Id: uid, player2Id: "p2", status: "active" }),
      });
      const ctx = makeContext({ uid });
      await expect(
        (getVideoUrl as any)(
          { gameId: "g", storagePath: "videos/uid/../admin/round_1/file.mp4" },
          ctx
        )
      ).rejects.toThrow("Invalid storage path");
    });

    it("propagates storage SDK error to caller", async () => {
      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ player1Id: "p1", player2Id: "p2" }),
      });
      mocks.bucketFile.getSignedUrl.mockRejectedValue(
        new Error("Service account missing signBlob permission")
      );

      const ctx = makeContext({ uid: "p1" });
      await expect(
        (getVideoUrl as any)({ gameId: "g", storagePath: "videos/p1/g/round_1/abc.mp4" }, ctx)
      ).rejects.toThrow("Service account missing signBlob permission");
    });
  });

  // ==========================================================================
  // submitTrick - storagePath validation
  // ==========================================================================

  describe("submitTrick - storagePath validation", () => {
    it("rejects malformed storagePath", async () => {
      const ctx = makeContext({ uid: freshUid("st") });
      await expect(
        (submitTrick as any)(
          {
            gameId: "g",
            clipUrl: "",
            storagePath: "videos/../etc/passwd",
            trickName: null,
            isSetTrick: true,
            idempotencyKey: "k",
          },
          ctx
        )
      ).rejects.toThrow("Invalid storagePath format");
    });

    it("rejects storagePath with null bytes", async () => {
      const ctx = makeContext({ uid: freshUid("st") });
      await expect(
        (submitTrick as any)(
          {
            gameId: "g",
            clipUrl: "",
            storagePath: "videos/uid/gid/round_1/file\0.mp4",
            trickName: null,
            isSetTrick: true,
            idempotencyKey: "k",
          },
          ctx
        )
      ).rejects.toThrow("Invalid storagePath format");
    });

    it("rejects storagePath that does not match expected structure", async () => {
      const ctx = makeContext({ uid: freshUid("st") });
      await expect(
        (submitTrick as any)(
          {
            gameId: "g",
            clipUrl: "",
            storagePath: "uploads/uid/file.mp4",
            trickName: null,
            isSetTrick: true,
            idempotencyKey: "k",
          },
          ctx
        )
      ).rejects.toThrow("Invalid storagePath format");
    });

    it("stores null storagePath when not provided", async () => {
      const baseGame = {
        player1Id: "p1",
        player2Id: "p2",
        currentTurn: "p1",
        currentAttacker: "p1",
        turnPhase: "attacker_recording",
        roundNumber: 1,
        moves: [],
        processedIdempotencyKeys: [],
        currentSetMove: null,
        player1Letters: [],
        player2Letters: [],
        status: "active",
      };
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => baseGame });
      const ctx = makeContext({ uid: "p1" });
      const res = await (submitTrick as any)(
        {
          gameId: "g",
          clipUrl: "https://legacy.url/clip.mp4",
          trickName: null,
          isSetTrick: true,
          idempotencyKey: "k-legacy",
        },
        ctx
      );
      expect(res.success).toBe(true);

      const update = mocks.transaction.update.mock.calls[0][1];
      const move = update.moves[0];
      expect(move.storagePath).toBeNull();
      expect(move.clipUrl).toBe("https://legacy.url/clip.mp4");
    });
  });

  // ==========================================================================
  // judgeTrick
  // ==========================================================================

  describe("judgeTrick", () => {
    const judgingGame = (overrides: Record<string, any> = {}) => ({
      player1Id: "p1",
      player2Id: "p2",
      currentTurn: "p2",
      currentAttacker: "p1",
      turnPhase: "judging",
      roundNumber: 1,
      moves: [
        {
          id: "mm1",
          type: "match",
          playerId: "p2",
          result: "pending",
          judgmentVotes: { attackerVote: null, defenderVote: null },
        },
      ],
      processedIdempotencyKeys: [],
      currentSetMove: { id: "sm1" },
      player1Letters: [],
      player2Letters: [],
      status: "active",
      winnerId: null,
      ...overrides,
    });

    it("rejects unauthenticated caller", async () => {
      await expect(
        (judgeTrick as any)(
          { gameId: "g", moveId: "m", vote: "landed", idempotencyKey: "k" },
          noAuthContext()
        )
      ).rejects.toThrow("Not logged in");
    });

    it("rejects missing gameId", async () => {
      const ctx = makeContext({ uid: freshUid("jt") });
      await expect(
        (judgeTrick as any)({ gameId: "", moveId: "m", vote: "landed", idempotencyKey: "k" }, ctx)
      ).rejects.toThrow("Missing gameId, moveId, or vote");
    });

    it("rejects missing moveId", async () => {
      const ctx = makeContext({ uid: freshUid("jt") });
      await expect(
        (judgeTrick as any)({ gameId: "g", moveId: "", vote: "landed", idempotencyKey: "k" }, ctx)
      ).rejects.toThrow("Missing gameId, moveId, or vote");
    });

    it("rejects invalid vote value", async () => {
      const ctx = makeContext({ uid: freshUid("jt") });
      await expect(
        (judgeTrick as any)({ gameId: "g", moveId: "m", vote: "maybe", idempotencyKey: "k" }, ctx)
      ).rejects.toThrow("Vote must be 'landed' or 'bailed'");
    });

    it("throws not-found when game does not exist", async () => {
      mocks.transaction.get.mockResolvedValue({ exists: false });
      const ctx = makeContext({ uid: "p1" });
      await expect(
        (judgeTrick as any)({ gameId: "g", moveId: "m", vote: "landed", idempotencyKey: "k" }, ctx)
      ).rejects.toThrow("Game not found");
    });

    it("returns duplicate:true for already-processed idempotency key", async () => {
      const game = judgingGame({ processedIdempotencyKeys: ["dk"] });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext({ uid: "p1" });
      const res = await (judgeTrick as any)(
        { gameId: "g", moveId: "mm1", vote: "landed", idempotencyKey: "dk" },
        ctx
      );
      expect(res.duplicate).toBe(true);
      expect(res.success).toBe(true);
    });

    it("rejects non-participant", async () => {
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => judgingGame() });
      const ctx = makeContext({ uid: "outsider" });
      await expect(
        (judgeTrick as any)(
          { gameId: "g", moveId: "mm1", vote: "landed", idempotencyKey: "k" },
          ctx
        )
      ).rejects.toThrow("Not a participant");
    });

    it("rejects when not in judging phase", async () => {
      const game = judgingGame({ turnPhase: "attacker_recording" });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext({ uid: "p1" });
      await expect(
        (judgeTrick as any)(
          { gameId: "g", moveId: "mm1", vote: "landed", idempotencyKey: "k" },
          ctx
        )
      ).rejects.toThrow("not in judging phase");
    });

    it("throws not-found for unknown moveId", async () => {
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => judgingGame() });
      const ctx = makeContext({ uid: "p1" });
      await expect(
        (judgeTrick as any)(
          { gameId: "g", moveId: "nonexistent", vote: "landed", idempotencyKey: "k" },
          ctx
        )
      ).rejects.toThrow("Move not found");
    });

    it("rejects duplicate vote from attacker", async () => {
      const game = judgingGame({
        moves: [
          {
            id: "mm1",
            type: "match",
            result: "pending",
            judgmentVotes: { attackerVote: "landed", defenderVote: null },
          },
        ],
      });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext({ uid: "p1" }); // attacker
      await expect(
        (judgeTrick as any)(
          { gameId: "g", moveId: "mm1", vote: "landed", idempotencyKey: "k" },
          ctx
        )
      ).rejects.toThrow("already voted");
    });

    it("rejects duplicate vote from defender", async () => {
      const game = judgingGame({
        moves: [
          {
            id: "mm1",
            type: "match",
            result: "pending",
            judgmentVotes: { attackerVote: null, defenderVote: "bailed" },
          },
        ],
      });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext({ uid: "p2" }); // defender
      await expect(
        (judgeTrick as any)(
          { gameId: "g", moveId: "mm1", vote: "bailed", idempotencyKey: "k" },
          ctx
        )
      ).rejects.toThrow("already voted");
    });

    it("records first vote and returns waitingForOtherVote:true", async () => {
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => judgingGame() });
      const ctx = makeContext({ uid: "p1" }); // attacker votes first
      const res = await (judgeTrick as any)(
        { gameId: "g", moveId: "mm1", vote: "landed", idempotencyKey: "k" },
        ctx
      );
      expect(res).toMatchObject({
        success: true,
        vote: "landed",
        finalResult: null,
        waitingForOtherVote: true,
        gameCompleted: false,
        duplicate: false,
      });
    });

    it("resolves landed when both agree landed (no letter, roles switch)", async () => {
      const game = judgingGame({
        moves: [
          {
            id: "mm1",
            type: "match",
            result: "pending",
            judgmentVotes: { attackerVote: "landed", defenderVote: null },
          },
        ],
      });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext({ uid: "p2" }); // defender agrees
      const res = await (judgeTrick as any)(
        { gameId: "g", moveId: "mm1", vote: "landed", idempotencyKey: "k" },
        ctx
      );
      expect(res.finalResult).toBe("landed");
      expect(res.waitingForOtherVote).toBe(false);
      expect(res.gameCompleted).toBe(false);

      const update = mocks.transaction.update.mock.calls[0][1];
      expect(update.currentAttacker).toBe("p2"); // defender becomes attacker
      expect(update.roundNumber).toBe(1); // same round on landed
      expect(update.turnPhase).toBe("attacker_recording");
    });

    it("resolves bailed when both agree bailed (letter assigned, round increments)", async () => {
      const game = judgingGame({
        moves: [
          {
            id: "mm1",
            type: "match",
            result: "pending",
            judgmentVotes: { attackerVote: "bailed", defenderVote: null },
          },
        ],
        player2Letters: [],
      });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext({ uid: "p2" });
      const res = await (judgeTrick as any)(
        { gameId: "g", moveId: "mm1", vote: "bailed", idempotencyKey: "k" },
        ctx
      );
      expect(res.finalResult).toBe("bailed");

      const update = mocks.transaction.update.mock.calls[0][1];
      expect(update.player2Letters).toEqual(["S"]);
      expect(update.roundNumber).toBe(2);
      expect(update.currentAttacker).toBe("p1"); // attacker stays on bailed
    });

    it("gives defender benefit of the doubt when votes disagree", async () => {
      const game = judgingGame({
        moves: [
          {
            id: "mm1",
            type: "match",
            result: "pending",
            judgmentVotes: { attackerVote: "bailed", defenderVote: null },
          },
        ],
      });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext({ uid: "p2" }); // defender says landed
      const res = await (judgeTrick as any)(
        { gameId: "g", moveId: "mm1", vote: "landed", idempotencyKey: "k" },
        ctx
      );
      expect(res.finalResult).toBe("landed"); // defender wins tie
    });

    it("also gives defender benefit when attacker says landed but defender says bailed", async () => {
      // This is the reverse disagreement: attacker=landed, defender=bailed -> disagree -> landed
      const game = judgingGame({
        moves: [
          {
            id: "mm1",
            type: "match",
            result: "pending",
            judgmentVotes: { attackerVote: "landed", defenderVote: null },
          },
        ],
      });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext({ uid: "p2" });
      const res = await (judgeTrick as any)(
        { gameId: "g", moveId: "mm1", vote: "bailed", idempotencyKey: "k" },
        ctx
      );
      expect(res.finalResult).toBe("landed");
    });

    it("assigns letters in S-K-A-T-E order", async () => {
      const letters = ["S", "K", "A", "T", "E"];
      for (let i = 0; i < 4; i++) {
        const existing = letters.slice(0, i);
        const game = judgingGame({
          roundNumber: i + 1,
          moves: [
            {
              id: `mm${i}`,
              type: "match",
              result: "pending",
              judgmentVotes: { attackerVote: "bailed", defenderVote: null },
            },
          ],
          player2Letters: existing,
        });
        mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
        mocks.transaction.update.mockClear();

        const ctx = makeContext({ uid: "p2" });
        await (judgeTrick as any)(
          { gameId: "g", moveId: `mm${i}`, vote: "bailed", idempotencyKey: `kl${i}` },
          ctx
        );

        const update = mocks.transaction.update.mock.calls[0][1];
        expect(update.player2Letters).toEqual(letters.slice(0, i + 1));
      }
    });

    it("completes game when defender gets 5th letter (S.K.A.T.E.)", async () => {
      const game = judgingGame({
        moves: [
          {
            id: "mm1",
            type: "match",
            result: "pending",
            judgmentVotes: { attackerVote: "bailed", defenderVote: null },
          },
        ],
        player2Letters: ["S", "K", "A", "T"],
      });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext({ uid: "p2" });
      const res = await (judgeTrick as any)(
        { gameId: "g", moveId: "mm1", vote: "bailed", idempotencyKey: "k" },
        ctx
      );

      expect(res.finalResult).toBe("bailed");
      expect(res.gameCompleted).toBe(true);
      expect(res.winnerId).toBe("p1");

      const update = mocks.transaction.update.mock.calls[0][1];
      expect(update.status).toBe("completed");
      expect(update.winnerId).toBe("p1");
      expect(update.player2Letters).toEqual(["S", "K", "A", "T", "E"]);
      expect(update.turnPhase).toBe("round_complete");
    });

    it("assigns letter to player1 when player1 is the defender", async () => {
      const game = judgingGame({
        currentAttacker: "p2",
        moves: [
          {
            id: "mm1",
            type: "match",
            result: "pending",
            judgmentVotes: { attackerVote: null, defenderVote: "bailed" },
          },
        ],
        player1Letters: ["S"],
      });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext({ uid: "p2" }); // attacker votes bailed
      const res = await (judgeTrick as any)(
        { gameId: "g", moveId: "mm1", vote: "bailed", idempotencyKey: "k" },
        ctx
      );
      expect(res.finalResult).toBe("bailed");

      const update = mocks.transaction.update.mock.calls[0][1];
      expect(update.player1Letters).toEqual(["S", "K"]);
    });

    it("clears voteDeadline and voteReminderSent when judging completes", async () => {
      const game = judgingGame({
        moves: [
          {
            id: "mm1",
            type: "match",
            result: "pending",
            judgmentVotes: { attackerVote: "landed", defenderVote: null },
          },
        ],
        voteDeadline: { toMillis: () => Date.now() + 30000 },
        voteReminderSent: false,
      });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext({ uid: "p2" });
      await (judgeTrick as any)(
        { gameId: "g", moveId: "mm1", vote: "landed", idempotencyKey: "k" },
        ctx
      );

      const update = mocks.transaction.update.mock.calls[0][1];
      expect(update.voteDeadline).toBeNull();
      expect(update.voteReminderSent).toBeNull();
    });

    it("initializes judgmentVotes when move has none", async () => {
      const game = judgingGame({
        moves: [
          {
            id: "mm1",
            type: "match",
            result: "pending",
            // no judgmentVotes property
          },
        ],
      });
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });
      const ctx = makeContext({ uid: "p1" });
      const res = await (judgeTrick as any)(
        { gameId: "g", moveId: "mm1", vote: "landed", idempotencyKey: "k" },
        ctx
      );
      expect(res.success).toBe(true);
      expect(res.waitingForOtherVote).toBe(true);
    });
  });

  // ==========================================================================
  // validateChallengeVideo
  // ==========================================================================

  describe("validateChallengeVideo", () => {
    it("skips files with no path", async () => {
      await (validateChallengeVideo as any)({ name: null, contentType: "video/mp4", bucket: "b" });
      expect(mocks.storageInstance.bucket).not.toHaveBeenCalled();
    });

    it("skips non-challenge paths", async () => {
      await (validateChallengeVideo as any)({
        name: "profiles/avatar.jpg",
        contentType: "image/jpeg",
        bucket: "b",
      });
      expect(mocks.storageInstance.bucket).not.toHaveBeenCalled();
    });

    it("skips non-video content types in challenges/", async () => {
      await (validateChallengeVideo as any)({
        name: "challenges/photo.jpg",
        contentType: "image/jpeg",
        bucket: "b",
      });
      expect(mocks.storageInstance.bucket).not.toHaveBeenCalled();
    });

    it("processes challenge video with undefined contentType", async () => {
      mocks.ffprobeFn.mockImplementation((_p: string, cb: any) => {
        cb(null, { format: { duration: 15.0 } });
      });
      await (validateChallengeVideo as any)({
        name: "challenges/notype.mp4",
        contentType: undefined,
        bucket: "b",
      });
      expect(mocks.storageInstance.bucket).toHaveBeenCalled();
      expect(mocks.bucketFile.delete).not.toHaveBeenCalled();
    });

    it("keeps video with valid 15s duration", async () => {
      mocks.ffprobeFn.mockImplementation((_p: string, cb: any) => {
        cb(null, { format: { duration: 15.0 } });
      });
      await (validateChallengeVideo as any)({
        name: "challenges/good.mp4",
        contentType: "video/mp4",
        bucket: "b",
      });
      expect(mocks.bucketFile.delete).not.toHaveBeenCalled();
    });

    it("keeps video at lower boundary (14.5s)", async () => {
      mocks.ffprobeFn.mockImplementation((_p: string, cb: any) => {
        cb(null, { format: { duration: 14.5 } });
      });
      await (validateChallengeVideo as any)({
        name: "challenges/lower.mp4",
        contentType: "video/mp4",
        bucket: "b",
      });
      expect(mocks.bucketFile.delete).not.toHaveBeenCalled();
    });

    it("keeps video at upper boundary (15.5s)", async () => {
      mocks.ffprobeFn.mockImplementation((_p: string, cb: any) => {
        cb(null, { format: { duration: 15.5 } });
      });
      await (validateChallengeVideo as any)({
        name: "challenges/upper.mp4",
        contentType: "video/mp4",
        bucket: "b",
      });
      expect(mocks.bucketFile.delete).not.toHaveBeenCalled();
    });

    it("deletes video that is too short (< 14.5s)", async () => {
      mocks.ffprobeFn.mockImplementation((_p: string, cb: any) => {
        cb(null, { format: { duration: 10.0 } });
      });
      await (validateChallengeVideo as any)({
        name: "challenges/short.mp4",
        contentType: "video/mp4",
        bucket: "b",
      });
      expect(mocks.bucketFile.delete).toHaveBeenCalled();
    });

    it("deletes video that is too long (> 15.5s)", async () => {
      mocks.ffprobeFn.mockImplementation((_p: string, cb: any) => {
        cb(null, { format: { duration: 20.0 } });
      });
      await (validateChallengeVideo as any)({
        name: "challenges/long.mp4",
        contentType: "video/mp4",
        bucket: "b",
      });
      expect(mocks.bucketFile.delete).toHaveBeenCalled();
    });

    it("deletes video when duration resolves to 0 (missing metadata)", async () => {
      mocks.ffprobeFn.mockImplementation((_p: string, cb: any) => {
        cb(null, { format: {} }); // no duration -> ?? 0
      });
      await (validateChallengeVideo as any)({
        name: "challenges/noduration.mp4",
        contentType: "video/mp4",
        bucket: "b",
      });
      expect(mocks.bucketFile.delete).toHaveBeenCalled();
    });

    it("handles ffprobe error gracefully without throwing", async () => {
      mocks.ffprobeFn.mockImplementation((_p: string, cb: any) => {
        cb(new Error("probe failed"), null);
      });
      await expect(
        (validateChallengeVideo as any)({
          name: "challenges/err.mp4",
          contentType: "video/mp4",
          bucket: "b",
        })
      ).resolves.not.toThrow();
      expect(mocks.logger.error).toHaveBeenCalledWith(
        expect.stringContaining("[validateChallengeVideo]"),
        expect.anything(),
        expect.anything()
      );
    });

    it("deletes video just below the lower boundary (14.4s)", async () => {
      mocks.ffprobeFn.mockImplementation((_p: string, cb: any) => {
        cb(null, { format: { duration: 14.4 } });
      });
      await (validateChallengeVideo as any)({
        name: "challenges/below.mp4",
        contentType: "video/mp4",
        bucket: "b",
      });
      expect(mocks.bucketFile.delete).toHaveBeenCalled();
    });

    it("deletes video just above the upper boundary (15.6s)", async () => {
      mocks.ffprobeFn.mockImplementation((_p: string, cb: any) => {
        cb(null, { format: { duration: 15.6 } });
      });
      await (validateChallengeVideo as any)({
        name: "challenges/above.mp4",
        contentType: "video/mp4",
        bucket: "b",
      });
      expect(mocks.bucketFile.delete).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // monitoredTransaction (tested via submitTrick logging behaviour)
  // ==========================================================================

  describe("monitoredTransaction logging", () => {
    it("logs transaction data on single-attempt success", async () => {
      const game = {
        player1Id: "p1",
        player2Id: "p2",
        currentTurn: "p1",
        currentAttacker: "p1",
        turnPhase: "attacker_recording",
        roundNumber: 1,
        moves: [],
        processedIdempotencyKeys: [],
        currentSetMove: null,
      };
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });

      const ctx = makeContext({ uid: "p1" });
      await (submitTrick as any)(
        { gameId: "g1", clipUrl: "u", trickName: null, isSetTrick: true, idempotencyKey: "k-log1" },
        ctx
      );
      expect(mocks.logger.log).toHaveBeenCalledWith(
        "[TransactionMonitor]",
        expect.objectContaining({ transaction: "submitTrick", gameId: "g1" })
      );
    });

    it("warns with contention detected on retry", async () => {
      const game = {
        player1Id: "p1",
        player2Id: "p2",
        currentTurn: "p1",
        currentAttacker: "p1",
        turnPhase: "attacker_recording",
        roundNumber: 1,
        moves: [],
        processedIdempotencyKeys: [],
        currentSetMove: null,
      };
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game });

      // Simulate Firestore retry: call the callback twice
      mocks.runTransaction.mockImplementation(async (fn: any) => {
        try {
          await fn(mocks.transaction);
        } catch {
          // first attempt error
        }
        return fn(mocks.transaction);
      });

      const ctx = makeContext({ uid: "p1" });
      await (submitTrick as any)(
        {
          gameId: "g1",
          clipUrl: "u",
          trickName: null,
          isSetTrick: true,
          idempotencyKey: "k-retry",
        },
        ctx
      );
      expect(mocks.logger.warn).toHaveBeenCalledWith(
        "[TransactionMonitor] Contention detected:",
        expect.objectContaining({ retried: true })
      );
    });
  });

  // ==========================================================================
  // processVoteTimeouts
  // ==========================================================================

  describe("processVoteTimeouts", () => {
    it("does nothing when there are no games in judging", async () => {
      mocks.collectionRef.get.mockResolvedValue({ docs: [] });
      await (processVoteTimeouts as any)();
      expect(mocks.runTransaction).not.toHaveBeenCalled();
    });

    it("sends reminder when time remaining is within 30s window", async () => {
      const nowMs = Date.now();
      const deadlineMs = nowMs + 20000; // 20s remaining (< 30s window, > 0)

      const gameDoc = {
        id: "game-reminder",
        data: () => ({
          player1Id: "p1",
          player2Id: "p2",
          currentAttacker: "p1",
          voteDeadline: { toMillis: () => deadlineMs },
          voteReminderSent: false,
          moves: [
            {
              type: "match",
              result: "pending",
              judgmentVotes: { attackerVote: null, defenderVote: null },
            },
          ],
        }),
        ref: { update: vi.fn().mockResolvedValue(undefined) },
      };

      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });

      // Mock user doc lookups for notifications
      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ fcmToken: "token-123" }),
        get: (field: string) => (field === "fcmToken" ? "token-123" : null),
      });

      await (processVoteTimeouts as any)();

      expect(gameDoc.ref.update).toHaveBeenCalledWith({ voteReminderSent: true });
    });

    it("auto-resolves when vote deadline has passed", async () => {
      const nowMs = Date.now();
      const deadlineMs = nowMs - 5000; // 5s ago

      const freshGameData = {
        player1Id: "p1",
        player2Id: "p2",
        currentAttacker: "p1",
        turnPhase: "judging",
        roundNumber: 1,
        voteDeadline: { toMillis: () => deadlineMs },
        voteReminderSent: true,
        moves: [
          {
            type: "match",
            result: "pending",
            judgmentVotes: { attackerVote: null, defenderVote: null },
          },
        ],
        player1Letters: [],
        player2Letters: [],
      };

      const gameDoc = {
        id: "game-timeout",
        data: () => freshGameData,
        ref: { update: vi.fn().mockResolvedValue(undefined) },
      };

      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });

      // autoResolveVoteTimeout reads the game again inside a transaction
      mocks.transaction.get.mockResolvedValue({
        exists: true,
        data: () => ({ ...freshGameData }),
      });

      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({}),
        get: () => null, // no fcmToken
      });

      await (processVoteTimeouts as any)();

      // Should have run a transaction for auto-resolve
      expect(mocks.runTransaction).toHaveBeenCalled();

      // The transaction should update with auto-resolved result
      expect(mocks.transaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          turnPhase: "attacker_recording",
          voteDeadline: null,
          voteTimeoutOccurred: true,
        })
      );
    });

    it("logs error when sending vote reminder notification fails (covers line 889)", async () => {
      const nowMs = Date.now();
      const deadlineMs = nowMs + 20000; // 20s remaining (< 30s window, > 0)

      const gameDoc = {
        id: "game-reminder-fail",
        data: () => ({
          player1Id: "p1",
          player2Id: "p2",
          currentAttacker: "p1",
          voteDeadline: { toMillis: () => deadlineMs },
          voteReminderSent: false,
          moves: [
            {
              type: "match",
              result: "pending",
              judgmentVotes: { attackerVote: null, defenderVote: null },
            },
          ],
        }),
        ref: { update: vi.fn().mockResolvedValue(undefined) },
      };

      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });

      // Mock user doc to return fcmToken so messaging().send is called
      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ fcmToken: "token-fail" }),
        get: (field: string) => (field === "fcmToken" ? "token-fail" : null),
      });

      // Make messaging send throw
      mocks.messagingInstance.send.mockRejectedValue(new Error("FCM send failed"));

      await (processVoteTimeouts as any)();

      // Should log the error but not crash
      expect(mocks.logger.error).toHaveBeenCalledWith(
        expect.stringContaining("[VoteReminder] Failed to send notification"),
        expect.anything()
      );
    });

    it("sends timeout notifications with fcmToken (covers lines 984-997)", async () => {
      const nowMs = Date.now();
      const deadlineMs = nowMs - 5000; // 5s ago - expired

      const freshGameData = {
        player1Id: "p1",
        player2Id: "p2",
        currentAttacker: "p1",
        turnPhase: "judging",
        roundNumber: 1,
        voteDeadline: { toMillis: () => deadlineMs },
        voteReminderSent: true,
        moves: [
          {
            type: "match",
            result: "pending",
            judgmentVotes: { attackerVote: null, defenderVote: null },
          },
        ],
        player1Letters: [],
        player2Letters: [],
      };

      const gameDoc = {
        id: "game-timeout-notif",
        data: () => freshGameData,
        ref: { update: vi.fn().mockResolvedValue(undefined) },
      };

      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });

      // autoResolveVoteTimeout reads the game again inside a transaction
      mocks.transaction.get.mockResolvedValue({
        exists: true,
        data: () => ({ ...freshGameData }),
      });

      // Return user with fcmToken so messaging().send is called for timeout notifications
      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ fcmToken: "token-timeout" }),
        get: (field: string) => (field === "fcmToken" ? "token-timeout" : null),
      });

      await (processVoteTimeouts as any)();

      // Should have sent timeout notification via messaging
      expect(mocks.messagingInstance.send).toHaveBeenCalledWith(
        expect.objectContaining({
          token: "token-timeout",
          notification: expect.objectContaining({
            title: "Vote Timed Out",
          }),
          data: expect.objectContaining({
            type: "vote_timeout",
            gameId: "game-timeout-notif",
          }),
        })
      );
    });

    it("logs error when sending timeout notification fails (covers line 997)", async () => {
      const nowMs = Date.now();
      const deadlineMs = nowMs - 5000; // expired

      const freshGameData = {
        player1Id: "p1",
        player2Id: "p2",
        currentAttacker: "p1",
        turnPhase: "judging",
        roundNumber: 1,
        voteDeadline: { toMillis: () => deadlineMs },
        voteReminderSent: true,
        moves: [
          {
            type: "match",
            result: "pending",
            judgmentVotes: { attackerVote: null, defenderVote: null },
          },
        ],
        player1Letters: [],
        player2Letters: [],
      };

      const gameDoc = {
        id: "game-timeout-err",
        data: () => freshGameData,
        ref: { update: vi.fn().mockResolvedValue(undefined) },
      };

      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });

      mocks.transaction.get.mockResolvedValue({
        exists: true,
        data: () => ({ ...freshGameData }),
      });

      // Return user with fcmToken but make send fail
      mocks.docRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ fcmToken: "token-err" }),
        get: (field: string) => (field === "fcmToken" ? "token-err" : null),
      });

      mocks.messagingInstance.send.mockRejectedValue(new Error("FCM timeout error"));

      await (processVoteTimeouts as any)();

      expect(mocks.logger.error).toHaveBeenCalledWith(
        expect.stringContaining("[VoteTimeout] Failed to notify"),
        expect.anything()
      );
    });

    it("skips game docs with null voteDeadline", async () => {
      const gameDoc = {
        id: "game-null",
        data: () => ({
          voteDeadline: null,
          voteReminderSent: false,
        }),
        ref: { update: vi.fn() },
      };

      mocks.collectionRef.get.mockResolvedValue({ docs: [gameDoc] });
      await (processVoteTimeouts as any)();

      expect(gameDoc.ref.update).not.toHaveBeenCalled();
      expect(mocks.runTransaction).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Integration-style: full game flow scenario
  // ==========================================================================

  describe("game flow: set trick -> match trick -> judge", () => {
    it("transitions through attacker_recording -> defender_recording -> judging -> resolution", async () => {
      // Step 1: Attacker sets trick
      const game1 = {
        player1Id: "p1",
        player2Id: "p2",
        currentTurn: "p1",
        currentAttacker: "p1",
        turnPhase: "attacker_recording",
        roundNumber: 1,
        moves: [],
        processedIdempotencyKeys: [],
        currentSetMove: null,
        player1Letters: [],
        player2Letters: [],
        status: "active",
      };
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game1 });

      const res1 = await (submitTrick as any)(
        {
          gameId: "flow-g",
          clipUrl: "url1",
          trickName: "kickflip",
          isSetTrick: true,
          idempotencyKey: "f1",
        },
        makeContext({ uid: "p1" })
      );
      expect(res1.success).toBe(true);
      let update1 = mocks.transaction.update.mock.calls[0][1];
      expect(update1.turnPhase).toBe("defender_recording");
      expect(update1.currentTurn).toBe("p2");

      // Step 2: Defender matches trick
      mocks.transaction.update.mockClear();
      const game2 = {
        ...game1,
        currentTurn: "p2",
        turnPhase: "defender_recording",
        currentSetMove: { id: res1.moveId },
      };
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game2 });

      const res2 = await (submitTrick as any)(
        {
          gameId: "flow-g",
          clipUrl: "url2",
          trickName: "kickflip",
          isSetTrick: false,
          idempotencyKey: "f2",
        },
        makeContext({ uid: "p2" })
      );
      expect(res2.success).toBe(true);
      let update2 = mocks.transaction.update.mock.calls[0][1];
      expect(update2.turnPhase).toBe("judging");
      expect(update2.voteDeadline).toBeDefined();

      // Step 3a: Attacker votes
      mocks.transaction.update.mockClear();
      const game3a = {
        ...game1,
        currentTurn: "p2",
        currentAttacker: "p1",
        turnPhase: "judging",
        moves: [
          {
            id: res2.moveId,
            type: "match",
            result: "pending",
            judgmentVotes: { attackerVote: null, defenderVote: null },
          },
        ],
      };
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game3a });

      const res3a = await (judgeTrick as any)(
        { gameId: "flow-g", moveId: res2.moveId, vote: "landed", idempotencyKey: "f3a" },
        makeContext({ uid: "p1" })
      );
      expect(res3a.waitingForOtherVote).toBe(true);

      // Step 3b: Defender votes - both agree landed
      mocks.transaction.update.mockClear();
      const game3b = {
        ...game3a,
        moves: [
          {
            id: res2.moveId,
            type: "match",
            result: "pending",
            judgmentVotes: { attackerVote: "landed", defenderVote: null },
          },
        ],
      };
      mocks.transaction.get.mockResolvedValue({ exists: true, data: () => game3b });

      const res3b = await (judgeTrick as any)(
        { gameId: "flow-g", moveId: res2.moveId, vote: "landed", idempotencyKey: "f3b" },
        makeContext({ uid: "p2" })
      );
      expect(res3b.finalResult).toBe("landed");
      expect(res3b.gameCompleted).toBe(false);

      const finalUpdate = mocks.transaction.update.mock.calls[0][1];
      expect(finalUpdate.currentAttacker).toBe("p2"); // defender becomes attacker
      expect(finalUpdate.turnPhase).toBe("attacker_recording");
    });
  });
});
