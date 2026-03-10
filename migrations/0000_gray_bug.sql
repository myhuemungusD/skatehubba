CREATE TYPE "public"."account_tier" AS ENUM('free', 'pro', 'premium');--> statement-breakpoint
CREATE TYPE "public"."filmer_request_status" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TABLE "account_lockouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"locked_at" timestamp with time zone NOT NULL,
	"unlock_at" timestamp with time zone NOT NULL,
	"failed_attempts" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_lockouts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"user_id" varchar(255),
	"email" varchar(255),
	"ip_address" varchar(45) NOT NULL,
	"user_agent" text,
	"metadata" json,
	"success" boolean NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "custom_users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"first_name" varchar(100),
	"last_name" varchar(100),
	"firebase_uid" varchar(128),
	"push_token" varchar(255),
	"is_email_verified" boolean DEFAULT false NOT NULL,
	"email_verification_token" varchar(255),
	"email_verification_expires" timestamp with time zone,
	"reset_password_token" varchar(255),
	"reset_password_expires" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"trust_level" integer DEFAULT 0 NOT NULL,
	"account_tier" "account_tier" DEFAULT 'free' NOT NULL,
	"pro_awarded_by" varchar(255),
	"premium_purchased_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_users_email_unique" UNIQUE("email"),
	CONSTRAINT "custom_users_firebase_uid_unique" UNIQUE("firebase_uid")
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"ip_address" varchar(45) NOT NULL,
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mfa_secrets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"secret" varchar(255) NOT NULL,
	"backup_codes" json,
	"enabled" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mfa_secrets_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "usernames" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uid" varchar(128) NOT NULL,
	"username" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usernames_uid_unique" UNIQUE("uid"),
	CONSTRAINT "usernames_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "battle_vote_state" (
	"battle_id" varchar(255) PRIMARY KEY NOT NULL,
	"creator_id" varchar(255) NOT NULL,
	"opponent_id" varchar(255),
	"status" varchar(20) DEFAULT 'voting' NOT NULL,
	"votes" json DEFAULT '[]'::json NOT NULL,
	"voting_started_at" timestamp with time zone,
	"vote_deadline_at" timestamp with time zone,
	"winner_id" varchar(255),
	"processed_event_ids" json DEFAULT '[]'::json NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "battle_votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"battle_id" varchar(255) NOT NULL,
	"odv" varchar(255) NOT NULL,
	"vote" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "battles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" varchar(255) NOT NULL,
	"opponent_id" varchar(255),
	"matchmaking" varchar(20) DEFAULT 'open' NOT NULL,
	"status" varchar(20) DEFAULT 'waiting' NOT NULL,
	"winner_id" varchar(255),
	"clip_url" varchar(500),
	"response_clip_url" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "consumed_payment_intents" (
	"id" serial PRIMARY KEY NOT NULL,
	"payment_intent_id" varchar(255) NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consumed_payment_intents_payment_intent_id_unique" UNIQUE("payment_intent_id")
);
--> statement-breakpoint
CREATE TABLE "donations" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "donations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"first_name" varchar(50) NOT NULL,
	"amount" integer NOT NULL,
	"payment_intent_id" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "donations_payment_intent_id_unique" UNIQUE("payment_intent_id")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar,
	"user_email" varchar(255),
	"items" json NOT NULL,
	"total" integer NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"payment_intent_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_payment_intent_id_unique" UNIQUE("payment_intent_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"price" integer NOT NULL,
	"image_url" varchar(500),
	"icon" varchar(50),
	"category" varchar(100),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_product_id_unique" UNIQUE("product_id")
);
--> statement-breakpoint
CREATE TABLE "beta_signups" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"platform" varchar(50),
	"ip_hash" varchar(64),
	"source" varchar(100) DEFAULT 'skatehubba.com',
	"submit_count" integer DEFAULT 1 NOT NULL,
	"last_submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar,
	"user_email" varchar(255),
	"type" varchar(50) NOT NULL,
	"message" text NOT NULL,
	"status" varchar(50) DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "subscribers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"first_name" text,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "subscribers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenger_id" varchar(255) NOT NULL,
	"challenged_id" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"game_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_disputes" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" varchar(255) NOT NULL,
	"turn_id" integer NOT NULL,
	"disputed_by" varchar(255) NOT NULL,
	"against_player_id" varchar(255) NOT NULL,
	"original_result" varchar(50) NOT NULL,
	"final_result" varchar(50),
	"resolved_by" varchar(255),
	"resolved_at" timestamp with time zone,
	"penalty_applied_to" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_turns" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" varchar(255) NOT NULL,
	"player_id" varchar(255) NOT NULL,
	"player_name" varchar(255) NOT NULL,
	"turn_number" integer NOT NULL,
	"turn_type" varchar(20) DEFAULT 'set' NOT NULL,
	"trick_description" text NOT NULL,
	"video_url" varchar(500),
	"video_duration_ms" integer,
	"thumbnail_url" varchar(500),
	"result" varchar(50) DEFAULT 'pending' NOT NULL,
	"judged_by" varchar(255),
	"judged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player1_id" varchar(255) NOT NULL,
	"player1_name" varchar(255) NOT NULL,
	"player2_id" varchar(255),
	"player2_name" varchar(255),
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"current_turn" varchar(255),
	"turn_phase" varchar(50) DEFAULT 'set_trick',
	"offensive_player_id" varchar(255),
	"defensive_player_id" varchar(255),
	"player1_letters" varchar(5) DEFAULT '' NOT NULL,
	"player2_letters" varchar(5) DEFAULT '' NOT NULL,
	"winner_id" varchar(255),
	"last_trick_description" text,
	"last_trick_by" varchar(255),
	"player1_dispute_used" boolean DEFAULT false NOT NULL,
	"player2_dispute_used" boolean DEFAULT false NOT NULL,
	"deadline_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "check_ins" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"spot_id" integer NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"is_ar" boolean DEFAULT false NOT NULL,
	"filmer_uid" varchar(128),
	"filmer_status" "filmer_request_status",
	"filmer_requested_at" timestamp with time zone,
	"filmer_responded_at" timestamp with time zone,
	"filmer_request_id" varchar(64)
);
--> statement-breakpoint
CREATE TABLE "checkin_nonces" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"nonce" varchar(255) NOT NULL,
	"action_hash" varchar(64) NOT NULL,
	"spot_id" integer NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"client_timestamp" varchar(50) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "filmer_daily_counters" (
	"id" serial PRIMARY KEY NOT NULL,
	"counter_key" varchar(128) NOT NULL,
	"day" varchar(10) NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "filmer_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"check_in_id" integer NOT NULL,
	"requester_id" varchar(255) NOT NULL,
	"filmer_id" varchar(255) NOT NULL,
	"status" "filmer_request_status" DEFAULT 'pending' NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "spot_ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"spot_id" integer NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"rating" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spots" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"spot_type" varchar(50) DEFAULT 'street',
	"tier" varchar(20) DEFAULT 'bronze',
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"address" text,
	"city" varchar(100),
	"state" varchar(50),
	"country" varchar(100) DEFAULT 'USA',
	"photo_url" text,
	"thumbnail_url" text,
	"created_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"check_in_count" integer DEFAULT 0 NOT NULL,
	"rating" double precision DEFAULT 0 NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clip_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"clip_id" integer NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trick_clips" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"user_name" varchar(255) NOT NULL,
	"trick_name" varchar(200) NOT NULL,
	"description" text,
	"video_url" varchar(500) NOT NULL,
	"video_duration_ms" integer,
	"thumbnail_url" varchar(500),
	"file_size_bytes" integer,
	"mime_type" varchar(100),
	"status" varchar(50) DEFAULT 'processing' NOT NULL,
	"spot_id" integer,
	"game_id" varchar(255),
	"game_turn_id" integer,
	"views" integer DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trick_mastery" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"trick" varchar(100) NOT NULL,
	"level" varchar(50) DEFAULT 'learning' NOT NULL,
	"landed_count" integer DEFAULT 0 NOT NULL,
	"last_landed_at" timestamp with time zone,
	"streak" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tricks" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"likes_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "closet_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"brand" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"image_url" varchar(500) NOT NULL,
	"rarity" varchar(50),
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_profiles" (
	"uid" varchar(255) PRIMARY KEY NOT NULL,
	"username" varchar(50) NOT NULL,
	"stance" varchar(20),
	"experience_level" varchar(20),
	"favorite_tricks" json DEFAULT '[]'::json NOT NULL,
	"bio" text,
	"sponsor_flow" varchar(255),
	"sponsor_team" varchar(255),
	"hometown_shop" varchar(255),
	"spots_visited" integer DEFAULT 0 NOT NULL,
	"crew_name" varchar(100),
	"credibility_score" integer DEFAULT 0 NOT NULL,
	"avatar_url" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" varchar PRIMARY KEY NOT NULL,
	"handle" varchar(50) NOT NULL,
	"display_name" varchar(100),
	"bio" text,
	"photo_url" varchar(500),
	"stance" varchar(20) DEFAULT 'regular',
	"home_spot" varchar(255),
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"dispute_penalties" integer DEFAULT 0 NOT NULL,
	"roles" json,
	"filmer_rep_score" integer DEFAULT 0 NOT NULL,
	"filmer_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "device_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"token" varchar(500) NOT NULL,
	"platform" varchar(10) DEFAULT 'android' NOT NULL,
	"device_name" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "device_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"in_app_enabled" boolean DEFAULT true NOT NULL,
	"game_notifications" boolean DEFAULT true NOT NULL,
	"challenge_notifications" boolean DEFAULT true NOT NULL,
	"turn_notifications" boolean DEFAULT true NOT NULL,
	"result_notifications" boolean DEFAULT true NOT NULL,
	"marketing_emails" boolean DEFAULT true NOT NULL,
	"weekly_digest" boolean DEFAULT true NOT NULL,
	"quiet_hours_start" varchar(5),
	"quiet_hours_end" varchar(5),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"data" json,
	"channel" varchar(20) DEFAULT 'in_app' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mod_actions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" varchar(255) NOT NULL,
	"target_user_id" varchar(255) NOT NULL,
	"action_type" varchar(20) NOT NULL,
	"reason_code" varchar(50) NOT NULL,
	"notes" text,
	"reversible" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"related_report_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_profiles" (
	"user_id" varchar(255) PRIMARY KEY NOT NULL,
	"trust_level" integer DEFAULT 0 NOT NULL,
	"reputation_score" integer DEFAULT 0 NOT NULL,
	"is_banned" boolean DEFAULT false NOT NULL,
	"ban_expires_at" timestamp with time zone,
	"pro_verification_status" varchar(20) DEFAULT 'none' NOT NULL,
	"is_pro_verified" boolean DEFAULT false NOT NULL,
	"pro_verification_evidence" json,
	"pro_verification_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_quotas" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"action" varchar(50) NOT NULL,
	"date_key" varchar(10) NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"quota_limit" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" varchar(255) NOT NULL,
	"target_type" varchar(20) NOT NULL,
	"target_id" varchar(255) NOT NULL,
	"reason" varchar(100) NOT NULL,
	"notes" text,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"content" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutorial_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"type" text NOT NULL,
	"content" json,
	"order" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"step_id" integer NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"time_spent" integer,
	"interaction_data" json
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_custom_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."custom_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_secrets" ADD CONSTRAINT "mfa_secrets_user_id_custom_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."custom_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_vote_state" ADD CONSTRAINT "battle_vote_state_battle_id_battles_id_fk" FOREIGN KEY ("battle_id") REFERENCES "public"."battles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_votes" ADD CONSTRAINT "battle_votes_battle_id_battles_id_fk" FOREIGN KEY ("battle_id") REFERENCES "public"."battles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_disputes" ADD CONSTRAINT "game_disputes_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_disputes" ADD CONSTRAINT "game_disputes_turn_id_game_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."game_turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turns_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filmer_requests" ADD CONSTRAINT "filmer_requests_check_in_id_check_ins_id_fk" FOREIGN KEY ("check_in_id") REFERENCES "public"."check_ins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filmer_requests" ADD CONSTRAINT "filmer_requests_requester_id_custom_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."custom_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filmer_requests" ADD CONSTRAINT "filmer_requests_filmer_id_custom_users_id_fk" FOREIGN KEY ("filmer_id") REFERENCES "public"."custom_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_ratings" ADD CONSTRAINT "spot_ratings_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clip_views" ADD CONSTRAINT "clip_views_clip_id_trick_clips_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."trick_clips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_custom_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."custom_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_step_id_tutorial_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."tutorial_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_audit_event_type" ON "audit_logs" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "IDX_audit_user_id" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_audit_ip" ON "audit_logs" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "IDX_audit_created_at" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "IDX_login_attempts_email" ON "login_attempts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "IDX_login_attempts_ip" ON "login_attempts" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "IDX_login_attempts_created_at" ON "login_attempts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "IDX_battle_vote_state_status" ON "battle_vote_state" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_battle_vote_state_deadline" ON "battle_vote_state" USING btree ("status","vote_deadline_at");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_battle_voter" ON "battle_votes" USING btree ("battle_id","odv");--> statement-breakpoint
CREATE INDEX "IDX_consumed_payment_intents_user" ON "consumed_payment_intents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_orders_user" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_orders_status" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_beta_signups_email" ON "beta_signups" USING btree ("email");--> statement-breakpoint
CREATE INDEX "IDX_feedback_status" ON "feedback" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_challenges_challenger" ON "challenges" USING btree ("challenger_id");--> statement-breakpoint
CREATE INDEX "IDX_challenges_challenged" ON "challenges" USING btree ("challenged_id");--> statement-breakpoint
CREATE INDEX "IDX_challenges_status" ON "challenges" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_game_disputes_game" ON "game_disputes" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "IDX_game_disputes_disputed_by" ON "game_disputes" USING btree ("disputed_by");--> statement-breakpoint
CREATE INDEX "IDX_game_turns_game" ON "game_turns" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "IDX_game_turns_player" ON "game_turns" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "IDX_game_turns_game_result" ON "game_turns" USING btree ("game_id","result");--> statement-breakpoint
CREATE INDEX "IDX_games_player1" ON "games" USING btree ("player1_id");--> statement-breakpoint
CREATE INDEX "IDX_games_player2" ON "games" USING btree ("player2_id");--> statement-breakpoint
CREATE INDEX "IDX_games_status_deadline" ON "games" USING btree ("status","deadline_at");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_check_in_per_day" ON "check_ins" USING btree ("user_id","spot_id",DATE("timestamp"));--> statement-breakpoint
CREATE INDEX "IDX_check_ins_user" ON "check_ins" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_check_ins_spot" ON "check_ins" USING btree ("spot_id");--> statement-breakpoint
CREATE INDEX "IDX_checkin_nonces_expires" ON "checkin_nonces" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_checkin_nonce" ON "checkin_nonces" USING btree ("user_id","nonce");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_filmer_counter_day" ON "filmer_daily_counters" USING btree ("counter_key","day");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_filmer_request" ON "filmer_requests" USING btree ("check_in_id","filmer_id");--> statement-breakpoint
CREATE INDEX "IDX_filmer_requests_status" ON "filmer_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_filmer_requests_requester" ON "filmer_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "IDX_filmer_requests_filmer" ON "filmer_requests" USING btree ("filmer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_spot_rating_per_user" ON "spot_ratings" USING btree ("spot_id","user_id");--> statement-breakpoint
CREATE INDEX "IDX_spot_ratings_spot" ON "spot_ratings" USING btree ("spot_id");--> statement-breakpoint
CREATE INDEX "IDX_spot_location" ON "spots" USING btree ("lat","lng");--> statement-breakpoint
CREATE INDEX "IDX_spot_city" ON "spots" USING btree ("city");--> statement-breakpoint
CREATE INDEX "IDX_spot_created_by" ON "spots" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_clip_view_per_user" ON "clip_views" USING btree ("clip_id","user_id");--> statement-breakpoint
CREATE INDEX "IDX_clip_views_clip" ON "clip_views" USING btree ("clip_id");--> statement-breakpoint
CREATE INDEX "IDX_trick_clips_user" ON "trick_clips" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_trick_clips_status" ON "trick_clips" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_trick_clips_public_feed" ON "trick_clips" USING btree ("is_public","status","created_at");--> statement-breakpoint
CREATE INDEX "IDX_trick_clips_game" ON "trick_clips" USING btree ("game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_user_trick" ON "trick_mastery" USING btree ("user_id","trick");--> statement-breakpoint
CREATE INDEX "IDX_closet_items_user" ON "closet_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_device_tokens_user" ON "device_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_device_tokens_token" ON "device_tokens" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_notification_prefs_user" ON "notification_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_notifications_user" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_notifications_user_unread" ON "notifications" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX "IDX_notifications_created_at" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "IDX_mod_actions_target" ON "mod_actions" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "IDX_mod_actions_admin" ON "mod_actions" USING btree ("admin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_moderation_quota" ON "moderation_quotas" USING btree ("user_id","action","date_key");--> statement-breakpoint
CREATE INDEX "IDX_moderation_reports_status" ON "moderation_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_moderation_reports_reporter" ON "moderation_reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "IDX_moderation_reports_created" ON "moderation_reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "IDX_posts_user" ON "posts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_posts_status" ON "posts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_user_progress_user_step" ON "user_progress" USING btree ("user_id","step_id");--> statement-breakpoint
CREATE INDEX "IDX_user_progress_user" ON "user_progress" USING btree ("user_id");