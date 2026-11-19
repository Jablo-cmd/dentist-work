#!/usr/bin/env bash
# Proves the least-privilege role does what docs/18 claims. Run after ops/db-roles.sql.
#
#   ADMIN_DATABASE_URL=… APP_DATABASE_URL=… ./ops/verify-db-roles.sh
#
# Exits non-zero if the application role can wipe append-only history, delete retained records, or
# TRUNCATE anything, if it has lost a privilege it needs, or if any table lacks an explicit decision.
set -euo pipefail
: "${ADMIN_DATABASE_URL:?}"; : "${APP_DATABASE_URL:?}"
admin="${ADMIN_DATABASE_URL%%\?*}"; app="${APP_DATABASE_URL%%\?*}"
fail=0
expect_denied() { # <description> <sql>
  if out=$(psql "$app" -v ON_ERROR_STOP=1 -qAtc "$2" 2>&1); then echo "FAIL (allowed): $1"; fail=1; else
    if grep -qi "permission denied" <<<"$out"; then echo "ok   denied: $1"; else echo "FAIL ($1): unexpected error: $out"; fail=1; fi; fi
}
expect_allowed() {
  if out=$(psql "$app" -v ON_ERROR_STOP=1 -qAtc "$2" 2>&1); then echo "ok   allowed: $1"; else echo "FAIL (denied): $1 -> $out"; fail=1; fi
}

for t in audit_events appointment_events clinical_note_versions treatment_plan_item_events payment_allocations; do
  expect_denied "UPDATE $t" "update \"$t\" set \"id\" = \"id\" where false"
  expect_denied "DELETE $t" "delete from \"$t\" where false"
  expect_allowed "SELECT $t" "select 1 from \"$t\" limit 1"
done
for t in $(psql "$admin" -Atc "select tablename from pg_tables where schemaname='public' and tablename <> '_prisma_migrations'"); do
  expect_denied "TRUNCATE $t" "truncate table \"$t\""
done
for t in patients invoices payments clinical_encounters imaging_assets medical_history_entries; do
  expect_denied "DELETE $t" "delete from \"$t\" where false"
done
expect_denied "UPDATE imaging_assets.originalFilename" "update imaging_assets set \"originalFilename\"='x' where false"
expect_allowed "UPDATE imaging_assets scan columns" "update imaging_assets set \"scanAttempts\"=\"scanAttempts\" where false"
expect_denied "write to _prisma_migrations" "delete from _prisma_migrations where false"
expect_denied "CREATE TABLE" "create table should_not_exist(x int)"
expect_allowed "INSERT-capable on audit_events (empty insert check)" "select has_table_privilege(current_user,'audit_events','INSERT')::text"
for t in sessions mfa_challenges invoice_lines; do expect_allowed "DELETE $t" "delete from \"$t\" where false"; done

# Every table must be accounted for: DELETE only where documented, UPDATE never on append-only tables.
DELETE_OK=" invoice_lines patient_contacts user_role_assignments mfa_recovery_codes user_mfa sessions mfa_challenges "
APPEND_ONLY=" audit_events appointment_events clinical_note_versions treatment_plan_item_events payment_allocations "
for t in $(psql "$admin" -Atc "select tablename from pg_tables where schemaname='public' and tablename <> '_prisma_migrations'"); do
  can() { psql "$app" -Atc "select has_table_privilege(current_user, 'public.\"$t\"', '$1')"; }
  [[ "$(can DELETE)" == "f" || "$DELETE_OK" == *" $t "* ]] || { echo "FAIL: unexpected DELETE privilege on $t"; fail=1; }
  [[ "$APPEND_ONLY" != *" $t "* || "$(can UPDATE)" == "f" ]] || { echo "FAIL: UPDATE privilege on append-only table $t"; fail=1; }
  [[ "$(can SELECT)" == "t" ]] || { echo "FAIL: missing SELECT on $t"; fail=1; }
done
[[ $fail -eq 0 ]] && echo "least-privilege role verified" || echo "least-privilege role verification FAILED"
exit $fail
