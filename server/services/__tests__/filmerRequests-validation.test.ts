/**
 * Tests for filmerRequests/validation.ts
 * Covers ensureTrust and ensureFilmerEligible guard functions
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetDb = vi.hoisted(() => vi.fn());

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("@shared/schema", () => ({
  customUsers: {
    id: { name: "id" },
    isActive: { name: "isActive" },
  },
  userProfiles: {
    id: { name: "id" },
    roles: { name: "roles" },
    filmerVerified: { name: "filmerVerified" },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

import { ensureTrust, ensureFilmerEligible } from "../filmerRequests/validation";
import { FilmerRequestError } from "../filmerRequests/types";

describe("ensureTrust", () => {
  it("does not throw when trust level meets threshold", () => {
    expect(() => ensureTrust(1)).not.toThrow();
    expect(() => ensureTrust(5)).not.toThrow();
  });

  it("throws INSUFFICIENT_TRUST when trust level is below threshold", () => {
    try {
      ensureTrust(0);
      expect.fail("Expected FilmerRequestError");
    } catch (e) {
      expect(e).toBeInstanceOf(FilmerRequestError);
      expect((e as FilmerRequestError).code).toBe("INSUFFICIENT_TRUST");
      expect((e as FilmerRequestError).status).toBe(403);
    }
  });
});

describe("ensureFilmerEligible", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupDb(userResult: unknown[], profileResult: unknown[]) {
    let selectCallCount = 0;
    const db = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              selectCallCount++;
              if (selectCallCount === 1) return Promise.resolve(userResult);
              return Promise.resolve(profileResult);
            }),
          }),
        }),
      })),
    };
    mockGetDb.mockReturnValue(db);
    return db;
  }

  it("throws FILMER_NOT_FOUND when filmer does not exist", async () => {
    setupDb([], []);

    try {
      await ensureFilmerEligible("nonexistent");
      expect.fail("Expected FilmerRequestError");
    } catch (e) {
      expect(e).toBeInstanceOf(FilmerRequestError);
      expect((e as FilmerRequestError).code).toBe("FILMER_NOT_FOUND");
      expect((e as FilmerRequestError).status).toBe(404);
    }
  });

  it("throws FILMER_INACTIVE when filmer is not active", async () => {
    setupDb([{ isActive: false }], []);

    try {
      await ensureFilmerEligible("inactive-filmer");
      expect.fail("Expected FilmerRequestError");
    } catch (e) {
      expect(e).toBeInstanceOf(FilmerRequestError);
      expect((e as FilmerRequestError).code).toBe("FILMER_INACTIVE");
      expect((e as FilmerRequestError).status).toBe(403);
    }
  });

  it("throws FILMER_NOT_ELIGIBLE when filmer has no roles or verification", async () => {
    setupDb([{ isActive: true }], [{ filmerVerified: false, roles: null }]);

    try {
      await ensureFilmerEligible("unverified-filmer");
      expect.fail("Expected FilmerRequestError");
    } catch (e) {
      expect(e).toBeInstanceOf(FilmerRequestError);
      expect((e as FilmerRequestError).code).toBe("FILMER_NOT_ELIGIBLE");
      expect((e as FilmerRequestError).status).toBe(403);
    }
  });

  it("succeeds when filmer is active and verified", async () => {
    setupDb([{ isActive: true }], [{ filmerVerified: true, roles: null }]);
    await expect(ensureFilmerEligible("verified-filmer")).resolves.toBeUndefined();
  });

  it("succeeds when filmer is active and has filmer role", async () => {
    setupDb([{ isActive: true }], [{ filmerVerified: false, roles: { filmer: true } }]);
    await expect(ensureFilmerEligible("role-filmer")).resolves.toBeUndefined();
  });
});
