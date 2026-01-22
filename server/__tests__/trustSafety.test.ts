import {
  TRUST_QUOTAS,
  createInMemoryRateLimiter,
  getBanStatus,
  getQuotaDecision,
  hasProtectedProfileFields,
  type ModerationProfile,
} from "../services/trustSafety";

describe("trust & safety guards", () => {
  it("blocks client attempts to set pro verification", () => {
    const payload = { isProVerified: true };
    expect(hasProtectedProfileFields(payload)).toBe(true);
  });

  it("blocks client attempts to raise trust level", () => {
    const payload = { trustLevel: 2 };
    expect(hasProtectedProfileFields(payload)).toBe(true);
  });

  it("treats banned users as blocked for posting/check-ins", () => {
    const profile: ModerationProfile = {
      trustLevel: 0,
      reputationScore: 0,
      isBanned: true,
      banExpiresAt: null,
      proVerificationStatus: "none",
      isProVerified: false,
    };

    const status = getBanStatus(profile);
    expect(status.isBanned).toBe(true);
  });

  it("returns 429 after rate limit threshold", () => {
    const limiter = createInMemoryRateLimiter({ windowMs: 1000, max: 2 });

    const first = limiter.check("user-1", 0);
    const second = limiter.check("user-1", 0);
    const third = limiter.check("user-1", 0);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
  });

  it("rejects report spam once quota is exceeded", () => {
    const limit = TRUST_QUOTAS[0].report;
    const decision = getQuotaDecision(0, "report", limit);

    expect(decision.allowed).toBe(false);
  });
});
