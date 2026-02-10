import {
  TRUST_QUOTAS,
  PROTECTED_PROFILE_FIELDS,
  hasProtectedProfileFields,
  getBanStatus,
  getQuotaDecision,
  createInMemoryRateLimiter,
  createRedisRateLimiter,
  type TrustLevel,
  type ModerationAction,
  type ModerationProfile,
} from "../services/trustSafety";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a ModerationProfile with sensible defaults that can be overridden. */
const makeProfile = (overrides: Partial<ModerationProfile> = {}): ModerationProfile => ({
  trustLevel: 1,
  reputationScore: 50,
  isBanned: false,
  banExpiresAt: null,
  proVerificationStatus: "none",
  isProVerified: false,
  ...overrides,
});

/** Create a minimal mock that quacks like an ioredis instance. */
const createRedisMock = (overrides: Record<string, unknown> = {}) => {
  let counter = 0;
  let ttlValue = 60;

  return {
    incr: vi.fn(async () => {
      counter += 1;
      return counter;
    }),
    expire: vi.fn(async () => 1),
    ttl: vi.fn(async () => ttlValue),

    /** Test-only helpers to manipulate mock state. */
    _setCounter(n: number) {
      counter = n;
    },
    _setTtl(n: number) {
      ttlValue = n;
    },
    _resetCounter() {
      counter = 0;
    },
    ...overrides,
  } as unknown as import("ioredis").default;
};

// ---------------------------------------------------------------------------
// TRUST_QUOTAS
// ---------------------------------------------------------------------------

describe("TRUST_QUOTAS", () => {
  const trustLevels: TrustLevel[] = [0, 1, 2];
  const actions: ModerationAction[] = ["checkin", "post", "report"];

  it("contains an entry for every trust level", () => {
    for (const level of trustLevels) {
      expect(TRUST_QUOTAS[level]).toBeDefined();
    }
  });

  it("every trust level maps every action to a positive integer", () => {
    for (const level of trustLevels) {
      for (const action of actions) {
        const value = TRUST_QUOTAS[level][action];
        expect(value).toBeGreaterThan(0);
        expect(Number.isInteger(value)).toBe(true);
      }
    }
  });

  it("higher trust levels have equal or greater quotas than lower levels", () => {
    for (const action of actions) {
      expect(TRUST_QUOTAS[1][action]).toBeGreaterThanOrEqual(TRUST_QUOTAS[0][action]);
      expect(TRUST_QUOTAS[2][action]).toBeGreaterThanOrEqual(TRUST_QUOTAS[1][action]);
    }
  });

  it("has the exact expected values for trust level 0", () => {
    expect(TRUST_QUOTAS[0]).toEqual({ checkin: 2, post: 1, report: 3 });
  });

  it("has the exact expected values for trust level 1", () => {
    expect(TRUST_QUOTAS[1]).toEqual({ checkin: 5, post: 3, report: 5 });
  });

  it("has the exact expected values for trust level 2", () => {
    expect(TRUST_QUOTAS[2]).toEqual({ checkin: 10, post: 5, report: 10 });
  });
});

// ---------------------------------------------------------------------------
// hasProtectedProfileFields
// ---------------------------------------------------------------------------

