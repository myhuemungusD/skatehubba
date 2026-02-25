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
    colors: { grime: "#1a1a1a", orange: "#ff6600", white: "#fff", lightGray: "#aaa" },
    spacing: { sm: 8, md: 12, lg: 16, xl: 20 },
    borderRadius: { md: 8, sm: 4 },
  },
}));

declare const globalThis: { __DEV__: boolean };
globalThis.__DEV__ = false;

import { VideoErrorBoundary } from "./VideoErrorBoundary";

describe("VideoErrorBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is a class component with getDerivedStateFromError", () => {
    expect(VideoErrorBoundary).toBeDefined();
    expect(VideoErrorBoundary.getDerivedStateFromError).toBeDefined();
  });

  it("getDerivedStateFromError returns error state", () => {
    const error = new Error("Video decode failed");
    const state = VideoErrorBoundary.getDerivedStateFromError(error);
    expect(state.hasError).toBe(true);
    expect(state.errorMessage).toBe("Video decode failed");
  });

  it("getDerivedStateFromError uses default message for empty error", () => {
    const error = new Error("");
    const state = VideoErrorBoundary.getDerivedStateFromError(error);
    expect(state.hasError).toBe(true);
    expect(state.errorMessage).toBe("Video failed to load");
  });

  it("initial state has no error", () => {
    const instance = new VideoErrorBoundary({ children: null });
    expect(instance.state.hasError).toBe(false);
    expect(instance.state.errorMessage).toBeNull();
  });

  it("handleRetry resets error state and calls onRetry", () => {
    const onRetry = vi.fn();
    const instance = new VideoErrorBoundary({ children: null, onRetry });
    instance.setState = vi.fn();
    instance.handleRetry();
    expect(instance.setState).toHaveBeenCalledWith({ hasError: false, errorMessage: null });
    expect(onRetry).toHaveBeenCalled();
  });

  it("handleRetry works without onRetry callback", () => {
    const instance = new VideoErrorBoundary({ children: null });
    instance.setState = vi.fn();
    instance.handleRetry();
    expect(instance.setState).toHaveBeenCalledWith({ hasError: false, errorMessage: null });
  });
});
