#!/usr/bin/env node

/**
 * SkateHubba Database Diagnostic Script
 *
 * Connects to the Neon PostgreSQL database and verifies that all tables,
 * columns, enums, and foreign keys defined in the Drizzle schema exist.
 * Reports missing objects and prints remediation steps.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/diagnose-database.mjs
 *   node scripts/diagnose-database.mjs --json     # Machine-readable output
 *   node scripts/diagnose-database.mjs --ci       # Exit 1 on any issue
 *
 * Respects NO_COLOR / FORCE_COLOR environment variables.
 * Auto-loads .env from project root if DATABASE_URL is not set.
 */

import pg from "pg";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const { Pool } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "..");

// ── CLI flags ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const JSON_MODE = args.includes("--json");
const CI_MODE = args.includes("--ci");
const QUERY_TIMEOUT_MS = 15_000;
const CONNECTION_TIMEOUT_MS = 10_000;

// ── Color support ───────────────────────────────────────────────────────────
const useColor =
  !JSON_MODE &&
  !process.env.NO_COLOR &&
  (process.env.FORCE_COLOR === "1" || process.stdout.isTTY);

const c = useColor
  ? {
      reset: "\x1b[0m",
      red: "\x1b[31m",
      green: "\x1b[32m",
      yellow: "\x1b[33m",
      blue: "\x1b[34m",
      cyan: "\x1b[36m",
      dim: "\x1b[2m",
      bold: "\x1b[1m",
    }
  : {
      reset: "",
      red: "",
      green: "",
      yellow: "",
      blue: "",
      cyan: "",
      dim: "",
      bold: "",
    };

// ── JSON accumulator ────────────────────────────────────────────────────────
const jsonResult = {
  connection: null,
  tables: { present: [], missing: [], total_expected: 0 },
  columns: { issues: [] },
  enums: { present: [], missing: [] },
  foreign_keys: { issues: [] },
  migrations: [],
  row_counts: {},
  healthy: false,
};

function log(msg) {
  if (!JSON_MODE) console.log(msg);
}
function logErr(msg) {
  if (!JSON_MODE) console.error(msg);
}
function ok(msg) {
  log(`  ${c.green}✓${c.reset} ${msg}`);
}
function warn(msg) {
  log(`  ${c.yellow}⚠${c.reset} ${msg}`);
}
function fail(msg) {
  log(`  ${c.red}✗${c.reset} ${msg}`);
}
function info(msg) {
  log(`  ${c.blue}ℹ${c.reset} ${msg}`);
}
function heading(msg) {
  log(`\n${c.bold}${c.cyan}── ${msg} ──${c.reset}`);
}

// ── .env auto-loading (lightweight, no external dependency) ─────────────────
function loadDotenv() {
  const envPath = resolve(ROOT_DIR, ".env");
  if (!existsSync(envPath)) return;

  let content;
  try {
    content = readFileSync(envPath, "utf8");
  } catch {
    return;
  }

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Don't override existing env vars
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// ── Mask credentials in URL for safe logging ────────────────────────────────
function maskUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "****";
    return parsed.toString();
  } catch {
    // Fallback if URL constructor fails on unusual formats
    return url.replace(/:([^@/]{1,})@/, ":****@");
  }
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

// Tables created by numbered migration files (have a CREATE TABLE statement)
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

// Columns added via ALTER TABLE in later migrations.
// If the table exists but these columns don't, the migration wasn't applied.
const EXPECTED_COLUMNS = {
  custom_users: [
    "account_tier", // 0004
    "pro_awarded_by", // 0004
    "premium_purchased_at", // 0004
    "trust_level", // schema
    "push_token", // schema
  ],
  games: [
    "turn_phase", // 0006
    "offensive_player_id", // 0006
    "defensive_player_id", // 0006
    "player1_dispute_used", // 0006
    "player2_dispute_used", // 0006
  ],
  game_turns: [
    "turn_type", // 0006
    "video_duration_ms", // 0006
    "thumbnail_url", // 0011
  ],
  user_profiles: [
    "dispute_penalties", // 0006
    "xp", // 0008 (renamed from points)
  ],
};

