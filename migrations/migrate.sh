#!/bin/bash

# Migration Runner Script with Transaction Support
# Usage: ./migrate.sh [up|down|status|validate] [migration_number]
# Example: ./migrate.sh up 0001
#          ./migrate.sh down 0002
#          ./migrate.sh status
#          ./migrate.sh validate

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MIGRATIONS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_TABLE="schema_migrations"
LOG_FILE="${MIGRATIONS_DIR}/migration.log"

# Database connection
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-skatehubba}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-}"

# Helper function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Log function
log_message() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Execute SQL with transaction support
execute_sql() {
    local sql_file=$1
    local migration_name=$(basename "$sql_file" .sql)

    print_info "Executing: $migration_name"
    log_message "Starting migration: $migration_name"

    if [ ! -f "$sql_file" ]; then
        print_error "Migration file not found: $sql_file"
        log_message "ERROR: Migration file not found: $sql_file"
        return 1
    fi

    # Execute SQL within a transaction
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -v ON_ERROR_STOP=1 \
        --single-transaction \
        -f "$sql_file" 2>&1 | tee -a "$LOG_FILE"

    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        print_success "Migration completed: $migration_name"
        log_message "SUCCESS: Migration completed: $migration_name"
        return 0
    else
        print_error "Migration failed: $migration_name"
        log_message "ERROR: Migration failed: $migration_name"
        return 1
    fi
}

# Initialize migrations table
init_migrations_table() {
    print_info "Initializing migrations tracking table..."

    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -v ON_ERROR_STOP=1 \
        --single-transaction <<EOF
CREATE TABLE IF NOT EXISTS $MIGRATIONS_TABLE (
    id SERIAL PRIMARY KEY,
    migration_number VARCHAR(4) NOT NULL UNIQUE,
    migration_name VARCHAR(255) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
    execution_time_ms INTEGER,
    checksum VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_migrations_number ON $MIGRATIONS_TABLE (migration_number);
EOF

    if [ $? -eq 0 ]; then
        print_success "Migrations table initialized"
        log_message "Migrations table initialized"
    else
        print_error "Failed to initialize migrations table"
        log_message "ERROR: Failed to initialize migrations table"
        exit 1
    fi
}

# Check if migration has been applied
is_migration_applied() {
    local migration_number=$1

    local count=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -t -c "SELECT COUNT(*) FROM $MIGRATIONS_TABLE WHERE migration_number = '$migration_number'" 2>/dev/null || echo "0")

    [ $(echo "$count" | tr -d '[:space:]') -gt 0 ]
}

# Record migration
record_migration() {
    local migration_number=$1
    local migration_name=$2
    local execution_time=$3
    local checksum=$4

    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -v ON_ERROR_STOP=1 <<EOF
INSERT INTO $MIGRATIONS_TABLE (migration_number, migration_name, execution_time_ms, checksum)
VALUES ('$migration_number', '$migration_name', $execution_time, '$checksum')
ON CONFLICT (migration_number) DO UPDATE
SET applied_at = NOW(), execution_time_ms = $execution_time, checksum = '$checksum';
EOF
}

# Remove migration record
remove_migration_record() {
    local migration_number=$1

    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -v ON_ERROR_STOP=1 \
        -c "DELETE FROM $MIGRATIONS_TABLE WHERE migration_number = '$migration_number'"
}

# Calculate checksum of migration file
calculate_checksum() {
    local file=$1
    sha256sum "$file" | awk '{print $1}'
}

# Pre-migration validation
pre_migration_validation() {
    print_info "Running pre-migration validation..."

    # Check database connection
    if ! PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" >/dev/null 2>&1; then
        print_error "Cannot connect to database"
        return 1
    fi

    # Check disk space (require at least 100MB free)
    local available_space=$(df "$MIGRATIONS_DIR" | awk 'NR==2 {print $4}')
    if [ "$available_space" -lt 102400 ]; then
        print_warning "Low disk space: ${available_space}KB available"
    fi

    print_success "Pre-migration validation passed"
    return 0
}

# Post-migration validation
post_migration_validation() {
    local migration_file=$1
    print_info "Running post-migration validation..."

    # Verify database connection still works
    if ! PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" >/dev/null 2>&1; then
        print_error "Database connection lost after migration"
        return 1
    fi

    # Check for basic table integrity (this is generic, can be extended)
    local table_check=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'" 2>/dev/null || echo "0")

    if [ $(echo "$table_check" | tr -d '[:space:]') -eq 0 ]; then
        print_warning "No tables found in public schema"
    fi

    print_success "Post-migration validation passed"
    return 0
}

