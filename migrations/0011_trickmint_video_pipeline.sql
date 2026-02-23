-- Migration: TrickMint Video Upload Pipeline
-- Adds trick_clips table and thumbnail_url to game_turns

-- Add thumbnail_url column to game_turns for feed/history thumbnails
ALTER TABLE game_turns ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(500);

-- TrickMint trick clips table — standalone video uploads outside game context
CREATE TABLE IF NOT EXISTS trick_clips (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  trick_name VARCHAR(200) NOT NULL,
  description TEXT,
  video_url VARCHAR(500) NOT NULL,
  video_duration_ms INTEGER,
  thumbnail_url VARCHAR(500),
  file_size_bytes INTEGER,
  mime_type VARCHAR(100),
  status VARCHAR(50) NOT NULL DEFAULT 'processing',
  spot_id INTEGER,
  game_id VARCHAR(255),
  game_turn_id INTEGER,
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for trick_clips
CREATE INDEX IF NOT EXISTS "IDX_trick_clips_user" ON trick_clips (user_id);
CREATE INDEX IF NOT EXISTS "IDX_trick_clips_status" ON trick_clips (status);
CREATE INDEX IF NOT EXISTS "IDX_trick_clips_public_feed" ON trick_clips (is_public, status, created_at);
CREATE INDEX IF NOT EXISTS "IDX_trick_clips_game" ON trick_clips (game_id);