describe("hasProtectedProfileFields", () => {
  it("returns true when payload contains a single protected field", () => {
    for (const field of PROTECTED_PROFILE_FIELDS) {
      expect(hasProtectedProfileFields({ [field]: "anything" })).toBe(true);
    }
  });

  it("returns true when payload contains multiple protected fields", () => {
    const payload = { trustLevel: 2, isBanned: false, displayName: "Alice" };
    expect(hasProtectedProfileFields(payload)).toBe(true);
  });

  it("returns true when protected field is mixed with non-protected fields", () => {
    const payload = { bio: "skater", reputationScore: 999 };
    expect(hasProtectedProfileFields(payload)).toBe(true);
  });

  it("returns false for a payload with only non-protected fields", () => {
    const payload = { displayName: "Bob", bio: "loves kickflips", avatarUrl: "http://img" };
    expect(hasProtectedProfileFields(payload)).toBe(false);
  });

  it("returns false for an empty payload", () => {
    expect(hasProtectedProfileFields({})).toBe(false);
  });

  it("returns false when field values happen to match protected names but keys do not", () => {
    const payload = { someField: "trustLevel" };
    expect(hasProtectedProfileFields(payload)).toBe(false);
  });

  it("detects proVerificationStatus as protected", () => {
    expect(hasProtectedProfileFields({ proVerificationStatus: "verified" })).toBe(true);
  });

  it("detects banExpiresAt as protected", () => {
    expect(hasProtectedProfileFields({ banExpiresAt: new Date() })).toBe(true);
  });

  it("detects reputationSignals as protected", () => {
    expect(hasProtectedProfileFields({ reputationSignals: [] })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getBanStatus
// ---------------------------------------------------------------------------

describe("getBanStatus", () => {
  it("returns not banned for a profile that is not banned", () => {
    const profile = makeProfile({ isBanned: false });
    const result = getBanStatus(profile);

    expect(result).toEqual({ isBanned: false, expired: false, expiresAt: null });
  });

  it("returns not banned for an unbanned profile even if banExpiresAt is set", () => {
    const profile = makeProfile({
      isBanned: false,
      banExpiresAt: new Date("2099-01-01"),
    });
    const result = getBanStatus(profile);

    expect(result.isBanned).toBe(false);
    expect(result.expired).toBe(false);
    expect(result.expiresAt).toBeNull();
  });

  it("returns banned for a permanently banned profile (no expiry)", () => {
    const profile = makeProfile({ isBanned: true, banExpiresAt: null });
    const result = getBanStatus(profile);

    expect(result.isBanned).toBe(true);
    expect(result.expired).toBe(false);
    expect(result.expiresAt).toBeNull();
  });

  it("returns banned for a temp-banned profile whose ban has NOT expired", () => {
    const future = new Date("2099-06-15T00:00:00Z");
    const now = new Date("2025-01-01T00:00:00Z");
    const profile = makeProfile({ isBanned: true, banExpiresAt: future });
    const result = getBanStatus(profile, now);

    expect(result.isBanned).toBe(true);
    expect(result.expired).toBe(false);
    expect(result.expiresAt).toEqual(future);
  });

  it("returns not banned + expired for a temp-banned profile whose ban HAS expired", () => {
    const past = new Date("2024-01-01T00:00:00Z");
    const now = new Date("2025-06-01T00:00:00Z");
    const profile = makeProfile({ isBanned: true, banExpiresAt: past });
    const result = getBanStatus(profile, now);

    expect(result.isBanned).toBe(false);
    expect(result.expired).toBe(true);
    expect(result.expiresAt).toEqual(past);
  });

  it("treats a ban expiring exactly at 'now' as expired", () => {
    const exactNow = new Date("2025-06-01T12:00:00Z");
    const profile = makeProfile({ isBanned: true, banExpiresAt: exactNow });
    const result = getBanStatus(profile, exactNow);

    expect(result.isBanned).toBe(false);
    expect(result.expired).toBe(true);
  });

  it("uses the current time when 'now' is not supplied", () => {
    const farFuture = new Date("2099-12-31T23:59:59Z");
    const profile = makeProfile({ isBanned: true, banExpiresAt: farFuture });
    const result = getBanStatus(profile);

    // Ban is in the far future, so it should still be active.
    expect(result.isBanned).toBe(true);
    expect(result.expired).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getQuotaDecision
// ---------------------------------------------------------------------------

describe("getQuotaDecision", () => {
  it("allows when current count is zero", () => {
    const decision = getQuotaDecision(0, "post", 0);
    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(1); // limit is 1 for trust 0 / post
    expect(decision.limit).toBe(1);
  });

  it("allows when current count is under the limit", () => {
    const decision = getQuotaDecision(1, "checkin", 2); // limit 5
    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(3);
  });

  it("blocks when current count equals the limit", () => {
    const decision = getQuotaDecision(1, "checkin", 5); // limit 5
    expect(decision.allowed).toBe(false);
    expect(decision.remaining).toBe(0);
  });

  it("blocks when current count exceeds the limit", () => {
    const decision = getQuotaDecision(0, "report", 100); // limit 3
    expect(decision.allowed).toBe(false);
    expect(decision.remaining).toBe(0);
  });

  it("remaining never goes negative", () => {
    const decision = getQuotaDecision(2, "post", 999);
    expect(decision.remaining).toBe(0);
  });

  it("returns the correct limit for each trust level / action combo", () => {
    const levels: TrustLevel[] = [0, 1, 2];
    const actions: ModerationAction[] = ["checkin", "post", "report"];

    for (const level of levels) {
      for (const action of actions) {
        const decision = getQuotaDecision(level, action, 0);
        expect(decision.limit).toBe(TRUST_QUOTAS[level][action]);
      }
    }
  });

  it("allows one fewer than the limit and reports remaining=1", () => {
    // Trust 2 checkin limit is 10; currentCount 9 should allow one more.
    const decision = getQuotaDecision(2, "checkin", 9);
    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(1);
  });

  it("blocks at exact boundary (currentCount === limit) for trust level 2 report", () => {
    const decision = getQuotaDecision(2, "report", 10);
    expect(decision.allowed).toBe(false);
    expect(decision.remaining).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// createInMemoryRateLimiter
// ---------------------------------------------------------------------------

describe("createInMemoryRateLimiter", () => {
  it("allows requests under the max", () => {
    const limiter = createInMemoryRateLimiter({ windowMs: 10_000, max: 3 });

    const r1 = limiter.check("u1", 0);
    expect(r1.allowed).toBe(true);
    expect(r1.status).toBe(200);
    expect(r1.remaining).toBe(2);
    expect(r1.limit).toBe(3);

    const r2 = limiter.check("u1", 0);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);
  });

  it("blocks once max is exceeded", () => {
    const limiter = createInMemoryRateLimiter({ windowMs: 10_000, max: 2 });

    limiter.check("u1", 0); // 1
    limiter.check("u1", 0); // 2
    const r3 = limiter.check("u1", 0); // 3 -> blocked

    expect(r3.allowed).toBe(false);
    expect(r3.status).toBe(429);
    expect(r3.remaining).toBe(0);
    expect(r3.retryAfterMs).toBeGreaterThan(0);
  });

  it("reports correct retryAfterMs when blocked", () => {
    const limiter = createInMemoryRateLimiter({ windowMs: 5_000, max: 1 });

    limiter.check("u1", 1000); // allowed, resetAt = 1000 + 5000 = 6000
    const blocked = limiter.check("u1", 2000); // blocked at t=2000

    expect(blocked.retryAfterMs).toBe(4000); // 6000 - 2000
  });

  it("resets after the window elapses", () => {
    const limiter = createInMemoryRateLimiter({ windowMs: 1_000, max: 1 });

    const r1 = limiter.check("u1", 0);
    expect(r1.allowed).toBe(true);

    const r2 = limiter.check("u1", 500);
    expect(r2.allowed).toBe(false);

    // After the window has passed (t >= resetAt which is 0 + 1000 = 1000)
    const r3 = limiter.check("u1", 1001);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0); // max 1, count becomes 1, remaining = 0
  });

  it("tracks multiple keys independently", () => {
    const limiter = createInMemoryRateLimiter({ windowMs: 10_000, max: 1 });

    const a1 = limiter.check("alice", 0);
    const b1 = limiter.check("bob", 0);

    expect(a1.allowed).toBe(true);
    expect(b1.allowed).toBe(true);

    // Both have used their single allowed request.
    const a2 = limiter.check("alice", 0);
    const b2 = limiter.check("bob", 0);

    expect(a2.allowed).toBe(false);
    expect(b2.allowed).toBe(false);
  });

  it("sets retryAfterMs to 0 when allowed", () => {
    const limiter = createInMemoryRateLimiter({ windowMs: 10_000, max: 5 });
    const result = limiter.check("key", 0);

    expect(result.retryAfterMs).toBe(0);
  });

  it("populates resetAt on the first request", () => {
    const limiter = createInMemoryRateLimiter({ windowMs: 60_000, max: 10 });
    const result = limiter.check("k", 5000);

    expect(result.resetAt).toBe(5000 + 60_000);
  });

  it("preserves the same resetAt for subsequent calls within the window", () => {
    const limiter = createInMemoryRateLimiter({ windowMs: 10_000, max: 5 });

    const r1 = limiter.check("k", 100);
    const r2 = limiter.check("k", 200);

    expect(r1.resetAt).toBe(r2.resetAt);
  });
});

// ---------------------------------------------------------------------------
// createRedisRateLimiter
// ---------------------------------------------------------------------------

describe("createRedisRateLimiter", () => {
  it("allows requests under the max", async () => {
    const redis = createRedisMock();
    const limiter = createRedisRateLimiter({ windowMs: 60_000, max: 5 }, redis);

    const result = await limiter.check("u1", 1000);

    expect(result.allowed).toBe(true);
    expect(result.status).toBe(200);
    expect(result.remaining).toBe(4);
    expect(result.limit).toBe(5);
    expect(result.retryAfterMs).toBe(0);
  });

  it("calls redis.incr with the prefixed key", async () => {
    const redis = createRedisMock();
    const limiter = createRedisRateLimiter({ windowMs: 60_000, max: 5 }, redis, "test:");

    await limiter.check("mykey", 0);

    expect(redis.incr).toHaveBeenCalledWith("test:mykey");
  });

  it("sets expire on first increment (count === 1)", async () => {
    const redis = createRedisMock();
    const limiter = createRedisRateLimiter({ windowMs: 30_000, max: 5 }, redis);

    await limiter.check("k1", 0);

    // windowMs=30_000 -> windowSeconds = 30
    expect(redis.expire).toHaveBeenCalledWith("rl:k1", 30);
  });

  it("does not set expire when count > 1", async () => {
    const redis = createRedisMock();
    // Start counter at 1 so the next incr returns 2.
    redis._setCounter(1);
    const limiter = createRedisRateLimiter({ windowMs: 60_000, max: 5 }, redis);

    await limiter.check("k1", 0);

    // expire should only be called for the TTL-repair branch (-1 check), not the count===1 branch
    // Since ttl mock returns 60 (positive), expire is NOT called at all.
    const expireCalls = (redis.expire as ReturnType<typeof vi.fn>).mock.calls;
    const firstArgCalls = expireCalls.filter(
      (call: unknown[]) => call[0] === "rl:k1" && call[1] === 60
    );
    // The count===1 branch should not have fired (count is 2).
    expect(firstArgCalls.length).toBe(0);
  });

  it("blocks when count exceeds max", async () => {
    const redis = createRedisMock();
    redis._setCounter(4); // next incr will return 5
    redis._setTtl(30);
    const limiter = createRedisRateLimiter({ windowMs: 60_000, max: 5 }, redis);

    // count=5, max=5 -> allowed (count <= max)
    const atLimit = await limiter.check("u1", 1000);
    expect(atLimit.allowed).toBe(true);

    // count=6, max=5 -> blocked
    const overLimit = await limiter.check("u1", 1000);
    expect(overLimit.allowed).toBe(false);
    expect(overLimit.status).toBe(429);
    expect(overLimit.remaining).toBe(0);
    expect(overLimit.retryAfterMs).toBeGreaterThan(0);
  });

  it("computes resetAt from TTL", async () => {
    const redis = createRedisMock();
    redis._setTtl(45);
    const limiter = createRedisRateLimiter({ windowMs: 60_000, max: 10 }, redis);

    const result = await limiter.check("u1", 2000);

    // resetAt = now + ttl * 1000 = 2000 + 45000 = 47000
    expect(result.resetAt).toBe(47_000);
  });

  it("repairs TTL when redis.ttl returns a negative value", async () => {
    const redis = createRedisMock();
    redis._setTtl(-1); // simulate missing TTL
    redis._setCounter(1); // first call (count will be 2, but counter starts at 1 and will incr)
    // Actually let's reset to 0 so first call returns 1
    redis._resetCounter();
    const limiter = createRedisRateLimiter({ windowMs: 10_000, max: 5 }, redis);

    await limiter.check("k", 0);

    // windowSeconds = ceil(10_000/1000) = 10
    // expire is called once for count===1 and once for TTL repair
    const expireCalls = (redis.expire as ReturnType<typeof vi.fn>).mock.calls;
    expect(expireCalls.length).toBe(2);
    // Both should set TTL to windowSeconds=10
    expect(expireCalls[0]).toEqual(["rl:k", 10]);
    expect(expireCalls[1]).toEqual(["rl:k", 10]);
  });

  it("uses the default key prefix 'rl:' when none is provided", async () => {
    const redis = createRedisMock();
    const limiter = createRedisRateLimiter({ windowMs: 60_000, max: 5 }, redis);

    await limiter.check("abc", 0);

    expect(redis.incr).toHaveBeenCalledWith("rl:abc");
  });

  it("uses a custom key prefix when provided", async () => {
    const redis = createRedisMock();
    const limiter = createRedisRateLimiter({ windowMs: 60_000, max: 5 }, redis, "custom:");

    await limiter.check("abc", 0);

    expect(redis.incr).toHaveBeenCalledWith("custom:abc");
  });

  it("falls back to in-memory limiter when redis.incr throws", async () => {
    const redis = createRedisMock({
      incr: vi.fn(async () => {
        throw new Error("Redis connection lost");
      }),
    });
    const limiter = createRedisRateLimiter({ windowMs: 10_000, max: 2 }, redis);

    // Should not throw; falls back to in-memory.
    const r1 = await limiter.check("u1", 0);
    expect(r1.allowed).toBe(true);
    expect(r1.status).toBe(200);

    const r2 = await limiter.check("u1", 0);
    expect(r2.allowed).toBe(true);

    const r3 = await limiter.check("u1", 0);
    expect(r3.allowed).toBe(false);
    expect(r3.status).toBe(429);
  });

  it("falls back to in-memory limiter when redis.ttl throws", async () => {
    let incrCount = 0;
    const redis = createRedisMock({
      incr: vi.fn(async () => {
        incrCount += 1;
        return incrCount;
      }),
      ttl: vi.fn(async () => {
        throw new Error("TTL failed");
      }),
    });
    const limiter = createRedisRateLimiter({ windowMs: 10_000, max: 1 }, redis);

    // First call: incr succeeds but ttl throws -> fallback.
    const r1 = await limiter.check("u1", 0);
    expect(r1.allowed).toBe(true);

    // Second call also falls back. In-memory counts this as request #2 for key "u1".
    const r2 = await limiter.check("u1", 0);
    expect(r2.allowed).toBe(false);
  });

  it("rounds up windowMs to the next whole second for expire", async () => {
    const redis = createRedisMock();
    const limiter = createRedisRateLimiter({ windowMs: 1500, max: 5 }, redis);

    await limiter.check("k", 0);

    // Math.ceil(1500/1000) = 2
    expect(redis.expire).toHaveBeenCalledWith("rl:k", 2);
  });

  it("correctly computes remaining on subsequent calls", async () => {
    const redis = createRedisMock();
    const limiter = createRedisRateLimiter({ windowMs: 60_000, max: 3 }, redis);

    const r1 = await limiter.check("u1", 0);
    expect(r1.remaining).toBe(2); // max(3-1, 0) = 2

    const r2 = await limiter.check("u1", 0);
    expect(r2.remaining).toBe(1); // max(3-2, 0) = 1

    const r3 = await limiter.check("u1", 0);
    expect(r3.remaining).toBe(0); // max(3-3, 0) = 0

    const r4 = await limiter.check("u1", 0);
    expect(r4.remaining).toBe(0); // max(3-4, 0) = 0
    expect(r4.allowed).toBe(false);
  });
});