# Run migration up
migrate_up() {
    local migration_number=$1

    init_migrations_table

    # Abort if duplicate sequence numbers are detected
    local dup_prev_num=""
    for dup_file in "$MIGRATIONS_DIR"/[0-9][0-9][0-9][0-9]_*.sql; do
        [ -e "$dup_file" ] || continue
        [[ "$dup_file" == *"_down.sql" ]] && continue
        local dup_num
        dup_num=$(basename "$dup_file" | cut -d'_' -f1)
        if [ "$dup_num" = "$dup_prev_num" ]; then
            print_error "Duplicate migration sequence number $dup_num detected. Run './migrate.sh validate' for details."
            exit 1
        fi
        dup_prev_num="$dup_num"
    done

    if [ -z "$migration_number" ]; then
        # Run all pending migrations
        print_info "Running all pending migrations..."

        for migration_file in "$MIGRATIONS_DIR"/[0-9][0-9][0-9][0-9]_*.sql; do
            [ -e "$migration_file" ] || continue

            local number=$(basename "$migration_file" | cut -d'_' -f1)
            local name=$(basename "$migration_file" .sql)

            if is_migration_applied "$number"; then
                print_info "Skipping already applied migration: $number"
                continue
            fi

            # Pre-migration validation
            if ! pre_migration_validation; then
                print_error "Pre-migration validation failed for $number"
                exit 1
            fi

            # Execute migration and measure time
            local start_time=$(date +%s%N)
            if execute_sql "$migration_file"; then
                local end_time=$(date +%s%N)
                local execution_time=$(( (end_time - start_time) / 1000000 ))
                local checksum=$(calculate_checksum "$migration_file")

                record_migration "$number" "$name" "$execution_time" "$checksum"

                # Post-migration validation
                if ! post_migration_validation "$migration_file"; then
                    print_error "Post-migration validation failed for $number"
                    exit 1
                fi
            else
                print_error "Migration failed: $number"
                print_info "All changes have been rolled back (transaction)"
                exit 1
            fi
        done

        print_success "All migrations completed successfully"
    else
        # Run specific migration
        local migration_file="$MIGRATIONS_DIR/${migration_number}_"*.sql

        if [ ! -f $migration_file ]; then
            print_error "Migration not found: $migration_number"
            exit 1
        fi

        if is_migration_applied "$migration_number"; then
            print_warning "Migration already applied: $migration_number"
            exit 0
        fi

        local name=$(basename "$migration_file" .sql)

        # Pre-migration validation
        if ! pre_migration_validation; then
            print_error "Pre-migration validation failed"
            exit 1
        fi

        # Execute migration and measure time
        local start_time=$(date +%s%N)
        if execute_sql "$migration_file"; then
            local end_time=$(date +%s%N)
            local execution_time=$(( (end_time - start_time) / 1000000 ))
            local checksum=$(calculate_checksum "$migration_file")

            record_migration "$migration_number" "$name" "$execution_time" "$checksum"

            # Post-migration validation
            if ! post_migration_validation "$migration_file"; then
                print_error "Post-migration validation failed"
                exit 1
            fi
        else
            print_error "Migration failed: $migration_number"
            print_info "All changes have been rolled back (transaction)"
            exit 1
        fi
    fi
}

# Run migration down
migrate_down() {
    local migration_number=$1

    if [ -z "$migration_number" ]; then
        print_error "Migration number required for rollback"
        print_info "Usage: ./migrate.sh down <migration_number>"
        exit 1
    fi

    local migration_file="$MIGRATIONS_DIR/${migration_number}_"*"_down.sql"

    if [ ! -f $migration_file ]; then
        print_error "Rollback migration not found: ${migration_number}_*_down.sql"
        exit 1
    fi

    if ! is_migration_applied "$migration_number"; then
        print_warning "Migration not applied: $migration_number"
        exit 0
    fi

    print_warning "Rolling back migration: $migration_number"
    read -p "Are you sure? This will remove changes made by this migration. (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        print_info "Rollback cancelled"
        exit 0
    fi

    # Pre-migration validation
    if ! pre_migration_validation; then
        print_error "Pre-rollback validation failed"
        exit 1
    fi

    # Execute rollback
    if execute_sql "$migration_file"; then
        remove_migration_record "$migration_number"

        # Post-migration validation
        if ! post_migration_validation "$migration_file"; then
            print_error "Post-rollback validation failed"
            exit 1
        fi

        print_success "Rollback completed: $migration_number"
    else
        print_error "Rollback failed: $migration_number"
        exit 1
    fi
}

