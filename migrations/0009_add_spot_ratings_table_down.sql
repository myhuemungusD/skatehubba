-- Rollback: Remove spot_ratings table
-- This will restore the state before per-user rating deduplication was added.
-- Note: Historical per-user rating data will be lost.

DROP INDEX IF EXISTS "IDX_spot_ratings_spot";
DROP INDEX IF EXISTS unique_spot_rating_per_user;
DROP TABLE IF EXISTS spot_ratings;
