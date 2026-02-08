# Database Migrations

This directory contains database migration scripts for the SkateHubba application, along with migration runner tools that provide robust error handling, transaction support, and rollback capabilities.

## Overview

The migration system provides:

- ✅ **Transaction Support** - All migrations run within database transactions
- ✅ **Rollback Procedures** - Every migration has a corresponding down migration
- ✅ **Error Handling** - Comprehensive error detection and reporting
- ✅ **Pre/Post Validation** - Automated validation before and after migrations
- ✅ **Migration Tracking** - Database table tracks applied migrations
- ✅ **Checksum Verification** - Ensures migration file integrity
- ✅ **Two Execution Methods** - Both Bash and Node.js runners available

## Directory Structure

```
migrations/
├── README.md                              # This file
├── migrate.sh                             # Bash migration runner
├── migrate.js                             # Node.js migration runner
├── 0001_create_usernames.sql              # Forward migration
├── 0001_create_usernames_down.sql         # Rollback migration
├── 0002_create_games_tables.sql           # Forward migration
├── 0002_create_games_tables_down.sql      # Rollback migration
├── 0003_create_spots_table.sql            # Forward migration
├── 0003_create_spots_table_down.sql       # Rollback migration
├── 0004_add_account_tier.sql              # Forward migration
└── 0004_add_account_tier_down.sql         # Rollback migration
```

## Migration Files

### 0001 - Create Usernames Table

Creates the `usernames` table for storing user identifiers and usernames.

**Tables Created:**
- `usernames` - User identification and username mapping

**Indexes:**
- `usernames_username_unique` - Ensures unique usernames
- `usernames_uid_unique` - Ensures unique user IDs

### 0002 - Create Games Tables

Creates tables for the S.K.A.T.E. game functionality.

**Tables Created:**
- `games` - Game sessions and state
- `game_turns` - Turn history with video support

**Indexes:**
- `idx_games_player1`, `idx_games_player2` - Player lookups
- `idx_games_status` - Game status filtering
- `idx_games_deadline` - Deadline queries
- `idx_game_turns_game`, `idx_game_turns_player` - Turn lookups

### 0003 - Create Spots Table

Creates tables for skate spot locations and check-ins.

**Tables Created:**
- `spots` - Skate location data
- `check_ins` - User check-ins at spots

**Types Created:**
- `filmer_request_status` - ENUM for filmer request states

**Indexes:**
- `IDX_spot_location` - Geospatial queries
- `IDX_spot_city` - City-based filtering
- `IDX_spot_created_by` - Creator lookups
- `IDX_check_ins_user`, `IDX_check_ins_spot` - Check-in queries
- `unique_check_in_per_day` - One check-in per user per spot per day

### 0004 - Add Account Tier

Adds monetization tier system to user accounts.

**Types Created:**
- `account_tier` - ENUM for account levels (free, pro, premium)

**Columns Added to `custom_users`:**
- `account_tier` - User's current tier
- `pro_awarded_by` - Who awarded pro status
- `premium_purchased_at` - Premium purchase timestamp

## Migration Runners

### Bash Runner (migrate.sh)

Best for manual execution and shell scripts.

**Features:**
- Color-coded output
- Detailed logging to `migration.log`
- Confirmation prompts for rollbacks
- Disk space checks

**Usage:**

```bash
# Apply all pending migrations
./migrate.sh up

# Apply specific migration
./migrate.sh up 0001

# Rollback specific migration (with confirmation)
./migrate.sh down 0002

# Show migration status
./migrate.sh status

# Validate all migrations
./migrate.sh validate
```

### Node.js Runner (migrate.js)

Best for programmatic execution and CI/CD integration.

**Features:**
- Connection pooling
- Async/await support
- Programmatic API
- No external dependencies except pg

**Requirements:**
```bash
npm install pg
```

**Usage:**

