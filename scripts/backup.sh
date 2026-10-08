#!/usr/bin/env bash
# Backs up the Otakudex database, then proves the backup can be restored.
#
#   DATABASE_URL        database to back up (required, see .env.example)
#   VERIFY_ADMIN_URL    optional: a Postgres server where a throwaway database may be created
#                       (connect to its maintenance database, e.g. .../postgres). When set, the
#                       backup is restored there and the row count is compared with the source.
#   BACKUP_DIR          where dumps go (default: backups, ignored by git)
#   KEEP_DAYS           dumps older than this are deleted after a verified backup (default: 30)
#
# Credentials live in the environment (or ~/.pgpass), never in this file. Note that a URL passed as
# an argument can be seen by other users of this machine through `ps`; prefer ~/.pgpass on shared hosts.
set -euo pipefail
umask 077 # dumps hold private notes and watch history: readable by the owner only

: "${DATABASE_URL:?DATABASE_URL must be set (see .env.example)}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"

log() { printf '[%s] %s\n' "$(date +%F\ %T)" "$*"; }

mkdir -p "$BACKUP_DIR"
dump_file="$BACKUP_DIR/otakudex-$(date +%F_%H-%M-%S).dump"

log "Dumping to $dump_file"
pg_dump --format=custom --no-owner --file="$dump_file" "$DATABASE_URL"

log "Checking the archive is readable"
pg_restore --list "$dump_file" > /dev/null

if [[ -n "${VERIFY_ADMIN_URL:-}" ]]; then
  verify_db="otakudex_verify_$$"
  # Swap the database name but keep the query string (for example ?sslmode=require).
  admin_base="${VERIFY_ADMIN_URL%%\?*}"
  admin_query=""
  if [[ "$VERIFY_ADMIN_URL" == *\?* ]]; then admin_query="?${VERIFY_ADMIN_URL#*\?}"; fi
  verify_url="${admin_base%/*}/${verify_db}${admin_query}"
  cleanup() { psql "$VERIFY_ADMIN_URL" -qc "DROP DATABASE IF EXISTS $verify_db" > /dev/null 2>&1 || true; }
  trap cleanup EXIT

  log "Restoring into temporary database $verify_db"
  psql "$VERIFY_ADMIN_URL" -qc "CREATE DATABASE $verify_db"
  pg_restore --no-owner --dbname="$verify_url" "$dump_file"

  source_count=$(psql "$DATABASE_URL" -tAc "SELECT count(*) FROM library_entry")
  restored_count=$(psql "$verify_url" -tAc "SELECT count(*) FROM library_entry")
  if [[ "$source_count" != "$restored_count" ]]; then
    log "VERIFICATION FAILED: source has $source_count entries, restore has $restored_count"
    exit 1
  fi
  log "Restore verified: $restored_count library entries"
else
  log "VERIFY_ADMIN_URL not set: archive checked, but no full test restore was done"
fi

log "Removing dumps older than $KEEP_DAYS days:"
find "$BACKUP_DIR" -name 'otakudex-*.dump' -mtime "+$KEEP_DAYS" -print -delete
log "Done: $dump_file"
