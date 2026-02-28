/**
 * Battle State Service — Idempotency Helpers
 *
 * Deterministic event ID generation for deduplication of battle events.
 */

import crypto from "node:crypto";

export function generateEventId(
  type: string,
  odv: string,
  battleId: string,
  sequenceKey?: string
): string {
  if (sequenceKey) {
    return `${type}-${battleId}-${odv}-${sequenceKey}`;
  }
  return `${type}-${battleId}-${odv}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

/** Maximum number of processed event IDs to retain per vote-state row */
export const MAX_PROCESSED_EVENTS = 50;
