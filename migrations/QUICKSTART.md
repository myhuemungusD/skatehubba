# Migration System - Quick Start Guide

Get started with database migrations in under 5 minutes.

## Prerequisites

- PostgreSQL database running
- Node.js (for Node.js runner) or Bash (for shell runner)
- Database credentials

## Quick Setup

### 1. Configure Database Connection

```bash
# Option A: Set environment variables
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=skatehubba
export DB_USER=postgres
export DB_PASSWORD=your_password

# Option B: Create .env file (Node.js only)
cp .env.example .env
# Edit .env with your credentials
```

### 2. Verify Database Connection

```bash
# Test connection using psql
psql -h localhost -p 5432 -U postgres -d skatehubba -c "SELECT version();"
```

### 3. Run Migrations

#### Using Bash (Recommended for Manual Execution)

```bash
# Make script executable (one-time)
chmod +x migrate.sh

# Validate migrations
./migrate.sh validate

# Apply all pending migrations
./migrate.sh up

# Check status
./migrate.sh status
```

#### Using Node.js (Recommended for CI/CD)

```bash
# Install pg dependency (one-time)
npm install pg

# Validate migrations
node migrate.js validate

# Apply all pending migrations
node migrate.js up

# Check status
node migrate.js status
```

## Common Commands

### Apply All Pending Migrations

```bash
./migrate.sh up
# or
node migrate.js up
```

### Apply Specific Migration

```bash
./migrate.sh up 0001
# or
node migrate.js up 0001
```

### Rollback Migration

```bash
./migrate.sh down 0003
# or
node migrate.js down 0003
```

### Check Migration Status

```bash
./migrate.sh status
# or
node migrate.js status
```

### Validate All Migrations

```bash
./migrate.sh validate
# or
node migrate.js validate
```

## Expected Output

### Successful Migration

```
[INFO] Running all pending migrations...
[INFO] Executing: 0001_create_usernames
[INFO] Running pre-migration validation...
[SUCCESS] Pre-migration validation passed
[SUCCESS] Migration completed: 0001_create_usernames
[INFO] Running post-migration validation...
[SUCCESS] Post-migration validation passed
[SUCCESS] All migrations completed successfully
```

### Migration Status

```
[INFO] Migration Status
[INFO] ================

Number     Name                                               Applied At               Status
------     ----                                               ----------               ------
0001       create_usernames                                   2024-01-15T10:30:00Z     APPLIED
0002       create_games_tables                                2024-01-15T10:30:05Z     APPLIED
0003       create_spots_table                                 2024-01-15T10:30:12Z     APPLIED
0004       add_account_tier                                   -                        PENDING
```

## Troubleshooting

### "Cannot connect to database"

1. Check PostgreSQL is running:
   ```bash
   pg_isready -h localhost -p 5432
   ```

2. Verify credentials:
   ```bash
   psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT 1;"
   ```

3. Check firewall/network connectivity

### "Migration already applied"

This is normal - the migration has already run. To re-run:

```bash
# First rollback
./migrate.sh down 0001

# Then re-apply
./migrate.sh up 0001
```

### "Permission denied: ./migrate.sh"

Make the script executable:

```bash
chmod +x migrate.sh
```

### "Module 'pg' not found" (Node.js)

Install the PostgreSQL driver:

```bash
npm install pg
```

## Next Steps

- Read the full [README.md](README.md) for comprehensive documentation
- Review [migration best practices](README.md#best-practices)
- Learn how to [create new migrations](README.md#creating-new-migrations)
- Set up [CI/CD integration](README.md#cicd-integration)

## Support

If you encounter issues:

1. Check `migration.log` for detailed error messages
2. Run `./migrate.sh validate` to check migration files
3. Verify database connectivity and permissions
4. Review the full documentation in [README.md](README.md)

## Example Workflow

```bash
# 1. Initial setup (one-time)
export DB_HOST=localhost DB_PORT=5432 DB_NAME=skatehubba DB_USER=postgres DB_PASSWORD=secret
chmod +x migrate.sh

# 2. Validate everything is correct
./migrate.sh validate

# 3. Apply all migrations
./migrate.sh up

# 4. Check what was applied
./migrate.sh status

# 5. (Optional) Rollback if needed
./migrate.sh down 0004

# 6. Re-apply after fixes
./migrate.sh up 0004
```

That's it! You're ready to manage database migrations. 🎉
