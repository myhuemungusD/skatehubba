/**
 * Tests for client/src/lib/game/gameActions.ts
 *
 * Covers: FORFEIT action branch (line 134) in submitAction
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockAuth = vi.hoisted(() => ({
  currentUser: {
    uid: "user-1",
  } as any,
}));

const mockRunTransaction = vi.fn();

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((...args: any[]) => {
    if (args.length >= 3 && typeof args[2] === "string") {
      return { id: args[2], _col: args[1] };
    }
    return { id: "auto-id", _col: "auto" };
  }),
  runTransaction: (...args: any[]) => mockRunTransaction(...args),
  serverTimestamp: vi.fn(() => ({ _serverTimestamp: true })),
  increment: vi.fn((n: number) => ({ _increment: n })),
}));

vi.mock("../../firebase", () => ({
  db: { _mockDb: true },
  auth: mockAuth,
}));

// ── Imports ────────────────────────────────────────────────────────────────

import { submitAction } from "../gameActions";

// ── Tests ──────────────────────────────────────────────────────────────────

describe("gameActions — submitAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.currentUser = { uid: "user-1" } as any;
  });

  it("handles FORFEIT action — sets status to CANCELLED and opponentId as winner (line 134)", async () => {
    const mockUpdate = vi.fn();
    const mockTransaction = {
      get: vi.fn().mockResolvedValue({
        exists: () => true,
        id: "game-1",
        data: () => ({
          state: {
            status: "ACTIVE",
            phase: "SETTER_RECORDING",
            turnPlayerId: "user-1",
            p1Letters: 0,
            p2Letters: 0,
            roundNumber: 1,
          },
          players: ["user-1", "user-2"],
        }),
      }),
      update: mockUpdate,
    };

    mockRunTransaction.mockImplementation(async (_db: any, fn: any) => {
      return fn(mockTransaction);
    });

    await submitAction("game-1", "FORFEIT");

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        "state.status": "CANCELLED",
        "state.currentTrick": null,
        winnerId: "user-2",
      })
    );
  });

  it("throws when user is not authenticated", async () => {
    mockAuth.currentUser = null;
    await expect(submitAction("game-1", "FORFEIT")).rejects.toThrow("Unauthorized");
  });
});
