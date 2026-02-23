import { describe, it, expect } from "vitest";
import { getTierColor } from "../getTierColor";

describe("getTierColor", () => {
  it("returns correct color for bronze", () => {
    expect(getTierColor("bronze")).toBe("#cd7f32");
  });

  it("returns correct color for silver", () => {
    expect(getTierColor("silver")).toBe("#c0c0c0");
  });

  it("returns correct color for gold", () => {
    expect(getTierColor("gold")).toBe("#ffd700");
  });

  it("returns correct color for legendary", () => {
    expect(getTierColor("legendary")).toBe("#ff6600");
  });

  it("returns bronze as default for null tier", () => {
    expect(getTierColor(null)).toBe("#cd7f32");
  });
});
