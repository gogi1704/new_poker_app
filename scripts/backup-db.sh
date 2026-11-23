#!/bin/sh
# Daily dump of the self-hosted production Postgres (see docker-compose.production.yml).
# Run from the repo root on the server: ./scripts/backup-db.sh
# Suggested cron (3am daily): 0 3 * * * cd /opt/poker-club && ./scripts/backup-db.sh >> backups/backup.log 2>&1
set -eu

cd "$(dirname "$0")/.."
mkdir -p backups

STAMP=$(date +%Y%m%d-%H%M%S)
OUT="backups/pokerclub-$STAMP.sql.gz"

docker-compose -p poker-club -f docker-compose.production.yml exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-pokerclub}" "${POSTGRES_DB:-pokerclub}" | gzip > "$OUT"

echo "Backup written: $OUT"

# Keep the last 14 days, drop anything older.
find backups -name 'pokerclub-*.sql.gz' -mtime +14 -delete
