/**
 * Tests for client/src/lib/devAdmin.ts
 *
 * Covers: isDevAdmin() function and the side-effect that registers
 * __enableDevAdmin / __disableDevAdmin on window when running on localhost.
 *
 * Because the module has top-level side effects that inspect `window`,
 * we use vi.resetModules() + dynamic import to test different window states.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("devAdmin", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ────────────────────────────────────────────────────────────────────────
  // isDevAdmin()
  // ────────────────────────────────────────────────────────────────────────

  describe("isDevAdmin", () => {
    it("returns false when window is undefined (SSR / Node)", async () => {
      // In the default Node.js test environment, globalThis.window is undefined
      // unless we stub it. Make sure it's not set.
      delete (globalThis as any).window;

      const { isDevAdmin } = await import("../devAdmin");

      expect(isDevAdmin()).toBe(false);
    });

    it("returns false when not on localhost", async () => {
      vi.stubGlobal("window", {
        location: { hostname: "skatehubba.com" },
        sessionStorage: {
          getItem: vi.fn(() => "true"), // even if devAdmin is set
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
      });

      const { isDevAdmin } = await import("../devAdmin");

      expect(isDevAdmin()).toBe(false);
    });

    it("returns false on localhost when devAdmin is not set in sessionStorage", async () => {
      vi.stubGlobal("window", {
        location: { hostname: "localhost" },
        sessionStorage: {
          getItem: vi.fn(() => null),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
      });

      const { isDevAdmin } = await import("../devAdmin");

      expect(isDevAdmin()).toBe(false);
    });

    it("returns false on localhost when devAdmin is set to a non-'true' value", async () => {
      vi.stubGlobal("window", {
        location: { hostname: "localhost" },
        sessionStorage: {
          getItem: vi.fn(() => "false"),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
      });

      const { isDevAdmin } = await import("../devAdmin");

      expect(isDevAdmin()).toBe(false);
    });

    it("returns true on localhost when devAdmin is 'true'", async () => {
      vi.stubGlobal("window", {
        location: { hostname: "localhost" },
        sessionStorage: {
          getItem: vi.fn(() => "true"),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
      });

      const { isDevAdmin } = await import("../devAdmin");

      expect(isDevAdmin()).toBe(true);
    });

    it("calls sessionStorage.getItem with 'devAdmin'", async () => {
      const mockGetItem = vi.fn(() => "true");
      vi.stubGlobal("window", {
        location: { hostname: "localhost" },
        sessionStorage: {
          getItem: mockGetItem,
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
      });

      const { isDevAdmin } = await import("../devAdmin");
      isDevAdmin();

      expect(mockGetItem).toHaveBeenCalledWith("devAdmin");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Global helpers (side effects at module load time)
  // ────────────────────────────────────────────────────────────────────────

  describe("global helpers (side effects)", () => {
    it("attaches __enableDevAdmin on localhost", async () => {
      const mockWindow: any = {
        location: { hostname: "localhost", reload: vi.fn() },
        sessionStorage: {
          getItem: vi.fn(),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
      };
      vi.stubGlobal("window", mockWindow);

      await import("../devAdmin");

      expect(mockWindow.__enableDevAdmin).toBeTypeOf("function");
    });

    it("attaches __disableDevAdmin on localhost", async () => {
      const mockWindow: any = {
        location: { hostname: "localhost", reload: vi.fn() },
        sessionStorage: {
          getItem: vi.fn(),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
      };
      vi.stubGlobal("window", mockWindow);

      await import("../devAdmin");

      expect(mockWindow.__disableDevAdmin).toBeTypeOf("function");
    });

    it("does NOT attach helpers when not on localhost", async () => {
      const mockWindow: any = {
        location: { hostname: "skatehubba.com" },
        sessionStorage: {
          getItem: vi.fn(),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
      };
      vi.stubGlobal("window", mockWindow);

      await import("../devAdmin");

      expect(mockWindow.__enableDevAdmin).toBeUndefined();
      expect(mockWindow.__disableDevAdmin).toBeUndefined();
    });

    it("does NOT attach helpers when window is undefined", async () => {
      delete (globalThis as any).window;

      await import("../devAdmin");

      // No crash, and no global helpers set
      expect((globalThis as any).__enableDevAdmin).toBeUndefined();
      expect((globalThis as any).__disableDevAdmin).toBeUndefined();
    });

    it("__enableDevAdmin sets sessionStorage and reloads", async () => {
      const mockWindow: any = {
        location: { hostname: "localhost", reload: vi.fn() },
        sessionStorage: {
          getItem: vi.fn(),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
      };
      vi.stubGlobal("window", mockWindow);

      await import("../devAdmin");
      mockWindow.__enableDevAdmin();

      expect(mockWindow.sessionStorage.setItem).toHaveBeenCalledWith("devAdmin", "true");
      expect(mockWindow.location.reload).toHaveBeenCalled();
    });

    it("__disableDevAdmin removes sessionStorage and reloads", async () => {
      const mockWindow: any = {
        location: { hostname: "localhost", reload: vi.fn() },
        sessionStorage: {
          getItem: vi.fn(),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
      };
      vi.stubGlobal("window", mockWindow);

      await import("../devAdmin");
      mockWindow.__disableDevAdmin();

      expect(mockWindow.sessionStorage.removeItem).toHaveBeenCalledWith("devAdmin");
      expect(mockWindow.location.reload).toHaveBeenCalled();
    });
  });
});
