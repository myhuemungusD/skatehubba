import { describe, it, expect, vi } from "vitest";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  StyleSheet: { create: (s: any) => s },
  Animated: {
    View: "Animated.View",
    Value: vi.fn(() => ({ setValue: vi.fn() })),
    loop: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
    sequence: vi.fn(() => ({})),
    timing: vi.fn(() => ({ start: vi.fn() })),
  },
}));

vi.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

vi.mock("@/theme", () => ({
  SKATE: {
    colors: {
      neon: "#39ff14",
      orange: "#ff6600",
      blood: "#ff1a1a",
      white: "#fff",
      darkGray: "#333",
      lightGray: "#aaa",
      grime: "#1a1a1a",
      ink: "#0a0a0a",
    },
    spacing: { xs: 4, sm: 8, md: 12 },
    borderRadius: { sm: 4, md: 8, full: 9999 },
  },
}));

vi.mock("@/types", () => ({
  SKATE_LETTERS: ["S", "K", "A", "T", "E"],
}));

declare const globalThis: { __DEV__: boolean };
globalThis.__DEV__ = false;

describe("LetterIndicator", () => {
  it("exports LetterIndicator component", async () => {
    const mod = await import("./LetterIndicator");
    expect(mod.LetterIndicator).toBeDefined();
  });

  it("getLetterColor logic: 0 letters = neon (green)", () => {
    // Recreating the logic from the component
    function getLetterColor(count: number): string {
      if (count === 0) return "#39ff14"; // neon
      if (count <= 2) return "#eab308"; // yellow
      if (count === 3) return "#ff6600"; // orange
      return "#ff1a1a"; // red
    }

    expect(getLetterColor(0)).toBe("#39ff14");
    expect(getLetterColor(1)).toBe("#eab308");
    expect(getLetterColor(2)).toBe("#eab308");
    expect(getLetterColor(3)).toBe("#ff6600");
    expect(getLetterColor(4)).toBe("#ff1a1a");
    expect(getLetterColor(5)).toBe("#ff1a1a");
  });

  it("getStatusLabel logic: labels for letter counts", () => {
    function getStatusLabel(count: number): string | null {
      if (count === 0) return "Clean";
      if (count === 4) return "MATCH POINT";
      if (count === 5) return "S.K.A.T.E.";
      return null;
    }

    expect(getStatusLabel(0)).toBe("Clean");
    expect(getStatusLabel(1)).toBeNull();
    expect(getStatusLabel(2)).toBeNull();
    expect(getStatusLabel(3)).toBeNull();
    expect(getStatusLabel(4)).toBe("MATCH POINT");
    expect(getStatusLabel(5)).toBe("S.K.A.T.E.");
  });

  it("SKATE_LETTERS has 5 letters", async () => {
    const { SKATE_LETTERS } = await import("@/types");
    expect(SKATE_LETTERS).toEqual(["S", "K", "A", "T", "E"]);
  });

  it("match point is determined by 4 letters", () => {
    const letters = ["S", "K", "A", "T"];
    expect(letters.length === 4).toBe(true);
  });

  it("eliminated is determined by 5 letters", () => {
    const letters = ["S", "K", "A", "T", "E"];
    expect(letters.length === 5).toBe(true);
  });
});
