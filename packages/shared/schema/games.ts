import { z } from "zod";
import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  json,
  varchar,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";

// Game status enum: pending (waiting for accept), active (in progress), completed, declined, forfeited
export const GAME_STATUSES = ["pending", "active", "completed", "declined", "forfeited"] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

// Turn phase: describes what the current player must do
// "set_trick" = offensive player records a trick video
// "respond_trick" = defensive player watches + records response video
// "judge" = defensive player judges the offensive trick (LAND/BAIL)
export const TURN_PHASES = ["set_trick", "respond_trick", "judge"] as const;
export type TurnPhase = (typeof TURN_PHASES)[number];

// Turn result enum
export const TURN_RESULTS = ["landed", "missed", "pending"] as const;
export type TurnResult = (typeof TURN_RESULTS)[number];

// S.K.A.T.E. Games table — async, turn-based, ruthless
export const games = pgTable("games", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  player1Id: varchar("player1_id", { length: 255 }).notNull(),
  player1Name: varchar("player1_name", { length: 255 }).notNull(),
  player2Id: varchar("player2_id", { length: 255 }),
  player2Name: varchar("player2_name", { length: 255 }),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  currentTurn: varchar("current_turn", { length: 255 }),
  // Async turn phase tracking
  turnPhase: varchar("turn_phase", { length: 50 }).default("set_trick"), // set_trick | respond_trick | judge
  offensivePlayerId: varchar("offensive_player_id", { length: 255 }), // who set the trick
  defensivePlayerId: varchar("defensive_player_id", { length: 255 }), // who must respond + judge
  player1Letters: varchar("player1_letters", { length: 5 }).default(""),
  player2Letters: varchar("player2_letters", { length: 5 }).default(""),
  winnerId: varchar("winner_id", { length: 255 }),
  lastTrickDescription: text("last_trick_description"),
  lastTrickBy: varchar("last_trick_by", { length: 255 }),
  // Dispute tracking: max 1 per player per game
  player1DisputeUsed: boolean("player1_dispute_used").default(false),
  player2DisputeUsed: boolean("player2_dispute_used").default(false),
  deadlineAt: timestamp("deadline_at"), // 24-hour deadline for current turn
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// Game turns/history table — each turn = one video clip (set or response)
export const gameTurns = pgTable("game_turns", {
  id: serial("id").primaryKey(),
  gameId: varchar("game_id", { length: 255 }).notNull(),
  playerId: varchar("player_id", { length: 255 }).notNull(),
  playerName: varchar("player_name", { length: 255 }).notNull(),
  turnNumber: integer("turn_number").notNull(),
  turnType: varchar("turn_type", { length: 20 }).notNull().default("set"), // "set" = offensive trick, "response" = defensive attempt
  trickDescription: text("trick_description").notNull(),
  videoUrl: varchar("video_url", { length: 500 }), // Firebase Storage URL
  videoDurationMs: integer("video_duration_ms"), // Max 15000ms enforced client-side
  thumbnailUrl: varchar("thumbnail_url", { length: 500 }), // First-frame thumbnail for feed/history
  result: varchar("result", { length: 50 }).notNull().default("pending"), // 'landed', 'missed', 'pending'
  judgedBy: varchar("judged_by", { length: 255 }),
  judgedAt: timestamp("judged_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Dispute table — max 1 per player per game, final resolution
export const gameDisputes = pgTable("game_disputes", {
  id: serial("id").primaryKey(),
  gameId: varchar("game_id", { length: 255 }).notNull(),
  turnId: integer("turn_id").notNull(), // which turn is being disputed
  disputedBy: varchar("disputed_by", { length: 255 }).notNull(), // player who filed dispute
  againstPlayerId: varchar("against_player_id", { length: 255 }).notNull(), // player who judged BAIL
  originalResult: varchar("original_result", { length: 50 }).notNull(), // always "missed" (BAIL)
  finalResult: varchar("final_result", { length: 50 }), // "missed" (upheld) or "landed" (overturned), null = pending
  resolvedBy: varchar("resolved_by", { length: 255 }), // who resolved (opponent auto-resolves)
  resolvedAt: timestamp("resolved_at"),
  // Reputation cost: loser of dispute gets permanent penalty
  penaltyAppliedTo: varchar("penalty_applied_to", { length: 255 }), // who got penalized
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Challenges table - SKATE game challenge requests
export const challenges = pgTable("challenges", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  challengerId: varchar("challenger_id", { length: 255 }).notNull(),
  challengedId: varchar("challenged_id", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  gameId: varchar("game_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Game Sessions table — replaces Firestore game_sessions collection
export const gameSessions = pgTable(
  "game_sessions",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    spotId: varchar("spot_id", { length: 255 }).notNull(),
    creatorId: varchar("creator_id", { length: 255 }).notNull(),
    players: json("players")
      .$type<
        Array<{
          odv: string;
          letters: string;
          connected: boolean;
          disconnectedAt?: string;
        }>
      >()
      .notNull()
      .default([]),
    maxPlayers: integer("max_players").notNull().default(4),
    currentTurnIndex: integer("current_turn_index").notNull().default(0),
    currentAction: varchar("current_action", { length: 20 }).notNull().default("set"),
    currentTrick: text("current_trick"),
    setterId: varchar("setter_id", { length: 255 }),
    status: varchar("status", { length: 20 }).notNull().default("waiting"),
    winnerId: varchar("winner_id", { length: 255 }),
    turnDeadlineAt: timestamp("turn_deadline_at"),
    pausedAt: timestamp("paused_at"),
    processedEventIds: json("processed_event_ids").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index("IDX_game_sessions_status").on(table.status),
    creatorIdx: index("IDX_game_sessions_creator").on(table.creatorId),
    deadlineIdx: index("IDX_game_sessions_deadline").on(table.status, table.turnDeadlineAt),
  })
);

export const insertGameSchema = createInsertSchema(games).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});

export const insertGameTurnSchema = createInsertSchema(gameTurns).omit({
  id: true,
  createdAt: true,
});

export const insertGameDisputeSchema = createInsertSchema(gameDisputes).omit({
  id: true,
  createdAt: true,
});

export const insertChallengeSchema = createInsertSchema(challenges).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Game = typeof games.$inferSelect;
export type InsertGame = z.infer<typeof insertGameSchema>;
export type GameTurn = typeof gameTurns.$inferSelect;
export type InsertGameTurn = z.infer<typeof insertGameTurnSchema>;
export type GameDispute = typeof gameDisputes.$inferSelect;
export type InsertGameDispute = z.infer<typeof insertGameDisputeSchema>;
export type GameSession = typeof gameSessions.$inferSelect;
export type InsertGameSession = typeof gameSessions.$inferInsert;
export type Challenge = typeof challenges.$inferSelect;
export type InsertChallenge = z.infer<typeof insertChallengeSchema>;
