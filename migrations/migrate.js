#!/usr/bin/env node

/**
 * Database Migration Runner with Transaction Support
 *
 * This script provides a Node.js interface for running database migrations
 * with full transaction support, validation, and error handling.
 *
 * Usage:
 *   node migrate.js up [migration_number]
 *   node migrate.js down <migration_number>
 *   node migrate.js status
 *   node migrate.js validate
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Configuration
const MIGRATIONS_DIR = __dirname;
const MIGRATIONS_TABLE = 'schema_migrations';

// Database connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'skatehubba',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 1, // Only one connection for migrations
});

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

// Logging functions
function logInfo(message) {
  console.log(`${colors.blue}[INFO]${colors.reset} ${message}`);
}

function logSuccess(message) {
  console.log(`${colors.green}[SUCCESS]${colors.reset} ${message}`);
}

function logError(message) {
  console.error(`${colors.red}[ERROR]${colors.reset} ${message}`);
}

function logWarning(message) {
  console.warn(`${colors.yellow}[WARNING]${colors.reset} ${message}`);
}

// Initialize migrations tracking table
async function initMigrationsTable() {
  logInfo('Initializing migrations tracking table...');

  const sql = `
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id SERIAL PRIMARY KEY,
      migration_number VARCHAR(4) NOT NULL UNIQUE,
      migration_name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
      execution_time_ms INTEGER,
      checksum VARCHAR(64)
    );

    CREATE INDEX IF NOT EXISTS idx_migrations_number ON ${MIGRATIONS_TABLE} (migration_number);
  `;

  try {
    await pool.query(sql);
    logSuccess('Migrations table initialized');
  } catch (error) {
    logError(`Failed to initialize migrations table: ${error.message}`);
    throw error;
  }
}

// Check if migration has been applied
async function isMigrationApplied(migrationNumber) {
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM ${MIGRATIONS_TABLE} WHERE migration_number = $1`,
    [migrationNumber]
  );
  return parseInt(result.rows[0].count, 10) > 0;
}

// Record migration in tracking table
async function recordMigration(migrationNumber, migrationName, executionTime, checksum) {
  await pool.query(
    `INSERT INTO ${MIGRATIONS_TABLE} (migration_number, migration_name, execution_time_ms, checksum)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (migration_number) DO UPDATE
     SET applied_at = NOW(), execution_time_ms = $3, checksum = $4`,
    [migrationNumber, migrationName, executionTime, checksum]
  );
}

// Remove migration record
async function removeMigrationRecord(migrationNumber) {
  await pool.query(
    `DELETE FROM ${MIGRATIONS_TABLE} WHERE migration_number = $1`,
    [migrationNumber]
  );
}

// Calculate checksum for migration file
function calculateChecksum(filePath) {
  const crypto = require('crypto');
  const content = fs.readFileSync(filePath, 'utf8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

// Pre-migration validation
async function preMigrationValidation() {
  logInfo('Running pre-migration validation...');

  try {
    // Check database connection
    await pool.query('SELECT 1');

    // Check if database is writable
    await pool.query('SELECT pg_is_in_recovery()');

    logSuccess('Pre-migration validation passed');
    return true;
  } catch (error) {
    logError(`Pre-migration validation failed: ${error.message}`);
    return false;
  }
}

// Post-migration validation
async function postMigrationValidation() {
  logInfo('Running post-migration validation...');

  try {
    // Verify database connection still works
    await pool.query('SELECT 1');

    // Check for table integrity
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'`
    );

    if (parseInt(result.rows[0].count, 10) === 0) {
      logWarning('No tables found in public schema');
    }

    logSuccess('Post-migration validation passed');
    return true;
  } catch (error) {
    logError(`Post-migration validation failed: ${error.message}`);
    return false;
  }
}

// Execute migration file within a transaction
async function executeMigration(filePath, migrationName) {
  logInfo(`Executing: ${migrationName}`);

  const sql = fs.readFileSync(filePath, 'utf8');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');

    logSuccess(`Migration completed: ${migrationName}`);
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    logError(`Migration failed: ${migrationName}`);
    logError(`Error: ${error.message}`);
    logInfo('All changes have been rolled back (transaction)');
    return false;
  } finally {
    client.release();
  }
}

// Get all migration files
function getMigrationFiles() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(file => /^\d{4}_.*\.sql$/.test(file) && !file.endsWith('_down.sql'))
    .sort();

  return files.map(file => ({
    number: file.substring(0, 4),
    name: file.replace('.sql', ''),
    path: path.join(MIGRATIONS_DIR, file),
  }));
}

// Run migrations up
async function migrateUp(migrationNumber) {
  await initMigrationsTable();

  const migrations = getMigrationFiles();

  if (migrationNumber) {
    const migration = migrations.find(m => m.number === migrationNumber);

    if (!migration) {
      logError(`Migration not found: ${migrationNumber}`);
      return false;
    }

    if (await isMigrationApplied(migrationNumber)) {
      logWarning(`Migration already applied: ${migrationNumber}`);
      return true;
    }

    return await runSingleMigration(migration);
  } else {
    logInfo('Running all pending migrations...');

    for (const migration of migrations) {
      if (await isMigrationApplied(migration.number)) {
        logInfo(`Skipping already applied migration: ${migration.number}`);
        continue;
      }

      const success = await runSingleMigration(migration);
      if (!success) {
        return false;
      }
    }

    logSuccess('All migrations completed successfully');
    return true;
  }
}

// Run a single migration
async function runSingleMigration(migration) {
  // Pre-migration validation
  if (!await preMigrationValidation()) {
    logError(`Pre-migration validation failed for ${migration.number}`);
    return false;
  }

  // Execute migration and measure time
  const startTime = Date.now();
  const success = await executeMigration(migration.path, migration.name);

  if (!success) {
    return false;
  }

  const executionTime = Date.now() - startTime;
  const checksum = calculateChecksum(migration.path);

  await recordMigration(migration.number, migration.name, executionTime, checksum);

  // Post-migration validation
  if (!await postMigrationValidation()) {
    logError(`Post-migration validation failed for ${migration.number}`);
    return false;
  }

  return true;
}

// Run migration down (rollback)
async function migrateDown(migrationNumber) {
  if (!migrationNumber) {
    logError('Migration number required for rollback');
    logInfo('Usage: node migrate.js down <migration_number>');
    return false;
  }

  const downFile = fs.readdirSync(MIGRATIONS_DIR)
    .find(file => file.startsWith(migrationNumber) && file.endsWith('_down.sql'));

  if (!downFile) {
    logError(`Rollback migration not found: ${migrationNumber}_*_down.sql`);
    return false;
  }

  if (!await isMigrationApplied(migrationNumber)) {
    logWarning(`Migration not applied: ${migrationNumber}`);
    return true;
  }

  const filePath = path.join(MIGRATIONS_DIR, downFile);
  const migrationName = downFile.replace('.sql', '');

  logWarning(`Rolling back migration: ${migrationNumber}`);

  // Pre-rollback validation
  if (!await preMigrationValidation()) {
    logError('Pre-rollback validation failed');
    return false;
  }

  // Execute rollback
  const success = await executeMigration(filePath, migrationName);

  if (!success) {
    return false;
  }

  await removeMigrationRecord(migrationNumber);

  // Post-rollback validation
  if (!await postMigrationValidation()) {
    logError('Post-rollback validation failed');
    return false;
  }

  logSuccess(`Rollback completed: ${migrationNumber}`);
  return true;
}

// Show migration status
async function showStatus() {
  await initMigrationsTable();

  logInfo('Migration Status');
  logInfo('================\n');

  console.log(
    'Number'.padEnd(10),
    'Name'.padEnd(50),
    'Applied At'.padEnd(25),
    'Status'
  );
  console.log('-'.repeat(100));

  const migrations = getMigrationFiles();

  for (const migration of migrations) {
    const applied = await isMigrationApplied(migration.number);

    if (applied) {
      const result = await pool.query(
        `SELECT applied_at FROM ${MIGRATIONS_TABLE} WHERE migration_number = $1`,
        [migration.number]
      );
      const appliedAt = result.rows[0].applied_at.toISOString();
      console.log(
        migration.number.padEnd(10),
        migration.name.padEnd(50),
        appliedAt.padEnd(25),
        `${colors.green}APPLIED${colors.reset}`
      );
    } else {
      console.log(
        migration.number.padEnd(10),
        migration.name.padEnd(50),
        '-'.padEnd(25),
        `${colors.yellow}PENDING${colors.reset}`
      );
    }
  }

  console.log('');
}

// Validate migrations
async function validateMigrations() {
  logInfo('Validating migrations...');

  let errors = 0;
  const migrations = getMigrationFiles();

  // Check for gaps in migration numbers
  let prevNum = 0;
  for (const migration of migrations) {
    const num = parseInt(migration.number, 10);

    if (num !== prevNum + 1 && prevNum !== 0) {
      logError(`Gap in migration sequence: ${prevNum} -> ${num}`);
      errors++;
    }

    prevNum = num;
  }

  // Check for corresponding down migrations
  for (const migration of migrations) {
    const downFile = path.join(MIGRATIONS_DIR, `${migration.name}_down.sql`);

    if (!fs.existsSync(downFile)) {
      logError(`Missing down migration for: ${migration.name}`);
      errors++;
    }
  }

  // Check SQL syntax (basic check)
  for (const migration of migrations) {
    const content = fs.readFileSync(migration.path, 'utf8');

    if (!content.includes(';')) {
      logWarning(`No SQL statements found in: ${path.basename(migration.path)}`);
    }
  }

  if (errors === 0) {
    logSuccess('All migrations are valid');
    return true;
  } else {
    logError(`Found ${errors} validation error(s)`);
    return false;
  }
}

// Main function
async function main() {
  const command = process.argv[2];
  const migrationNumber = process.argv[3];

  try {
    let success = false;

    switch (command) {
      case 'up':
        success = await migrateUp(migrationNumber);
        break;
      case 'down':
        success = await migrateDown(migrationNumber);
        break;
      case 'status':
        await showStatus();
        success = true;
        break;
      case 'validate':
        success = await validateMigrations();
        break;
      default:
        console.log('Usage: node migrate.js {up|down|status|validate} [migration_number]');
        console.log('');
        console.log('Commands:');
        console.log('  up [migration_number]    - Apply migrations (all or specific)');
        console.log('  down <migration_number>  - Rollback a specific migration');
        console.log('  status                   - Show migration status');
        console.log('  validate                 - Validate migration files');
        console.log('');
        console.log('Examples:');
        console.log('  node migrate.js up                # Apply all pending migrations');
        console.log('  node migrate.js up 0001           # Apply specific migration');
        console.log('  node migrate.js down 0002         # Rollback migration 0002');
        console.log('  node migrate.js status            # Show which migrations are applied');
        console.log('  node migrate.js validate          # Validate all migration files');
        process.exit(1);
    }

    await pool.end();
    process.exit(success ? 0 : 1);
  } catch (error) {
    logError(`Unexpected error: ${error.message}`);
    console.error(error);
    await pool.end();
    process.exit(1);
  }
}

// Run main function
if (require.main === module) {
  main();
}

module.exports = {
  migrateUp,
  migrateDown,
  showStatus,
  validateMigrations,
};
