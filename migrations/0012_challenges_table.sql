-- Migration: Create challenges table
-- Matches the Drizzle schema in packages/shared/schema/games.ts

CREATE TABLE IF NOT EXISTS "challenges" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "challenger_id" varchar(255) NOT NULL,
  "challenged_id" varchar(255) NOT NULL,
  "status" varchar(50) NOT NULL DEFAULT 'pending',
  "game_id" varchar(255),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_challenges_challenger" ON "challenges" ("challenger_id");
CREATE INDEX IF NOT EXISTS "IDX_challenges_challenged" ON "challenges" ("challenged_id");
CREATE INDEX IF NOT EXISTS "IDX_challenges_status" ON "challenges" ("status");
