export type TrustLevel = 0 | 1 | 2;

export type ModerationAction = "checkin" | "post" | "report";

export type ProVerificationStatus = "none" | "pending" | "verified" | "rejected";

export interface ModerationProfile {
  trustLevel: TrustLevel;
  reputationScore: number;
  isBanned: boolean;
  banExpiresAt: Date | null;
  proVerificationStatus: ProVerificationStatus;
  isProVerified: boolean;
}

export const TRUST_QUOTAS: Record<TrustLevel, Record<ModerationAction, number>> = {
  0: {
    checkin: 2,
    post: 1,
    report: 3,
  },
  1: {
    checkin: 5,
    post: 3,
    report: 5,
  },
  2: {
    checkin: 10,
    post: 5,
    report: 10,
  },
};

export const PROTECTED_PROFILE_FIELDS = [
  "trustLevel",
  "reputationScore",
  "reputationSignals",
  "isBanned",
  "banExpiresAt",
  "proVerificationStatus",
  "isProVerified",
] as const;

export const hasProtectedProfileFields = (payload: Record<string, unknown>): boolean =>
  PROTECTED_PROFILE_FIELDS.some((field) => field in payload);

export interface BanStatus {
  isBanned: boolean;
  expired: boolean;
  expiresAt: Date | null;
}

export const getBanStatus = (profile: ModerationProfile, now = new Date()): BanStatus => {
  if (!profile.isBanned) {
    return { isBanned: false, expired: false, expiresAt: null };
  }

  if (profile.banExpiresAt && profile.banExpiresAt <= now) {
    return { isBanned: false, expired: true, expiresAt: profile.banExpiresAt };
  }

  return { isBanned: true, expired: false, expiresAt: profile.banExpiresAt };
};

export interface QuotaDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
}

export const getQuotaDecision = (
  trustLevel: TrustLevel,
  action: ModerationAction,
  currentCount: number
): QuotaDecision => {
  const limit = TRUST_QUOTAS[trustLevel][action];
  const remaining = Math.max(limit - currentCount, 0);
  return {
    allowed: currentCount < limit,
    limit,
    remaining,
  };
};

export interface RateLimitDecision {
  allowed: boolean;
  status: 200 | 429;
  retryAfterMs: number;
  remaining: number;
  limit: number;
  resetAt: number;
}

export interface InMemoryRateLimiter {
  check: (key: string, now?: number) => RateLimitDecision;
}

interface RateLimitOptions {
  windowMs: number;
  max: number;
}

interface RateLimitState {
  count: number;
  resetAt: number;
}

export interface RateLimiter {
  check: (key: string, now?: number) => Promise<RateLimitDecision>;
}

export const createInMemoryRateLimiter = (options: RateLimitOptions): InMemoryRateLimiter => {
  const store = new Map<string, RateLimitState>();

  const check = (key: string, now = Date.now()): RateLimitDecision => {
    const existing = store.get(key);
    const resetAt =
      existing?.resetAt && existing.resetAt > now ? existing.resetAt : now + options.windowMs;
    const count = existing && existing.resetAt > now ? existing.count : 0;
    const nextCount = count + 1;
    const allowed = nextCount <= options.max;

    store.set(key, { count: nextCount, resetAt });

    return {
      allowed,
      status: allowed ? 200 : 429,
      retryAfterMs: allowed ? 0 : Math.max(resetAt - now, 0),
      remaining: Math.max(options.max - nextCount, 0),
      limit: options.max,
      resetAt,
    };
  };

  return { check };
};

/**
 * Redis-backed rate limiter for multi-instance deployments.
 * Uses atomic INCR + EXPIRE for race-condition-safe counting.
 * Falls back to in-memory if Redis is unavailable.
 */
export const createRedisRateLimiter = (
  options: RateLimitOptions,
  redis: import("ioredis").default,
  keyPrefix = "rl:"
): RateLimiter => {
  const memoryFallback = createInMemoryRateLimiter(options);
  const windowSeconds = Math.ceil(options.windowMs / 1000);

  const check = async (key: string, now = Date.now()): Promise<RateLimitDecision> => {
    try {
      const redisKey = `${keyPrefix}${key}`;
      const count = await redis.incr(redisKey);

      if (count === 1) {
        await redis.expire(redisKey, windowSeconds);
      }

      const ttl = await redis.ttl(redisKey);
      let effectiveTtlSeconds = ttl;
      if (effectiveTtlSeconds < 0) {
        // Key has no TTL or does not exist; enforce windowSeconds as TTL
        await redis.expire(redisKey, windowSeconds);
        effectiveTtlSeconds = windowSeconds;
      }
      const resetAt = now + effectiveTtlSeconds * 1000;
      const allowed = count <= options.max;

      return {
        allowed,
        status: allowed ? 200 : 429,
        retryAfterMs: allowed ? 0 : Math.max(resetAt - now, 0),
        remaining: Math.max(options.max - count, 0),
        limit: options.max,
        resetAt,
      };
    } catch {
      // Redis failure — degrade to memory
      return memoryFallback.check(key, now);
    }
  };

  return { check };
};
