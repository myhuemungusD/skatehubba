/**
 * Feed Response Cache Middleware
 *
 * Caches JSON API responses in Redis with short TTL to reduce DB queries
 * and speed up repeated feed/list requests. This indirectly reduces bandwidth
 * because faster responses decrease the chance of client retries and duplicate
 * fetches from impatient users.
 *
 * Cache key includes: route path, query params, and preferred quality tier,
 * so different quality preferences get separate cached responses.
 *
 * Gracefully falls back to no caching when Redis is unavailable.
 */

import type { Request, Response, NextFunction } from "express";
import { getRedisClient } from "../redis";
import logger from "../logger";

const DEFAULT_TTL_SECONDS = 30; // Short TTL — feed freshness matters

export function feedCache(ttlSeconds: number = DEFAULT_TTL_SECONDS) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== "GET") return next();

    const redis = getRedisClient();
    if (!redis) return next();

    const quality = req.preferredQuality || "medium";
    const cacheKey = `feed:${req.originalUrl}:q=${quality}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        res.setHeader("X-Cache", "HIT");
        res.setHeader("Content-Type", "application/json");
        res.send(cached);
        return;
      }
    } catch (err) {
      // Redis failure is non-fatal — proceed to DB
      logger.warn("[FeedCache] Redis read failed", { error: String(err) });
    }

    // Intercept res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      // Only cache successful, non-error responses
      const hasErrorField =
        body !== null &&
        typeof body === "object" &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `in` operator requires object type; body is `unknown` at this point and narrowing via `as any` is the standard pattern here
        "error" in (body as any);
      const shouldCache = res.statusCode === 200 && !hasErrorField;

      if (shouldCache) {
        // Cache asynchronously — don't block the response
        const serialized = JSON.stringify(body);
        redis.setex(cacheKey, ttlSeconds, serialized).catch((writeErr: unknown) => {
          logger.warn("[FeedCache] Redis write failed", {
            error: String(writeErr),
          });
        });
      }
      res.setHeader("X-Cache", "MISS");
      return originalJson(body);
    };

    next();
  };
}
