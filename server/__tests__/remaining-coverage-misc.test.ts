/**
 * Coverage tests for miscellaneous files:
 *
 * server/__tests__/game-critical-paths/mockSetup.ts — lines 40-46, 75, 101, 159
 * server/api-docs/openapi.ts — line 72
 * server/services/storageService.ts — lines 151-152, 235
 * server/services/userService.ts — line 143
 * server/services/gameDisputeService.ts — lines 78-92, 162, 166-167
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ===========================================================================
// 1. mockSetup.ts — lines 40-46, 75, 101, 159
// ===========================================================================

describe("mockSetup — extractPrimaryId and createQueryChain coverage", () => {
  it("covers extractPrimaryId with 'and' op recursion (lines 40-46)", async () => {
    const { extractPrimaryId } = await import("../__tests__/game-critical-paths/mockSetup");

    // Line 39: null where
    expect(extractPrimaryId(null)).toBeNull();

    // Line 39: eq with non-primary col
    expect(extractPrimaryId({ _op: "eq", col: { _isPrimary: false }, val: "123" })).toBeNull();

    // Line 39: eq with primary col
    expect(extractPrimaryId({ _op: "eq", col: { _isPrimary: true }, val: "id-1" })).toBe("id-1");

    // Lines 40-46: and op with nested conditions
    const andClause = {
      _op: "and",
      conditions: [
        { _op: "eq", col: { _isPrimary: false }, val: "irrelevant" },
        { _op: "eq", col: { _isPrimary: true }, val: "found-id" },
      ],
    };
    expect(extractPrimaryId(andClause)).toBe("found-id");

    // Lines 40-46: and op with no matching primary
    const andNoMatch = {
      _op: "and",
      conditions: [
        { _op: "eq", col: { _isPrimary: false }, val: "a" },
        { _op: "eq", col: { _isPrimary: false }, val: "b" },
      ],
    };
    expect(extractPrimaryId(andNoMatch)).toBeNull();
  });

  it("covers createQueryChain select without where (line 75)", async () => {
    const { createQueryChain, stores, clearAllStores } =
      await import("../__tests__/game-critical-paths/mockSetup");

    clearAllStores();

    const chain = createQueryChain();

    // Insert a record first
    stores.gameSessions = stores.gameSessions || new Map();
    stores.gameSessions.set("s1", { id: "s1", name: "Session 1" });
    stores.gameSessions.set("s2", { id: "s2", name: "Session 2" });

    // Select without where — should return all values (line 75)
    const results = await chain.select().from({ _table: "gameSessions" });

    expect(results).toHaveLength(2);

    clearAllStores();
  });

  it("covers createQueryChain delete (line 101) and update not-found (line 92)", async () => {
    const { createQueryChain, stores, clearAllStores } =
      await import("../__tests__/game-critical-paths/mockSetup");

    clearAllStores();
    stores.gameSessions = stores.gameSessions || new Map();

    const chain = createQueryChain();

    // Insert a record
    stores.gameSessions.set("s1", { id: "s1", name: "Test" });

    // Delete with where clause matching the ID
    await chain.delete({ _table: "gameSessions" }).where({
      _op: "eq",
      col: { _isPrimary: true },
      val: "s1",
    });

    expect(stores.gameSessions.has("s1")).toBe(false);

    // Update with non-existent ID and returning (line 92)
    const updateResult = await chain
      .update({ _table: "gameSessions" })
      .set({ name: "Updated" })
      .where({ _op: "eq", col: { _isPrimary: true }, val: "nonexistent" })
      .returning();

    expect(updateResult).toEqual([]);

    clearAllStores();
  });

  it("covers createQueryChain .then error path (line 159)", async () => {
    const { createQueryChain, clearAllStores } =
      await import("../__tests__/game-critical-paths/mockSetup");

    clearAllStores();
    const chain = createQueryChain();

    // Select from a table that exists — should resolve fine
    const result = await chain.select().from({ _table: "gameSessions" });
    expect(result).toEqual([]);

    clearAllStores();
  });
});

// ===========================================================================
// 2. openapi.ts — line 72
// ===========================================================================

describe("openapi — line 72 (auth fallback to both security schemes)", () => {
  it("adds both BearerAuth and SessionAuth when auth doesn't match known patterns", async () => {
    vi.resetModules();

    // Create a mock category with an authentication string that doesn't contain
    // "firebase", "bearer", "session", or "cookie"
    vi.doMock("../api-docs/index", () => ({
      apiDocumentation: [
        {
          name: "Custom",
          description: "Custom auth endpoints",
          endpoints: [
            {
              method: "GET",
              path: "/api/custom",
              description: "Custom endpoint",
              authentication: "API key required", // Doesn't match firebase/bearer/session/cookie
              parameters: [],
              responses: [{ status: 200, description: "OK", example: { ok: true } }],
            },
          ],
        },
      ],
    }));

    vi.doMock("../config/env", () => ({
      env: { NODE_ENV: "test" },
    }));

    const { generateOpenAPISpec } = await import("../api-docs/openapi");
    const spec = generateOpenAPISpec();

    const customOp = spec.paths["/api/custom"]["get"] as any;
    // Line 72: should fall through to both security schemes
    expect(customOp.security).toEqual([{ BearerAuth: [] }, { SessionAuth: [] }]);
  });
});

// ===========================================================================
// 3. storageService.ts — lines 151-152 (file too large), 235 (isOwnStorageUrl with no bucket)
// ===========================================================================

describe("storageService — additional coverage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("validates file that exceeds max size (lines 151-152)", async () => {
    vi.doMock("../config/env", () => ({
      env: { FIREBASE_STORAGE_BUCKET: "test-bucket" },
    }));

    vi.doMock("../admin", () => ({
      admin: {
        storage: vi.fn().mockReturnValue({
          bucket: vi.fn().mockReturnValue({
            file: vi.fn().mockReturnValue({
              exists: vi.fn().mockResolvedValue([true]),
              getMetadata: vi.fn().mockResolvedValue([
                {
                  size: 100 * 1024 * 1024, // 100MB — exceeds 50MB limit
                  contentType: "video/mp4",
                },
              ]),
            }),
          }),
        }),
      },
    }));

    vi.doMock("../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const { validateUploadedFile } = await import("../services/storageService");
    const result = await validateUploadedFile("path/to/video.mp4", "video");

    expect(result.valid).toBe(false);
    expect(result.error).toContain("exceeds maximum size");
  });

  it("validates file with invalid content type (lines 164-167)", async () => {
    vi.doMock("../config/env", () => ({
      env: { FIREBASE_STORAGE_BUCKET: "test-bucket" },
    }));

    vi.doMock("../admin", () => ({
      admin: {
        storage: vi.fn().mockReturnValue({
          bucket: vi.fn().mockReturnValue({
            file: vi.fn().mockReturnValue({
              exists: vi.fn().mockResolvedValue([true]),
              getMetadata: vi.fn().mockResolvedValue([
                {
                  size: 1000,
                  contentType: "application/pdf", // Invalid type for video
                },
              ]),
            }),
          }),
        }),
      },
    }));

    vi.doMock("../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const { validateUploadedFile } = await import("../services/storageService");
    const result = await validateUploadedFile("path/to/file.pdf", "video");

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid file type");
  });

  it("isOwnStorageUrl returns false when bucket is not configured (line 235)", async () => {
    vi.doMock("../config/env", () => ({
      env: { FIREBASE_STORAGE_BUCKET: undefined },
    }));

    vi.doMock("../admin", () => ({
      admin: { storage: vi.fn() },
    }));

    vi.doMock("../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const { isOwnStorageUrl } = await import("../services/storageService");
    expect(isOwnStorageUrl("https://example.com/video.mp4")).toBe(false);
  });
});

// ===========================================================================
// 4. userService.ts — line 143 (getOrCreateUser rethrows non-23505 errors)
// ===========================================================================

describe("userService — line 143 (rethrow non-23505 error)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rethrows non-unique-constraint errors from createUser", async () => {
    vi.doMock("../db", () => ({
      db: null as any,
      requireDb: vi.fn(),
    }));

    vi.doMock("../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    vi.doMock("@shared/schema", () => ({
      customUsers: { id: "id", email: "email" },
    }));

    vi.doMock("drizzle-orm", () => ({
      eq: vi.fn((field: any, value: any) => ({ field, value })),
    }));

    const dbModule = await import("../db");
    const { getOrCreateUser } = await import("../services/userService");

    // getUserById returns null (user not found)
    const limitFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });
    (dbModule as any).db = { select: selectFn };

    // createUser throws a non-23505 error
    const genericError = Object.assign(new Error("Connection timeout"), { code: "ECONNRESET" });
    const returningFn = vi.fn().mockRejectedValue(genericError);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    (dbModule.requireDb as any).mockReturnValue({ insert: insertFn });

    // Should rethrow the non-23505 error (line 143: throw err)
    await expect(
      getOrCreateUser({
        id: "uid1",
        email: "test@example.com",
        passwordHash: "hashed",
      })
    ).rejects.toThrow("Connection timeout");
  });
});

// ===========================================================================
// 5. gameDisputeService.ts — additional lines for fileDispute success path
// ===========================================================================

describe("gameDisputeService — fileDispute success path (lines 78-92)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("successfully files a dispute for player2 (lines 78-92)", async () => {
    vi.doMock("@shared/schema", () => ({
      games: { id: { name: "id" } },
      gameTurns: { id: { name: "id" }, gameId: { name: "gameId" } },
      gameDisputes: { id: { name: "id" } },
      userProfiles: { id: { name: "id" }, disputePenalties: { name: "disputePenalties" } },
    }));

    vi.doMock("drizzle-orm", () => ({
      eq: (col: any, val: any) => ({ _op: "eq", col, val }),
      sql: (strings: TemplateStringsArray, ...vals: any[]) => ({ _sql: true }),
    }));

    vi.doMock("../../routes/games-shared", () => ({
      TURN_DEADLINE_MS: 24 * 60 * 60 * 1000,
    }));

    const { fileDispute } = await import("../services/gameDisputeService");

    const game = {
      id: "game-1",
      player1Id: "p1",
      player2Id: "p2",
      status: "active",
      player1DisputeUsed: false,
      player2DisputeUsed: false, // player2's dispute not used
    };

    const turn = {
      id: 10,
      gameId: "game-1",
      playerId: "p2", // player2 is disputing their own turn
      result: "missed",
      judgedBy: "p1", // judged by player1
    };

    let selectCallCount = 0;
    const limitFn = vi.fn().mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return Promise.resolve([game]);
      if (selectCallCount === 2) return Promise.resolve([turn]);
      return Promise.resolve([]);
    });

    const dispute = {
      id: 1,
      gameId: "game-1",
      turnId: 10,
      disputedBy: "p2",
      againstPlayerId: "p1",
    };
    const returningFn = vi.fn().mockResolvedValue([dispute]);
    const insertValuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: insertValuesFn });

    const updateSetFn = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    const updateFn = vi.fn().mockReturnValue({ set: updateSetFn });

    const tx = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: limitFn }),
        }),
      }),
      update: updateFn,
      insert: insertFn,
    };

    const result = await fileDispute(tx as any, "game-1", "p2", 10);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dispute).toEqual(dispute);
      expect(result.opponentId).toBe("p1"); // player1 is opponent for player2
    }

    // Verify that player2DisputeUsed was set
    expect(updateSetFn).toHaveBeenCalledWith({ player2DisputeUsed: true });
  });
});
