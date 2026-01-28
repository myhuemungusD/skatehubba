import { AnalyticsIngestSchema, type EventName } from "@skatehubba/shared/analytics-events";
import { auth } from "../firebase.config";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";

const SESSION_KEY = "skatehubba_session_id";
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "";

/**
 * Generate a unique ID for event idempotency using cryptographically secure random.
 */
function generateEventId(): string {
  return Crypto.randomUUID();
}

/**
 * Get or create a persistent session ID.
 * Uses AsyncStorage so it persists across app restarts within a session.
 */
async function getSessionId(): Promise<string> {
  try {
    let sessionId = await AsyncStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = generateEventId();
      await AsyncStorage.setItem(SESSION_KEY, sessionId);
    }
    return sessionId;
  } catch {
    // Fallback if AsyncStorage fails
    return generateEventId();
  }
}

/**
 * Get the platform source (ios or android).
 */
function getSource(): "ios" | "android" {
  return Platform.OS === "ios" ? "ios" : "android";
}

/**
 * Get the app version string.
 */
function getAppVersion(): string {
  return Application.nativeApplicationVersion ?? "mobile";
}

/**
 * Log an analytics event to the server.
 *
 * Key features:
 * - Only logs when user is authenticated (server needs UID)
 * - Generates idempotency key (event_id) to prevent duplicate counting
 * - Validates payload before sending
 * - Silently fails - analytics should never crash the app
 *
 * @param event_name - Event type from allowlist
 * @param properties - Event-specific data
 *
 * @example
 * ```ts
 * await logEvent("battle_created", {
 *   battle_id: "abc123",
 *   matchmaking: "open",
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
    const sessionId = await getSessionId();

    const payload = {
      event_id: generateEventId(),
      event_name,
      occurred_at: new Date().toISOString(),
      session_id: sessionId,
      source: getSource(),
      app_version: getAppVersion(),
      properties,
    };

    // Validate before sending
    const parsed = AnalyticsIngestSchema.safeParse(payload);
    if (!parsed.success) {
      console.warn("[Analytics] Invalid event payload:", parsed.error.flatten());
      return;
    }

    // Send to server
    await fetch(`${API_BASE_URL}/api/analytics/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    // Silently fail - analytics should never crash the app
    console.warn("[Analytics] Failed to log event:", error);
  }
}

/**
 * Log multiple events at once (useful for offline sync).
 */
export async function logEventBatch(
  events: Array<{ event_name: EventName; properties?: Record<string, unknown> }>
): Promise<void> {
  try {
    const user = auth.currentUser;
    if (!user) return;

    const token = await user.getIdToken();
    const sessionId = await getSessionId();
    const source = getSource();
    const appVersion = getAppVersion();

    const payload = events.map((ev) => ({
      event_id: generateEventId(),
      event_name: ev.event_name,
      occurred_at: new Date().toISOString(),
      session_id: sessionId,
      source,
      app_version: appVersion,
      properties: ev.properties ?? {},
    }));

    await fetch(`${API_BASE_URL}/api/analytics/events/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn("[Analytics] Failed to log event batch:", error);
  }
}

/**
 * Clear the current session (call on logout).
 */
export async function clearAnalyticsSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore errors
  }
}
