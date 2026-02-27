import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { getRedisClient } from "../redis.ts";
import { RATE_LIMIT_CONFIG } from "../config/rateLimits.ts";

/**
 * Build a RedisStore for express-rate-limit if Redis is available.
 * Returns undefined (uses default MemoryStore) when Redis is not configured.
 * When Redis is configured but unreachable, errors are caught so requests
 * pass through instead of triggering a 500 from the global error handler.
 */
function buildStore(prefix: string): InstanceType<typeof RedisStore> | undefined {
  const redis = getRedisClient();
  if (!redis) return undefined;

  return new RedisStore({
    sendCommand: async (...args: string[]) => {
      try {
        return (await redis.call(...(args as [string, ...string[]]))) as number;
      } catch {
        // Redis unreachable — return 0 so the rate limiter allows the request
        // through rather than crashing the request with a 500.
        return 0;
      }
    },
    prefix,
  });
}

const RL = RATE_LIMIT_CONFIG;

export const authLimiter = rateLimit({
  windowMs: RL.authLogin.windowMs,
  max: RL.authLogin.max,
  limit: RL.authLogin.max,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  store: buildStore(RL.authLogin.prefix),
  message: { error: RL.authLogin.message },
});

export const aiLimiter = rateLimit({
  windowMs: RL.ai.windowMs,
  max: RL.ai.max,
  limit: RL.ai.max,
  standardHeaders: true,
  legacyHeaders: false,
  store: buildStore(RL.ai.prefix),
  message: { error: RL.ai.message },
});
