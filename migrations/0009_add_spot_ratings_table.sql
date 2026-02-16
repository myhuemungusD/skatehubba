-- Migration: Add spot_ratings table for per-user rating deduplication
-- This prevents vote manipulation by ensuring each user can only rate a spot once.
-- Subsequent ratings from the same user update their previous rating rather than adding new votes.

CREATE TABLE IF NOT EXISTS spot_ratings (
  id SERIAL PRIMARY KEY,
  spot_id INTEGER NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_spot_ratings_spot FOREIGN KEY (spot_id) REFERENCES spots(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_spot_rating_per_user ON spot_ratings (spot_id, user_id);
CREATE INDEX IF NOT EXISTS "IDX_spot_ratings_spot" ON spot_ratings (spot_id);
