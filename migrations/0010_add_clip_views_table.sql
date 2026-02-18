-- Migration: Add clip_views table for per-user view deduplication
-- This prevents view count inflation by ensuring each user can only increment views once per clip.

CREATE TABLE IF NOT EXISTS clip_views (
  id SERIAL PRIMARY KEY,
  clip_id INTEGER NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  viewed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_clip_view_per_user ON clip_views (clip_id, user_id);
CREATE INDEX IF NOT EXISTS "IDX_clip_views_clip" ON clip_views (clip_id);
