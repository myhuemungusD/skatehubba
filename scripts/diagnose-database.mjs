#!/usr/bin/env node

/**
 * SkateHubba Database Diagnostic Script
 *
 * Connects to your Neon PostgreSQL database and checks whether all tables
 * defined in the Drizzle schema actually exist. Reports missing tables,
 * enums, and indexes, then prints remediation steps.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/diagnose-database.mjs
 *
 * Or if DATABASE_URL is already in your environment / .env:
 *   node scripts/diagnose-database.mjs
 */

import pg from "pg";

const { Pool } = pg;

// ── Colors ──────────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};

function ok(msg) {
  console.log(`  ${c.green}✓${c.reset} ${msg}`);
}
function warn(msg) {
  console.log(`  ${c.yellow}⚠${c.reset} ${msg}`);
}
function fail(msg) {
  console.log(`  ${c.red}✗${c.reset} ${msg}`);
}
function info(msg) {
  console.log(`  ${c.blue}ℹ${c.reset} ${msg}`);
}
function heading(msg) {
  console.log(`\n${c.bold}${c.cyan}── ${msg} ──${c.reset}`);
}

// ── Expected schema ─────────────────────────────────────────────────────────
// Every table defined in packages/shared/schema/*.ts
const EXPECTED_TABLES = [
  // auth.ts
  "custom_users",
  "usernames",
  "auth_sessions",
  "audit_logs",
  "login_attempts",
  "account_lockouts",
  "mfa_secrets",
  // profiles.ts
  "user_profiles",
  "closet_items",
  "onboarding_profiles",
  // spots.ts
  "spots",
  "spot_ratings",
  "check_ins",
  "filmer_requests",
  "filmer_daily_counters",
  "checkin_nonces",
  // games.ts
  "games",
  "game_turns",
  "game_disputes",
  "challenges",
  // tricks.ts
  "tricks",
  "trick_mastery",
  "trick_clips",
  "clip_views",
  // notifications.ts
  "notifications",
  "notification_preferences",
  // commerce.ts
  "donations",
  "products",
  "orders",
  "consumed_payment_intents",
  // engagement.ts
  "subscribers",
  "feedback",
  "beta_signups",
  // moderation.ts
  "moderation_profiles",
  "moderation_reports",
  "mod_actions",
  "moderation_quotas",
  "posts",
  // battles.ts
  "battles",
  "battle_votes",
  "battle_vote_state",
  // tutorials.ts
  "tutorial_steps",
  "user_progress",
];

// Tables created by numbered migrations (have a CREATE TABLE statement)
const TABLES_WITH_MIGRATIONS = new Set([
  "usernames", // 0001
  "games", // 0002
  "game_turns", // 0002
  "spots", // 0003
  "check_ins", // 0003
  "game_sessions", // 0005 (legacy, not in current schema)
  "battle_vote_state", // 0005
  "moderation_profiles", // 0005
  "moderation_reports", // 0005
  "mod_actions", // 0005
  "moderation_quotas", // 0005
  "posts", // 0005
  "checkin_nonces", // 0005
  "beta_signups", // 0005
  "onboarding_profiles", // 0005
  "game_disputes", // 0006
  "notifications", // 0007
  "notification_preferences", // 0007
  "spot_ratings", // 0009
  "clip_views", // 0010
  "trick_clips", // 0011
  "challenges", // 0012
]);

// Enums required by the schema
const EXPECTED_ENUMS = [
  "account_tier", // auth.ts — pgEnum
  "filmer_request_status", // spots.ts — pgEnum
];

