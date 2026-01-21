CREATE TABLE IF NOT EXISTS "usernames" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "uid" varchar(128) NOT NULL UNIQUE,
  "username" varchar(20) NOT NULL UNIQUE,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "usernames_username_unique" ON "usernames" ("username");
CREATE UNIQUE INDEX IF NOT EXISTS "usernames_uid_unique" ON "usernames" ("uid");
