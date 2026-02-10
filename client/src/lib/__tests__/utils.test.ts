/**
 * Tests for client/src/lib/utils.ts
 *
 * Covers the `cn` utility (clsx + tailwind-merge wrapper).
 */

import { describe, it, expect } from "vitest";
import { cn } from "../utils";

describe("utils", () => {
  describe("cn (className merge utility)", () => {
    // ── Basic merging ──────────────────────────────────────────────────

    it("merges multiple class names", () => {
      expect(cn("foo", "bar")).toBe("foo bar");
    });

    it("returns empty string with no arguments", () => {
      expect(cn()).toBe("");
    });

    it("returns empty string for a single empty string", () => {
      expect(cn("")).toBe("");
    });

    it("passes a single class through unchanged", () => {
      expect(cn("btn")).toBe("btn");
    });

    // ── Conditional / falsy values ─────────────────────────────────────

    it("filters out false values", () => {
      expect(cn("base", false && "hidden", "visible")).toBe("base visible");
    });

    it("filters out undefined and null values", () => {
      expect(cn("base", undefined, null, "end")).toBe("base end");
    });

    it("filters out 0 (falsy number)", () => {
      expect(cn("a", 0 && "b", "c")).toBe("a c");
    });

    // ── Object syntax (clsx feature) ───────────────────────────────────

    it("includes keys with truthy values from an object", () => {
      expect(cn({ hidden: true, visible: false })).toBe("hidden");
    });

    it("merges object and string inputs together", () => {
      expect(cn("base", { active: true, disabled: false })).toBe("base active");
    });

    // ── Array syntax (clsx feature) ────────────────────────────────────

    it("flattens array inputs", () => {
      expect(cn(["foo", "bar"])).toBe("foo bar");
    });

    it("handles nested arrays", () => {
      expect(cn(["a", ["b", "c"]])).toBe("a b c");
    });

    // ── Tailwind-merge conflict resolution ─────────────────────────────

    it("resolves conflicting padding utilities (last wins)", () => {
      expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
    });

    it("resolves conflicting text color utilities", () => {
      expect(cn("text-red-500", "text-blue-600")).toBe("text-blue-600");
    });

    it("resolves conflicting margin utilities", () => {
      expect(cn("mt-2 mb-4", "mt-6")).toBe("mb-4 mt-6");
    });

    it("keeps non-conflicting utilities", () => {
      expect(cn("p-4 text-center", "bg-red-500")).toBe("p-4 text-center bg-red-500");
    });

    it("resolves conflicting display utilities", () => {
      expect(cn("block", "flex")).toBe("flex");
    });

    it("resolves conflicting font-weight utilities", () => {
      expect(cn("font-bold", "font-normal")).toBe("font-normal");
    });

    // ── Mixed inputs ───────────────────────────────────────────────────

    it("handles a realistic component className pattern", () => {
      const isActive = true;
      const isDisabled = false;
      const result = cn(
        "rounded-md px-4 py-2 font-medium",
        isActive && "bg-blue-500 text-white",
        isDisabled && "opacity-50 cursor-not-allowed"
      );
      expect(result).toBe("rounded-md px-4 py-2 font-medium bg-blue-500 text-white");
    });

    it("allows overriding base styles via a className prop", () => {
      const baseClasses = "rounded-md bg-gray-100 text-sm";
      const overrides = "bg-blue-500 text-lg";
      const result = cn(baseClasses, overrides);
      expect(result).toBe("rounded-md bg-blue-500 text-lg");
    });
  });
});
