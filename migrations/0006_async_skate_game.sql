-- 0006_async_skate_game.sql
-- Adds async turn-based SKATE game support: turn phases, disputes, reputation penalties

-- Add async turn phase columns to games table
ALTER TABLE games ADD COLUMN IF NOT EXISTS turn_phase VARCHAR(50) DEFAULT 'set_trick';
ALTER TABLE games ADD COLUMN IF NOT EXISTS offensive_player_id VARCHAR(255);
ALTER TABLE games ADD COLUMN IF NOT EXISTS defensive_player_id VARCHAR(255);
ALTER TABLE games ADD COLUMN IF NOT EXISTS player1_dispute_used BOOLEAN DEFAULT false;
ALTER TABLE games ADD COLUMN IF NOT EXISTS player2_dispute_used BOOLEAN DEFAULT false;

-- Add turn_type and video_duration_ms to game_turns
ALTER TABLE game_turns ADD COLUMN IF NOT EXISTS turn_type VARCHAR(20) NOT NULL DEFAULT 'set';
ALTER TABLE game_turns ADD COLUMN IF NOT EXISTS video_duration_ms INTEGER;

-- Create game_disputes table
CREATE TABLE IF NOT EXISTS game_disputes (
  id SERIAL PRIMARY KEY,
  game_id VARCHAR(255) NOT NULL,
  turn_id INTEGER NOT NULL,
  disputed_by VARCHAR(255) NOT NULL,
  against_player_id VARCHAR(255) NOT NULL,
  original_result VARCHAR(50) NOT NULL,
  final_result VARCHAR(50),
  resolved_by VARCHAR(255),
  resolved_at TIMESTAMP,
  penalty_applied_to VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_game_disputes_game ON game_disputes(game_id);
CREATE INDEX IF NOT EXISTS idx_game_disputes_turn ON game_disputes(turn_id);

-- Add dispute_penalties to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS dispute_penalties INTEGER NOT NULL DEFAULT 0;
