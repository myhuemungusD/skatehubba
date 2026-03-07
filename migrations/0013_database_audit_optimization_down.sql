-- Rollback migration for 0013_database_audit_optimization.sql
-- Removes all indexes, foreign keys, and constraints added by the up migration.
-- NOTE: The filmer_daily_counters PK and id column are NOT removed to avoid data loss.

-- 12. feedback: Remove status index
DROP INDEX IF EXISTS "IDX_feedback_status";

-- 11. beta_signups: Remove email index
DROP INDEX IF EXISTS "IDX_beta_signups_email";

-- 10. orders: Remove indexes
DROP INDEX IF EXISTS "IDX_orders_status";
DROP INDEX IF EXISTS "IDX_orders_user";

-- 9. closet_items: Remove user index
DROP INDEX IF EXISTS "IDX_closet_items_user";

-- 8. user_progress: Remove FK and indexes
DROP INDEX IF EXISTS "IDX_user_progress_user";
DROP INDEX IF EXISTS "IDX_user_progress_user_step";
ALTER TABLE user_progress DROP CONSTRAINT IF EXISTS fk_user_progress_step;

-- 7. clip_views: Remove FK
ALTER TABLE clip_views DROP CONSTRAINT IF EXISTS fk_clip_views_clip;

-- 6. trick_mastery: Downgrade UNIQUE index back to regular index
DROP INDEX IF EXISTS "IDX_user_trick";
CREATE INDEX IF NOT EXISTS "IDX_user_trick" ON trick_mastery (user_id, trick);

-- 5. challenges: Remove indexes
DROP INDEX IF EXISTS "IDX_challenges_status";
DROP INDEX IF EXISTS "IDX_challenges_challenged";
DROP INDEX IF EXISTS "IDX_challenges_challenger";

-- 4. game_disputes: Remove FK constraints and indexes
DROP INDEX IF EXISTS "IDX_game_disputes_disputed_by";
DROP INDEX IF EXISTS "IDX_game_disputes_game";
ALTER TABLE game_disputes DROP CONSTRAINT IF EXISTS fk_game_disputes_turn;
ALTER TABLE game_disputes DROP CONSTRAINT IF EXISTS fk_game_disputes_game;

-- 3. game_turns: Remove FK constraint and indexes
DROP INDEX IF EXISTS "IDX_game_turns_game_result";
DROP INDEX IF EXISTS "IDX_game_turns_player";
DROP INDEX IF EXISTS "IDX_game_turns_game";
ALTER TABLE game_turns DROP CONSTRAINT IF EXISTS fk_game_turns_game;

-- 2. games: Remove indexes
DROP INDEX IF EXISTS "IDX_games_status_deadline";
DROP INDEX IF EXISTS "IDX_games_player2";
DROP INDEX IF EXISTS "IDX_games_player1";

-- 1. filmer_daily_counters: Intentionally NOT removing the PK/id column.
--    Dropping a column with data is destructive and irreversible.
--    If rollback is needed, the id column remains harmless.
