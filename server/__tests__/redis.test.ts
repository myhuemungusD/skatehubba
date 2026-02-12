/**
 * @fileoverview Unit tests for Redis client module
 * @module server/__tests__/redis.test
 *
 * Tests:
 * - getRedisClient with and without REDIS_URL
 * - shutdownRedis
 * - Event handlers
 * - Retry strategy
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock logger
vi.mock("../logger.ts", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Track event handlers
const mockEventHandlers: Record<string, Function> = {};
const mockQuit = vi.fn().mockResolvedValue("OK");
let capturedRetryStrategy: ((times: number) => number | null) | null = null;
let shouldThrow = false;

vi.mock("ioredis", () => {
  const RedisCtor = function (_url: string, options: any) {
    if (shouldThrow) {
      shouldThrow = false;
      throw new Error("Failed to create");
    }
    if (options?.retryStrategy) {
      capturedRetryStrategy = options.retryStrategy;
    }
    return {
      on: (event: string, handler: Function) => {
        mockEventHandlers[event] = handler;
      },
      quit: mockQuit,
    };
  };
  return { default: RedisCtor };
});

describe("Redis module", () => {
  let originalRedisUrl: string | undefined;

  beforeEach(() => {
    originalRedisUrl = process.env.REDIS_URL;
    vi.clearAllMocks();
    Object.keys(mockEventHandlers).forEach((k) => delete mockEventHandlers[k]);
    capturedRetryStrategy = null;
    shouldThrow = false;
  });

  afterEach(() => {
    if (originalRedisUrl !== undefined) {
      process.env.REDIS_URL = originalRedisUrl;
    } else {
      delete process.env.REDIS_URL;
    }
  });

  it("should return null when REDIS_URL is not set", async () => {
    vi.resetModules();
    delete process.env.REDIS_URL;

    const { getRedisClient } = await import("../redis");
    const client = getRedisClient();

    expect(client).toBeNull();
  });

  it("should create Redis client when REDIS_URL is set", async () => {
    vi.resetModules();
    process.env.REDIS_URL = "redis://localhost:6379";

    const { getRedisClient } = await import("../redis");
    const client = getRedisClient();

    expect(client).not.toBeNull();
  });

  it("should return cached client on subsequent calls", async () => {
    vi.resetModules();
    process.env.REDIS_URL = "redis://localhost:6379";

    const { getRedisClient } = await import("../redis");
    const client1 = getRedisClient();
    const client2 = getRedisClient();

    expect(client1).toBe(client2);
  });

  it("should register event handlers (connect, error, close)", async () => {
    vi.resetModules();
    process.env.REDIS_URL = "redis://localhost:6379";

    const { getRedisClient } = await import("../redis");
    getRedisClient();

    expect(mockEventHandlers).toHaveProperty("connect");
    expect(mockEventHandlers).toHaveProperty("error");
    expect(mockEventHandlers).toHaveProperty("close");
  });

  it("should log on connect event", async () => {
    vi.resetModules();
    process.env.REDIS_URL = "redis://localhost:6379";
    const logger = (await import("../logger.ts")).default;

    const { getRedisClient } = await import("../redis");
    getRedisClient();

    mockEventHandlers["connect"]();
    expect(logger.info).toHaveBeenCalledWith("[Redis] Connected");
  });

  it("should log on error event", async () => {
    vi.resetModules();
    process.env.REDIS_URL = "redis://localhost:6379";
    const logger = (await import("../logger.ts")).default;

    const { getRedisClient } = await import("../redis");
    getRedisClient();

    mockEventHandlers["error"](new Error("Connection refused"));
    expect(logger.error).toHaveBeenCalledWith(
      "[Redis] Connection error",
      expect.objectContaining({ error: expect.any(String) })
    );
  });

  it("should log on close event", async () => {
    vi.resetModules();
    process.env.REDIS_URL = "redis://localhost:6379";
    const logger = (await import("../logger.ts")).default;

    const { getRedisClient } = await import("../redis");
    getRedisClient();

    mockEventHandlers["close"]();
    expect(logger.warn).toHaveBeenCalledWith("[Redis] Connection closed");
  });

  it("should quit and null out on shutdownRedis", async () => {
    vi.resetModules();
    process.env.REDIS_URL = "redis://localhost:6379";

    const { getRedisClient, shutdownRedis } = await import("../redis");
    getRedisClient();

    await shutdownRedis();
    expect(mockQuit).toHaveBeenCalled();
  });

  it("should handle shutdownRedis when redis is null", async () => {
    vi.resetModules();
    delete process.env.REDIS_URL;

    const { shutdownRedis } = await import("../redis");
    await shutdownRedis();
    expect(mockQuit).not.toHaveBeenCalled();
  });

  it("should configure retry strategy with exponential backoff", async () => {
    vi.resetModules();
    process.env.REDIS_URL = "redis://localhost:6379";

    const { getRedisClient } = await import("../redis");
    getRedisClient();

    expect(capturedRetryStrategy).toBeDefined();
    expect(capturedRetryStrategy!(1)).toBe(200);
    expect(capturedRetryStrategy!(5)).toBe(1000);
    expect(capturedRetryStrategy!(10)).toBe(2000);
    expect(capturedRetryStrategy!(11)).toBeNull();
  });

  it("should return null when Redis constructor throws", async () => {
    vi.resetModules();
    process.env.REDIS_URL = "redis://localhost:6379";
    shouldThrow = true;

    const { getRedisClient } = await import("../redis");
    const client = getRedisClient();

    expect(client).toBeNull();
  });
});