// Expected foreign key relationships
const EXPECTED_FOREIGN_KEYS = [
  { table: "auth_sessions", column: "user_id", references: "custom_users" },
  { table: "mfa_secrets", column: "user_id", references: "custom_users" },
  { table: "game_turns", column: "game_id", references: "games" },
  { table: "game_disputes", column: "game_id", references: "games" },
  { table: "game_disputes", column: "turn_id", references: "game_turns" },
  { table: "spot_ratings", column: "spot_id", references: "spots" },
  { table: "check_ins", column: "spot_id", references: "spots" },
  { table: "filmer_requests", column: "requester_id", references: "custom_users" },
  { table: "filmer_requests", column: "filmer_id", references: "custom_users" },
  { table: "filmer_requests", column: "check_in_id", references: "check_ins" },
  { table: "clip_views", column: "clip_id", references: "trick_clips" },
  { table: "battle_votes", column: "battle_id", references: "battles" },
  { table: "battle_vote_state", column: "battle_id", references: "battles" },
  { table: "user_progress", column: "step_id", references: "tutorial_steps" },
];

// Enums required by the schema
const EXPECTED_ENUMS = [
  "account_tier", // auth.ts
  "filmer_request_status", // spots.ts
];

// Critical tables — if missing, auth and core features are broken
const CRITICAL_TABLES = new Set([
  "custom_users",
  "usernames",
  "auth_sessions",
  "user_profiles",
  "games",
  "game_turns",
  "spots",
]);

