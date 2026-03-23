import { z } from "zod";
import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  varchar,
  index,
  json,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";

// ============================================================================
// Enums
// ============================================================================

export const GAME_STATUSES = ["pending", "active", "completed", "declined", "forfeited"] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

export const TURN_PHASES = ["set_trick", "respond_trick", "judge"] as const;
export type TurnPhase = (typeof TURN_PHASES)[number];

export const TURN_RESULTS = ["landed", "missed", "pending"] as const;
export type TurnResult = (typeof TURN_RESULTS)[number];

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
export const SKATE_LETTERS = "SKATE";
export const SKATE_LETTERS_TO_LOSE = 5;

// ============================================================================
// Player state stored as JSON array on the game row
// ============================================================================

/**
 * Each player in a multiplayer S.K.A.T.E. game.
 * Stored as a JSON array on the `games` table — no join tables, no N player columns.
 */
export interface GamePlayer {
  id: string;
  name: string;
  letters: string; // "", "S", "SK", ... "SKATE"
  isEliminated: boolean;
}

// ============================================================================
// Games table — 2-5 player async S.K.A.T.E.
// ============================================================================

export const games = pgTable(
  "games",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Player who created the game */
    creatorId: varchar("creator_id", { length: 255 }).notNull(),

    /** JSON array of GamePlayer objects — the source of truth for letters/elimination */
    players: json("players").$type<GamePlayer[]>().notNull().default([]),

    /** How many players are required before the game starts */
    maxPlayers: integer("max_players").notNull().default(2),

    status: varchar("status", { length: 50 }).notNull().default("pending"),

    /** ID of the player whose turn it is right now */
    currentTurn: varchar("current_turn", { length: 255 }),

    /** What the current player needs to do */
    turnPhase: varchar("turn_phase", { length: 50 }).default("set_trick"),

    /** The player currently setting tricks (offensive role) */
    setterId: varchar("setter_id", { length: 255 }),

    /** Index into `players` of the defender who must respond next.
     *  After setter submits, each non-setter responds in order. */
    currentResponderIdx: integer("current_responder_idx"),

    /** Last trick description for UI display */
    lastTrickDescription: text("last_trick_description"),
    lastTrickBy: varchar("last_trick_by", { length: 255 }),

    /** 24-hour turn deadline */
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),

    winnerId: varchar("winner_id", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    creatorIdx: index("IDX_games_creator").on(table.creatorId),
    statusDeadlineIdx: index("IDX_games_status_deadline").on(table.status, table.deadlineAt),
  })
);

// ============================================================================
// Game turns — each turn = one video clip (set or response)
// ============================================================================

export const gameTurns = pgTable(
  "game_turns",
  {
    id: serial("id").primaryKey(),
    gameId: varchar("game_id", { length: 255 })
      .notNull()
      .references(() => games.id, { onDelete: "restrict" }),
    playerId: varchar("player_id", { length: 255 }).notNull(),
    playerName: varchar("player_name", { length: 255 }).notNull(),
    turnNumber: integer("turn_number").notNull(),
    turnType: varchar("turn_type", { length: 20 }).notNull().default("set"),
    trickDescription: text("trick_description").notNull(),
    videoUrl: varchar("video_url", { length: 500 }),
    videoDurationMs: integer("video_duration_ms"),
    thumbnailUrl: varchar("thumbnail_url", { length: 500 }),
    result: varchar("result", { length: 50 }).notNull().default("pending"),
    judgedBy: varchar("judged_by", { length: 255 }),
    judgedAt: timestamp("judged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    gameIdx: index("IDX_game_turns_game").on(table.gameId),
    playerIdx: index("IDX_game_turns_player").on(table.playerId),
    gameResultIdx: index("IDX_game_turns_game_result").on(table.gameId, table.result),
  })
);

// ============================================================================
// Validation schemas
// ============================================================================

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

// ============================================================================
// Types
// ============================================================================

export type Game = typeof games.$inferSelect;
export type InsertGame = z.infer<typeof insertGameSchema>;
export type GameTurn = typeof gameTurns.$inferSelect;
export type InsertGameTurn = z.infer<typeof insertGameTurnSchema>;
