import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { getRedisClient } from "../redis.ts";

/**
 * Build a RedisStore for express-rate-limit if Redis is available.
 * Returns undefined (uses default MemoryStore) when Redis is not configured.
 */
function buildStore(prefix: string): InstanceType<typeof RedisStore> | undefined {
  const redis = getRedisClient();
  if (!redis) return undefined;

  return new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...(args as [string, ...string[]])) as Promise<any>,
    prefix,
  });
}

export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  store: buildStore("rl:auth:"),
  message: {
    error: "Too many login attempts, please try again later.",
  },
});

export const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: buildStore("rl:ai:"),
  message: {
    error: "Too many AI requests, please try again later.",
  },
});
