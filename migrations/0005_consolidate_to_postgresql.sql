-- Migration: Consolidate Firestore collections into PostgreSQL
-- This migration creates tables for all data previously stored in Firestore,
-- adds missing unique constraints, and fixes race condition vectors.

-- ============================================================================
-- Game Sessions (replaces Firestore game_sessions collection)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "game_sessions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "spot_id" varchar(255) NOT NULL,
  "creator_id" varchar(255) NOT NULL,
  "players" json NOT NULL DEFAULT '[]',
  "max_players" integer NOT NULL DEFAULT 4,
  "current_turn_index" integer NOT NULL DEFAULT 0,
  "current_action" varchar(20) NOT NULL DEFAULT 'set',
  "current_trick" text,
  "setter_id" varchar(255),
  "status" varchar(20) NOT NULL DEFAULT 'waiting',
  "winner_id" varchar(255),
  "turn_deadline_at" timestamp,
  "paused_at" timestamp,
  "processed_event_ids" json NOT NULL DEFAULT '[]',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_game_sessions_status" ON "game_sessions" ("status");
CREATE INDEX IF NOT EXISTS "IDX_game_sessions_creator" ON "game_sessions" ("creator_id");
CREATE INDEX IF NOT EXISTS "IDX_game_sessions_deadline" ON "game_sessions" ("status", "turn_deadline_at");

-- ============================================================================
-- Battle Vote State (replaces Firestore battle_state collection)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "battle_vote_state" (
  "battle_id" varchar(255) PRIMARY KEY REFERENCES "battles"("id") ON DELETE CASCADE,
  "creator_id" varchar(255) NOT NULL,
  "opponent_id" varchar(255),
  "status" varchar(20) NOT NULL DEFAULT 'voting',
  "votes" json NOT NULL DEFAULT '[]',
  "voting_started_at" timestamp,
  "vote_deadline_at" timestamp,
  "winner_id" varchar(255),
  "processed_event_ids" json NOT NULL DEFAULT '[]',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_battle_vote_state_status" ON "battle_vote_state" ("status");
CREATE INDEX IF NOT EXISTS "IDX_battle_vote_state_deadline" ON "battle_vote_state" ("status", "vote_deadline_at");

-- ============================================================================
-- Moderation Profiles (replaces Firestore moderation_users collection)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "moderation_profiles" (
  "user_id" varchar(255) PRIMARY KEY,
  "trust_level" integer NOT NULL DEFAULT 0,
  "reputation_score" integer NOT NULL DEFAULT 0,
  "is_banned" boolean NOT NULL DEFAULT false,
  "ban_expires_at" timestamp,
  "pro_verification_status" varchar(20) NOT NULL DEFAULT 'none',
  "is_pro_verified" boolean NOT NULL DEFAULT false,
  "pro_verification_evidence" json,
  "pro_verification_notes" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- ============================================================================
-- Moderation Reports (replaces Firestore reports collection)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "moderation_reports" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "reporter_id" varchar(255) NOT NULL,
  "target_type" varchar(20) NOT NULL,
  "target_id" varchar(255) NOT NULL,
  "reason" varchar(100) NOT NULL,
  "notes" text,
  "status" varchar(20) NOT NULL DEFAULT 'queued',
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_moderation_reports_status" ON "moderation_reports" ("status");
CREATE INDEX IF NOT EXISTS "IDX_moderation_reports_reporter" ON "moderation_reports" ("reporter_id");
CREATE INDEX IF NOT EXISTS "IDX_moderation_reports_created" ON "moderation_reports" ("created_at");

-- ============================================================================
-- Mod Actions (replaces Firestore mod_actions collection)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "mod_actions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "admin_id" varchar(255) NOT NULL,
  "target_user_id" varchar(255) NOT NULL,
  "action_type" varchar(20) NOT NULL,
  "reason_code" varchar(50) NOT NULL,
  "notes" text,
  "reversible" boolean NOT NULL DEFAULT true,
  "expires_at" timestamp,
  "related_report_id" varchar(255),
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_mod_actions_target" ON "mod_actions" ("target_user_id");
CREATE INDEX IF NOT EXISTS "IDX_mod_actions_admin" ON "mod_actions" ("admin_id");

-- ============================================================================
-- Moderation Quotas (replaces Firestore moderation_quotas collection)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "moderation_quotas" (
  "id" varchar(255) PRIMARY KEY,
  "user_id" varchar(255) NOT NULL,
  "action" varchar(50) NOT NULL,
  "date_key" varchar(10) NOT NULL,
  "count" integer NOT NULL DEFAULT 0,
  "quota_limit" integer NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "unique_moderation_quota" ON "moderation_quotas" ("user_id", "action", "date_key");

-- ============================================================================
-- Posts (replaces Firestore posts collection)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "posts" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar(255) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "content" json,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_posts_user" ON "posts" ("user_id");
CREATE INDEX IF NOT EXISTS "IDX_posts_status" ON "posts" ("status");

-- ============================================================================
-- Checkin Nonces (replaces Firestore checkin_nonces collection)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "checkin_nonces" (
  "id" varchar(255) PRIMARY KEY,
  "user_id" varchar(255) NOT NULL,
  "nonce" varchar(255) NOT NULL,
  "action_hash" varchar(64) NOT NULL,
  "spot_id" integer NOT NULL,
  "lat" double precision NOT NULL,
  "lng" double precision NOT NULL,
  "client_timestamp" varchar(50) NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_checkin_nonces_expires" ON "checkin_nonces" ("expires_at");
CREATE UNIQUE INDEX IF NOT EXISTS "unique_checkin_nonce" ON "checkin_nonces" ("user_id", "nonce");

-- ============================================================================
-- Spot uniqueness constraint (name + approximate location)
-- Prevents duplicate spots at same location with same name
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS "unique_spot_name_location"
  ON "spots" (lower(trim("name")), round("lat"::numeric, 4), round("lng"::numeric, 4))
  WHERE "is_active" = true;

-- ============================================================================
-- Beta Signups (replaces Firestore mail_list collection)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "beta_signups" (
  "id" varchar(64) PRIMARY KEY,
  "email" varchar(255) NOT NULL,
  "platform" varchar(50),
  "ip_hash" varchar(64),
  "source" varchar(100) DEFAULT 'skatehubba.com',
  "submit_count" integer NOT NULL DEFAULT 1,
  "last_submitted_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- ============================================================================
-- Onboarding Profiles (replaces Firestore profiles collection)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "onboarding_profiles" (
  "uid" varchar(255) PRIMARY KEY,
  "username" varchar(50) NOT NULL,
  "stance" varchar(20),
  "experience_level" varchar(20),
  "favorite_tricks" json NOT NULL DEFAULT '[]',
  "bio" text,
  "sponsor_flow" varchar(255),
  "sponsor_team" varchar(255),
  "hometown_shop" varchar(255),
  "spots_visited" integer NOT NULL DEFAULT 0,
  "crew_name" varchar(100),
  "credibility_score" integer NOT NULL DEFAULT 0,
  "avatar_url" varchar(500),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
