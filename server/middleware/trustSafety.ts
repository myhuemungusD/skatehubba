import type { Request, Response, NextFunction } from "express";
import {
  createInMemoryRateLimiter,
  getBanStatus,
  type ModerationAction,
} from "../services/trustSafety";
import {
  consumeQuota,
  getModerationProfile,
  QuotaExceededError,
} from "../services/moderationStore";

const checkInRateLimiter = createInMemoryRateLimiter({ windowMs: 60 * 1000, max: 10 });
const postRateLimiter = createInMemoryRateLimiter({ windowMs: 60 * 1000, max: 5 });
const reportRateLimiter = createInMemoryRateLimiter({ windowMs: 60 * 1000, max: 3 });
const adminRateLimiter = createInMemoryRateLimiter({ windowMs: 60 * 1000, max: 20 });

const getLimiter = (action: ModerationAction) => {
  switch (action) {
    case "checkin":
      return checkInRateLimiter;
    case "post":
      return postRateLimiter;
    case "report":
      return reportRateLimiter;
    default:
      return checkInRateLimiter;
  }
};

export const enforceTrustAction = (action: ModerationAction) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.currentUser?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const limiter = getLimiter(action);
    const decision = limiter.check(userId);
    if (!decision.allowed) {
      return res.status(429).json({
        error: "RATE_LIMITED",
        retryAfterMs: decision.retryAfterMs,
      });
    }

    try {
      const profile = await getModerationProfile(userId);
      const banStatus = getBanStatus(profile);
      if (banStatus.isBanned) {
        return res.status(403).json({
          error: "BANNED",
          expiresAt: banStatus.expiresAt?.toISOString() ?? null,
        });
      }

      await consumeQuota(userId, action, profile.trustLevel);

      return next();
    } catch (error) {
      if (error instanceof QuotaExceededError) {
        return res.status(429).json({ error: "QUOTA_EXCEEDED" });
      }

      return res.status(500).json({ error: "MODERATION_CHECK_FAILED" });
    }
  };
};

export const enforceAdminRateLimit = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.currentUser?.id ?? req.ip ?? "unknown";
    const decision = adminRateLimiter.check(key);
    if (!decision.allowed) {
      return res.status(429).json({
        error: "RATE_LIMITED",
        retryAfterMs: decision.retryAfterMs,
      });
    }

    return next();
  };
};

export const enforceNotBanned = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.currentUser?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      const profile = await getModerationProfile(userId);
      const banStatus = getBanStatus(profile);
      if (banStatus.isBanned) {
        return res.status(403).json({
          error: "BANNED",
          expiresAt: banStatus.expiresAt?.toISOString() ?? null,
        });
      }
      return next();
    } catch (error) {
      return res.status(500).json({ error: "MODERATION_CHECK_FAILED" });
    }
  };
};
