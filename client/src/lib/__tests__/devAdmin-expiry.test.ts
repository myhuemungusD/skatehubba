/**
 * @fileoverview Coverage tests for devAdmin.ts lines 27-29 (expiry branch)
 *
 * Covers the code path where devAdmin is enabled but the session has expired,
 * causing isDevAdmin() to return false and clear sessionStorage.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("devAdmin expiry", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false and clears storage when devAdmin session expired (lines 27-29)", async () => {
    const pastExpiry = String(Date.now() - 60000); // expired 1 minute ago
    const mockGetItem = vi.fn((key: string) => {
      if (key === "devAdmin") return "true";
      if (key === "devAdminExpiry") return pastExpiry;
      return null;
    });
    const mockRemoveItem = vi.fn();

    vi.stubGlobal("window", {
      location: { hostname: "localhost" },
      sessionStorage: {
        getItem: mockGetItem,
        setItem: vi.fn(),
        removeItem: mockRemoveItem,
      },
    });

    const { isDevAdmin } = await import("../devAdmin");
    expect(isDevAdmin()).toBe(false);
    expect(mockRemoveItem).toHaveBeenCalledWith("devAdmin");
    expect(mockRemoveItem).toHaveBeenCalledWith("devAdminExpiry");
  });

  it("returns true when devAdmin has not expired", async () => {
    const futureExpiry = String(Date.now() + 3600000); // expires in 1 hour
    const mockGetItem = vi.fn((key: string) => {
      if (key === "devAdmin") return "true";
      if (key === "devAdminExpiry") return futureExpiry;
      return null;
    });

    vi.stubGlobal("window", {
      location: { hostname: "localhost" },
      sessionStorage: {
        getItem: mockGetItem,
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    });

    const { isDevAdmin } = await import("../devAdmin");
    expect(isDevAdmin()).toBe(true);
  });

  it("returns true when devAdminExpiry is null (fallback to '0', parsed as 0) — line 25", async () => {
    // When devAdminExpiry is null, the || "0" fallback kicks in,
    // parseInt("0", 10) = 0, and the condition `expiry > 0 && Date.now() > expiry`
    // is false (since expiry = 0, the first clause fails), so it returns true.
    const mockGetItem = vi.fn((key: string) => {
      if (key === "devAdmin") return "true";
      if (key === "devAdminExpiry") return null; // triggers || "0" fallback
      return null;
    });

    vi.stubGlobal("window", {
      location: { hostname: "localhost" },
      sessionStorage: {
        getItem: mockGetItem,
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    });

    const { isDevAdmin } = await import("../devAdmin");
    expect(isDevAdmin()).toBe(true);
  });

});
