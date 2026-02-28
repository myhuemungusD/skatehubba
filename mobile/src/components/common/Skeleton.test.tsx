import { describe, it, expect, vi } from "vitest";

vi.mock("react-native", () => ({
  View: "View",
  StyleSheet: { create: (s: any) => s },
  Animated: {
    View: "Animated.View",
    Value: vi.fn(() => ({ setValue: vi.fn() })),
    loop: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
    sequence: vi.fn(() => ({})),
    timing: vi.fn(() => ({ start: vi.fn() })),
  },
}));

vi.mock("@/theme", () => ({
  SKATE: {
    colors: { ink: "#0a0a0a", darkGray: "#333", grime: "#1a1a1a" },
    spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 },
    borderRadius: { sm: 4, md: 8, lg: 12 },
  },
}));

declare const globalThis: { __DEV__: boolean };
globalThis.__DEV__ = false;

import {
  LeaderboardSkeleton,
  ChallengesSkeleton,
  UsersSkeleton,
  MapSkeleton,
  TrickMintSkeleton,
} from "./Skeleton";
import Skeleton from "./Skeleton";

describe("Skeleton components", () => {
  it("exports default Skeleton component", () => {
    expect(Skeleton).toBeDefined();
  });

  it("exports LeaderboardSkeleton", () => {
    expect(LeaderboardSkeleton).toBeDefined();
    expect(typeof LeaderboardSkeleton).toBe("function");
  });

  it("exports ChallengesSkeleton", () => {
    expect(ChallengesSkeleton).toBeDefined();
    expect(typeof ChallengesSkeleton).toBe("function");
  });

  it("exports UsersSkeleton", () => {
    expect(UsersSkeleton).toBeDefined();
    expect(typeof UsersSkeleton).toBe("function");
  });

  it("exports MapSkeleton", () => {
    expect(MapSkeleton).toBeDefined();
    expect(typeof MapSkeleton).toBe("function");
  });

  it("exports TrickMintSkeleton", () => {
    expect(TrickMintSkeleton).toBeDefined();
    expect(typeof TrickMintSkeleton).toBe("function");
  });
});
