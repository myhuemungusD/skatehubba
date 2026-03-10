/**
 * Redis Client
 *
 * Centralized Redis connection for:
 * - Rate limiting (express-rate-limit, custom, socket auth)
 * - Replay protection
 * - Session/presence state
 * - Room membership tracking
 * - Recent auth tracking
 * - Discovery cache
 *
 * Falls back gracefully when REDIS_URL is not set (logs warning, returns null).
 * Callers must handle the null case with in-memory fallbacks for local dev.
 */

import Redis from "ioredis";
import logger from "./logger.ts";

let redis: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (redis) return redis;

  const url = process.env.REDIS_URL;
  if (!url) {
    if (process.env.NODE_ENV === "production") {
      logger.error(
        "[Redis] REDIS_URL not set in production — rate limits, replay protection, and session state " +
          "will use in-memory stores that diverge across instances. Set REDIS_URL to a Redis/Valkey instance."
      );
    } else {
      logger.warn("[Redis] REDIS_URL not set — falling back to in-memory stores.");
    }
    return null;
  }

  try {
    redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 10) {
          logger.error("[Redis] Max reconnection attempts reached");
          return null; // stop retrying
        }
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
      lazyConnect: false,
    });

    redis.on("connect", () => {
      logger.info("[Redis] Connected");
    });

    redis.on("error", (err) => {
      logger.error("[Redis] Connection error", { error: String(err) });
    });

    redis.on("close", () => {
      logger.warn("[Redis] Connection closed");
    });

    return redis;
  } catch (err) {
    logger.error("[Redis] Failed to create client", { error: String(err) });
    return null;
  }
}

/**
 * Graceful shutdown — call from SIGTERM/SIGINT handlers.
 */
export async function shutdownRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    logger.info("[Redis] Disconnected");
  }
}
