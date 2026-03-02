-- Down migration: Drop challenges table
DROP INDEX IF EXISTS "idx_challenges_status";
DROP INDEX IF EXISTS "idx_challenges_challenged";
DROP INDEX IF EXISTS "idx_challenges_challenger";
DROP TABLE IF EXISTS "challenges";
