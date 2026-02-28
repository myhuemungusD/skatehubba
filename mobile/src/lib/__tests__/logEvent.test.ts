import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetItem, mockSetItem, mockRemoveItem, mockGetIdToken } = vi.hoisted(() => ({
  mockGetItem: vi.fn(),
  mockSetItem: vi.fn(),
  mockRemoveItem: vi.fn(),
  mockGetIdToken: vi.fn().mockResolvedValue("test-token-abc"),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: mockGetItem,
    setItem: mockSetItem,
    removeItem: mockRemoveItem,
  },
}));

vi.mock("expo-application", () => ({
  nativeApplicationVersion: "1.0.0",
}));

vi.mock("expo-crypto", () => ({
  randomUUID: vi.fn(() => "test-uuid-123"),
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

vi.mock("@/lib/firebase.config", () => ({
  auth: {
    currentUser: {
      uid: "user-123",
      getIdToken: mockGetIdToken,
    },
  },
}));

vi.mock("shared/analytics-events", () => ({
  AnalyticsIngestSchema: {
    safeParse: vi.fn((data: any) => ({ success: true, data })),
  },
}));

declare const globalThis: { __DEV__: boolean; fetch: any };
globalThis.__DEV__ = false;

const mockFetch = vi.fn().mockResolvedValue({ ok: true });
globalThis.fetch = mockFetch;

import { logEvent, clearAnalyticsSession } from "../analytics/logEvent";

describe("logEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true });
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
  });

  it("sends POST request with auth token", async () => {
    await logEvent("battle_created" as any, { battle_id: "123" });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/analytics/events");
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("Bearer test-token-abc");
  });

  it("includes event_name in payload", async () => {
    await logEvent("battle_created" as any, {});
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.event_name).toBe("battle_created");
  });

  it("includes session_id in payload", async () => {
    mockGetItem.mockResolvedValue("existing-session");
    await logEvent("battle_created" as any, {});
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.session_id).toBe("existing-session");
  });

  it("silently fails on fetch error", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    await expect(logEvent("battle_created" as any, {})).resolves.toBeUndefined();
  });
});

describe("clearAnalyticsSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes session key from AsyncStorage", async () => {
    mockRemoveItem.mockResolvedValue(undefined);
    await clearAnalyticsSession();
    expect(mockRemoveItem).toHaveBeenCalledWith("skatehubba_session_id");
  });
});
