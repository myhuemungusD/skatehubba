-- S.K.A.T.E. Games table
CREATE TABLE IF NOT EXISTS "games" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "player1_id" varchar(255) NOT NULL,
  "player1_name" varchar(255) NOT NULL,
  "player2_id" varchar(255),
  "player2_name" varchar(255),
  "status" varchar(50) NOT NULL DEFAULT 'pending',
  "current_turn" varchar(255),
  "player1_letters" varchar(5) DEFAULT '',
  "player2_letters" varchar(5) DEFAULT '',
  "winner_id" varchar(255),
  "last_trick_description" text,
  "last_trick_by" varchar(255),
  "deadline_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "completed_at" timestamp
);

-- Game turns/history table with video support
CREATE TABLE IF NOT EXISTS "game_turns" (
  "id" serial PRIMARY KEY,
  "game_id" varchar NOT NULL REFERENCES "games"("id") ON DELETE CASCADE,
  "player_id" varchar(255) NOT NULL,
  "player_name" varchar(255) NOT NULL,
  "turn_number" integer NOT NULL,
  "trick_description" text NOT NULL,
  "video_url" varchar(500),
  "result" varchar(50) NOT NULL,
  "judged_by" varchar(255),
  "judged_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Indexes for games table
CREATE INDEX IF NOT EXISTS "idx_games_player1" ON "games" ("player1_id");
CREATE INDEX IF NOT EXISTS "idx_games_player2" ON "games" ("player2_id");
CREATE INDEX IF NOT EXISTS "idx_games_status" ON "games" ("status");
CREATE INDEX IF NOT EXISTS "idx_games_deadline" ON "games" ("deadline_at");

-- Indexes for game_turns table
CREATE INDEX IF NOT EXISTS "idx_game_turns_game" ON "game_turns" ("game_id");
CREATE INDEX IF NOT EXISTS "idx_game_turns_player" ON "game_turns" ("player_id");
