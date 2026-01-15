import rateLimit from "express-rate-limit";

// NOTE: MemoryStore is not shared across instances; use RedisStore for multi-instance deployments.

export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  // Login failures must return 401/403 for skipSuccessfulRequests to work.
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
  message: {
    error: "Too many AI requests, please try again later.",
  },
});
