import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockApiRequest, mockInvalidateQueries, mockShowMessage } = vi.hoisted(() => ({
  mockApiRequest: vi.fn(),
  mockInvalidateQueries: vi.fn(),
  mockShowMessage: vi.fn(),
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: mockApiRequest,
  queryClient: { invalidateQueries: mockInvalidateQueries },
}));

vi.mock("react-native-flash-message", () => ({
  showMessage: mockShowMessage,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}));

declare const globalThis: { __DEV__: boolean };
globalThis.__DEV__ = false;

describe("useTrickMintApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("my-clips query calls correct endpoint", async () => {
    mockApiRequest.mockResolvedValue({ clips: [], total: 0, limit: 50, offset: 0 });
    const result = await mockApiRequest("/api/trickmint/my-clips?limit=50&offset=0");
    expect(mockApiRequest).toHaveBeenCalledWith("/api/trickmint/my-clips?limit=50&offset=0");
    expect(result.clips).toEqual([]);
  });

  it("feed query calls correct endpoint", async () => {
    mockApiRequest.mockResolvedValue({ clips: [{ id: 1 }], total: 1, limit: 50, offset: 0 });
    const result = await mockApiRequest("/api/trickmint/feed?limit=50&offset=0");
    expect(result.clips).toHaveLength(1);
  });

  it("delete mutation calls correct endpoint with DELETE method", async () => {
    mockApiRequest.mockResolvedValue({});
    await mockApiRequest("/api/trickmint/42", { method: "DELETE" });
    expect(mockApiRequest).toHaveBeenCalledWith("/api/trickmint/42", { method: "DELETE" });
  });

  it("delete success invalidates trickmint queries", () => {
    mockInvalidateQueries({ queryKey: ["trickmint"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["trickmint"] });
  });

  it("delete success shows success message", () => {
    mockShowMessage({ message: "Clip deleted", type: "success", duration: 2000 });
    expect(mockShowMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success", message: "Clip deleted" })
    );
  });

  it("delete error shows danger message", () => {
    mockShowMessage({ message: "Failed to delete clip", type: "danger", duration: 2000 });
    expect(mockShowMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "danger" }));
  });
});