```bash
# Apply all pending migrations
node migrate.js up

# Apply specific migration
node migrate.js up 0001

# Rollback specific migration
node migrate.js down 0002

# Show migration status
node migrate.js status

# Validate all migrations
node migrate.js validate
```

**Programmatic Usage:**

```javascript
const { migrateUp, migrateDown, showStatus } = require('./migrations/migrate.js');

async function runMigrations() {
  try {
    // Apply all pending migrations
    await migrateUp();

    // Show current status
    await showStatus();
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}
```

## Environment Configuration

Both runners use the same environment variables:

```bash
export DB_HOST=localhost           # Database host
export DB_PORT=5432                # Database port
export DB_NAME=skatehubba          # Database name
export DB_USER=postgres            # Database user
export DB_PASSWORD=your_password   # Database password
```

### Using .env file (Node.js only)

```bash
# Install dotenv
npm install dotenv

# Create .env file
cat > .env <<EOF
DB_HOST=localhost
DB_PORT=5432
DB_NAME=skatehubba
DB_USER=postgres
DB_PASSWORD=your_password
EOF
```

## Migration Tracking

Migrations are tracked in the `schema_migrations` table:

```sql
CREATE TABLE schema_migrations (
    id SERIAL PRIMARY KEY,
    migration_number VARCHAR(4) NOT NULL UNIQUE,
    migration_name VARCHAR(255) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
    execution_time_ms INTEGER,
    checksum VARCHAR(64)
);
```

This table is automatically created on first migration run.

## Best Practices

### Creating New Migrations

1. **Number sequentially** - Use next available 4-digit number (0005, 0006, etc.)

2. **Descriptive names** - Use clear, action-based names:
   ```
   0005_add_user_preferences.sql
   0006_create_achievements_table.sql
   ```

3. **Always create down migration** - For every `XXXX_name.sql`, create `XXXX_name_down.sql`

4. **Keep migrations atomic** - One logical change per migration

5. **Use idempotent operations** - Always use `IF EXISTS` and `IF NOT EXISTS`:
   ```sql
   CREATE TABLE IF NOT EXISTS my_table (...);
   CREATE INDEX IF NOT EXISTS my_index ON my_table (...);
   ```

6. **Test rollbacks** - Always test the down migration:
   ```bash
   ./migrate.sh up 0005
   ./migrate.sh down 0005
   ./migrate.sh up 0005  # Should work again
   ```

### Migration Template

**Forward Migration (`XXXX_description.sql`):**

```sql
-- Description of what this migration does
-- Include any important notes or warnings

-- Create tables
CREATE TABLE IF NOT EXISTS my_table (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_my_table_name ON my_table (name);

-- Create types (with error handling)
DO $$ BEGIN
  CREATE TYPE my_type AS ENUM ('value1', 'value2');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
```

**Rollback Migration (`XXXX_description_down.sql`):**

```sql
-- Rollback migration for XXXX_description.sql
-- This script reverses the changes made by the forward migration

-- Drop in reverse order (indexes first, then tables)
DROP INDEX IF EXISTS idx_my_table_name;
DROP TABLE IF EXISTS my_table CASCADE;
DROP TYPE IF EXISTS my_type CASCADE;
```

## Transaction Behavior

### Automatic Rollback

If any statement in a migration fails, the entire migration is automatically rolled back:

```sql
CREATE TABLE users (...);        -- Succeeds
CREATE TABLE posts (...);        -- Succeeds
CREATE TABLE invalid syntax;     -- Fails
-- All changes are rolled back, users and posts tables are NOT created
```

### Manual Transactions

Migrations run with `--single-transaction` (Bash) or within a transaction block (Node.js). You don't need to add `BEGIN`/`COMMIT` statements.

## Validation

### Pre-Migration Validation

Before each migration:
- ✅ Database connection is verified
- ✅ Database is writable (not in recovery mode)
- ✅ Sufficient disk space available (Bash only)

### Post-Migration Validation

