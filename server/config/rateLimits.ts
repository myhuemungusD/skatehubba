/**
 * Rate Limiter Configuration
 *
 * Centralized configuration for all express-rate-limit instances.
 * Adjust values here instead of editing individual middleware files.
 *
 * Each entry defines:
 *  - windowMs: time window in milliseconds
 *  - max: maximum number of requests per window
 *  - message: error message returned when limit is exceeded
 *  - prefix: Redis key prefix for distributed rate limiting
 */

export const RATE_LIMIT_CONFIG = {
  /** Authentication endpoints (login, verify-email, forgot/reset password) */
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: "Too many authentication attempts, please try again later.",
    prefix: "rl:secauth:",
  },

  /** Email signup attempts */
  emailSignup: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: "Too many signup attempts from this IP, please try again later.",
    prefix: "rl:signup:",
  },

  /** Public write endpoints (spots, challenges, uploads) */
  publicWrite: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 30,
    message: "Too many write requests, please slow down.",
    prefix: "rl:pubwrite:",
  },

  /** Check-in requests per IP */
  checkInIp: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 60,
    message: "Check-in rate limit exceeded.",
    prefix: "rl:checkinip:",
  },

  /** Spot creation per user (MVP: 3 spots/day) */
  perUserSpotWrite: {
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 3,
    message: "You've reached the daily limit for adding spots (3 per day). Try again tomorrow!",
    prefix: "rl:spotwrite:",
  },

  /** Check-in requests per user */
  perUserCheckIn: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20,
    message: "Check-in rate limit exceeded.",
    prefix: "rl:checkinuser:",
  },

  /** Password reset requests */
  passwordReset: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
    message: "Too many password reset attempts, please try again later.",
    prefix: "rl:pwreset:",
  },

  /** General API rate limit (all /api routes) */
  api: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100,
    message: "Too many requests, please slow down.",
    prefix: "rl:api:",
  },

  /** Username availability checks */
  usernameCheck: {
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    message: "Too many username checks, please slow down.",
    prefix: "rl:username:",
  },

  /** Profile creation attempts */
  profileCreate: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    message: "Too many profile creation attempts, please try again later.",
    prefix: "rl:profile:",
  },

  /** Static file / HTML template serving */
  staticFile: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60,
    message: "Too many requests, please slow down.",
    prefix: "rl:static:",
  },

  /** Quick match requests per user */
  quickMatch: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 5,
    message: "Too many quick match requests, please slow down.",
    prefix: "rl:quickmatch:",
  },

  /** Spot rating requests per user */
  spotRating: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10,
    message: "Too many rating requests, please slow down.",
    prefix: "rl:spotrate:",
  },

  /** Spot discovery requests per IP */
  spotDiscovery: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10,
    message: "Too many discovery requests, please slow down.",
    prefix: "rl:discover:",
  },

  /** Pro award requests per user */
  proAward: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    message: "Too many pro award attempts, please try again later.",
    prefix: "rl:proaward:",
  },

  // --- rateLimit.ts limiters (auth/routes.ts login, AI endpoints) ---

  /** Auth limiter used by auth/routes.ts (login endpoint) */
  authLogin: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    message: "Too many login attempts, please try again later.",
    prefix: "rl:auth:",
  },

  /** AI endpoint requests */
  ai: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: "Too many AI requests, please try again later.",
    prefix: "rl:ai:",
  },

  /** Profile read/fetch requests per IP — prevents scraping */
  profileRead: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60,
    message: "Too many profile requests, please slow down.",
    prefix: "rl:profileread:",
  },

  /** MFA verification attempts (brute-force protection for 6-digit TOTP codes) */
  mfaVerify: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: "Too many MFA verification attempts, please try again later.",
    prefix: "rl:mfa:",
  },

  /** Sensitive auth actions (change-password, verify-identity) */
  sensitiveAuth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: "Too many attempts, please try again later.",
    prefix: "rl:sensitive:",
  },

  /** Remote S.K.A.T.E. round actions (resolve, confirm) */
  remoteSkate: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10,
    message: "Too many requests, please slow down.",
    prefix: "rl:remoteskate:",
  },

  /** Post creation */
  postCreate: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 10,
    message: "Too many posts, please slow down.",
    prefix: "rl:postcreate:",
  },

  /** Analytics event ingestion per IP */
  analyticsIngest: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60,
    message: "Too many analytics requests, please slow down.",
    prefix: "rl:analytics:",
  },

  /** Stripe checkout / payment actions */
  payment: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: "Too many payment requests, please try again later.",
    prefix: "rl:payment:",
  },

  /** Game creation and write actions */
  gameWrite: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 10,
    message: "Too many game actions, please slow down.",
    prefix: "rl:gamewrite:",
  },

  /** TrickMint video upload requests per user */
  trickmintUpload: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 15,
    message: "Too many upload requests, please try again later.",
    prefix: "rl:trickmint:",
  },

  /** User search/listing requests per IP — prevents scraping */
  userSearch: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30,
    message: "Too many search requests, please slow down.",
    prefix: "rl:usersearch:",
  },
} as const;

export type RateLimitKey = keyof typeof RATE_LIMIT_CONFIG;
