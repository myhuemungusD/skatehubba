-- Migration 0013: Database Audit & Optimization
-- Adds missing primary keys, foreign keys, indexes, and constraints
-- identified during senior-level database audit.
--
-- DEPLOYMENT NOTE: Run this migration BEFORE deploying the updated app code.
-- The Drizzle schema files now declare these indexes/FKs; deploying the app
-- first could cause drizzle-kit to create conflicting constraints.

-- ============================================================================
-- 1. filmer_daily_counters: Add missing primary key
-- ============================================================================
ALTER TABLE filmer_daily_counters
  ADD COLUMN IF NOT EXISTS id SERIAL;

-- Backfill existing rows so the PK constraint won't fail on NULLs
UPDATE filmer_daily_counters SET id = DEFAULT WHERE id IS NULL;

-- Only add PK constraint if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'filmer_daily_counters_pkey' AND conrelid = 'filmer_daily_counters'::regclass
  ) THEN
    ALTER TABLE filmer_daily_counters ADD PRIMARY KEY (id);
  END IF;
END $$;

-- ============================================================================
-- 2. games: Add missing indexes for query optimization
-- ============================================================================
CREATE INDEX IF NOT EXISTS "IDX_games_player1" ON games (player1_id);
CREATE INDEX IF NOT EXISTS "IDX_games_player2" ON games (player2_id);
-- Single-column status index omitted: the composite (status, deadline_at) index covers status-only queries.
CREATE INDEX IF NOT EXISTS "IDX_games_status_deadline" ON games (status, deadline_at);

-- ============================================================================
-- 3. game_turns: Add FK constraint and indexes
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_game_turns_game' AND conrelid = 'game_turns'::regclass
  ) THEN
    ALTER TABLE game_turns
      ADD CONSTRAINT fk_game_turns_game
      FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "IDX_game_turns_game" ON game_turns (game_id);
CREATE INDEX IF NOT EXISTS "IDX_game_turns_player" ON game_turns (player_id);
CREATE INDEX IF NOT EXISTS "IDX_game_turns_game_result" ON game_turns (game_id, result);

-- ============================================================================
-- 4. game_disputes: Add FK constraints and indexes
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_game_disputes_game' AND conrelid = 'game_disputes'::regclass
  ) THEN
    ALTER TABLE game_disputes
      ADD CONSTRAINT fk_game_disputes_game
      FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_game_disputes_turn' AND conrelid = 'game_disputes'::regclass
  ) THEN
    ALTER TABLE game_disputes
      ADD CONSTRAINT fk_game_disputes_turn
      FOREIGN KEY (turn_id) REFERENCES game_turns(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "IDX_game_disputes_game" ON game_disputes (game_id);
CREATE INDEX IF NOT EXISTS "IDX_game_disputes_disputed_by" ON game_disputes (disputed_by);

-- ============================================================================
-- 5. challenges: Add missing indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS "IDX_challenges_challenger" ON challenges (challenger_id);
CREATE INDEX IF NOT EXISTS "IDX_challenges_challenged" ON challenges (challenged_id);
CREATE INDEX IF NOT EXISTS "IDX_challenges_status" ON challenges (status);

-- ============================================================================
-- 6. trick_mastery: Upgrade index to UNIQUE (prevents duplicate user+trick)
-- ============================================================================
-- Safety check: abort if duplicates exist (migration runs in a transaction,
-- so the CREATE UNIQUE INDEX will fail and the entire migration rolls back).
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT user_id, trick FROM trick_mastery
    GROUP BY user_id, trick
    HAVING COUNT(*) > 1
  ) dupes;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Cannot create unique index: % duplicate (user_id, trick) pairs found in trick_mastery. Deduplicate manually before running this migration.', dup_count;
  END IF;
END $$;

DROP INDEX IF EXISTS "IDX_user_trick";
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_user_trick" ON trick_mastery (user_id, trick);

-- ============================================================================
-- 7. clip_views: Add FK to trick_clips
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_clip_views_clip' AND conrelid = 'clip_views'::regclass
  ) THEN
    ALTER TABLE clip_views
      ADD CONSTRAINT fk_clip_views_clip
      FOREIGN KEY (clip_id) REFERENCES trick_clips(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- 8. user_progress: Add FK and indexes
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_user_progress_step' AND conrelid = 'user_progress'::regclass
  ) THEN
    ALTER TABLE user_progress
      ADD CONSTRAINT fk_user_progress_step
      FOREIGN KEY (step_id) REFERENCES tutorial_steps(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_user_progress_user_step" ON user_progress (user_id, step_id);
CREATE INDEX IF NOT EXISTS "IDX_user_progress_user" ON user_progress (user_id);

-- ============================================================================
-- 9. closet_items: Add missing user index
-- ============================================================================
CREATE INDEX IF NOT EXISTS "IDX_closet_items_user" ON closet_items (user_id);

-- ============================================================================
-- 10. orders: Add missing indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS "IDX_orders_user" ON orders (user_id);
CREATE INDEX IF NOT EXISTS "IDX_orders_status" ON orders (status);

-- ============================================================================
-- 11. beta_signups: Add email index for lookup queries
-- ============================================================================
CREATE INDEX IF NOT EXISTS "IDX_beta_signups_email" ON beta_signups (email);

-- ============================================================================
-- 12. feedback: Add status index
-- ============================================================================
CREATE INDEX IF NOT EXISTS "IDX_feedback_status" ON feedback (status);
