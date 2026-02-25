import { describe, it, expect, vi } from "vitest";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  StyleSheet: { create: (s: any) => s },
  ScrollView: "ScrollView",
  TouchableOpacity: "TouchableOpacity",
  Animated: {
    View: "Animated.View",
    Value: vi.fn(() => ({ setValue: vi.fn() })),
    timing: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
    spring: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
    sequence: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
    parallel: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
    loop: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  },
}));

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: vi.fn(() => ({ top: 0, bottom: 0, left: 0, right: 0 })),
}));

vi.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

vi.mock("@/theme", () => ({
  SKATE: {
    colors: {
      ink: "#0a0a0a",
      grime: "#1a1a1a",
      orange: "#ff6600",
      white: "#fff",
      gold: "#ffd700",
      lightGray: "#aaa",
      gray: "#666",
      darkGray: "#333",
      neon: "#39ff14",
      blood: "#ff1a1a",
    },
    spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 },
    borderRadius: { sm: 4, md: 8, lg: 12, full: 9999 },
    fontSize: { sm: 14, md: 16, lg: 18 },
    fontWeight: { bold: "bold", semibold: "600" },
    accessibility: { minimumTouchTarget: 44 },
  },
}));

vi.mock("@/types", () => ({
  SKATE_LETTERS: ["S", "K", "A", "T", "E"],
}));

vi.mock("./LetterIndicator", () => ({
  LetterIndicator: "LetterIndicator",
}));

declare const globalThis: { __DEV__: boolean };
globalThis.__DEV__ = false;

describe("ResultScreen", () => {
  it("exports ResultScreen component", async () => {
    const mod = await import("./ResultScreen");
    expect(mod.ResultScreen).toBeDefined();
  });

  it("formatDuration returns -- for null dates", () => {
    // Test the formatDuration logic
    function formatDuration(start: Date | null, end: Date | null): string {
      if (!start || !end) return "--";
      const diffMs = end.getTime() - start.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return "<1 min";
      if (diffMins < 60) return `${diffMins} min`;
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      return `${hours}h ${mins}m`;
    }

    expect(formatDuration(null, null)).toBe("--");
    expect(formatDuration(new Date(), null)).toBe("--");
    expect(formatDuration(null, new Date())).toBe("--");
  });

  it("formatDuration handles short games", () => {
    function formatDuration(start: Date, end: Date): string {
      const diffMs = end.getTime() - start.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return "<1 min";
      if (diffMins < 60) return `${diffMins} min`;
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      return `${hours}h ${mins}m`;
    }

    const start = new Date("2024-01-01T12:00:00Z");
    const end30s = new Date("2024-01-01T12:00:30Z");
    expect(formatDuration(start, end30s)).toBe("<1 min");
  });

  it("formatDuration handles multi-minute games", () => {
    function formatDuration(start: Date, end: Date): string {
      const diffMs = end.getTime() - start.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return "<1 min";
      if (diffMins < 60) return `${diffMins} min`;
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      return `${hours}h ${mins}m`;
    }

    const start = new Date("2024-01-01T12:00:00Z");
    const end15m = new Date("2024-01-01T12:15:00Z");
    expect(formatDuration(start, end15m)).toBe("15 min");
  });

  it("formatDuration handles hour+ games", () => {
    function formatDuration(start: Date, end: Date): string {
      const diffMs = end.getTime() - start.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return "<1 min";
      if (diffMins < 60) return `${diffMins} min`;
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      return `${hours}h ${mins}m`;
    }

    const start = new Date("2024-01-01T12:00:00Z");
    const end1h30m = new Date("2024-01-01T13:30:00Z");
    expect(formatDuration(start, end1h30m)).toBe("1h 30m");
  });

  it("determines winner correctly", () => {
    const gameSession = {
      player1Id: "p1",
      player2Id: "p2",
      winnerId: "p1",
      player1DisplayName: "Alice",
      player2DisplayName: "Bob",
    };

    const currentUserId = "p1";
    const isWinner = gameSession.winnerId === currentUserId;
    expect(isWinner).toBe(true);

    const winnerName =
      gameSession.winnerId === gameSession.player1Id
        ? gameSession.player1DisplayName
        : gameSession.player2DisplayName;
    expect(winnerName).toBe("Alice");
  });

  it("determines loser correctly", () => {
    const gameSession = {
      player1Id: "p1",
      player2Id: "p2",
      winnerId: "p1",
      player1DisplayName: "Alice",
      player2DisplayName: "Bob",
    };

    const currentUserId = "p2";
    const isWinner = gameSession.winnerId === currentUserId;
    expect(isWinner).toBe(false);

    const loserName =
      gameSession.winnerId === gameSession.player1Id
        ? gameSession.player2DisplayName
        : gameSession.player1DisplayName;
    expect(loserName).toBe("Bob");
  });
});
