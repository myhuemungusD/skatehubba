import { describe, it, expect, vi } from "vitest";

vi.mock("node:crypto", () => ({
  default: { randomBytes: () => ({ toString: () => "abcd1234" }) },
}));

import { generateEventId, MAX_PROCESSED_EVENTS } from "../idempotency";

describe("generateEventId", () => {
  it("returns deterministic id with sequenceKey", () => {
    const id = generateEventId("timeout", "user1", "battle1", "seq-key");
    expect(id).toBe("timeout-battle1-user1-seq-key");
  });

  it("returns non-deterministic id without sequenceKey", () => {
    const id = generateEventId("vote", "user1", "battle1");
    expect(id).toMatch(/^vote-battle1-user1-\d+-abcd1234$/);
  });

  it("returns non-deterministic id when sequenceKey is undefined", () => {
    const id = generateEventId("vote", "user1", "battle1", undefined);
    expect(id).toMatch(/^vote-battle1-user1-\d+-abcd1234$/);
  });

  it("returns non-deterministic id when sequenceKey is empty string", () => {
    const id = generateEventId("vote", "user1", "battle1", "");
    expect(id).toMatch(/^vote-battle1-user1-\d+-abcd1234$/);
  });
});

describe("MAX_PROCESSED_EVENTS", () => {
  it("is a positive integer", () => {
    expect(MAX_PROCESSED_EVENTS).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_PROCESSED_EVENTS)).toBe(true);
  });
});
