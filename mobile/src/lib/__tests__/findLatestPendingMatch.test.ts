import { describe, it, expect } from "vitest";
import type { Move } from "@skatehubba/types";

/**
 * Tests the findLatestPendingMatch helper logic used in game/[id].tsx.
 * The helper finds the most recent "match" move with a "pending" result.
 */
function findLatestPendingMatch(moves: Move[]): Move | null {
  return [...moves].reverse().find((m) => m.type === "match" && m.result === "pending") ?? null;
}

function makeMove(overrides: Partial<Move> = {}): Move {
  return {
    id: "move-1",
    roundNumber: 1,
    playerId: "user-1",
    type: "set",
    trickName: "Kickflip",
    clipUrl: "https://example.com/clip.mp4",
    storagePath: null,
    thumbnailUrl: null,
    durationSec: 15,
    result: "pending",
    createdAt: new Date(),
    ...overrides,
  };
}

describe("findLatestPendingMatch", () => {
  it("returns null for empty moves array", () => {
    expect(findLatestPendingMatch([])).toBeNull();
  });

  it("returns null when no match moves exist", () => {
    const moves = [makeMove({ type: "set", result: "pending" })];
    expect(findLatestPendingMatch(moves)).toBeNull();
  });

  it("returns null when match moves exist but none are pending", () => {
    const moves = [
      makeMove({ id: "m1", type: "match", result: "landed" }),
      makeMove({ id: "m2", type: "match", result: "bailed" }),
    ];
    expect(findLatestPendingMatch(moves)).toBeNull();
  });

  it("returns the pending match move", () => {
    const pending = makeMove({ id: "m2", type: "match", result: "pending" });
    const moves = [makeMove({ id: "m1", type: "set", result: "landed" }), pending];
    expect(findLatestPendingMatch(moves)).toEqual(pending);
  });

  it("returns the last pending match when multiple exist", () => {
    const earlier = makeMove({ id: "m1", type: "match", result: "pending" });
    const later = makeMove({ id: "m2", type: "match", result: "pending" });
    const moves = [earlier, later];
    expect(findLatestPendingMatch(moves)?.id).toBe("m2");
  });

  it("skips landed/bailed matches and finds pending one", () => {
    const moves = [
      makeMove({ id: "m1", type: "match", result: "landed" }),
      makeMove({ id: "m2", type: "match", result: "bailed" }),
      makeMove({ id: "m3", type: "set", result: "pending" }),
      makeMove({ id: "m4", type: "match", result: "pending" }),
    ];
    expect(findLatestPendingMatch(moves)?.id).toBe("m4");
  });

  it("does not mutate the original array", () => {
    const moves = [
      makeMove({ id: "m1", type: "match", result: "landed" }),
      makeMove({ id: "m2", type: "match", result: "pending" }),
    ];
    const copy = [...moves];
    findLatestPendingMatch(moves);
    expect(moves.map((m) => m.id)).toEqual(copy.map((m) => m.id));
  });
});
