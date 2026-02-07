-- Rollback migration for 0002_create_games_tables.sql
-- This script removes the games and game_turns tables and all associated objects

-- Drop indexes for game_turns table
DROP INDEX IF EXISTS "idx_game_turns_player";
DROP INDEX IF EXISTS "idx_game_turns_game";

-- Drop indexes for games table
DROP INDEX IF EXISTS "idx_games_deadline";
DROP INDEX IF EXISTS "idx_games_status";
DROP INDEX IF EXISTS "idx_games_player2";
DROP INDEX IF EXISTS "idx_games_player1";

-- Drop game_turns table (must drop first due to foreign key)
DROP TABLE IF EXISTS "game_turns" CASCADE;

-- Drop games table
DROP TABLE IF EXISTS "games" CASCADE;