// Critical tables — if these are missing, auth and core features are broken
const CRITICAL_TABLES = [
  "custom_users",
  "usernames",
  "auth_sessions",
  "user_profiles",
  "games",
  "game_turns",
  "spots",
];

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error(
      `\n${c.red}ERROR:${c.reset} DATABASE_URL environment variable is not set.\n`
    );
    console.error("Usage:");
    console.error(
      '  DATABASE_URL="postgresql://user:pass@host/db?sslmode=require" node scripts/diagnose-database.mjs\n'
    );
    process.exit(1);
  }

  // Mask password in output
  const safeUrl = databaseUrl.replace(
    /\/\/([^:]+):([^@]+)@/,
    "//$1:****@"
  );

  console.log(
    `\n${c.bold}${c.cyan}SkateHubba Database Diagnostic${c.reset}`
  );
  console.log(`${c.dim}${safeUrl}${c.reset}`);

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 10_000,
    ssl: databaseUrl.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
  });

  try {
    // ── 1. Connection test ───────────────────────────────────────────────
    heading("Connection");
    try {
      const { rows } = await pool.query("SELECT version()");
      ok(`Connected — ${rows[0].version.split(",")[0]}`);
    } catch (err) {
      fail(`Cannot connect: ${err.message}`);
      process.exit(1);
    }

    // ── 2. List existing tables ──────────────────────────────────────────
    heading("Existing tables");
    const { rows: tableRows } = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const existingTables = new Set(tableRows.map((r) => r.table_name));

    if (existingTables.size === 0) {
      fail("No tables found in public schema — database appears empty");
    } else {
      info(`Found ${existingTables.size} table(s):`);
      for (const t of [...existingTables].sort()) {
        console.log(`      ${c.dim}${t}${c.reset}`);
      }
    }

    // ── 3. Check expected tables ─────────────────────────────────────────
    heading("Schema check — expected tables");
    const missingTables = [];
    const presentTables = [];

    for (const table of EXPECTED_TABLES) {
      if (existingTables.has(table)) {
        presentTables.push(table);
        ok(table);
      } else {
        missingTables.push(table);
        const isCritical = CRITICAL_TABLES.includes(table);
        const hasMigration = TABLES_WITH_MIGRATIONS.has(table);
        const label = isCritical ? `${c.red}CRITICAL${c.reset}` : "missing";
        const source = hasMigration
          ? "has migration file"
          : "drizzle-kit push only";
        fail(`${table} — ${label} ${c.dim}(${source})${c.reset}`);
      }
    }

    // ── 4. Check enums ───────────────────────────────────────────────────
    heading("Enum types");
    const { rows: enumRows } = await pool.query(`
      SELECT typname FROM pg_type
      WHERE typcategory = 'E'
      ORDER BY typname
    `);
    const existingEnums = new Set(enumRows.map((r) => r.typname));

    const missingEnums = [];
    for (const e of EXPECTED_ENUMS) {
      if (existingEnums.has(e)) {
        ok(e);
      } else {
        missingEnums.push(e);
        fail(`${e} — missing`);
      }
    }

    // ── 5. Check migration tracking ──────────────────────────────────────
    heading("Migration tracking");
    if (existingTables.has("schema_migrations")) {
      const { rows: migRows } = await pool.query(`
        SELECT migration_number, migration_name, applied_at
        FROM schema_migrations
        ORDER BY migration_number
      `);
      if (migRows.length === 0) {
        warn("schema_migrations table exists but is empty — no migrations recorded");
      } else {
        info(`${migRows.length} migration(s) recorded:`);
        for (const m of migRows) {
          const date = new Date(m.applied_at).toISOString().slice(0, 19);
          console.log(
            `      ${c.dim}${m.migration_number} — ${m.migration_name} (${date})${c.reset}`
          );
        }
      }
    } else if (existingTables.has("drizzle_migrations") || existingTables.has("__drizzle_migrations")) {
      info("Drizzle migration tracking table found (drizzle-kit managed)");
    } else {
      warn("No migration tracking table found (schema_migrations / drizzle_migrations)");
    }

    // ── 6. Row counts for critical tables ────────────────────────────────
    heading("Row counts (critical tables)");
    for (const table of CRITICAL_TABLES) {
      if (existingTables.has(table)) {
        try {
          const { rows } = await pool.query(
            `SELECT count(*) AS n FROM "${table}"`
          );
          const count = parseInt(rows[0].n, 10);
          if (count === 0) {
            warn(`${table}: 0 rows`);
          } else {
            ok(`${table}: ${count.toLocaleString()} row(s)`);
          }
        } catch (err) {
          fail(`${table}: query failed — ${err.message}`);
        }
      }
    }

    // ── 7. Summary & remediation ─────────────────────────────────────────
    heading("Summary");
    console.log(
      `\n  Tables present:  ${c.green}${presentTables.length}${c.reset} / ${EXPECTED_TABLES.length}`
    );
    console.log(
      `  Tables missing:  ${missingTables.length > 0 ? c.red : c.green}${missingTables.length}${c.reset}`
    );
    console.log(
      `  Enums missing:   ${missingEnums.length > 0 ? c.red : c.green}${missingEnums.length}${c.reset}`
    );

    if (missingTables.length === 0 && missingEnums.length === 0) {
      console.log(
        `\n  ${c.green}${c.bold}All schema objects present. Database looks healthy.${c.reset}\n`
      );
      process.exit(0);
    }

    // ── Remediation ──────────────────────────────────────────────────────
    heading("Remediation steps");

    const missingWithMigration = missingTables.filter((t) =>
      TABLES_WITH_MIGRATIONS.has(t)
    );
    const missingWithoutMigration = missingTables.filter(
      (t) => !TABLES_WITH_MIGRATIONS.has(t)
    );

    console.log(
      `\n  ${c.bold}Step 1: Run drizzle-kit push to create schema-only tables${c.reset}`
    );
    console.log(`  This creates all tables/enums that have no migration file.`);
    console.log(`  It's additive — it won't drop existing tables.\n`);
    console.log(`    ${c.cyan}npx drizzle-kit push${c.reset}\n`);
    if (missingWithoutMigration.length > 0) {
      console.log(`  Tables this will create:`);
      for (const t of missingWithoutMigration) {
        console.log(`    ${c.yellow}+ ${t}${c.reset}`);
      }
    }

    if (missingWithMigration.length > 0) {
      console.log(
        `\n  ${c.bold}Step 2: Run numbered migrations for remaining tables${c.reset}`
      );
      console.log(`  These tables have dedicated SQL migration files:\n`);

      // Map table -> migration file
      const tableMigrationMap = {
        usernames: "0001_create_usernames.sql",
        games: "0002_create_games_tables.sql",
        game_turns: "0002_create_games_tables.sql",
        spots: "0003_create_spots_table.sql",
        check_ins: "0003_create_spots_table.sql",
        battle_vote_state: "0005_consolidate_to_postgresql.sql",
        moderation_profiles: "0005_consolidate_to_postgresql.sql",
        moderation_reports: "0005_consolidate_to_postgresql.sql",
        mod_actions: "0005_consolidate_to_postgresql.sql",
        moderation_quotas: "0005_consolidate_to_postgresql.sql",
        posts: "0005_consolidate_to_postgresql.sql",
        checkin_nonces: "0005_consolidate_to_postgresql.sql",
        beta_signups: "0005_consolidate_to_postgresql.sql",
        onboarding_profiles: "0005_consolidate_to_postgresql.sql",
        game_disputes: "0006_async_skate_game.sql",
        notifications: "0007_add_notifications.sql",
        notification_preferences: "0007_add_notifications.sql",
        spot_ratings: "0009_add_spot_ratings_table.sql",
        clip_views: "0010_add_clip_views_table.sql",
        trick_clips: "0011_trickmint_video_pipeline.sql",
        challenges: "0012_create_challenges_table.sql",
      };

      const migrationFiles = [
        ...new Set(
          missingWithMigration.map((t) => tableMigrationMap[t]).filter(Boolean)
        ),
      ];

      for (const file of migrationFiles) {
        console.log(
          `    ${c.cyan}psql "$DATABASE_URL" -f migrations/${file}${c.reset}`
        );
      }

      console.log(
        `\n  Or run all pending migrations at once:`
      );
      console.log(
        `    ${c.cyan}node migrations/migrate.js up${c.reset}`
      );
    }

    console.log(
      `\n  ${c.bold}Step 3: Verify${c.reset}`
    );
    console.log(
      `    ${c.cyan}node scripts/diagnose-database.mjs${c.reset}  ${c.dim}(re-run this script)${c.reset}`
    );

    const criticalMissing = missingTables.filter((t) =>
      CRITICAL_TABLES.includes(t)
    );
    if (criticalMissing.length > 0) {
      console.log(
        `\n  ${c.red}${c.bold}⚠  CRITICAL: ${criticalMissing.join(", ")} missing.${c.reset}`
      );
      console.log(
        `  ${c.red}Auth, leaderboard, and game features will not work until these exist.${c.reset}`
      );
      if (criticalMissing.includes("custom_users")) {
        console.log(
          `\n  ${c.yellow}Note: custom_users has NO migration file — it was created via drizzle-kit push.`
        );
        console.log(
          `  If drizzle-kit push was never run against production, this table does not exist,`
        );
        console.log(
          `  and the entire auth chain (login → user record → leaderboard) is broken.${c.reset}`
        );
      }
    }

    console.log("");
    process.exit(missingTables.length > 0 ? 1 : 0);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`\n${c.red}Fatal error:${c.reset} ${err.message}`);
  process.exit(1);
});
