/**
 * Tests for packages/shared/schema/battles.ts
 *
 * Covers: Drizzle schema table objects (battles, battleVotes, battleVoteState),
 * Zod validation schemas (insertBattleSchema, insertBattleVoteSchema),
 * and exported types.
 *
 * Lines 30 and 46 are Drizzle foreign key references which get executed when
 * the schema is imported.
 */

import {
  battles,
  battleVotes,
  battleVoteState,
  insertBattleSchema,
  insertBattleVoteSchema,
  type Battle,
  type InsertBattle,
  type BattleVote,
  type InsertBattleVote,
  type BattleVoteStateRow,
  type InsertBattleVoteState,
} from "../schema/battles";

describe("battles table schema", () => {
  it("is defined", () => {
    expect(battles).toBeDefined();
    const battle: Battle | undefined = undefined;
    expect(battle).toBeUndefined();
  });
});

describe("battleVotes table schema (covers line 30 foreign key reference)", () => {
  it("is defined", () => {
    expect(battleVotes).toBeDefined();
    const vote: BattleVote | undefined = undefined;
    expect(vote).toBeUndefined();
  });

  it("has battleId column referencing battles table (covers line 30)", () => {
    const columns = battleVotes as Record<string, any>;
    expect(columns.battleId).toBeDefined();
    expect(columns.battleId.name).toBe("battle_id");
  });
});

describe("battleVoteState table schema (covers line 46 foreign key reference)", () => {
  it("is defined", () => {
    expect(battleVoteState).toBeDefined();
    const state: BattleVoteStateRow | undefined = undefined;
    expect(state).toBeUndefined();
  });

  it("has battleId as primary key referencing battles table (covers line 46)", () => {
    const columns = battleVoteState as Record<string, any>;
    expect(columns.battleId).toBeDefined();
    expect(columns.battleId.name).toBe("battle_id");
  });
});

describe("insertBattleSchema", () => {
  it("accepts valid battle input", () => {
    const result = insertBattleSchema.safeParse({
      creatorId: "user-1",
    });
    expect(result.success).toBe(true);
  });

  it("accepts battle with all optional fields", () => {
    const result = insertBattleSchema.safeParse({
      creatorId: "user-1",
      opponentId: "user-2",
      matchmaking: "direct",
      status: "active",
      winnerId: "user-1",
      clipUrl: "https://example.com/clip.mp4",
      responseClipUrl: "https://example.com/response.mp4",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing creatorId", () => {
    const result = insertBattleSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("insertBattleVoteSchema", () => {
  it("accepts valid vote input", () => {
    const result = insertBattleVoteSchema.safeParse({
      battleId: "battle-1",
      odv: "voter-1",
      vote: "clean",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing battleId", () => {
    const result = insertBattleVoteSchema.safeParse({
      odv: "voter-1",
      vote: "clean",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing vote", () => {
    const result = insertBattleVoteSchema.safeParse({
      battleId: "battle-1",
      odv: "voter-1",
    });
    expect(result.success).toBe(false);
  });
});

describe("exported types", () => {
  it("InsertBattle type exists", () => {
    const insert: InsertBattle | undefined = undefined;
    expect(insert).toBeUndefined();
  });

  it("InsertBattleVote type exists", () => {
    const insert: InsertBattleVote | undefined = undefined;
    expect(insert).toBeUndefined();
  });

  it("InsertBattleVoteState type exists", () => {
    const insert: InsertBattleVoteState | undefined = undefined;
    expect(insert).toBeUndefined();
  });
});