After each migration:
- ✅ Database connection still works
- ✅ Basic schema integrity checks
- ✅ Migration recorded in tracking table

### Migration File Validation

Run `validate` command to check:
- ✅ No gaps in migration numbers
- ✅ All forward migrations have rollback migrations
- ✅ SQL syntax is valid (basic check)

```bash
./migrate.sh validate
# or
node migrate.js validate
```

## Error Handling

### Common Errors and Solutions

**"Cannot connect to database"**
- Check database is running: `pg_isready -h localhost -p 5432`
- Verify credentials in environment variables
- Check network connectivity

**"Migration already applied"**
- Migration has already run
- Check status: `./migrate.sh status`
- If re-running is needed, rollback first: `./migrate.sh down XXXX`

**"Rollback migration not found"**
- Create the corresponding `_down.sql` file
- Follow naming convention: `XXXX_name_down.sql`

**"Gap in migration sequence"**
- Migration numbers must be sequential
- Rename migrations to close gaps

**"Transaction rolled back"**
- SQL error in migration script
- Check `migration.log` for details
- Fix SQL and retry

### Recovering from Failed Migrations

1. **Check the error message** in console or `migration.log`

2. **Verify database state**:
   ```bash
   ./migrate.sh status
   ```

3. **If migration was partially applied** (rare with transactions):
   ```bash
   # Manually inspect database
   psql -h localhost -U postgres -d skatehubba -c "\dt"

   # Clean up if needed, then retry
   ./migrate.sh up XXXX
   ```

4. **If migration tracking is incorrect**:
   ```sql
   -- View migration records
   SELECT * FROM schema_migrations ORDER BY migration_number;

   -- Manually fix if needed (use with caution!)
   DELETE FROM schema_migrations WHERE migration_number = '0003';
   ```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Database Migrations

on:
  push:
    branches: [main]

jobs:
  migrate:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v2

      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install pg

      - name: Run migrations
        env:
          DB_HOST: ${{ secrets.DB_HOST }}
          DB_PORT: ${{ secrets.DB_PORT }}
          DB_NAME: ${{ secrets.DB_NAME }}
          DB_USER: ${{ secrets.DB_USER }}
          DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
        run: |
          node migrations/migrate.js validate
          node migrations/migrate.js up
          node migrations/migrate.js status
```

### Docker Integration

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY migrations/ ./migrations/
COPY package.json ./

RUN npm install pg

CMD ["node", "migrations/migrate.js", "up"]
```

## Troubleshooting

### View Migration Logs

**Bash runner:**
```bash
tail -f migrations/migration.log
```

**Node.js runner:**
Logs go to stdout/stderr - redirect as needed:
```bash
node migrate.js up 2>&1 | tee migration.log
```

### Check Database Connection

```bash
# Test connection
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT version();"

# Check migration tracking table
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT * FROM schema_migrations;"
```

### Verify Migration Files

```bash
# List all migration files
ls -la migrations/*.sql

# Validate naming convention
./migrate.sh validate
```

## FAQ

**Q: Can I run migrations in parallel?**
A: No, migrations must run sequentially to maintain data consistency.

**Q: What happens if migration fails midway?**
A: The entire migration is rolled back automatically due to transaction support.

**Q: Can I modify an already-applied migration?**
A: No, you should create a new migration instead. The checksum will detect changes.

**Q: How do I skip a migration?**
A: You can manually insert a record into `schema_migrations`, but this is not recommended.

**Q: Can I use this with multiple databases?**
A: Yes, use different `DB_NAME` environment variables for each database.

**Q: Do I need both migrate.sh and migrate.js?**
A: No, choose one based on your preference. Both provide the same functionality.

## Support

For issues or questions:
1. Check this README
2. Review `migration.log` for detailed error information
3. Verify database connectivity and credentials
4. Ensure migration files follow naming conventions
5. Run validation: `./migrate.sh validate`

## License

This migration system is part of the SkateHubba application.
