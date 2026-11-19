#!/usr/bin/env bash
# Proves that backups are restorable: back up, restore into a scratch database, compare row counts
# table by table, then remove the scratch database. Run it regularly (and after every schema change).
#
#   DATABASE_URL=… ADMIN_DATABASE_URL=… ./ops/restore-drill.sh
#
# Exits non-zero if any table differs. Evidence of a successful drill is a pre-production gate (docs/05).
set -euo pipefail
: "${DATABASE_URL:?}"; : "${ADMIN_DATABASE_URL:?}"
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
scratch="dpms_restore_drill_$(date +%s)"
src="${DATABASE_URL%%\?*}"; admin="${ADMIN_DATABASE_URL%%\?*}"; base="${admin%/*}"

started=$(date +%s)
"$here/backup.sh" "$work" >/dev/null
backup="$(ls "$work"/*.dump* | grep -v sha256 | head -1)"
"$here/restore.sh" "$backup" "$scratch"

count_all() { # prints "table count" for every public table, sorted
  psql "$1" -Atc "select tablename from pg_tables where schemaname='public' order by 1" | while read -r t; do
    printf '%s %s\n' "$t" "$(psql "$1" -Atc "select count(*) from \"$t\"")"
  done
}
count_all "$src" > "$work/source.counts"
count_all "$base/$scratch" > "$work/restored.counts"
status=0
if diff -u "$work/source.counts" "$work/restored.counts"; then
  echo "row counts identical across $(wc -l < "$work/source.counts") tables"
else
  echo "DRILL FAILED: restored data differs from source" >&2; status=1
fi
psql "$admin" -qc "drop database \"$scratch\"" # only the scratch database this script created
echo "drill finished in $(( $(date +%s) - started ))s (status=$status)"
exit $status
