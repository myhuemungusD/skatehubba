-- Rollback migration for 0001_create_usernames.sql
-- This script removes the usernames table and all associated objects

-- Drop indexes first
DROP INDEX IF EXISTS "usernames_uid_unique";
DROP INDEX IF EXISTS "usernames_username_unique";

-- Drop the table
DROP TABLE IF EXISTS "usernames" CASCADE;
