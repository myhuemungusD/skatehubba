import rateLimit from "express-rate-limit";
import { apiLimiter as securityApiLimiter } from "./security";

// Reuse the centralized apiLimiter from security.ts to avoid conflicting configurations.
export const apiLimiter = securityApiLimiter;

export const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Strict limit for writes
  message: { error: "Too many attempts. Chill." },
  keyGenerator: (req) => req.ip || "unknown",
});
