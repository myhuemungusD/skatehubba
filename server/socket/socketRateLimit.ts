/**
 * Per-socket sliding-window rate limiter for WebSocket events.
 *
 * Single shared instance — both game and battle handlers register their
 * rules here. Cleanup is one call per socket on disconnect.
 */

export interface RateLimitRule {
  maxPerWindow: number;
  windowMs: number;
}

const buckets = new Map<string, Map<string, number[]>>();
const rules = new Map<string, RateLimitRule>();

/**
 * Register rate-limit rules for a set of event names.
 * Call once at module load (e.g. from handler files).
 * Later calls for the same event name overwrite the previous rule.
 */
export function registerRateLimitRules(
  entries: Record<string, RateLimitRule>
): void {
  for (const [event, rule] of Object.entries(entries)) {
    rules.set(event, rule);
  }
}

/**
 * Returns true if the event is allowed, false if rate-limited.
 */
export function checkRateLimit(socketId: string, eventName: string): boolean {
  const rule = rules.get(eventName);
  if (!rule) return true;

  const now = Date.now();
  if (!buckets.has(socketId)) {
    buckets.set(socketId, new Map());
  }
  const perEvent = buckets.get(socketId)!;

  const timestamps = perEvent.get(eventName) || [];
  const recent = timestamps.filter((t) => now - t < rule.windowMs);

  if (recent.length >= rule.maxPerWindow) {
    return false;
  }

  recent.push(now);
  perEvent.set(eventName, recent);
  return true;
}

/**
 * Remove all tracking for a disconnected socket.
 */
export function cleanupRateLimits(socketId: string): void {
  buckets.delete(socketId);
}
