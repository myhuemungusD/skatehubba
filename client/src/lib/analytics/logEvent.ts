import { AnalyticsIngestSchema, type EventName } from "@shared/analytics-events";
import { auth } from "../firebase";
import { getAppConfig } from '@skatehubba/config';

/**
 * Generate a ULID-like unique ID for event idempotency.
 * Using crypto.randomUUID (available in all modern browsers).
 */
function generateEventId(): string {
  // crypto.randomUUID is available in all modern browsers (Chrome 92+, Firefox 95+, Safari 15.4+)
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback using crypto.getRandomValues (secure)
  const array = new Uint32Array(4);
  crypto.getRandomValues(array);
  return Array.from(array, (n) => n.toString(16).padStart(8, "0")).join("-");
}

/**
 * Get or create a persistent session ID for this browser session.
 * Stored in sessionStorage so it persists across page navigations
 * but clears when the browser tab is closed.
 *
 * Falls back to an in-memory ID if sessionStorage is unavailable
 * or throws (e.g., in private browsing or non-browser environments).
 */
function getSessionId(): string {
  const key = "skatehubba_session_id";
  let sessionId: string | null = null;

  // Guard against non-browser environments and storage access errors.
  if (typeof window !== "undefined" && typeof window.sessionStorage !== "undefined") {
    try {
      sessionId = window.sessionStorage.getItem(key);
      if (!sessionId) {
        sessionId = generateEventId();
        window.sessionStorage.setItem(key, sessionId);
      }
    } catch {
      // If accessing sessionStorage fails for any reason,
      // fall through to the non-persistent fallback below.
    }
  }

  // If we couldn't use sessionStorage, still return a valid session ID.
  if (!sessionId) {
    sessionId = generateEventId();
  }
  return sessionId;
}

/**
 * Log an analytics event to the server.
 *
 * Key features:
 * - Only logs when user is authenticated (server needs UID)
 * - Generates idempotency key (event_id) to prevent duplicate counting on retry
 * - Validates payload before sending (catches dev mistakes early)
 * - Uses keepalive to ensure events are sent even on page unload
 * - Silently fails - analytics should never break the app
 *
 * @param event_name - Event type from allowlist (e.g., "battle_created")
 * @param properties - Event-specific data (validated per event type on server)
 *
 * @example
 * ```ts
 * // Log a battle creation
 * await logEvent("battle_created", {
 *   battle_id: "abc123",
 *   matchmaking: "open",
 * });
 *
 * // Log a vote
 * await logEvent("battle_voted", {
 *   battle_id: "abc123",
 *   vote: "clean",
 * });
 * ```
 */
export async function logEvent(
  event_name: EventName,
  properties: Record<string, unknown> = {}
): Promise<void> {
  try {
    // Only log events for authenticated users
    const user = auth.currentUser;
    if (!user) {
      return;
    }

    // Get fresh ID token for auth
    const token = await user.getIdToken();

    const payload = {
      event_id: generateEventId(),
      event_name,
      occurred_at: new Date().toISOString(),
      session_id: getSessionId(),
      source: "web" as const,
      app_version: getAppConfig().version,
      properties,
    };

    // Validate before sending (catches dev mistakes early)
    const parsed = AnalyticsIngestSchema.safeParse(payload);
    if (!parsed.success) {
      console.warn("[Analytics] Invalid event payload:", parsed.error.flatten());
      return;
    }

    // Send to server - fire and forget
    await fetch("/api/analytics/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      keepalive: true, // Helps on navigation/unload
    });
  } catch (error) {
    // Silently fail - analytics should never break the app
    console.warn("[Analytics] Failed to log event:", error);
  }
}

/**
 * Log multiple events at once (useful for offline sync).
 *
 * @param events - Array of event name + properties pairs
 */
export async function logEventBatch(
  events: Array<{ event_name: EventName; properties?: Record<string, unknown> }>
): Promise<void> {
  try {
    const user = auth.currentUser;
    if (!user) return;

    const token = await user.getIdToken();
    const sessionId = getSessionId();
    const appVersion = getAppConfig().version;

    const payload = events.map((ev) => ({
      event_id: generateEventId(),
      event_name: ev.event_name,
      occurred_at: new Date().toISOString(),
      session_id: sessionId,
      source: "web" as const,
      app_version: appVersion,
      properties: ev.properties ?? {},
    }));

    await fetch("/api/analytics/events/batch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch (error) {
    console.warn("[Analytics] Failed to log event batch:", error);
  }
}
