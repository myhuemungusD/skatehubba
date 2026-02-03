-- Spots table for skate locations
CREATE TABLE IF NOT EXISTS "spots" (
  "id" serial PRIMARY KEY,
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
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "verified" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "check_in_count" integer NOT NULL DEFAULT 0,
  "rating" double precision DEFAULT 0,
  "rating_count" integer NOT NULL DEFAULT 0
);

-- Indexes for the spots table
CREATE INDEX IF NOT EXISTS "IDX_spot_location" ON "spots" ("lat", "lng");
CREATE INDEX IF NOT EXISTS "IDX_spot_city" ON "spots" ("city");
CREATE INDEX IF NOT EXISTS "IDX_spot_created_by" ON "spots" ("created_by");

-- Filmer request status enum type
DO $$ BEGIN
  CREATE TYPE filmer_request_status AS ENUM ('pending', 'accepted', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Check-ins table for spot visits
CREATE TABLE IF NOT EXISTS "check_ins" (
  "id" serial PRIMARY KEY,
  "user_id" varchar(255) NOT NULL,
  "spot_id" integer NOT NULL REFERENCES "spots"("id") ON DELETE CASCADE,
  "timestamp" timestamp NOT NULL DEFAULT now(),
  "is_ar" boolean NOT NULL DEFAULT false,
  "filmer_uid" varchar(128),
  "filmer_status" filmer_request_status,
  "filmer_requested_at" timestamp,
  "filmer_responded_at" timestamp,
  "filmer_request_id" varchar(64)
);

-- Indexes for check_ins table
CREATE INDEX IF NOT EXISTS "IDX_check_ins_user" ON "check_ins" ("user_id");
CREATE INDEX IF NOT EXISTS "IDX_check_ins_spot" ON "check_ins" ("spot_id");

-- Unique constraint: one check-in per user per spot per day
CREATE UNIQUE INDEX IF NOT EXISTS "unique_check_in_per_day" ON "check_ins" ("user_id", "spot_id", (DATE("timestamp")));
