-- Migration: Rename points column to xp in user_profiles
-- This completes the data model migration from the deprecated "points" field
-- to the standardised "xp" (experience points) naming used across the UI.

ALTER TABLE user_profiles RENAME COLUMN points TO xp;
