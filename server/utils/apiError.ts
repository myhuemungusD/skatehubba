import type { Response } from "express";

/**
 * Standardized API Error Response
 *
 * All error responses from the server follow this structure:
 *
 *  {
 *    "error":   "MACHINE_READABLE_CODE",        // UPPER_SNAKE_CASE, always present
 *    "message": "Human-readable description.",   // always present
 *    "details": { ... }                          // optional: validation issues, field info, etc.
 *  }
 */
export interface ApiErrorBody {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Send a standardized JSON error response.
 */
export function sendError(
  res: Response,
  status: number,
  error: string,
  message: string,
  details?: Record<string, unknown>
): Response {
  const body: ApiErrorBody = { error, message };
  if (details && Object.keys(details).length > 0) body.details = details;
  return res.status(status).json(body);
}

// ============================================================================
// Convenience helpers — one per common HTTP error status
// ============================================================================

export const Errors = {
  /** 400 Bad Request */
  badRequest: (res: Response, error: string, message: string, details?: Record<string, unknown>) =>
    sendError(res, 400, error, message, details),

  /** 400 Validation failed (includes Zod issues in details) */
  validation: (res: Response, issues: unknown, error = "VALIDATION_ERROR", message = "Request validation failed.") =>
    sendError(res, 400, error, message, { issues }),

  /** 401 Unauthorized */
  unauthorized: (res: Response, error = "UNAUTHORIZED", message = "Authentication required.") =>
    sendError(res, 401, error, message),

  /** 403 Forbidden */
  forbidden: (res: Response, error = "FORBIDDEN", message = "Insufficient permissions.") =>
    sendError(res, 403, error, message),

  /** 404 Not Found */
  notFound: (res: Response, error = "NOT_FOUND", message = "Resource not found.") =>
    sendError(res, 404, error, message),

  /** 409 Conflict */
  conflict: (res: Response, error: string, message: string, details?: Record<string, unknown>) =>
    sendError(res, 409, error, message, details),

  /** 413 Payload Too Large */
  tooLarge: (res: Response, error = "PAYLOAD_TOO_LARGE", message = "Payload too large.") =>
    sendError(res, 413, error, message),

  /** 429 Rate Limited */
  rateLimited: (res: Response, message = "Too many requests. Please try again later.", details?: Record<string, unknown>) =>
    sendError(res, 429, "RATE_LIMITED", message, details),

  /** 500 Internal Server Error */
  internal: (res: Response, error = "INTERNAL_ERROR", message = "An unexpected error occurred.") =>
    sendError(res, 500, error, message),

  /** 503 Database Unavailable */
  dbUnavailable: (res: Response) =>
    sendError(res, 503, "DATABASE_UNAVAILABLE", "Database unavailable. Please try again shortly."),

  /** 503 Service Unavailable */
  unavailable: (res: Response, error = "SERVICE_UNAVAILABLE", message = "Service temporarily unavailable.") =>
    sendError(res, 503, error, message),
} as const;
