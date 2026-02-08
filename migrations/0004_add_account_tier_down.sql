-- Rollback migration for 0004_add_account_tier.sql
-- This script removes the account tier columns and enum type

-- Remove columns from custom_users table
ALTER TABLE custom_users
  DROP COLUMN IF EXISTS premium_purchased_at,
  DROP COLUMN IF EXISTS pro_awarded_by,
  DROP COLUMN IF EXISTS account_tier;

-- Drop account_tier enum type
DROP TYPE IF EXISTS account_tier CASCADE;
