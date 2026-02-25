import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("verifyCronSecret", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns false when CRON_SECRET is not set", async () => {
    delete process.env.CRON_SECRET;
    const { verifyCronSecret } = await import("../cronAuth");
    expect(verifyCronSecret("Bearer something")).toBe(false);
  });

  it("returns true for a valid Bearer token", async () => {
    vi.stubEnv("CRON_SECRET", "my-secret");
    vi.resetModules();
    const { verifyCronSecret } = await import("../cronAuth");
    expect(verifyCronSecret("Bearer my-secret")).toBe(true);
  });

  it("returns false for an invalid Bearer token", async () => {
    vi.stubEnv("CRON_SECRET", "my-secret");
    vi.resetModules();
    const { verifyCronSecret } = await import("../cronAuth");
    expect(verifyCronSecret("Bearer wrong-secret")).toBe(false);
  });

  it("returns false when authHeader is undefined", async () => {
    vi.stubEnv("CRON_SECRET", "my-secret");
    vi.resetModules();
    const { verifyCronSecret } = await import("../cronAuth");
    expect(verifyCronSecret(undefined)).toBe(false);
  });

  it("returns false when authHeader length does not match", async () => {
    vi.stubEnv("CRON_SECRET", "my-secret");
    vi.resetModules();
    const { verifyCronSecret } = await import("../cronAuth");
    expect(verifyCronSecret("short")).toBe(false);
  });

  it("returns false when timingSafeEqual throws (buffer length mismatch)", async () => {
    // "àb" has JS length 2 but 3 UTF-8 bytes; "ab" has 2 bytes
    // "Bearer àb" and "Bearer ab" have the same JS .length (9) but different byte lengths
    vi.stubEnv("CRON_SECRET", "ab");
    vi.resetModules();
    const { verifyCronSecret } = await import("../cronAuth");
    expect(verifyCronSecret("Bearer \u00e0b")).toBe(false);
  });
});
