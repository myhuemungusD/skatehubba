CREATE TABLE "custom_users" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"first_name" varchar(100),
	"last_name" varchar(100),
	"firebase_uid" varchar(128),
	"is_email_verified" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"trust_level" integer DEFAULT 0 NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_users_email_unique" UNIQUE("email"),
	CONSTRAINT "custom_users_firebase_uid_unique" UNIQUE("firebase_uid")
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
CREATE TABLE "game_turns" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" varchar(36) NOT NULL,
	"player_id" varchar(36) NOT NULL,
	"player_name" varchar(255) NOT NULL,
	"turn_number" integer NOT NULL,
	"turn_type" varchar(20) DEFAULT 'set' NOT NULL,
	"trick_description" text NOT NULL,
	"video_url" text,
	"video_duration_ms" integer,
	"thumbnail_url" text,
	"result" varchar(50) DEFAULT 'pending' NOT NULL,
	"judged_by" varchar(36),
	"judged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" varchar(36) NOT NULL,
	"players" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_players" integer DEFAULT 2 NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"current_turn" varchar(36),
	"turn_phase" varchar(50) DEFAULT 'set_trick',
	"setter_id" varchar(36),
	"current_responder_idx" integer,
	"last_trick_description" text,
	"last_trick_by" varchar(36),
	"deadline_at" timestamp with time zone,
	"winner_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "check_ins" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"spot_id" integer NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spot_ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"spot_id" integer NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"rating" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spots" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"spot_type" varchar(50) DEFAULT 'street' NOT NULL,
	"tier" varchar(20) DEFAULT 'bronze' NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"address" text,
	"city" varchar(100),
	"state" varchar(50),
	"country" varchar(100) DEFAULT 'USA',
	"photo_url" text,
	"created_by" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"check_in_count" integer DEFAULT 0 NOT NULL,
	"rating" double precision DEFAULT 0 NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"handle" varchar(50) NOT NULL,
	"display_name" varchar(100),
	"bio" text,
	"photo_url" text,
	"stance" varchar(20) DEFAULT 'regular',
	"home_spot" varchar(255),
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
ALTER TABLE "usernames" ADD CONSTRAINT "usernames_uid_custom_users_id_fk" FOREIGN KEY ("uid") REFERENCES "public"."custom_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turns_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turns_player_id_custom_users_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."custom_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_creator_id_custom_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."custom_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_user_id_custom_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."custom_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_ratings" ADD CONSTRAINT "spot_ratings_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_ratings" ADD CONSTRAINT "spot_ratings_user_id_custom_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."custom_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spots" ADD CONSTRAINT "spots_created_by_custom_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."custom_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_id_custom_users_id_fk" FOREIGN KEY ("id") REFERENCES "public"."custom_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_users_firebase_uid" ON "custom_users" USING btree ("firebase_uid");--> statement-breakpoint
CREATE INDEX "IDX_users_email" ON "custom_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "IDX_game_turns_game" ON "game_turns" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "IDX_game_turns_player" ON "game_turns" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "IDX_game_turns_game_result" ON "game_turns" USING btree ("game_id","result");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_game_turn_number" ON "game_turns" USING btree ("game_id","turn_number");--> statement-breakpoint
CREATE INDEX "IDX_games_creator" ON "games" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "IDX_games_status_deadline" ON "games" USING btree ("status","deadline_at");--> statement-breakpoint
CREATE INDEX "IDX_games_winner" ON "games" USING btree ("winner_id");--> statement-breakpoint
CREATE INDEX "IDX_check_ins_user" ON "check_ins" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_check_ins_spot" ON "check_ins" USING btree ("spot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_spot_rating_per_user" ON "spot_ratings" USING btree ("spot_id","user_id");--> statement-breakpoint
CREATE INDEX "IDX_spot_ratings_spot" ON "spot_ratings" USING btree ("spot_id");--> statement-breakpoint
CREATE INDEX "IDX_spot_location" ON "spots" USING btree ("lat","lng");--> statement-breakpoint
CREATE INDEX "IDX_spot_city" ON "spots" USING btree ("city");--> statement-breakpoint
CREATE INDEX "IDX_spot_created_by" ON "spots" USING btree ("created_by");