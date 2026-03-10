/**
 * Sentry Error Tracking — Server
 *
 * Production-grade error tracking with:
 *   - Express request context (route, method, request ID, user)
 *   - Error classification and fingerprinting
 *   - Sensitive data scrubbing
 *   - Controlled sample rates (traces: 20% prod, 100% dev)
 *   - beforeSend filtering for expected operational errors
 *
 * MUST be imported before any other module to ensure Sentry instruments
 * all downstream libraries (http, express, pg, etc.).
 */
import * as Sentry from "@sentry/node";
import type { Request } from "express";

const SENTRY_DSN = process.env.SENTRY_DSN;
const isProduction = process.env.NODE_ENV === "production";

/** Error names/codes that represent normal operational behaviour — don't alert on these. */
const OPERATIONAL_ERRORS = new Set([
  "RATE_LIMIT",
  "CSRF_INVALID",
  "CORS_BLOCKED",
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
]);

/** HTTP status codes that are client errors, not server bugs. */
const CLIENT_ERROR_STATUSES = new Set([400, 401, 403, 404, 409, 422, 429]);

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",

    // Traces: 20% in production (cost control), 100% in dev (full visibility)
    tracesSampleRate: isProduction ? 0.2 : 1.0,

    // Release tracking — Vercel injects VERCEL_GIT_COMMIT_SHA at build time
    release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,

    // Server identification
    serverName: process.env.VERCEL ? `vercel-${process.env.VERCEL_ENV || "preview"}` : undefined,

    initialScope: {
      tags: {
        app: "skatehubba-server",
        runtime: "node",
      },
    },

    // Scrub sensitive data before sending to Sentry
    beforeSend(event, hint) {
      const error = hint?.originalException;

      // Drop expected operational errors — these are user mistakes, not bugs
      if (error instanceof Error) {
        const errorCode =
          "code" in error && typeof (error as Record<string, unknown>).code === "string"
            ? ((error as Record<string, unknown>).code as string)
            : undefined;
        if (errorCode && OPERATIONAL_ERRORS.has(errorCode)) {
          return null;
        }
      }

      // Scrub sensitive headers from request data
      if (event.request?.headers) {
        const sensitiveHeaders = ["authorization", "cookie", "x-csrf-token", "x-forwarded-for"];
        for (const header of sensitiveHeaders) {
          if (event.request.headers[header]) {
            event.request.headers[header] = "[Filtered]";
          }
        }
      }

      // Scrub sensitive data from request body
      if (event.request?.data) {
        const sensitiveKeys = ["password", "token", "secret", "creditCard", "ssn"];
        if (typeof event.request.data === "object" && event.request.data !== null) {
          const data = event.request.data as Record<string, unknown>;
          for (const key of Object.keys(data)) {
            if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
              data[key] = "[Filtered]";
            }
          }
        }
      }

      return event;
    },

    // Ignore common noisy errors
    ignoreErrors: [
      // Network errors from clients disconnecting mid-request
      "ECONNRESET",
      "EPIPE",
      "ECONNABORTED",
      // Client closed connection before response was sent
      "ERR_STREAM_PREMATURE_CLOSE",
    ],
  });
}

/**
 * Capture an exception with full Express request context.
 *
 * Enriches the Sentry event with:
 *  - Request ID (for log correlation)
 *  - Route path and HTTP method
 *  - User identity (Firebase UID if authenticated)
 *  - Error classification (severity level based on status code)
 */
export function captureRequestError(
  error: Error,
  req: Request,
  extra?: Record<string, unknown>
): void {
  if (!SENTRY_DSN) return;

  const statusCode =
    "statusCode" in error && typeof (error as Record<string, unknown>).statusCode === "number"
      ? ((error as Record<string, unknown>).statusCode as number)
      : 500;

  // Skip client errors — these are expected and noisy
  if (CLIENT_ERROR_STATUSES.has(statusCode)) return;

  Sentry.withScope((scope) => {
    // Request context
    scope.setTag("route", req.path);
    scope.setTag("method", req.method);
    scope.setTag("status_code", String(statusCode));

    if (req.requestId) {
      scope.setTag("request_id", req.requestId);
    }

    // User context (from Firebase auth middleware — typed as currentUser on Express.Request)
    const currentUser = req.currentUser;
    if (currentUser) {
      scope.setUser({
        id: currentUser.firebaseUid ?? String(currentUser.id ?? "unknown"),
      });
    }

    // Error classification
    scope.setLevel(statusCode >= 500 ? "error" : "warning");

    // Additional context
    if (extra) {
      scope.setContext("additional", extra);
    }

    // Fingerprint by error name + route for better grouping
    scope.setFingerprint([error.name || "Error", req.method, req.route?.path || req.path]);

    Sentry.captureException(error);
  });
}

/**
 * Flush all pending Sentry events. Call before process exit to ensure
 * crash reports are delivered even during unclean shutdowns.
 *
 * @param timeoutMs - Maximum time to wait for flush (default: 2000ms)
 */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!SENTRY_DSN) return;
  await Sentry.flush(timeoutMs);
}

/**
 * Capture a non-request error (background job, cron task, etc.)
 */
export function captureError(error: Error, context?: Record<string, unknown>): void {
  if (!SENTRY_DSN) return;

  Sentry.withScope((scope) => {
    scope.setLevel("error");
    if (context) {
      scope.setContext("additional", context);
      // Set source tag if provided
      if (typeof context.source === "string") {
        scope.setTag("source", context.source);
      }
    }
    Sentry.captureException(error);
  });
}

export { Sentry };
export default Sentry;
