-- Migration: Add notifications and notification preferences tables
-- Supports in-app notification feed, push preferences, and email opt-in/out

-- Notifications table (in-app feed)
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  channel VARCHAR(20) NOT NULL DEFAULT 'in_app',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "IDX_notifications_user" ON notifications (user_id);
CREATE INDEX IF NOT EXISTS "IDX_notifications_user_unread" ON notifications (user_id, is_read);
CREATE INDEX IF NOT EXISTS "IDX_notifications_created_at" ON notifications (created_at);

-- Notification preferences table (per-user settings)
CREATE TABLE IF NOT EXISTS notification_preferences (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  game_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  challenge_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  turn_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  result_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  marketing_emails BOOLEAN NOT NULL DEFAULT TRUE,
  weekly_digest BOOLEAN NOT NULL DEFAULT TRUE,
  quiet_hours_start VARCHAR(5),
  quiet_hours_end VARCHAR(5),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "unique_notification_prefs_user" ON notification_preferences (user_id);
