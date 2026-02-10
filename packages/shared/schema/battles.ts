import { z } from "zod";
import { pgTable, serial, timestamp, json, varchar, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";

// Battles table - 1v1 trick battles
export const battles = pgTable("battles", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  creatorId: varchar("creator_id", { length: 255 }).notNull(),
  opponentId: varchar("opponent_id", { length: 255 }),
  matchmaking: varchar("matchmaking", { length: 20 }).notNull().default("open"), // 'open' | 'direct'
  status: varchar("status", { length: 20 }).notNull().default("waiting"), // 'waiting' | 'active' | 'voting' | 'completed'
  winnerId: varchar("winner_id", { length: 255 }),
  clipUrl: varchar("clip_url", { length: 500 }),
  responseClipUrl: varchar("response_clip_url", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// Battle votes table
export const battleVotes = pgTable(
  "battle_votes",
  {
    id: serial("id").primaryKey(),
    battleId: varchar("battle_id", { length: 255 })
      .notNull()
      .references(() => battles.id, { onDelete: "cascade" }),
    odv: varchar("odv", { length: 255 }).notNull(), // voter ID
    vote: varchar("vote", { length: 20 }).notNull(), // 'clean' | 'sketch' | 'redo'
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    battleVoterIdx: uniqueIndex("unique_battle_voter").on(table.battleId, table.odv),
  })
);

// Battle Vote State table — replaces Firestore battle_state collection
export const battleVoteState = pgTable(
  "battle_vote_state",
  {
    battleId: varchar("battle_id", { length: 255 })
      .primaryKey()
      .references(() => battles.id, { onDelete: "cascade" }),
    creatorId: varchar("creator_id", { length: 255 }).notNull(),
    opponentId: varchar("opponent_id", { length: 255 }),
    status: varchar("status", { length: 20 }).notNull().default("voting"),
    votes: json("votes")
      .$type<
        Array<{
          odv: string;
          vote: "clean" | "sketch" | "redo";
          votedAt: string;
        }>
      >()
      .notNull()
      .default([]),
    votingStartedAt: timestamp("voting_started_at"),
    voteDeadlineAt: timestamp("vote_deadline_at"),
    winnerId: varchar("winner_id", { length: 255 }),
    processedEventIds: json("processed_event_ids").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index("IDX_battle_vote_state_status").on(table.status),
    deadlineIdx: index("IDX_battle_vote_state_deadline").on(table.status, table.voteDeadlineAt),
  })
);

export const insertBattleSchema = createInsertSchema(battles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});

export const insertBattleVoteSchema = createInsertSchema(battleVotes).omit({
  id: true,
  createdAt: true,
});

export type Battle = typeof battles.$inferSelect;
export type InsertBattle = z.infer<typeof insertBattleSchema>;
export type BattleVote = typeof battleVotes.$inferSelect;
export type InsertBattleVote = z.infer<typeof insertBattleVoteSchema>;
export type BattleVoteStateRow = typeof battleVoteState.$inferSelect;
export type InsertBattleVoteState = typeof battleVoteState.$inferInsert;
