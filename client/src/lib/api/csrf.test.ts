import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { apiRequestRaw } from "./client";

describe("CSRF Protection", () => {
  const originalDocument = global.document;
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.document = originalDocument;
    global.fetch = originalFetch;
  });

  const createMockDocument = (cookieValue: string) => {
    return {
      cookie: cookieValue,
    } as unknown as Document;
  };

  it("should include CSRF token from cookie in POST requests", async () => {
    global.document = createMockDocument("csrfToken=test-csrf-token-123");

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({}),
      headers: new Headers({ "content-type": "application/json" }),
    });

    await apiRequestRaw({
      method: "POST",
      path: "/api/test",
      body: { data: "test" },
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: "POST",
        headers: expect.any(Headers),
      })
    );

    const callArgs = (global.fetch as any).mock.calls[0];
    const headers = callArgs[1].headers as Headers;

    expect(headers.get("X-CSRF-Token")).toBe("test-csrf-token-123");
  });

  it("should include CSRF token in PUT requests", async () => {
    global.document = createMockDocument("csrfToken=put-token-456");

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({}),
      headers: new Headers({ "content-type": "application/json" }),
    });

    await apiRequestRaw({
      method: "PUT",
      path: "/api/test",
      body: { data: "test" },
    });

    const callArgs = (global.fetch as any).mock.calls[0];
    const headers = callArgs[1].headers as Headers;

    expect(headers.get("X-CSRF-Token")).toBe("put-token-456");
  });

  it("should include CSRF token in PATCH requests", async () => {
    global.document = createMockDocument("csrfToken=patch-token-789");

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({}),
      headers: new Headers({ "content-type": "application/json" }),
    });

    await apiRequestRaw({
      method: "PATCH",
      path: "/api/test",
      body: { data: "test" },
    });

    const callArgs = (global.fetch as any).mock.calls[0];
    const headers = callArgs[1].headers as Headers;

    expect(headers.get("X-CSRF-Token")).toBe("patch-token-789");
  });

  it("should include CSRF token in DELETE requests", async () => {
    global.document = createMockDocument("csrfToken=delete-token-abc");

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({}),
      headers: new Headers({ "content-type": "application/json" }),
    });

    await apiRequestRaw({
      method: "DELETE",
      path: "/api/test",
    });

    const callArgs = (global.fetch as any).mock.calls[0];
    const headers = callArgs[1].headers as Headers;

    expect(headers.get("X-CSRF-Token")).toBe("delete-token-abc");
  });

  it("should NOT include CSRF token in GET requests", async () => {
    global.document = createMockDocument("csrfToken=should-not-be-sent");

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({}),
      headers: new Headers({ "content-type": "application/json" }),
    });

    await apiRequestRaw({
      method: "GET",
      path: "/api/test",
    });

    const callArgs = (global.fetch as any).mock.calls[0];
    const headers = callArgs[1].headers as Headers;

    expect(headers.get("X-CSRF-Token")).toBe(null);
  });

  it("should handle missing CSRF cookie gracefully", async () => {
    global.document = createMockDocument("otherCookie=value");

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({}),
      headers: new Headers({ "content-type": "application/json" }),
    });

    await apiRequestRaw({
      method: "POST",
      path: "/api/test",
      body: { data: "test" },
    });

    const callArgs = (global.fetch as any).mock.calls[0];
    const headers = callArgs[1].headers as Headers;

    expect(headers.get("X-CSRF-Token")).toBe(null);
  });

  it("should extract CSRF token from multiple cookies", async () => {
    global.document = createMockDocument(
      "sessionId=abc123; csrfToken=multi-cookie-token; userId=xyz789"
    );

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({}),
      headers: new Headers({ "content-type": "application/json" }),
    });

    await apiRequestRaw({
      method: "POST",
      path: "/api/test",
      body: { data: "test" },
    });

    const callArgs = (global.fetch as any).mock.calls[0];
    const headers = callArgs[1].headers as Headers;

    expect(headers.get("X-CSRF-Token")).toBe("multi-cookie-token");
  });

  it("should include credentials in fetch request", async () => {
    global.document = createMockDocument("csrfToken=cred-token");

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({}),
      headers: new Headers({ "content-type": "application/json" }),
    });

    await apiRequestRaw({
      method: "POST",
      path: "/api/test",
      body: { data: "test" },
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        credentials: "include",
      })
    );
  });

  it("should handle empty cookie string", async () => {
    global.document = createMockDocument("");

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({}),
      headers: new Headers({ "content-type": "application/json" }),
    });

    await apiRequestRaw({
      method: "POST",
      path: "/api/test",
      body: { data: "test" },
    });

    const callArgs = (global.fetch as any).mock.calls[0];
    const headers = callArgs[1].headers as Headers;

    expect(headers.get("X-CSRF-Token")).toBe(null);
  });

  it("should handle server-side rendering (no document)", async () => {
    global.document = undefined as any;

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({}),
      headers: new Headers({ "content-type": "application/json" }),
    });

    await apiRequestRaw({
      method: "POST",
      path: "/api/test",
      body: { data: "test" },
    });

    const callArgs = (global.fetch as any).mock.calls[0];
    const headers = callArgs[1].headers as Headers;

    expect(headers.get("X-CSRF-Token")).toBe(null);
  });
});
