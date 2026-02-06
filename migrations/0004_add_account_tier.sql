-- Add account tier system for monetization
-- free: basic map viewing, browse spots
-- pro: awarded by an existing pro user (like getting sponsored)
-- premium: $9.99 one-time purchase, all features for life

DO $$ BEGIN
  CREATE TYPE account_tier AS ENUM ('free', 'pro', 'premium');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE custom_users
  ADD COLUMN IF NOT EXISTS account_tier account_tier NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS pro_awarded_by varchar(255),
  ADD COLUMN IF NOT EXISTS premium_purchased_at timestamp;
