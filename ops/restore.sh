#!/usr/bin/env bash
# Restores a DPMS backup into a NEW, EMPTY database and verifies it.
#
#   ADMIN_DATABASE_URL=postgresql://admin@host/postgres ./ops/restore.sh <backup-file> <new-database-name>
#   (BACKUP_PASSPHRASE_FILE=… if the backup is encrypted)
#
# Safety: refuses to restore into a database that already exists, and never drops anything.
# The restore is verified: the checksum is checked first, then migrations, tables and the
# integrity triggers are confirmed to be present in the restored copy.
set -euo pipefail

: "${ADMIN_DATABASE_URL:?ADMIN_DATABASE_URL (connection to the postgres maintenance db) is required}"
file="${1:?usage: restore.sh <backup-file> <new-database-name>}"
target="${2:?usage: restore.sh <backup-file> <new-database-name>}"
[[ "$target" =~ ^[a-z][a-z0-9_]{2,40}$ ]] || { echo "invalid database name" >&2; exit 2; }
umask 077

admin="${ADMIN_DATABASE_URL%%\?*}"
if [[ "$(psql "$admin" -Atc "select 1 from pg_database where datname = '$target'")" == "1" ]]; then
  echo "refusing: database '$target' already exists" >&2; exit 3
fi

# 1. Integrity of the file itself.
if [[ -f "$file.sha256" ]]; then
  ( cd "$(dirname "$file")" && sha256sum -c "$(basename "$file").sha256" >/dev/null ) || { echo "checksum mismatch: backup is corrupt or altered" >&2; exit 4; }
  echo "checksum OK"
else
  echo "warning: no .sha256 manifest next to the backup" >&2
fi

# 2. Decrypt to a private temp file if needed.
work="$file"; tmp=""
if [[ "$file" == *.enc ]]; then
  : "${BACKUP_PASSPHRASE_FILE:?BACKUP_PASSPHRASE_FILE is required for an encrypted backup}"
  tmp="$(mktemp)"; trap '[[ -n "$tmp" ]] && rm -f "$tmp"' EXIT
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in "$file" -out "$tmp" -pass "file:$BACKUP_PASSPHRASE_FILE"
  work="$tmp"
fi

# 3. Restore into the new database.
psql "$admin" -qc "create database \"$target\""
base="${admin%/*}"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$base/$target" "$work"

# 4. Verify the restored copy.
q() { psql "$base/$target" -Atc "$1"; }
migrations="$(q 'select count(*) from _prisma_migrations where finished_at is not null')"
tables="$(q "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")"
triggers="$(q "select count(*) from pg_trigger where not tgisinternal")"
[[ "$migrations" -ge 1 && "$tables" -ge 10 && "$triggers" -ge 10 ]] || { echo "verification FAILED (migrations=$migrations tables=$tables triggers=$triggers)" >&2; exit 5; }
echo "restore verified: migrations=$migrations tables=$tables integrity-triggers=$triggers -> database '$target'"
