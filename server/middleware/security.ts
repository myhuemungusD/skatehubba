
import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

const RATE_LIMITS = {
  // CodeQL: Missing rate limiting (auth endpoints)
  auth: {
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many authentication attempts, please try again later.',
  },
  // CodeQL: Missing rate limiting (public write endpoints)
  publicWrite: {
    windowMs: 10 * 60 * 1000,
    max: 30,
    message: 'Too many write requests, please slow down.',
  },
  // CodeQL: Missing rate limiting (password reset endpoints)
  passwordReset: {
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: 'Too many password reset attempts, please try again later.',
  },
  // CodeQL: Missing rate limiting (general API)
  api: {
    windowMs: 1 * 60 * 1000,
    max: 100,
    message: 'Too many requests, please slow down.',
  },
} as const;

/**
 * Rate limiter for email signup attempts
 * Limits to 5 signup attempts per 15 minutes per IP address
 * Helps prevent automated account creation and spam
 */
export const emailSignupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 signup attempts per windowMs
  message: {
    error: 'Too many signup attempts from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for authentication endpoints (login/register)
 * Limits to 10 authentication attempts per 15 minutes per IP address
 * Does not count successful logins, only failed attempts
 * Helps prevent brute force attacks
 */
export const authLimiter = rateLimit({
  windowMs: RATE_LIMITS.auth.windowMs, // 15 minutes
  max: RATE_LIMITS.auth.max, // Limit each IP to 10 login attempts per window
  message: {
    error: RATE_LIMITS.auth.message
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful logins
});

/**
 * Rate limiter for public write endpoints (spots, challenges, uploads)
 * Limits to 30 write requests per 10 minutes per IP address
 * Conservative to deter abuse while remaining non-blocking for real users
 */
export const publicWriteLimiter = rateLimit({
  windowMs: RATE_LIMITS.publicWrite.windowMs, // 10 minutes
  max: RATE_LIMITS.publicWrite.max, // 30 writes per 10 minutes
  message: {
    error: RATE_LIMITS.publicWrite.message
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict rate limiter for password reset requests
 * Limits to 3 password reset attempts per hour per IP address
 * Prevents abuse of password reset functionality
 */
export const passwordResetLimiter = rateLimit({
  windowMs: RATE_LIMITS.passwordReset.windowMs, // 1 hour
  max: RATE_LIMITS.passwordReset.max, // Only 3 password reset requests per hour
  message: {
    error: RATE_LIMITS.passwordReset.message
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * General API rate limiter for all endpoints
 * Limits to 100 requests per minute per IP address
 * Prevents API abuse and DDoS attacks
 */
export const apiLimiter = rateLimit({
  windowMs: RATE_LIMITS.api.windowMs, // 1 minute
  max: RATE_LIMITS.api.max, // 100 requests per minute
  message: {
    error: RATE_LIMITS.api.message
  },
  standardHeaders: true,
  legacyHeaders: false,
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
  if (company && company.trim() !== '') {
    return res.status(400).json({ error: 'Invalid submission' });
  }
  
  next();
};

/**
 * Email validation middleware
 * Validates email format and normalizes the email address
 * @param req - Express request object with email in body
 * @param res - Express response object
 * @param next - Express next function
 */
export const validateEmail = (req: Request, res: Response, next: NextFunction) => {
  const { email } = req.body;
  
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const trimmedEmail = email.trim();
  
  if (!emailRegex.test(trimmedEmail) || trimmedEmail.length < 3 || trimmedEmail.length > 254) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
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
  const userAgent = req.get('User-Agent');
  
  // Block requests without user agent (likely bots)
  if (!userAgent) {
    return res.status(400).json({ error: 'Invalid request' });
  }
  
  // Block common bot patterns
  const botPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python/i
  ];
  
  if (botPatterns.some(pattern => pattern.test(userAgent))) {
    return res.status(400).json({ error: 'Automated requests not allowed' });
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
export const logIPAddress = (req: Request, res: Response, next: NextFunction) => {
  // Get real IP address (accounting for proxies)
  const ip = req.headers['x-forwarded-for'] || 
             req.headers['x-real-ip'] || 
             req.connection.remoteAddress || 
             req.socket.remoteAddress;
  
  req.body.ipAddress = Array.isArray(ip) ? ip[0] : ip;
  next();
};
