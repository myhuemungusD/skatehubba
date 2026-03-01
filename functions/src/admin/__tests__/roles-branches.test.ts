/**
 * @fileoverview Branch-coverage tests for admin/roles.ts
 *
 * Targets the uncovered branches:
 * - Line 154: newRoles.join(", ") || "no roles" — when all roles are revoked (empty array)
 * - Line 188: (context.auth.token.roles as string[]) || [] — when token.roles is undefined
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Hoisted mock state
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

  const checkRateLimitFn = vi.fn().mockResolvedValue(undefined);

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
    checkRateLimitFn,
    logger,
  };
});

// ============================================================================
// Module mocks
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
  };

  return { ...mod, default: mod };
});

vi.mock("../../shared/rateLimit", () => ({
  checkRateLimit: (...args: any[]) => mocks.checkRateLimitFn(...args),
}));

vi.mock("../../shared/appCheck", () => ({
  verifyAppCheck: vi.fn(),
}));

// ============================================================================
// Import after mocks
// ============================================================================

const { manageUserRole, getUserRoles } = await import("../roles");

// ============================================================================
// Helpers
// ============================================================================

let uidCounter = 0;
function freshUid(prefix = "br") {
  return `${prefix}-${Date.now()}-${uidCounter++}`;
}

function adminContext(uid?: string): any {
  return {
    auth: { uid: uid || freshUid("admin"), token: { roles: ["admin"], email: "admin@test.com" } },
    app: { appId: "test-app" },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("admin/roles — uncovered branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.collectionRef.where.mockReturnValue(mocks.collectionRef);
    mocks.collectionRef.doc.mockReturnValue(mocks.docRef);
    mocks.collectionRef.get.mockResolvedValue({ docs: [] });
    mocks.firestoreInstance.collection.mockReturnValue(mocks.collectionRef);
    mocks.docRef.set.mockResolvedValue(undefined);
    mocks.docRef.get.mockResolvedValue({ exists: false, data: () => ({}), get: () => null });
    mocks.authInstance.setCustomUserClaims.mockResolvedValue(undefined);
    mocks.collectionRef.add.mockResolvedValue({ id: "log-id" });
    mocks.checkRateLimitFn.mockResolvedValue(undefined);
  });

  describe("line 154: 'no roles' fallback when all roles revoked", () => {
    it("shows 'no roles' in message when revoking the only role", async () => {
      mocks.authInstance.getUser.mockResolvedValue({
        email: "target@test.com",
        customClaims: { roles: ["moderator"] },
      });

      const ctx = adminContext();
      const res = await (manageUserRole as any)(
        { targetUid: "target-uid", role: "moderator", action: "revoke" },
        ctx
      );

      expect(res.success).toBe(true);
      expect(res.roles).toEqual([]);
      expect(res.message).toContain("no roles");
    });

    it("shows roles in message when roles remain after revoke", async () => {
      mocks.authInstance.getUser.mockResolvedValue({
        email: "target@test.com",
        customClaims: { roles: ["admin", "moderator"] },
      });

      const ctx = adminContext();
      const res = await (manageUserRole as any)(
        { targetUid: "target-uid", role: "moderator", action: "revoke" },
        ctx
      );

      expect(res.success).toBe(true);
      expect(res.roles).toEqual(["admin"]);
      expect(res.message).not.toContain("no roles");
      expect(res.message).toContain("admin");
    });
  });

  describe("line 188: token.roles || [] fallback in getUserRoles", () => {
    it("handles undefined roles in auth token (uses [] fallback)", async () => {
      // Create context where token.roles is undefined (not an array)
      const ctx = {
        auth: {
          uid: freshUid("gr-undef"),
          token: { email: "caller@test.com" },
          // Note: NO roles property
        },
        app: { appId: "test-app" },
      };

      await expect(
        (getUserRoles as any)({ targetUid: "t" }, ctx)
      ).rejects.toThrow("Only Admins can view user roles");
    });

    it("handles null roles in auth token (uses [] fallback)", async () => {
      const ctx = {
        auth: {
          uid: freshUid("gr-null"),
          token: { email: "caller@test.com", roles: null },
        },
        app: { appId: "test-app" },
      };

      await expect(
        (getUserRoles as any)({ targetUid: "t" }, ctx)
      ).rejects.toThrow("Only Admins can view user roles");
    });
  });
});
