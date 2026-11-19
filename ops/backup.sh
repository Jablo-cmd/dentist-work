#!/usr/bin/env bash
# Logical backup of the DPMS PostgreSQL database (schema + data, custom format, compressed).
#
#   DATABASE_URL=postgresql://… ./ops/backup.sh /secure/backup/dir
#
# Optional encryption (strongly recommended for anything leaving the server):
#   BACKUP_PASSPHRASE_FILE=/path/to/passphrase-file   (AES-256, PBKDF2)
#
# Output: dpms-<UTC timestamp>.dump[.enc] and a .sha256 manifest. The backup contains patient data:
# store it only on encrypted, access-controlled storage and never in this repository.
# Object storage (imaging files) is NOT included — back the bucket up separately (docs/17).
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
dest="${1:?usage: backup.sh <destination-directory>}"
umask 077
mkdir -p "$dest"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$dest/dpms-$stamp.dump"

# pg_dump ignores the Prisma-specific "?schema=" query parameter, so strip it.
url="${DATABASE_URL%%\?*}"
pg_dump --format=custom --compress=9 --no-owner --no-privileges --dbname="$url" --file="$file"

if [[ -n "${BACKUP_PASSPHRASE_FILE:-}" ]]; then
  openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -in "$file" -out "$file.enc" -pass "file:$BACKUP_PASSPHRASE_FILE"
  rm -f "$file"
  file="$file.enc"
fi

( cd "$dest" && sha256sum "$(basename "$file")" > "$(basename "$file").sha256" )
echo "backup written: $file"