# Show migration status
show_status() {
    print_info "Migration Status"
    print_info "================"

    init_migrations_table

    echo ""
    printf "%-10s %-50s %-20s %-15s\n" "Number" "Name" "Applied At" "Status"
    printf "%-10s %-50s %-20s %-15s\n" "------" "----" "----------" "------"

    for migration_file in "$MIGRATIONS_DIR"/[0-9][0-9][0-9][0-9]_*.sql; do
        [ -e "$migration_file" ] || continue

        local number=$(basename "$migration_file" | cut -d'_' -f1)
        local name=$(basename "$migration_file" .sql | cut -d'_' -f2-)

        if is_migration_applied "$number"; then
            local applied_at=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
                -t -c "SELECT applied_at FROM $MIGRATIONS_TABLE WHERE migration_number = '$number'" | tr -d '[:space:]')
            printf "%-10s %-50s %-20s ${GREEN}%-15s${NC}\n" "$number" "$name" "$applied_at" "APPLIED"
        else
            printf "%-10s %-50s %-20s ${YELLOW}%-15s${NC}\n" "$number" "$name" "-" "PENDING"
        fi
    done

    echo ""
}

# Validate migrations
validate_migrations() {
    print_info "Validating migrations..."

    local errors=0

    # Check for duplicate sequence numbers (forward migrations only)
    local dup_prev_num=""
    local dup_prev_file=""
    for migration_file in "$MIGRATIONS_DIR"/[0-9][0-9][0-9][0-9]_*.sql; do
        [ -e "$migration_file" ] || continue
        [[ "$migration_file" == *"_down.sql" ]] && continue

        local dup_num
        dup_num=$(basename "$migration_file" | cut -d'_' -f1)

        if [ "$dup_num" = "$dup_prev_num" ]; then
            print_error "Duplicate migration sequence number $dup_num: $(basename "$dup_prev_file") and $(basename "$migration_file")"
            ((errors++))
        fi

        dup_prev_num="$dup_num"
        dup_prev_file="$migration_file"
    done

    # Check for gaps in migration numbers (forward migrations only, deduplicated)
    local prev_num=0
    for migration_file in "$MIGRATIONS_DIR"/[0-9][0-9][0-9][0-9]_*.sql; do
        [ -e "$migration_file" ] || continue
        [[ "$migration_file" == *"_down.sql" ]] && continue

        local num
        num=$(basename "$migration_file" | cut -d'_' -f1 | sed 's/^0*//')

        # Skip duplicate numbers (already reported above)
        [ "$num" -eq "$prev_num" ] 2>/dev/null && continue

        if [ "$num" -ne $((prev_num + 1)) ] && [ $prev_num -ne 0 ]; then
            print_error "Gap in migration sequence: $prev_num -> $num"
            ((errors++))
        fi

        prev_num=$num
    done

    # Check for corresponding down migrations
    for migration_file in "$MIGRATIONS_DIR"/[0-9][0-9][0-9][0-9]_*.sql; do
        [ -e "$migration_file" ] || continue

        # Skip down migrations
        [[ "$migration_file" == *"_down.sql" ]] && continue

        local base_name=$(basename "$migration_file" .sql)
        local down_file="${MIGRATIONS_DIR}/${base_name}_down.sql"

        if [ ! -f "$down_file" ]; then
            print_error "Missing down migration for: $base_name"
            ((errors++))
        fi
    done

    # Check SQL syntax (basic check)
    for migration_file in "$MIGRATIONS_DIR"/[0-9][0-9][0-9][0-9]_*.sql; do
        [ -e "$migration_file" ] || continue

        if ! grep -q ";" "$migration_file"; then
            print_warning "No SQL statements found in: $(basename "$migration_file")"
        fi
    done

    if [ $errors -eq 0 ]; then
        print_success "All migrations are valid"
        return 0
    else
        print_error "Found $errors validation error(s)"
        return 1
    fi
}

# Main script
main() {
    local command=${1:-}
    local migration_number=${2:-}

    case "$command" in
        up)
            migrate_up "$migration_number"
            ;;
        down)
            migrate_down "$migration_number"
            ;;
        status)
            show_status
            ;;
        validate)
            validate_migrations
            ;;
        *)
            echo "Usage: $0 {up|down|status|validate} [migration_number]"
            echo ""
            echo "Commands:"
            echo "  up [migration_number]    - Apply migrations (all or specific)"
            echo "  down <migration_number>  - Rollback a specific migration"
            echo "  status                   - Show migration status"
            echo "  validate                 - Validate migration files"
            echo ""
            echo "Examples:"
            echo "  $0 up                    # Apply all pending migrations"
            echo "  $0 up 0001               # Apply specific migration"
            echo "  $0 down 0002             # Rollback migration 0002"
            echo "  $0 status                # Show which migrations are applied"
            echo "  $0 validate              # Validate all migration files"
            exit 1
            ;;
    esac
}

main "$@"
