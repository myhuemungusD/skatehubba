import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { getRedisClient } from "../redis.ts";
import { RATE_LIMIT_CONFIG } from "../config/rateLimits.ts";
import logger from "../logger.ts";

/**
 * Build a RedisStore for express-rate-limit if Redis is available.
 * Returns undefined (uses default MemoryStore) when Redis is not configured.
 *
 * Fail-closed: when Redis is configured but temporarily unreachable, we return
 * a high hit count so the rate limiter rejects the request rather than allowing
 * unlimited traffic through during a Redis outage.
 */
function buildStore(prefix: string): InstanceType<typeof RedisStore> | undefined {
  const redis = getRedisClient();
  if (!redis) return undefined;

  return new RedisStore({
    sendCommand: async (...args: string[]) => {
      try {
        return (await redis.call(...(args as [string, ...string[]]))) as number;
      } catch (err) {
        logger.error("[RateLimit] Redis command failed — failing closed", {
          prefix,
          error: err instanceof Error ? err.message : String(err),
        });
        // Fail closed: return a high count so the rate limiter triggers,
        // blocking requests until Redis recovers.
        return 999999;
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
