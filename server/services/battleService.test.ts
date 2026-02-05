import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("../db", () => ({
  db: null as any,
}));

vi.mock("./analyticsService", () => ({
  logServerEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../packages/shared/schema", () => ({
  battles: {
    id: "id",
    creatorId: "creatorId",
    opponentId: "opponentId",
    status: "status",
    winnerId: "winnerId",
    clipUrl: "clipUrl",
    responseClipUrl: "responseClipUrl",
  },
  battleVotes: {
    battleId: "battleId",
    odv: "odv",
    vote: "vote",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((field, value) => ({ field, value })),
}));

import {
  createBattle,
  joinBattle,
  voteBattle,
  completeBattle,
  getBattle,
  getBattleVotes,
  setBattleVoting,
  uploadBattleResponse,
} from "./battleService";
import * as dbModule from "../db";
import { logServerEvent } from "./analyticsService";

describe("createBattle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when db is null", async () => {
    (dbModule as any).db = null;
    await expect(createBattle({ creatorId: "u1", matchmaking: "open" })).rejects.toThrow(
      "Database not available"
    );
  });

  it("inserts battle and logs analytics event", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "battle-1" }]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    (dbModule as any).db = { insert: insertFn };

    const result = await createBattle({
      creatorId: "u1",
      matchmaking: "open",
      stance: "regular",
    });

    expect(result).toEqual({ battleId: "battle-1" });
    expect(insertFn).toHaveBeenCalled();
    expect(logServerEvent).toHaveBeenCalledWith(
      "u1",
      "battle_created",
      expect.objectContaining({
        battle_id: "battle-1",
        matchmaking: "open",
      })
    );
  });
});

describe("joinBattle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when db is null", async () => {
    (dbModule as any).db = null;
    await expect(joinBattle("u2", "battle-1")).rejects.toThrow("Database not available");
  });

  it("updates battle status and logs event", async () => {
    const returningFn = vi
      .fn()
      .mockResolvedValue([{ id: "battle-1", opponentId: "u2", status: "active" }]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    (dbModule as any).db = { update: updateFn };

    const result = await joinBattle("u2", "battle-1");
    expect(result).toEqual({ success: true });
    expect(logServerEvent).toHaveBeenCalledWith("u2", "battle_joined", { battle_id: "battle-1" });
  });

  it("throws when battle not found", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    (dbModule as any).db = { update: updateFn };

    await expect(joinBattle("u2", "nonexistent")).rejects.toThrow("Battle not found");
  });
});

describe("voteBattle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when db is null", async () => {
    (dbModule as any).db = null;
    await expect(voteBattle({ odv: "u1", battleId: "b1", vote: "clean" })).rejects.toThrow(
      "Database not available"
    );
  });

  it("inserts vote with upsert and logs event", async () => {
    const onConflictFn = vi.fn().mockResolvedValue(undefined);
    const valuesFn = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    (dbModule as any).db = { insert: insertFn };

    const result = await voteBattle({ odv: "u1", battleId: "b1", vote: "clean" });
    expect(result).toEqual({ success: true });
    expect(logServerEvent).toHaveBeenCalledWith("u1", "battle_voted", {
      battle_id: "b1",
      vote: "clean",
    });
  });
});

describe("completeBattle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when db is null", async () => {
    (dbModule as any).db = null;
    await expect(completeBattle({ battleId: "b1", totalRounds: 5 })).rejects.toThrow(
      "Database not available"
    );
  });

  it("updates battle to completed and logs event for winner", async () => {
    const whereFn = vi.fn().mockResolvedValue(undefined);
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    (dbModule as any).db = { update: updateFn };

    const result = await completeBattle({ battleId: "b1", winnerId: "u1", totalRounds: 5 });
    expect(result).toEqual({ success: true });
    expect(logServerEvent).toHaveBeenCalledWith(
      "u1",
      "battle_completed",
      expect.objectContaining({
        battle_id: "b1",
        winner_id: "u1",
        total_rounds: 5,
      })
    );
  });

  it("does not log event when no winner", async () => {
    const whereFn = vi.fn().mockResolvedValue(undefined);
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    (dbModule as any).db = { update: updateFn };

    await completeBattle({ battleId: "b1", totalRounds: 5 });
    expect(logServerEvent).not.toHaveBeenCalled();
  });
});

describe("getBattle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when db is null", async () => {
    (dbModule as any).db = null;
    await expect(getBattle("b1")).rejects.toThrow("Database not available");
  });

  it("returns battle when found", async () => {
    const battle = { id: "b1", status: "active" };
    const whereFn = vi.fn().mockResolvedValue([battle]);
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });
    (dbModule as any).db = { select: selectFn };

    const result = await getBattle("b1");
    expect(result).toEqual(battle);
  });

  it("returns null when battle not found", async () => {
    const whereFn = vi.fn().mockResolvedValue([]);
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });
    (dbModule as any).db = { select: selectFn };

    const result = await getBattle("nonexistent");
    expect(result).toBeNull();
  });
});

describe("getBattleVotes", () => {
  it("throws when db is null", async () => {
    (dbModule as any).db = null;
    await expect(getBattleVotes("b1")).rejects.toThrow("Database not available");
  });

  it("returns votes for a battle", async () => {
    const votes = [{ odv: "u1", vote: "clean" }];
    const whereFn = vi.fn().mockResolvedValue(votes);
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });
    (dbModule as any).db = { select: selectFn };

    const result = await getBattleVotes("b1");
    expect(result).toEqual(votes);
  });
});

describe("setBattleVoting", () => {
  it("throws when db is null", async () => {
    (dbModule as any).db = null;
    await expect(setBattleVoting("b1")).rejects.toThrow("Database not available");
  });

  it("updates battle status to voting", async () => {
    const whereFn = vi.fn().mockResolvedValue(undefined);
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    (dbModule as any).db = { update: updateFn };

    const result = await setBattleVoting("b1");
    expect(result).toEqual({ success: true });
  });
});

describe("uploadBattleResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when db is null", async () => {
    (dbModule as any).db = null;
    await expect(uploadBattleResponse("u1", "b1", "https://clip.mp4")).rejects.toThrow(
      "Database not available"
    );
  });

  it("throws when battle not found", async () => {
    const whereFn = vi.fn().mockResolvedValue([]);
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });
    (dbModule as any).db = { select: selectFn };

    await expect(uploadBattleResponse("u1", "b1", "https://clip.mp4")).rejects.toThrow(
      "Battle not found"
    );
  });

  it("uploads clip for creator", async () => {
    const battle = { id: "b1", creatorId: "u1", opponentId: "u2" };
    const selectWhereFn = vi.fn().mockResolvedValue([battle]);
    const selectFromFn = vi.fn().mockReturnValue({ where: selectWhereFn });
    const selectFn = vi.fn().mockReturnValue({ from: selectFromFn });

    const updateWhereFn = vi.fn().mockResolvedValue(undefined);
    const updateSetFn = vi.fn().mockReturnValue({ where: updateWhereFn });
    const updateFn = vi.fn().mockReturnValue({ set: updateSetFn });

    (dbModule as any).db = { select: selectFn, update: updateFn };

    const result = await uploadBattleResponse("u1", "b1", "https://clip.mp4");
    expect(result).toEqual({ success: true });
    expect(logServerEvent).toHaveBeenCalledWith(
      "u1",
      "battle_response_uploaded",
      expect.objectContaining({
        battle_id: "b1",
      })
    );
  });
});
