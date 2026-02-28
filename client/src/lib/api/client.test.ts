/**
 * Tests for client/src/lib/api/client.ts
 *
 * @vitest-environment jsdom
 *
 * Covers: buildApiUrl, apiRequestRaw, apiRequest.
 *
 * Strategy: mock external dependencies (@skatehubba/config, firebase auth,
 * error utilities, devAdmin) and test actual module exports with full
 * integration of internal helpers (buildHeaders, getCsrfToken, parseJsonSafely).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@skatehubba/config", () => ({
  getApiBaseUrl: vi.fn(() => "https://api.skatehubba.com"),
}));

vi.mock("../firebase/config", () => ({
  auth: {
    currentUser: null,
  },
}));

vi.mock("./errors", () => {
  class MockApiError extends Error {
    code: string;
    status?: number;
    details?: unknown;
    constructor(message: string, code: string, status?: number, details?: unknown) {
      super(message);
      this.name = "ApiError";
      this.code = code;
      this.status = status;
      this.details = details;
    }
  }
  return {
    ApiError: MockApiError,
    normalizeApiError: vi.fn(
      (opts: { status?: number; statusText?: string; payload?: unknown }) => {
        return new MockApiError(
          (opts.payload as any)?.message ?? opts.statusText ?? "Unknown error",
          "UNKNOWN",
          opts.status,
          opts.payload
        );
      }
    ),
  };
});

vi.mock("../devAdmin", () => ({
  isDevAdmin: vi.fn(() => false),
}));

// ── Imports (resolved AFTER mocks) ────────────────────────────────────────

import { buildApiUrl, apiRequestRaw, apiRequest } from "./client";
import { getApiBaseUrl } from "@skatehubba/config";
import { auth } from "../firebase/config";
import { ApiError, normalizeApiError } from "./errors";
import { isDevAdmin } from "../devAdmin";

// ── Helpers ────────────────────────────────────────────────────────────────

const mockUser = (token = "mock-id-token") => {
  (auth as { currentUser: unknown }).currentUser = {
    getIdToken: vi.fn().mockResolvedValue(token),
  };
};

const clearUser = () => {
  (auth as { currentUser: unknown }).currentUser = null;
};

function jsonResponse(body: unknown, status = 200, statusText = "OK"): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(body: string, status = 200, statusText = "OK"): Response {
  return new Response(body, {
    status,
    statusText,
    headers: { "content-type": "text/plain" },
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

// Track the cookie value for the stubbed document
let mockCookieValue = "";

describe("client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearUser();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true }));
    vi.mocked(getApiBaseUrl).mockReturnValue("https://api.skatehubba.com");
    vi.mocked(isDevAdmin).mockReturnValue(false);

    // Stub document globally for Node environment (no JSDOM)
    mockCookieValue = "";
    vi.stubGlobal("document", {
      get cookie() {
        return mockCookieValue;
      },
      set cookie(value: string) {
        mockCookieValue = value;
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ────────────────────────────────────────────────────────────────────────
  // buildApiUrl
  // ────────────────────────────────────────────────────────────────────────

  describe("buildApiUrl", () => {
    it("returns absolute URLs unchanged", () => {
      expect(buildApiUrl("https://example.com/api/test")).toBe("https://example.com/api/test");
      expect(buildApiUrl("http://localhost:3000/api")).toBe("http://localhost:3000/api");
    });

    it("is case-insensitive for http/https detection", () => {
      expect(buildApiUrl("HTTPS://example.com/api")).toBe("HTTPS://example.com/api");
      expect(buildApiUrl("HTTP://example.com/api")).toBe("HTTP://example.com/api");
    });

    it("prepends base URL to relative paths with leading slash", () => {
      expect(buildApiUrl("/api/games")).toBe("https://api.skatehubba.com/api/games");
    });

    it("adds leading slash to paths without one", () => {
      expect(buildApiUrl("api/games")).toBe("https://api.skatehubba.com/api/games");
    });

    it("strips trailing slashes from base URL", () => {
      vi.mocked(getApiBaseUrl).mockReturnValue("https://api.skatehubba.com/");
      expect(buildApiUrl("/test")).toBe("https://api.skatehubba.com/test");
    });

    it("strips multiple trailing slashes from base URL", () => {
      vi.mocked(getApiBaseUrl).mockReturnValue("https://api.skatehubba.com///");
      expect(buildApiUrl("/test")).toBe("https://api.skatehubba.com/test");
    });

    it("does not treat non-http URLs as absolute", () => {
      expect(buildApiUrl("ftp://example.com")).toBe("https://api.skatehubba.com/ftp://example.com");
    });

    it("works with empty base URL", () => {
      vi.mocked(getApiBaseUrl).mockReturnValue("");
      expect(buildApiUrl("/api/test")).toBe("/api/test");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Header building (tested through apiRequestRaw)
  // ────────────────────────────────────────────────────────────────────────

  describe("headers", () => {
    it("sets Accept: application/json by default", async () => {
      await apiRequestRaw({ method: "GET", path: "/api/test" });

      const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      const headers = new Headers(init?.headers as HeadersInit);
      expect(headers.get("Accept")).toBe("application/json");
    });

    it("sets Content-Type for requests with body", async () => {
      await apiRequestRaw({ method: "POST", path: "/api/test", body: { foo: "bar" } });

      const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      const headers = new Headers(init?.headers as HeadersInit);
      expect(headers.get("Content-Type")).toBe("application/json");
    });

    it("does not set Content-Type for GET requests (no body)", async () => {
      await apiRequestRaw({ method: "GET", path: "/api/test" });

      const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      const headers = new Headers(init?.headers as HeadersInit);
      expect(headers.get("Content-Type")).toBeNull();
    });

    it("includes Authorization header when user is authenticated", async () => {
      mockUser("my-token-abc");

      await apiRequestRaw({ method: "GET", path: "/api/test" });

      const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      const headers = new Headers(init?.headers as HeadersInit);
      expect(headers.get("Authorization")).toBe("Bearer my-token-abc");
    });

    it("does not include Authorization when no user", async () => {
      clearUser();

      await apiRequestRaw({ method: "GET", path: "/api/test" });

      const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      const headers = new Headers(init?.headers as HeadersInit);
      expect(headers.get("Authorization")).toBeNull();
    });

    it("includes X-Nonce header when provided", async () => {
      await apiRequestRaw({ method: "POST", path: "/api/test", body: {}, nonce: "abc123" });

      const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      const headers = new Headers(init?.headers as HeadersInit);
      expect(headers.get("X-Nonce")).toBe("abc123");
    });

    it("includes CSRF token for non-GET requests when cookie is set", async () => {
      mockCookieValue = "csrfToken=csrf-value-xyz; otherCookie=abc";

      await apiRequestRaw({ method: "POST", path: "/api/test", body: {} });

      const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      const headers = new Headers(init?.headers as HeadersInit);
      expect(headers.get("X-CSRF-Token")).toBe("csrf-value-xyz");
    });

    it("does not include CSRF token for GET requests", async () => {
      mockCookieValue = "csrfToken=csrf-value-xyz";

      await apiRequestRaw({ method: "GET", path: "/api/test" });

      const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      const headers = new Headers(init?.headers as HeadersInit);
      expect(headers.get("X-CSRF-Token")).toBeNull();
    });

    it("includes X-Dev-Admin header when devAdmin is active", async () => {
      vi.mocked(isDevAdmin).mockReturnValue(true);

      await apiRequestRaw({ method: "GET", path: "/api/test" });

      const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      const headers = new Headers(init?.headers as HeadersInit);
      expect(headers.get("X-Dev-Admin")).toBe("true");
    });

    it("does not include X-Dev-Admin when devAdmin is inactive", async () => {
      vi.mocked(isDevAdmin).mockReturnValue(false);

      await apiRequestRaw({ method: "GET", path: "/api/test" });

      const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      const headers = new Headers(init?.headers as HeadersInit);
      expect(headers.get("X-Dev-Admin")).toBeNull();
    });

    it("merges custom headers with defaults", async () => {
      await apiRequestRaw({
        method: "GET",
        path: "/api/test",
        headers: { "X-Custom": "custom-value" },
      });

      const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      const headers = new Headers(init?.headers as HeadersInit);
      expect(headers.get("X-Custom")).toBe("custom-value");
      expect(headers.get("Accept")).toBe("application/json");
    });

    it("allows custom headers to override defaults", async () => {
      await apiRequestRaw({
        method: "GET",
        path: "/api/test",
        headers: { Accept: "text/html" },
      });

      const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      const headers = new Headers(init?.headers as HeadersInit);
      expect(headers.get("Accept")).toBe("text/html");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // apiRequestRaw
  // ────────────────────────────────────────────────────────────────────────

  describe("apiRequestRaw", () => {
    it("sends GET request with correct URL", async () => {
      await apiRequestRaw({ method: "GET", path: "/api/games" });

      const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(url).toBe("https://api.skatehubba.com/api/games");
      expect(init?.method).toBe("GET");
    });

    it("sends POST request with JSON body", async () => {
      const body = { name: "Kickflip Battle" };

      await apiRequestRaw({ method: "POST", path: "/api/games", body });

      const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(JSON.stringify(body));
    });

    it("does not include body for GET requests", async () => {
      await apiRequestRaw({ method: "GET", path: "/api/test" });

      const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(init?.body).toBeUndefined();
    });

    it("includes credentials: include for cookie-based auth", async () => {
      await apiRequestRaw({ method: "GET", path: "/api/test" });

      const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(init?.credentials).toBe("include");
    });

    it("returns the response on success", async () => {
      const expected = jsonResponse({ data: "test" });
      vi.mocked(globalThis.fetch).mockResolvedValue(expected);

      const result = await apiRequestRaw({ method: "GET", path: "/api/test" });

      expect(result).toBe(expected);
    });

    it("throws normalized error on non-ok response", async () => {
      const errorPayload = { message: "Not found", code: "NOT_FOUND" };
      vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(errorPayload, 404, "Not Found"));

      await expect(apiRequestRaw({ method: "GET", path: "/api/missing" })).rejects.toThrow();

      expect(normalizeApiError).toHaveBeenCalledWith({
        status: 404,
        statusText: "Not Found",
        payload: errorPayload,
      });
    });

    it("throws ApiError on abort/timeout", async () => {
      const abortError = new DOMException("The operation was aborted", "AbortError");
      vi.mocked(globalThis.fetch).mockRejectedValue(abortError);

      await expect(
        apiRequestRaw({ method: "GET", path: "/api/slow", timeout: 5000 })
      ).rejects.toThrow("The request took too long. Check your connection and try again.");
    });

    it("uses default 30s timeout via setTimeout", async () => {
      const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

      await apiRequestRaw({ method: "GET", path: "/api/test" });

      // Verify setTimeout was called with 30000ms for the default timeout
      const timeoutCall = setTimeoutSpy.mock.calls.find((call) => call[1] === 30000);
      expect(timeoutCall).toBeDefined();
    });

    it("does not set timeout when timeout is 0", async () => {
      const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

      await apiRequestRaw({ method: "GET", path: "/api/test", timeout: 0 });

      // setTimeout should not be called for timeout (it may be called for other reasons)
      const timeoutCalls = setTimeoutSpy.mock.calls.filter(
        (call) => typeof call[1] === "number" && call[1] > 0
      );
      // No timeout calls should happen for the abort controller
      expect(timeoutCalls.length).toBe(0);
    });

    it("uses provided signal instead of creating its own", async () => {
      const externalController = new AbortController();

      await apiRequestRaw({
        method: "GET",
        path: "/api/test",
        signal: externalController.signal,
      });

      const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(init?.signal).toBe(externalController.signal);
    });

    it("clears timeout after successful request", async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

      await apiRequestRaw({ method: "GET", path: "/api/test" });

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it("fires setTimeout callback to abort when request takes too long", async () => {
      // Capture the timeout callback for the abort controller
      let timeoutCallback: (() => void) | null = null;
      const origSetTimeout = globalThis.setTimeout;
      const spy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: any, ms: number) => {
        if (ms === 5000) {
          timeoutCallback = fn;
        }
        return origSetTimeout(fn, ms);
      }) as typeof setTimeout);

      // Make fetch hang but respect abort signal
      vi.mocked(globalThis.fetch).mockImplementation((_url, opts) => {
        return new Promise((_resolve, reject) => {
          const signal = (opts as any)?.signal;
          if (signal) {
            signal.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted", "AbortError"));
            });
          }
          // Invoke the timeout callback to simulate time passing
          expect(timeoutCallback).not.toBeNull();
          timeoutCallback!();
        });
      });

      await expect(
        apiRequestRaw({ method: "GET", path: "/api/slow", timeout: 5000 })
      ).rejects.toThrow("The request took too long. Check your connection and try again.");

      spy.mockRestore();
    });

    it("wraps network fetch errors in ApiError with NETWORK_ERROR code", async () => {
      const networkError = new TypeError("Failed to fetch");
      vi.mocked(globalThis.fetch).mockRejectedValue(networkError);

      await expect(apiRequestRaw({ method: "GET", path: "/api/test" })).rejects.toThrow(
        "Network error. Check your connection and try again."
      );
    });

    it("handles 500 server errors", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        jsonResponse({ message: "Internal Server Error" }, 500, "Internal Server Error")
      );

      await expect(apiRequestRaw({ method: "GET", path: "/api/test" })).rejects.toThrow();

      expect(normalizeApiError).toHaveBeenCalledWith(expect.objectContaining({ status: 500 }));
    });

    it("handles non-JSON error responses", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        textResponse("Gateway Timeout", 504, "Gateway Timeout")
      );

      await expect(apiRequestRaw({ method: "GET", path: "/api/test" })).rejects.toThrow();

      // Short non-HTML text bodies are extracted as a synthetic { message } payload
      // so the error normalizer can produce a meaningful message.
      expect(normalizeApiError).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 504,
          statusText: "Gateway Timeout",
          payload: { message: "Gateway Timeout" },
        })
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // apiRequest (JSON parsing wrapper)
  // ────────────────────────────────────────────────────────────────────────

  describe("apiRequest", () => {
    it("returns parsed JSON body for successful response", async () => {
      const responseBody = { games: [{ id: 1, name: "SKATE" }] };
      vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(responseBody));

      const result = await apiRequest<{ games: { id: number; name: string }[] }>({
        method: "GET",
        path: "/api/games",
      });

      expect(result).toEqual(responseBody);
    });

    it("throws ApiError when response is not JSON", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(textResponse("OK", 200, "OK"));

      await expect(apiRequest({ method: "GET", path: "/api/test" })).rejects.toThrow(
        "Expected JSON response"
      );
    });

    it("throws ApiError with UNKNOWN code for non-JSON response", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(textResponse("OK", 200, "OK"));

      try {
        await apiRequest({ method: "GET", path: "/api/test" });
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as InstanceType<typeof ApiError>).code).toBe("UNKNOWN");
        expect((error as InstanceType<typeof ApiError>).status).toBe(200);
      }
    });

    it("propagates errors from apiRequestRaw", async () => {
      const networkError = new TypeError("Failed to fetch");
      vi.mocked(globalThis.fetch).mockRejectedValue(networkError);

      await expect(apiRequest({ method: "GET", path: "/api/test" })).rejects.toThrow(
        "Network error. Check your connection and try again."
      );
    });

    it("handles POST requests with body and returns typed response", async () => {
      const responseBody = { id: "new-game-123", status: "created" };
      vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(responseBody));

      const result = await apiRequest<{ id: string; status: string }>({
        method: "POST",
        path: "/api/games",
        body: { name: "SKATE Battle" },
      });

      expect(result).toEqual(responseBody);
    });

    it("handles invalid JSON in response body gracefully", async () => {
      // content-type says json, but body is invalid
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response("not json at all", {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );

      // parseJsonSafely returns undefined for invalid JSON
      await expect(apiRequest({ method: "GET", path: "/api/test" })).rejects.toThrow(
        "Expected JSON response"
      );
    });

    it("returns undefined from parseJsonSafely for non-JSON content type on success path", async () => {
      // A 200 OK response with text/html content type
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response("<html>OK</html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        })
      );

      // apiRequest calls parseJsonSafely which returns undefined for non-JSON,
      // then throws "Expected JSON response"
      await expect(apiRequest({ method: "GET", path: "/api/test" })).rejects.toThrow(
        "Expected JSON response"
      );
    });

    it("parseJsonSafely returns undefined when response.json() throws (catch branch)", async () => {
      // content-type says json, but json() throws a SyntaxError
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response("{{invalid json!!", {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
        })
      );

      await expect(apiRequest({ method: "GET", path: "/api/test" })).rejects.toThrow(
        "Expected JSON response"
      );
    });

    it("returns undefined from parseJsonSafely when content-type header is missing", async () => {
      // A 200 OK response with no content-type header
      vi.mocked(globalThis.fetch).mockResolvedValue(new Response("plain body", { status: 200 }));

      await expect(apiRequest({ method: "GET", path: "/api/test" })).rejects.toThrow(
        "Expected JSON response"
      );
    });
  });
});
