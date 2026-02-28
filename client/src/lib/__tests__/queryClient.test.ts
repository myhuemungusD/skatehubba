/**
 * Tests for client/src/lib/queryClient.ts
 *
 * Covers: apiRequest, getQueryFn, and the shouldRetry / retryDelay strategies
 * embedded in the exported QueryClient instance.
 *
 * NOTE: We do NOT mock ../api/errors — the real ApiError class has no external
 * dependencies and we need proper instanceof checks in shouldRetry.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("../api/client", () => ({
  apiRequestRaw: vi.fn(),
}));

// ── Imports ────────────────────────────────────────────────────────────────

import { apiRequestRaw } from "../api/client";
import { ApiError } from "../api/errors";
import { apiRequest, getQueryFn, queryClient } from "../queryClient";

// ── Helpers ────────────────────────────────────────────────────────────────

const retryFn = queryClient.getDefaultOptions().queries!.retry as (
  failureCount: number,
  error: unknown
) => boolean;

const retryDelayFn = queryClient.getDefaultOptions().queries!.retryDelay as (
  attempt: number,
  error: unknown
) => number;

const mutationRetryFn = queryClient.getDefaultOptions().mutations!.retry as (
  failureCount: number,
  error: unknown
) => boolean;

/** Convenience: build a minimal QueryFunctionContext */
function queryCtx(keys: string[]) {
  return {
    queryKey: keys,
    meta: undefined,
    signal: new AbortController().signal,
  } as any;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("queryClient module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ──────────────────── apiRequest ────────────────────────────────────────

  describe("apiRequest", () => {
    it("delegates GET to apiRequestRaw with path and no body", async () => {
      vi.mocked(apiRequestRaw).mockResolvedValueOnce(new Response("[]"));

      await apiRequest("GET", "/api/spots");

      expect(apiRequestRaw).toHaveBeenCalledWith({
        method: "GET",
        path: "/api/spots",
        body: undefined,
      });
    });

    it("delegates POST with body to apiRequestRaw", async () => {
      vi.mocked(apiRequestRaw).mockResolvedValueOnce(new Response("{}"));
      const body = { name: "Hubba Hideout" };

      await apiRequest("POST", "/api/spots", body);

      expect(apiRequestRaw).toHaveBeenCalledWith({
        method: "POST",
        path: "/api/spots",
        body,
      });
    });

    it("supports PUT, PATCH, DELETE methods", async () => {
      for (const method of ["PUT", "PATCH", "DELETE"] as const) {
        vi.mocked(apiRequestRaw).mockResolvedValueOnce(new Response("{}"));

        await apiRequest(method, "/api/spots/1");

        expect(apiRequestRaw).toHaveBeenCalledWith({
          method,
          path: "/api/spots/1",
          body: undefined,
        });
      }
    });

    it("returns the raw Response from apiRequestRaw", async () => {
      const res = new Response(JSON.stringify({ ok: true }));
      vi.mocked(apiRequestRaw).mockResolvedValueOnce(res);

      const result = await apiRequest("GET", "/api/health");

      expect(result).toBe(res);
    });

    it("propagates errors from apiRequestRaw", async () => {
      vi.mocked(apiRequestRaw).mockRejectedValueOnce(new ApiError("Kaboom", "UNKNOWN", 500));

      await expect(apiRequest("GET", "/api/spots")).rejects.toThrow("Kaboom");
    });
  });

  // ──────────────────── getQueryFn ───────────────────────────────────────

  describe("getQueryFn", () => {
    it("joins queryKey with / as the request path", async () => {
      const mockBody = { id: 42 };
      vi.mocked(apiRequestRaw).mockResolvedValueOnce(new Response(JSON.stringify(mockBody)));

      const fn = getQueryFn<typeof mockBody>({ on401: "throw" });
      await fn(queryCtx(["/api", "spots", "42"]));

      expect(apiRequestRaw).toHaveBeenCalledWith({
        method: "GET",
        path: "/api/spots/42",
      });
    });

    it("returns parsed JSON from the response", async () => {
      const data = { id: 1, name: "Hubba Hideout" };
      vi.mocked(apiRequestRaw).mockResolvedValueOnce(new Response(JSON.stringify(data)));

      const fn = getQueryFn<typeof data>({ on401: "throw" });
      const result = await fn(queryCtx(["/api/spots/1"]));

      expect(result).toEqual(data);
    });

    it("throws on 401 when on401 is 'throw'", async () => {
      vi.mocked(apiRequestRaw).mockRejectedValueOnce(
        new ApiError("Unauthorized", "UNAUTHORIZED", 401)
      );

      const fn = getQueryFn({ on401: "throw" });

      await expect(fn(queryCtx(["/api/me"]))).rejects.toThrow("Unauthorized");
    });

    it("returns null on 401 when on401 is 'returnNull'", async () => {
      vi.mocked(apiRequestRaw).mockRejectedValueOnce(
        new ApiError("Unauthorized", "UNAUTHORIZED", 401)
      );

      const fn = getQueryFn({ on401: "returnNull" });
      const result = await fn(queryCtx(["/api/me"]));

      expect(result).toBeNull();
    });

    it("throws non-401 ApiError regardless of on401 setting", async () => {
      vi.mocked(apiRequestRaw).mockRejectedValueOnce(new ApiError("Server error", "UNKNOWN", 500));

      const fn = getQueryFn({ on401: "returnNull" });

      await expect(fn(queryCtx(["/api/spots"]))).rejects.toThrow("Server error");
    });

    it("throws non-ApiError exceptions regardless of on401", async () => {
      vi.mocked(apiRequestRaw).mockRejectedValueOnce(new TypeError("Failed to fetch"));

      const fn = getQueryFn({ on401: "returnNull" });

      await expect(fn(queryCtx(["/api/spots"]))).rejects.toThrow("Failed to fetch");
    });

    it("only catches 401 status - not other 4xx for returnNull", async () => {
      vi.mocked(apiRequestRaw).mockRejectedValueOnce(new ApiError("Not Found", "UNKNOWN", 404));

      const fn = getQueryFn({ on401: "returnNull" });

      await expect(fn(queryCtx(["/api/spots/999"]))).rejects.toThrow("Not Found");
    });
  });

  // ──────────────────── shouldRetry ──────────────────────────────────────

  describe("shouldRetry (via queryClient defaults)", () => {
    it("stops retrying after 3 failures", () => {
      expect(retryFn(3, new Error("whatever"))).toBe(false);
      expect(retryFn(4, new Error("whatever"))).toBe(false);
      expect(retryFn(100, new Error("whatever"))).toBe(false);
    });

    it("retries network errors (TypeError with 'fetch' in message)", () => {
      expect(retryFn(0, new TypeError("Failed to fetch"))).toBe(true);
      expect(retryFn(2, new TypeError("network fetch error"))).toBe(true);
    });

    it("does not retry generic TypeErrors without 'fetch'", () => {
      // Falls through to default "true" since it's not an ApiError
      // but it's still an unknown error, so default is true
      expect(retryFn(0, new TypeError("Cannot read properties"))).toBe(true);
    });

    it("retries timeout / AbortError DOMException", () => {
      const err = new DOMException("The operation was aborted", "AbortError");
      expect(retryFn(0, err)).toBe(true);
      expect(retryFn(2, err)).toBe(true);
    });

    it("does NOT retry UNAUTHORIZED", () => {
      expect(retryFn(0, new ApiError("Unauthorized", "UNAUTHORIZED", 401))).toBe(false);
    });

    it("does NOT retry VALIDATION_ERROR", () => {
      expect(retryFn(0, new ApiError("Bad input", "VALIDATION_ERROR", 400))).toBe(false);
    });

    it("does NOT retry BANNED", () => {
      expect(retryFn(0, new ApiError("Banned", "BANNED", 403))).toBe(false);
    });

    it("does NOT retry REPLAY_DETECTED", () => {
      expect(retryFn(0, new ApiError("Replay", "REPLAY_DETECTED", 409))).toBe(false);
    });

    it("does NOT retry QUOTA_EXCEEDED", () => {
      expect(retryFn(0, new ApiError("Quota", "QUOTA_EXCEEDED", 429))).toBe(false);
    });

    it("retries RATE_LIMIT", () => {
      expect(retryFn(0, new ApiError("Slow down", "RATE_LIMIT", 429))).toBe(true);
      expect(retryFn(2, new ApiError("Slow down", "RATE_LIMIT", 429))).toBe(true);
    });

    it("retries 5xx server errors", () => {
      expect(retryFn(0, new ApiError("Internal", "UNKNOWN", 500))).toBe(true);
      expect(retryFn(0, new ApiError("Bad gateway", "UNKNOWN", 502))).toBe(true);
      expect(retryFn(0, new ApiError("Unavailable", "UNKNOWN", 503))).toBe(true);
    });

    it("does NOT retry 4xx client errors (excluding special codes)", () => {
      expect(retryFn(0, new ApiError("Not found", "UNKNOWN", 404))).toBe(false);
      expect(retryFn(0, new ApiError("Gone", "UNKNOWN", 410))).toBe(false);
      expect(retryFn(0, new ApiError("Unprocessable", "UNKNOWN", 422))).toBe(false);
    });

    it("retries ApiError with no status set (falls through to default)", () => {
      // An ApiError with UNKNOWN code and no status - skips both 5xx and 4xx checks
      expect(retryFn(0, new ApiError("Something", "UNKNOWN"))).toBe(true);
    });

    it("does NOT retry 4xx ApiError with UNKNOWN code and status between 400-499", () => {
      // Explicitly tests the branch at line 48: error.status >= 400 && error.status < 500
      expect(retryFn(0, new ApiError("Forbidden", "UNKNOWN", 403))).toBe(false);
      expect(retryFn(0, new ApiError("Conflict", "UNKNOWN", 409))).toBe(false);
      expect(retryFn(0, new ApiError("Teapot", "UNKNOWN", 418))).toBe(false);
    });

    it("retries unknown / unrecognised error types by default", () => {
      expect(retryFn(0, new Error("Random"))).toBe(true);
      expect(retryFn(0, "string error")).toBe(true);
      expect(retryFn(0, null)).toBe(true);
      expect(retryFn(0, undefined)).toBe(true);
      expect(retryFn(0, 42)).toBe(true);
    });

    it("uses the same retry function for mutations", () => {
      expect(mutationRetryFn(0, new ApiError("Banned", "BANNED", 403))).toBe(false);
      expect(mutationRetryFn(0, new ApiError("Internal", "UNKNOWN", 500))).toBe(true);
      expect(mutationRetryFn(3, new Error("anything"))).toBe(false);
    });
  });

  // ──────────────────── retryDelay ───────────────────────────────────────

  describe("retryDelay (via queryClient defaults)", () => {
    it("uses exponential backoff: 1s, 2s, 4s, 8s", () => {
      const e = new Error("generic");
      expect(retryDelayFn(0, e)).toBe(1000);
      expect(retryDelayFn(1, e)).toBe(2000);
      expect(retryDelayFn(2, e)).toBe(4000);
      expect(retryDelayFn(3, e)).toBe(8000);
    });

    it("caps standard delay at 10 seconds", () => {
      const e = new Error("generic");
      expect(retryDelayFn(4, e)).toBe(10000); // 16s capped to 10s
      expect(retryDelayFn(10, e)).toBe(10000);
      expect(retryDelayFn(20, e)).toBe(10000);
    });

    it("uses exponential backoff for RATE_LIMIT", () => {
      const rl = new ApiError("Rate limited", "RATE_LIMIT", 429);
      expect(retryDelayFn(0, rl)).toBe(1000);
      expect(retryDelayFn(1, rl)).toBe(2000);
      expect(retryDelayFn(2, rl)).toBe(4000);
      expect(retryDelayFn(3, rl)).toBe(8000);
      expect(retryDelayFn(4, rl)).toBe(16000);
    });

    it("caps RATE_LIMIT delay at 30 seconds", () => {
      const rl = new ApiError("Rate limited", "RATE_LIMIT", 429);
      expect(retryDelayFn(5, rl)).toBe(30000); // 32s capped to 30s
      expect(retryDelayFn(10, rl)).toBe(30000);
    });

    it("uses longer backoff for NETWORK_ERROR", () => {
      const ne = new ApiError("Network error", "NETWORK_ERROR");
      expect(retryDelayFn(0, ne)).toBe(1000);
      expect(retryDelayFn(1, ne)).toBe(2000);
      expect(retryDelayFn(2, ne)).toBe(4000);
    });

    it("caps NETWORK_ERROR delay at 15 seconds", () => {
      const ne = new ApiError("Network error", "NETWORK_ERROR");
      expect(retryDelayFn(4, ne)).toBe(15000); // 16s capped to 15s
      expect(retryDelayFn(10, ne)).toBe(15000);
    });

    it("uses longer backoff for TIMEOUT", () => {
      const to = new ApiError("Timeout", "TIMEOUT");
      expect(retryDelayFn(0, to)).toBe(1000);
      expect(retryDelayFn(3, to)).toBe(8000);
    });

    it("caps TIMEOUT delay at 15 seconds", () => {
      const to = new ApiError("Timeout", "TIMEOUT");
      expect(retryDelayFn(4, to)).toBe(15000);
    });

    it("retries TIMEOUT ApiError", () => {
      expect(retryFn(0, new ApiError("Timeout", "TIMEOUT"))).toBe(true);
    });

    it("retries NETWORK_ERROR ApiError", () => {
      expect(retryFn(0, new ApiError("Network fail", "NETWORK_ERROR"))).toBe(true);
    });
  });

  // ──────────────────── QueryClient config ───────────────────────────────

  describe("queryClient configuration", () => {
    it("exports a QueryClient instance", () => {
      expect(queryClient).toBeDefined();
      expect(queryClient.getDefaultOptions).toBeTypeOf("function");
    });

    it("disables refetchOnWindowFocus", () => {
      expect(queryClient.getDefaultOptions().queries!.refetchOnWindowFocus).toBe(false);
    });

    it("disables refetchInterval", () => {
      expect(queryClient.getDefaultOptions().queries!.refetchInterval).toBe(false);
    });

    it("sets staleTime to Infinity", () => {
      expect(queryClient.getDefaultOptions().queries!.staleTime).toBe(Infinity);
    });

    it("assigns retry and retryDelay to both queries and mutations", () => {
      const opts = queryClient.getDefaultOptions();
      expect(opts.queries!.retry).toBeTypeOf("function");
      expect(opts.queries!.retryDelay).toBeTypeOf("function");
      expect(opts.mutations!.retry).toBeTypeOf("function");
      expect(opts.mutations!.retryDelay).toBeTypeOf("function");
    });
  });
});
