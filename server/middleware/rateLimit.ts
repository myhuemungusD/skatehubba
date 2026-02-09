import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { getRedisClient } from "../redis.ts";
import { RATE_LIMIT_CONFIG } from "../config/rateLimits.ts";

/**
 * Build a RedisStore for express-rate-limit if Redis is available.
 * Returns undefined (uses default MemoryStore) when Redis is not configured.
 */
function buildStore(prefix: string): InstanceType<typeof RedisStore> | undefined {
  const redis = getRedisClient();
  if (!redis) return undefined;

  return new RedisStore({
    sendCommand: (...args: string[]) =>
      redis.call(...(args as [string, ...string[]])) as Promise<any>,
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
