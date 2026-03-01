/**
 * Branch coverage for server/services/userService.ts line 84
 * `results[0] ?? null` — the null fallback when results array is empty
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("userService line 84 — getUserByEmail empty results", () => {
  it("returns null when query returns empty array", async () => {
    const chain: any = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockResolvedValue([]);

    vi.doMock("../../db", () => ({
      db: chain,
      requireDb: vi.fn().mockReturnValue(chain),
    }));
    vi.doMock("@shared/schema", () => ({
      customUsers: { id: "id", email: "email" },
    }));
    vi.doMock("drizzle-orm", () => ({ eq: vi.fn() }));
    vi.doMock("../../logger", () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const { getUserByEmail } = await import("../../services/userService");
    const result = await getUserByEmail("nonexistent@test.com");
    expect(result).toBeNull();
  });
});
