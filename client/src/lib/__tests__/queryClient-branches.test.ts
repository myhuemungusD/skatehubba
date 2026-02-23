/**
 * @fileoverview Additional branch coverage for client/src/lib/queryClient.ts
 *
 * Covers uncovered lines 58-59:
 *   retryDelay for NETWORK_ERROR and TIMEOUT ApiError codes
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api/client", () => ({
  apiRequestRaw: vi.fn(),
}));

import { ApiError } from "../api/errors";
import { queryClient } from "../queryClient";

const retryDelayFn = queryClient.getDefaultOptions().queries!.retryDelay as (
  attempt: number,
  error: unknown
) => number;

describe("retryDelay — NETWORK_ERROR and TIMEOUT branches (lines 58-59)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses exponential backoff for NETWORK_ERROR with 15s cap", () => {
    const err = new ApiError("Network error", "NETWORK_ERROR");
    expect(retryDelayFn(0, err)).toBe(1000);
    expect(retryDelayFn(1, err)).toBe(2000);
    expect(retryDelayFn(2, err)).toBe(4000);
    expect(retryDelayFn(3, err)).toBe(8000);
  });

  it("caps NETWORK_ERROR delay at 15 seconds", () => {
    const err = new ApiError("Network error", "NETWORK_ERROR");
    expect(retryDelayFn(4, err)).toBe(15000); // 16s capped to 15s
    expect(retryDelayFn(10, err)).toBe(15000);
  });

  it("uses exponential backoff for TIMEOUT with 15s cap", () => {
    const err = new ApiError("Timeout", "TIMEOUT");
    expect(retryDelayFn(0, err)).toBe(1000);
    expect(retryDelayFn(1, err)).toBe(2000);
    expect(retryDelayFn(2, err)).toBe(4000);
    expect(retryDelayFn(3, err)).toBe(8000);
  });

  it("caps TIMEOUT delay at 15 seconds", () => {
    const err = new ApiError("Timeout", "TIMEOUT");
    expect(retryDelayFn(4, err)).toBe(15000);
    expect(retryDelayFn(10, err)).toBe(15000);
  });

  it("retries TIMEOUT ApiError via shouldRetry", () => {
    const retryFn = queryClient.getDefaultOptions().queries!.retry as (
      failureCount: number,
      error: unknown
    ) => boolean;
    expect(retryFn(0, new ApiError("Timeout", "TIMEOUT"))).toBe(true);
    expect(retryFn(2, new ApiError("Timeout", "TIMEOUT"))).toBe(true);
  });

  it("retries NETWORK_ERROR ApiError via shouldRetry", () => {
    const retryFn = queryClient.getDefaultOptions().queries!.retry as (
      failureCount: number,
      error: unknown
    ) => boolean;
    expect(retryFn(0, new ApiError("Network", "NETWORK_ERROR"))).toBe(true);
    expect(retryFn(2, new ApiError("Network", "NETWORK_ERROR"))).toBe(true);
  });
});
