import type { CustomUser } from "../../packages/shared/schema";

/**
 * Extended user type that includes roles for admin checks.
 * Roles are populated by auth middleware from Firebase custom claims
 * or database lookup.
 */
export type AuthenticatedUser = CustomUser & {
  roles?: string[];
};

interface RequestLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  fatal(message: string, context?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): RequestLogger;
}

declare global {
  namespace Express {
    interface Request {
      currentUser?: AuthenticatedUser;
      isAuthenticated(): boolean;
      /** Unique request trace ID (from X-Request-ID header or generated) */
      requestId: string;
      /** Child logger with requestId pre-bound */
      log: RequestLogger;
      /** Preferred video quality tier set by bandwidth detection middleware */
      preferredQuality?: string;
      /** Client IP address set by logIPAddress middleware */
      clientIpAddress?: string;
    }
  }
}

export {};
