-- Rollback migration for 0003_create_spots_table.sql
-- This script removes the spots and check_ins tables and all associated objects

-- Drop indexes for check_ins table
DROP INDEX IF EXISTS "unique_check_in_per_day";
DROP INDEX IF EXISTS "IDX_check_ins_spot";
DROP INDEX IF EXISTS "IDX_check_ins_user";

-- Drop check_ins table (must drop first due to foreign key)
DROP TABLE IF EXISTS "check_ins" CASCADE;

-- Drop filmer_request_status enum type
DROP TYPE IF EXISTS filmer_request_status CASCADE;

-- Drop indexes for spots table
DROP INDEX IF EXISTS "IDX_spot_created_by";
DROP INDEX IF EXISTS "IDX_spot_city";
DROP INDEX IF EXISTS "IDX_spot_location";

-- Drop spots table
DROP TABLE IF EXISTS "spots" CASCADE;
