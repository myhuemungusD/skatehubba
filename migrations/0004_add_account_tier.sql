-- Migration 0004: Add Account Tier System
-- Description: Adds monetization tier system to user accounts
-- Dependencies: Requires custom_users table to exist
-- Rollback: Use 0004_add_account_tier_down.sql

-- Add account tier system for monetization
-- Tier descriptions:
--   free: basic map viewing, browse spots (default for all users)
--   pro: awarded by an existing pro user (like getting sponsored)
--   premium: $9.99 one-time purchase, all features for life

-- Create account_tier enum type
-- Using DO block with exception handling to make this idempotent
DO $$ BEGIN
  CREATE TYPE account_tier AS ENUM ('free', 'pro', 'premium');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add account tier columns to custom_users table
-- All new users default to 'free' tier
-- pro_awarded_by tracks which user granted pro status
-- premium_purchased_at records when premium was purchased
ALTER TABLE custom_users
  ADD COLUMN IF NOT EXISTS account_tier account_tier NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS pro_awarded_by varchar(255),
  ADD COLUMN IF NOT EXISTS premium_purchased_at timestamp;
