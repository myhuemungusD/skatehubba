import { describe, expect, it } from "vitest";
import { createMemoryReplayStore, verifyReplayProtection } from "../services/replayProtection";

describe("replay protection", () => {
  it("rejects a duplicate nonce for the same user", async () => {
    const store = createMemoryReplayStore();
    const payload = {
      spotId: 42,
      lat: 37.7749,
      lng: -122.4194,
      nonce: "nonce-1234567890",
      clientTimestamp: new Date().toISOString(),
    };

    const first = await verifyReplayProtection("user-1", payload, store);
    const second = await verifyReplayProtection("user-1", payload, store);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe("replay_detected");
    }
  });
});
