/**
 * Tests for server/utils/circuitBreaker.ts
 *
 * Covers:
 * - getState() — line 52
 * - reset() via half-open → success — line 70
 * - Full circuit breaker lifecycle
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { CircuitBreaker } from "../circuitBreaker";

describe("CircuitBreaker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getState() returns closed initially", () => {
    const breaker = new CircuitBreaker("test");
    expect(breaker.getState()).toBe("closed");
  });

  it("getState() returns open after threshold failures", async () => {
    const breaker = new CircuitBreaker("test", 2, 30_000);

    // Two failures should trip the circuit
    await breaker.execute(() => Promise.reject(new Error("fail1")), "fallback");
    await breaker.execute(() => Promise.reject(new Error("fail2")), "fallback");

    expect(breaker.getState()).toBe("open");
  });

  it("returns fallback when circuit is open", async () => {
    const breaker = new CircuitBreaker("test", 1, 30_000);

    // One failure trips it
    await breaker.execute(() => Promise.reject(new Error("fail")), "fallback");
    expect(breaker.getState()).toBe("open");

    // Next call should return fallback without calling fn
    const fn = vi.fn();
    const result = await breaker.execute(fn, "fallback");
    expect(result).toBe("fallback");
    expect(fn).not.toHaveBeenCalled();
  });

  it("transitions to half-open after reset timeout, then resets on success", async () => {
    const breaker = new CircuitBreaker("test", 1, 100); // 100ms reset timeout

    // Trip the circuit
    await breaker.execute(() => Promise.reject(new Error("fail")), "fallback");
    expect(breaker.getState()).toBe("open");

    // Wait for reset timeout to elapse
    await new Promise((r) => setTimeout(r, 150));

    // Next call should transition to half-open, then succeed and reset to closed
    const result = await breaker.execute(() => Promise.resolve("success"), "fallback");
    expect(result).toBe("success");
    expect(breaker.getState()).toBe("closed");
  });

  it("logs String(error) when failure is not an Error instance (line 64 false branch)", async () => {
    const breaker = new CircuitBreaker("test", 1, 30_000);

    // Reject with a non-Error value (string)
    await breaker.execute(() => Promise.reject("string-error"), "fallback");
    expect(breaker.getState()).toBe("open");
  });

  it("re-opens on failure during half-open state", async () => {
    const breaker = new CircuitBreaker("test", 1, 100);

    // Trip the circuit
    await breaker.execute(() => Promise.reject(new Error("fail")), "fallback");
    expect(breaker.getState()).toBe("open");

    // Wait for reset timeout
    await new Promise((r) => setTimeout(r, 150));

    // Fail during half-open
    const result = await breaker.execute(() => Promise.reject(new Error("fail again")), "fallback");
    expect(result).toBe("fallback");
    expect(breaker.getState()).toBe("open");
  });
});
