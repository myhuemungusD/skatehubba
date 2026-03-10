/**
 * Sentry Error Tracking — Client (Web)
 *
 * Production-grade error tracking with:
 *   - Browser extension error filtering
 *   - Network error noise reduction
 *   - User context propagation (call setSentryUser after auth)
 *   - API error breadcrumbs for debugging
 *   - Controlled sample rates (traces: 20% prod, replays: 10% prod)
 *   - Release tracking via Vite build-time injection
 */
import * as Sentry from "@sentry/react";
import { env } from "./config/env";

const isProduction = env.MODE === "production";

if (env.EXPO_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: env.EXPO_PUBLIC_SENTRY_DSN,
    environment: env.MODE,
    tracesSampleRate: isProduction ? 0.2 : 1.0,
    replaysSessionSampleRate: isProduction ? 0.1 : 0,
    // Capture 100% of sessions that encounter an error (replay-on-error)
    replaysOnErrorSampleRate: 1.0,

    beforeSend(event, hint) {
      // Drop events from browser extensions — they pollute error streams
      if (
        event.exception?.values?.some((v) =>
          v.stacktrace?.frames?.some((f) => f.filename?.startsWith("chrome-extension://"))
        )
      ) {
        return null;
      }

      // Drop ResizeObserver errors — benign browser implementation quirk
      const error = hint?.originalException;
      if (error instanceof Error && error.message?.includes("ResizeObserver loop")) {
        return null;
      }

      return event;
    },

    // Filter noisy errors that aren't actionable
    ignoreErrors: [
      // Network errors from flaky connections
      "Failed to fetch",
      "NetworkError",
      "Load failed",
      "AbortError",
      // Browser quirks
      "ResizeObserver loop",
      // User-initiated navigation interrupts
      "The operation was aborted",
      "The user aborted a request",
    ],

    // Ignore errors from third-party scripts
    denyUrls: [/extensions\//i, /^chrome:\/\//i, /^moz-extension:\/\//i],

    initialScope: {
      tags: {
        app: "skatehubba-web",
      },
    },
  });
}

/**
 * Set the authenticated user context on Sentry.
 * Call after successful login / auth state change.
 */
export function setSentryUser(user: { uid: string; username?: string }): void {
  Sentry.setUser({
    id: user.uid,
    username: user.username,
  });
}

/**
 * Clear user context on logout.
 */
export function clearSentryUser(): void {
  Sentry.setUser(null);
}

/**
 * Add a breadcrumb for API errors so Sentry events show the
 * sequence of API calls leading up to a crash.
 */
export function addApiErrorBreadcrumb(
  method: string,
  url: string,
  statusCode: number,
  errorCode?: string
): void {
  Sentry.addBreadcrumb({
    category: "api",
    message: `${method} ${url} → ${statusCode}`,
    level: statusCode >= 500 ? "error" : "warning",
    data: {
      method,
      url,
      statusCode,
      ...(errorCode && { errorCode }),
    },
  });
}

/**
 * Capture an API error with structured context for better Sentry grouping.
 */
export function captureApiError(
  error: Error,
  context: { method: string; url: string; statusCode: number; errorCode?: string }
): void {
  // Only report 5xx errors to Sentry — 4xx are expected client errors
  if (context.statusCode < 500) return;

  Sentry.withScope((scope) => {
    scope.setTag("api_endpoint", context.url);
    scope.setTag("api_method", context.method);
    scope.setTag("api_status", String(context.statusCode));
    if (context.errorCode) {
      scope.setTag("api_error_code", context.errorCode);
    }
    scope.setFingerprint(["api-error", context.method, context.url, String(context.statusCode)]);
    Sentry.captureException(error);
  });
}

export default Sentry;