// Map table → migration file for remediation output
const TABLE_MIGRATION_MAP = {
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

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  loadDotenv();

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    logErr(
      `\n${c.red}ERROR:${c.reset} DATABASE_URL environment variable is not set.\n`
    );
    logErr("Usage:");
    logErr(
      '  DATABASE_URL="postgresql://user:pass@host/db?sslmode=require" node scripts/diagnose-database.mjs'
    );
    logErr("\nOr create a .env file in the project root with DATABASE_URL set.");
    process.exit(1);
  }

  const safeUrl = maskUrl(databaseUrl);

  log(`\n${c.bold}${c.cyan}SkateHubba Database Diagnostic${c.reset}`);
  log(`${c.dim}${safeUrl}${c.reset}`);

  // Neon always requires SSL — detect it from the host, not just the query string
  const isNeon =
    databaseUrl.includes(".neon.tech") || databaseUrl.includes("neondb");
  const needsSsl =
    databaseUrl.includes("sslmode=require") ||
    databaseUrl.includes("ssl=true") ||
    isNeon;

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    statement_timeout: QUERY_TIMEOUT_MS,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });

  let issueCount = 0;

  async function cleanup(exitCode) {
    try {
      await pool.end();
    } catch {
      // Ignore cleanup errors
    }
    if (JSON_MODE) {
      console.log(JSON.stringify(jsonResult, null, 2));
    }
    process.exit(exitCode);
  }

  try {
    // ── 1. Connection test ───────────────────────────────────────────────
    heading("Connection");
    try {
      const { rows } = await pool.query("SELECT version()");
      const version = rows[0].version.split(",")[0];
      ok(`Connected — ${version}`);
      jsonResult.connection = { ok: true, version };
    } catch (err) {
      fail(`Cannot connect: ${err.message}`);
      jsonResult.connection = { ok: false, error: err.message };
      await cleanup(1);
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
        log(`      ${c.dim}${t}${c.reset}`);
      }
    }

    // ── 3. Check expected tables ─────────────────────────────────────────
    heading("Schema check — expected tables");
    jsonResult.tables.total_expected = EXPECTED_TABLES.length;

    for (const table of EXPECTED_TABLES) {
      if (existingTables.has(table)) {
        jsonResult.tables.present.push(table);
        ok(table);
      } else {
        issueCount++;
        const isCritical = CRITICAL_TABLES.has(table);
        const hasMigration = TABLES_WITH_MIGRATIONS.has(table);
        const source = hasMigration
          ? "has migration file"
          : "drizzle-kit push only";
        jsonResult.tables.missing.push({ table, critical: isCritical, source });
        const label = isCritical ? `${c.red}CRITICAL${c.reset}` : "missing";
        fail(`${table} — ${label} ${c.dim}(${source})${c.reset}`);
      }
    }

    // ── 4. Check columns on existing tables ──────────────────────────────
    heading("Column check — migration-added columns");
    const { rows: colRows } = await pool.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);
    const columnsByTable = new Map();
    for (const row of colRows) {
      if (!columnsByTable.has(row.table_name)) {
        columnsByTable.set(row.table_name, new Set());
      }
      columnsByTable.get(row.table_name).add(row.column_name);
    }

    for (const [table, expectedCols] of Object.entries(EXPECTED_COLUMNS)) {
      if (!existingTables.has(table)) continue; // already flagged as missing table
      const actualCols = columnsByTable.get(table) || new Set();
      for (const col of expectedCols) {
        if (actualCols.has(col)) {
          ok(`${table}.${col}`);
        } else {
          issueCount++;
          jsonResult.columns.issues.push({ table, column: col });
          fail(
            `${table}.${col} — missing ${c.dim}(added by ALTER TABLE in a migration)${c.reset}`
          );
        }
      }
    }

    // ── 5. Check enums ───────────────────────────────────────────────────
    heading("Enum types");
    const { rows: enumRows } = await pool.query(`
      SELECT typname FROM pg_type
      WHERE typcategory = 'E'
      ORDER BY typname
    `);
    const existingEnums = new Set(enumRows.map((r) => r.typname));

    for (const e of EXPECTED_ENUMS) {
      if (existingEnums.has(e)) {
        jsonResult.enums.present.push(e);
        ok(e);
      } else {
        issueCount++;
        jsonResult.enums.missing.push(e);
        fail(`${e} — missing`);
      }
    }

    // ── 6. Check foreign keys ────────────────────────────────────────────
    heading("Foreign key constraints");
    const { rows: fkRows } = await pool.query(`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS referenced_table
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
        AND tc.table_schema = ccu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
    `);
    const existingFks = new Set(
      fkRows.map(
        (r) => `${r.table_name}.${r.column_name}->${r.referenced_table}`
      )
    );

    for (const fk of EXPECTED_FOREIGN_KEYS) {
      // Skip check if either table doesn't exist — already flagged above
      if (!existingTables.has(fk.table) || !existingTables.has(fk.references)) {
        continue;
      }
      const key = `${fk.table}.${fk.column}->${fk.references}`;
      if (existingFks.has(key)) {
        ok(`${fk.table}.${fk.column} → ${fk.references}`);
      } else {
        issueCount++;
        jsonResult.foreign_keys.issues.push(fk);
        fail(
          `${fk.table}.${fk.column} → ${fk.references} — ${c.yellow}FK missing${c.reset}`
        );
      }
    }

    // ── 7. Check migration tracking ──────────────────────────────────────
    heading("Migration tracking");
    if (existingTables.has("schema_migrations")) {
      const { rows: migRows } = await pool.query(`
        SELECT migration_number, migration_name, applied_at
        FROM schema_migrations
        ORDER BY migration_number
      `);
      if (migRows.length === 0) {
        warn(
          "schema_migrations table exists but is empty — no migrations recorded"
        );
      } else {
        info(`${migRows.length} migration(s) recorded:`);
        for (const m of migRows) {
          const date = new Date(m.applied_at).toISOString().slice(0, 19);
          jsonResult.migrations.push({
            number: m.migration_number,
            name: m.migration_name,
            applied_at: date,
          });
          log(
            `      ${c.dim}${m.migration_number} — ${m.migration_name} (${date})${c.reset}`
          );
        }
      }
    } else if (
      existingTables.has("drizzle_migrations") ||
      existingTables.has("__drizzle_migrations")
    ) {
      info("Drizzle migration tracking table found (drizzle-kit managed)");
    } else {
      warn(
        "No migration tracking table found (schema_migrations / drizzle_migrations)"
      );
    }

    // ── 8. Row counts for critical tables ────────────────────────────────
    heading("Row counts (critical tables)");
    for (const table of CRITICAL_TABLES) {
      if (!existingTables.has(table)) continue;
      try {
        const { rows } = await pool.query(
          `SELECT count(*) AS n FROM "${table}"`
        );
        const count = parseInt(rows[0].n, 10);
        jsonResult.row_counts[table] = count;
        if (count === 0) {
          warn(`${table}: 0 rows`);
        } else {
          ok(`${table}: ${count.toLocaleString()} row(s)`);
        }
      } catch (err) {
        fail(`${table}: query failed — ${err.message}`);
        jsonResult.row_counts[table] = null;
      }
    }

    // ── 9. Summary & remediation ─────────────────────────────────────────
    const missingTables = jsonResult.tables.missing;
    const missingEnums = jsonResult.enums.missing;
    const columnIssues = jsonResult.columns.issues;
    const fkIssues = jsonResult.foreign_keys.issues;
    jsonResult.healthy = issueCount === 0;

    heading("Summary");
    log(
      `\n  Tables present:   ${c.green}${jsonResult.tables.present.length}${c.reset} / ${EXPECTED_TABLES.length}`
    );
    log(
      `  Tables missing:   ${missingTables.length > 0 ? c.red : c.green}${missingTables.length}${c.reset}`
    );
    log(
      `  Columns missing:  ${columnIssues.length > 0 ? c.red : c.green}${columnIssues.length}${c.reset}`
    );
    log(
      `  Enums missing:    ${missingEnums.length > 0 ? c.red : c.green}${missingEnums.length}${c.reset}`
    );
    log(
      `  FK issues:        ${fkIssues.length > 0 ? c.yellow : c.green}${fkIssues.length}${c.reset}`
    );

    if (issueCount === 0) {
      log(
        `\n  ${c.green}${c.bold}All schema objects present. Database looks healthy.${c.reset}\n`
      );
      await cleanup(0);
    }

    // ── Remediation ──────────────────────────────────────────────────────
    heading("Remediation steps");

    const missingTableNames = missingTables.map((t) => t.table);
    const missingWithMigration = missingTableNames.filter((t) =>
      TABLES_WITH_MIGRATIONS.has(t)
    );
    const missingWithoutMigration = missingTableNames.filter(
      (t) => !TABLES_WITH_MIGRATIONS.has(t)
    );

    log(
      `\n  ${c.bold}Step 1: Run drizzle-kit push to create schema-only tables + enums${c.reset}`
    );
    log(`  This syncs the Drizzle schema to the database. It's additive —`);
    log(`  it won't drop existing tables or columns.\n`);
    log(`    ${c.cyan}npx drizzle-kit push${c.reset}\n`);
    if (missingWithoutMigration.length > 0) {
      log(`  Tables this will create:`);
      for (const t of missingWithoutMigration) {
        log(`    ${c.yellow}+ ${t}${c.reset}`);
      }
    }
    if (columnIssues.length > 0) {
      log(`\n  Columns this will add:`);
      for (const ci of columnIssues) {
        log(`    ${c.yellow}+ ${ci.table}.${ci.column}${c.reset}`);
      }
    }

    if (missingWithMigration.length > 0) {
      log(
        `\n  ${c.bold}Step 2: Run numbered migrations for remaining tables${c.reset}`
      );
      log(`  These tables have dedicated SQL migration files:\n`);

      const migrationFiles = [
        ...new Set(
          missingWithMigration
            .map((t) => TABLE_MIGRATION_MAP[t])
            .filter(Boolean)
        ),
      ];

      for (const file of migrationFiles) {
        log(
          `    ${c.cyan}psql "$DATABASE_URL" -f migrations/${file}${c.reset}`
        );
      }

      log(`\n  Or run all pending migrations at once:`);
      log(`    ${c.cyan}node migrations/migrate.js up${c.reset}`);
    }

    log(`\n  ${c.bold}Step 3: Verify${c.reset}`);
    log(
      `    ${c.cyan}node scripts/diagnose-database.mjs${c.reset}  ${c.dim}(re-run this script)${c.reset}`
    );

    const criticalMissing = missingTables
      .filter((t) => t.critical)
      .map((t) => t.table);
    if (criticalMissing.length > 0) {
      log(
        `\n  ${c.red}${c.bold}⚠  CRITICAL: ${criticalMissing.join(", ")} missing.${c.reset}`
      );
      log(
        `  ${c.red}Auth, leaderboard, and game features will not work until these exist.${c.reset}`
      );
      if (criticalMissing.includes("custom_users")) {
        log(
          `\n  ${c.yellow}Note: custom_users has NO migration file — it was created via drizzle-kit push.`
        );
        log(
          `  If drizzle-kit push was never run against production, this table does not exist,`
        );
        log(
          `  and the entire auth chain (login → user record → leaderboard) is broken.${c.reset}`
        );
      }
    }

    log("");
    await cleanup(issueCount > 0 ? 1 : 0);
  } catch (err) {
    fail(`Unexpected error: ${err.message}`);
    jsonResult.healthy = false;
    await cleanup(1);
  }
}

main().catch(async (err) => {
  if (JSON_MODE) {
    jsonResult.connection = jsonResult.connection || {
      ok: false,
      error: err.message,
    };
    console.log(JSON.stringify(jsonResult, null, 2));
  } else {
    console.error(`\n${c.red}Fatal error:${c.reset} ${err.message}`);
  }
  process.exit(1);
});
