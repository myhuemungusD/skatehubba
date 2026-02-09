import type { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import type { FirebaseAuthedRequest } from "./firebaseUid";
import { getRedisClient } from "../redis";
import { RATE_LIMIT_CONFIG } from "../config/rateLimits";

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

/**
 * Security middleware: bypass static/public assets, apply to everything else.
 * Keep heavy checks (auth/rate limit) on /api paths in the server bootstrap.
 */
export function securityMiddleware(_req: Request, _res: Response, next: NextFunction) {
  // Currently a pass-through middleware; add security checks for non-public paths if needed.
  next();
}

const RL = RATE_LIMIT_CONFIG;

/**
 * Rate limiter for email signup attempts
 * Limits to 5 signup attempts per 15 minutes per IP address
 * Helps prevent automated account creation and spam
 */
export const emailSignupLimiter = rateLimit({
  windowMs: RL.emailSignup.windowMs,
  max: RL.emailSignup.max,
  message: { error: RL.emailSignup.message },
  standardHeaders: true,
  legacyHeaders: false,
  store: buildStore(RL.emailSignup.prefix),
});

/**
 * Rate limiter for authentication endpoints (login/register)
 * Limits to 10 authentication attempts per 15 minutes per IP address
 * Does not count successful logins, only failed attempts
 * Helps prevent brute force attacks
 */
export const authLimiter = rateLimit({
  windowMs: RL.auth.windowMs,
  max: RL.auth.max,
  message: { error: RL.auth.message },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  store: buildStore(RL.auth.prefix),
});

/**
 * Rate limiter for public write endpoints (spots, challenges, uploads)
 * Limits to 30 write requests per 10 minutes per IP address
 * Conservative to deter abuse while remaining non-blocking for real users
 */
export const publicWriteLimiter = rateLimit({
  windowMs: RL.publicWrite.windowMs,
  max: RL.publicWrite.max,
  message: { error: RL.publicWrite.message },
  standardHeaders: true,
  legacyHeaders: false,
  store: buildStore(RL.publicWrite.prefix),
});

const getDeviceFingerprint = (req: Request): string | null => {
  const deviceId = req.get("x-device-id");
  if (deviceId) return deviceId;

  const sessionId = req.get("x-session-id");
  if (sessionId) return sessionId;

  const fingerprint = req.get("x-client-fingerprint");
  if (fingerprint) return fingerprint;

  return null;
};

const userKeyGenerator = (req: Request): string => {
  const userId = req.currentUser?.id ?? "anonymous";
  const ip = req.ip ?? "unknown-ip";
  const device = getDeviceFingerprint(req) ?? "unknown-device";

  // Handle edge case where all identifiers are at their fallback values.
  // Add additional entropy from request headers so that such requests do not
  // all share the same rate limit key.
  if (userId === "anonymous" && ip === "unknown-ip" && device === "unknown-device") {
    const userAgent = req.get("user-agent") ?? "unknown-ua";
    const acceptLanguage = req.get("accept-language") ?? "unknown-lang";
    const forwardedFor = req.get("x-forwarded-for") ?? "unknown-forwarded";

    return `${userId}:${device}:${ip}:${userAgent}:${acceptLanguage}:${forwardedFor}`;
  }
  return `${userId}:${device}:${ip}`;
};

export const checkInIpLimiter = rateLimit({
  windowMs: RL.checkInIp.windowMs,
  max: RL.checkInIp.max,
  message: { error: RL.checkInIp.message },
  standardHeaders: true,
  legacyHeaders: false,
  store: buildStore(RL.checkInIp.prefix),
});

export const perUserSpotWriteLimiter = rateLimit({
  windowMs: RL.perUserSpotWrite.windowMs,
  max: RL.perUserSpotWrite.max,
  message: { error: RL.perUserSpotWrite.message },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKeyGenerator,
  store: buildStore(RL.perUserSpotWrite.prefix),
});

export const perUserCheckInLimiter = rateLimit({
  windowMs: RL.perUserCheckIn.windowMs,
  max: RL.perUserCheckIn.max,
  message: { error: RL.perUserCheckIn.message },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKeyGenerator,
  store: buildStore(RL.perUserCheckIn.prefix),
});

/**
 * Strict rate limiter for password reset requests
 * Limits to 3 password reset attempts per hour per IP address
 * Prevents abuse of password reset functionality
 */
export const passwordResetLimiter = rateLimit({
  windowMs: RL.passwordReset.windowMs,
  max: RL.passwordReset.max,
  message: { error: RL.passwordReset.message },
  standardHeaders: true,
  legacyHeaders: false,
  store: buildStore(RL.passwordReset.prefix),
});

/**
 * General API rate limiter for all endpoints
 * Limits to 100 requests per minute per IP address
 * Prevents API abuse and DDoS attacks
 */
export const apiLimiter = rateLimit({
  windowMs: RL.api.windowMs,
  max: RL.api.max,
  message: { error: RL.api.message },
  standardHeaders: true,
  legacyHeaders: false,
  store: buildStore(RL.api.prefix),
});

export const usernameCheckLimiter = rateLimit({
  windowMs: RL.usernameCheck.windowMs,
  max: RL.usernameCheck.max,
  message: { error: RL.usernameCheck.message },
  standardHeaders: true,
  legacyHeaders: false,
  store: buildStore(RL.usernameCheck.prefix),
});

export const profileCreateLimiter = rateLimit({
  windowMs: RL.profileCreate.windowMs,
  max: RL.profileCreate.max,
  message: { error: RL.profileCreate.message },
  keyGenerator: (req: Request) => {
    const firebaseUid = (req as FirebaseAuthedRequest).firebaseUid;
    return firebaseUid || req.ip || "unknown";
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: buildStore(RL.profileCreate.prefix),
});

/**
 * Static file rate limiter for HTML/template serving
 * Limits to 60 requests per minute per IP address
 * Prevents abuse of file system operations while allowing normal browsing
 * CodeQL: Missing rate limiting - addresses file system access routes
 */
export const staticFileLimiter = rateLimit({
  windowMs: RL.staticFile.windowMs,
  max: RL.staticFile.max,
  message: { error: RL.staticFile.message },
  standardHeaders: true,
  legacyHeaders: false,
  store: buildStore(RL.staticFile.prefix),
  skip: (req) => {
    // Skip rate limiting for static assets (CSS, JS, images)
    const staticExtensions = /\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i;
    return staticExtensions.test(req.path);
  },
});

/**
 * Honeypot validation middleware to catch bots
 *
 * Checks for a hidden form field named 'company' that humans won't fill but bots will.
 * On the frontend, include a hidden input: <input type="text" name="company" style="display:none" />
 * Legitimate users won't see or fill this field, but automated bots typically fill all fields.
 *
 * @param req - Express request object with 'company' field in body
 * @param res - Express response object
 * @param next - Express next function
 */
export const validateHoneypot = (req: Request, res: Response, next: NextFunction) => {
  const { company } = req.body;

  // If honeypot field is filled, it's likely a bot
  if (company && company.trim() !== "") {
    return res.status(400).json({ error: "Invalid submission" });
  }

  next();
};

/**
 * RFC-compliant email validation (ReDoS-safe)
 * All regexes are anchored and linear-time.
 */
function isValidEmail(input: string): boolean {
  const email = input.trim();

  // Hard cap first (prevents any expensive processing on huge strings)
  if (email.length < 3 || email.length > 254) return false;

  // Must contain exactly one "@"
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@")) return false;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  // Basic structural rules
  if (!local || !domain) return false;
  if (local.length > 64) return false; // RFC-ish practical constraint
  if (domain.length > 253) return false;

  // Domain must contain a dot and not start/end with dot or hyphen
  if (!domain.includes(".")) return false;
  if (domain.startsWith(".") || domain.endsWith(".")) return false;

  // Reject whitespace and control chars cheaply
  // (regex is simple and anchored; no nested quantifiers)
  if (/[^\x21-\x7E]/.test(email)) return false; // non-printable ASCII
  if (email.includes(" ")) return false;

  // Allow common email characters only (simple, anchored, linear-time)
  // local: letters/digits and these: . _ % + - (no consecutive dots, no leading/trailing dot)
  if (!/^[A-Za-z0-9._%+-]+$/.test(local)) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;

  // domain labels: letters/digits/hyphen separated by dots; TLD >= 2
  if (!/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(domain)) return false;
  if (domain.split(".").some((label) => label.length === 0 || label.length > 63)) return false;
  if (domain.split(".").some((label) => label.startsWith("-") || label.endsWith("-"))) return false;

  return true;
}

/**
 * Email validation middleware
 * Validates email format and normalizes the email address
 * @param req - Express request object with email in body
 * @param res - Express response object
 * @param next - Express next function
 */
export const validateEmail = (req: Request, res: Response, next: NextFunction) => {
  const { email } = req.body;

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email is required" });
  }

  const trimmedEmail = email.trim();

  if (!isValidEmail(trimmedEmail)) {
    return res.status(400).json({ error: "Please enter a valid email address" });
  }

  // Normalize email
  req.body.email = trimmedEmail.toLowerCase();
  next();
};

// User agent validation
/**
 * User agent validation middleware
 * Rejects requests with suspicious or missing user agents
 * Helps block simple bot attacks and scrapers
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export const validateUserAgent = (req: Request, res: Response, next: NextFunction) => {
  const userAgent = req.get("User-Agent");

  // Block requests without user agent (likely bots)
  if (!userAgent) {
    return res.status(400).json({ error: "Invalid request" });
  }

  // Block common bot patterns
  const botPatterns = [/bot/i, /crawler/i, /spider/i, /scraper/i, /curl/i, /wget/i, /python/i];

  if (botPatterns.some((pattern) => pattern.test(userAgent))) {
    return res.status(400).json({ error: "Automated requests not allowed" });
  }

  next();
};

// IP logging middleware
/**
 * IP address logging middleware for security monitoring
 * Logs client IP addresses for suspicious activity tracking
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export const logIPAddress = (req: Request, _res: Response, next: NextFunction) => {
  // Get real IP address (accounting for proxies)
  const ip =
    req.headers["x-forwarded-for"] ||
    req.headers["x-real-ip"] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress;

  req.body.ipAddress = Array.isArray(ip) ? ip[0] : ip;
  next();
};
