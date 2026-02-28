import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  StyleSheet: { create: (s: any) => s },
  TouchableOpacity: "TouchableOpacity",
}));

vi.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

vi.mock("@/theme", () => ({
  SKATE: {
    colors: {
      ink: "#0a0a0a",
      orange: "#ff6600",
      white: "#fff",
      grime: "#1a1a1a",
      gray: "#666",
      lightGray: "#aaa",
    },
    fontSize: { xxl: 24, md: 16, lg: 18, sm: 14 },
    fontWeight: { bold: "bold", semibold: "600" },
    spacing: { sm: 8, md: 12, xl: 20, xxl: 24 },
    borderRadius: { md: 8 },
    accessibility: { minimumTouchTarget: 44 },
  },
}));

declare const globalThis: { __DEV__: boolean };
globalThis.__DEV__ = false;

import { ScreenErrorBoundary } from "./ScreenErrorBoundary";

describe("ScreenErrorBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is a class component with getDerivedStateFromError", () => {
    expect(ScreenErrorBoundary).toBeDefined();
    expect(ScreenErrorBoundary.getDerivedStateFromError).toBeDefined();
  });

  it("getDerivedStateFromError returns error state", () => {
    const error = new Error("Test error");
    const state = ScreenErrorBoundary.getDerivedStateFromError(error);
    expect(state.hasError).toBe(true);
    expect(state.errorMessage).toBe("Test error");
  });

  it("getDerivedStateFromError handles empty message", () => {
    const error = new Error("");
    const state = ScreenErrorBoundary.getDerivedStateFromError(error);
    expect(state.hasError).toBe(true);
    expect(state.errorMessage).toBe("An unexpected error occurred");
  });

  it("initial state has no error", () => {
    const instance = new ScreenErrorBoundary({ children: null });
    expect(instance.state.hasError).toBe(false);
    expect(instance.state.errorMessage).toBeNull();
  });

  it("handleRetry resets error state", () => {
    const instance = new ScreenErrorBoundary({ children: null });
    instance.setState = vi.fn();
    instance.handleRetry();
    expect(instance.setState).toHaveBeenCalledWith({ hasError: false, errorMessage: null });
  });
});
