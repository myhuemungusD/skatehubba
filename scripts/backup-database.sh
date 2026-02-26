#!/usr/bin/env bash
#
# PostgreSQL Database Backup Script
#
# Creates timestamped compressed backups of the SkateHubba PostgreSQL database.
# Designed to run via cron for automated daily backups.
#
# Usage:
#   ./scripts/backup-database.sh
#
# Environment variables (required):
#   DATABASE_URL  - PostgreSQL connection string
#
# Environment variables (optional):
#   BACKUP_DIR        - Directory to store backups (default: ./backups)
#   BACKUP_RETENTION  - Days to keep old backups (default: 30)
#   BACKUP_S3_BUCKET  - S3 bucket for offsite backup (optional)
#
# Cron example (daily at 3am):
#   0 3 * * * cd /app && ./scripts/backup-database.sh >> /var/log/skatehubba-backup.log 2>&1
#

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_RETENTION="${BACKUP_RETENTION:-30}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/skatehubba_${TIMESTAMP}.sql.gz"

# =============================================================================
# Pre-flight checks
# =============================================================================

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[ERROR] DATABASE_URL is not set. Aborting backup."
  exit 1
fi

if ! command -v pg_dump &> /dev/null; then
  echo "[ERROR] pg_dump not found. Install PostgreSQL client tools."
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

# =============================================================================
# Backup
# =============================================================================

echo "[$(date -Iseconds)] Starting database backup..."

pg_dump "${DATABASE_URL}" \
  --no-owner \
  --no-privileges \
  --format=plain \
  --verbose \
  2>/dev/null \
  | gzip > "${BACKUP_FILE}"

BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[$(date -Iseconds)] Backup created: ${BACKUP_FILE} (${BACKUP_SIZE})"

# =============================================================================
# Verify backup integrity
# =============================================================================

if ! gzip -t "${BACKUP_FILE}" 2>/dev/null; then
  echo "[ERROR] Backup file is corrupt: ${BACKUP_FILE}"
  rm -f "${BACKUP_FILE}"
  exit 1
fi

echo "[$(date -Iseconds)] Backup integrity verified."

# =============================================================================
# Optional: Upload to S3
# =============================================================================

if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  if command -v aws &> /dev/null; then
    S3_KEY="database-backups/$(basename "${BACKUP_FILE}")"
    echo "[$(date -Iseconds)] Uploading to s3://${BACKUP_S3_BUCKET}/${S3_KEY}..."
    aws s3 cp "${BACKUP_FILE}" "s3://${BACKUP_S3_BUCKET}/${S3_KEY}" --quiet
    echo "[$(date -Iseconds)] S3 upload complete."
  else
    echo "[WARN] aws CLI not found. Skipping S3 upload."
  fi
fi

# =============================================================================
# Cleanup old backups
# =============================================================================

DELETED=$(find "${BACKUP_DIR}" -name "skatehubba_*.sql.gz" -mtime "+${BACKUP_RETENTION}" -delete -print | wc -l)
if [ "${DELETED}" -gt 0 ]; then
  echo "[$(date -Iseconds)] Cleaned up ${DELETED} backup(s) older than ${BACKUP_RETENTION} days."
fi

echo "[$(date -Iseconds)] Backup complete."
