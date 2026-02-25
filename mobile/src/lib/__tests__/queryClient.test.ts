import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockValidateRequestDomain,
  mockReportPossiblePinningFailure,
  mockGetAppCheckToken,
  mockShowMessage,
  mockGetIdToken,
} = vi.hoisted(() => ({
  mockValidateRequestDomain: vi.fn(),
  mockReportPossiblePinningFailure: vi.fn(),
  mockGetAppCheckToken: vi.fn(),
  mockShowMessage: vi.fn(),
  mockGetIdToken: vi.fn().mockResolvedValue("auth-token-xyz"),
}));

vi.mock("@/lib/certificatePinning", () => ({
  validateRequestDomain: mockValidateRequestDomain,
  reportPossiblePinningFailure: mockReportPossiblePinningFailure,
}));

vi.mock("@/lib/appCheck", () => ({
  getAppCheckToken: mockGetAppCheckToken,
}));

vi.mock("react-native-flash-message", () => ({
  showMessage: mockShowMessage,
}));

vi.mock("@/lib/firebase.config", () => ({
  auth: {
    currentUser: {
      uid: "user-123",
      getIdToken: mockGetIdToken,
    },
  },
}));

vi.mock("@tanstack/react-query", () => ({
  QueryClient: class MockQueryClient {
    defaultOptions: any;
    constructor(opts?: any) {
      this.defaultOptions = opts?.defaultOptions ?? {};
    }
  },
}));

declare const globalThis: { __DEV__: boolean; fetch: any };
globalThis.__DEV__ = false;

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { apiRequest } from "../queryClient";

describe("apiRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateRequestDomain.mockReturnValue({ allowed: true });
    mockGetAppCheckToken.mockResolvedValue("appcheck-token");
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: "test" }),
    });
  });

  it("builds correct URL from endpoint", async () => {
    await apiRequest("/api/users");
    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("/api/users");
  });

  it("injects Authorization header", async () => {
    await apiRequest("/api/users");
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer auth-token-xyz");
  });

  it("injects App Check token header", async () => {
    await apiRequest("/api/users");
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers["X-Firebase-AppCheck"]).toBe("appcheck-token");
  });

  it("validates domain before fetching", async () => {
    await apiRequest("/api/test");
    expect(mockValidateRequestDomain).toHaveBeenCalled();
  });

  it("throws when domain is not allowed", async () => {
    mockValidateRequestDomain.mockReturnValue({ allowed: false, reason: "untrusted" });
    await expect(apiRequest("/api/test")).rejects.toThrow("Request blocked: untrusted");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws on HTTP error with error message", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: vi.fn().mockResolvedValue({ error: "Forbidden" }),
    });
    await expect(apiRequest("/api/secret")).rejects.toThrow("Forbidden");
  });

  it("reports possible pinning failure on network error", async () => {
    const networkError = new Error("Network request failed");
    mockFetch.mockRejectedValue(networkError);
    await expect(apiRequest("/api/test")).rejects.toThrow("Network request failed");
    expect(mockReportPossiblePinningFailure).toHaveBeenCalled();
  });
});
