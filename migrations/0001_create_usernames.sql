-- Migration 0001: Create Usernames Table
-- Description: Creates the usernames table for storing user identifiers and usernames
-- Dependencies: None
-- Rollback: Use 0001_create_usernames_down.sql

-- Create usernames table
-- This table maps user IDs (uid) to usernames for the application
CREATE TABLE IF NOT EXISTS "usernames" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "uid" varchar(128) NOT NULL UNIQUE,
  "username" varchar(20) NOT NULL UNIQUE,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Create indexes for unique constraints and fast lookups
-- These indexes ensure username and uid uniqueness and improve query performance
CREATE UNIQUE INDEX IF NOT EXISTS "usernames_username_unique" ON "usernames" ("username");
CREATE UNIQUE INDEX IF NOT EXISTS "usernames_uid_unique" ON "usernames" ("uid");
