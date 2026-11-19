-- Least-privilege database role for the DPMS API (docs/18, docs/22).
--
-- Why: the append-only triggers stop UPDATE/DELETE on audit and clinical history, but a role that owns
-- a table (or has TRUNCATE) can still wipe it, and triggers do not fire for TRUNCATE. The application must
-- therefore connect as a role that CANNOT do those things. Migrations run as a separate owner role.
--
-- Usage (as the database owner / a superuser):
--   psql "$ADMIN_DATABASE_URL" -v app_role=dpms_app -v app_password="$(openssl rand -base64 32)" -f ops/db-roles.sql
--
-- MAINTENANCE RULE: every migration that adds a table must add its grants here (and in a CI-verified
-- way): ops/verify-db-roles.sh fails if a table has no explicit decision.
\set ON_ERROR_STOP on

-- (psql does not interpolate variables inside DO $$ blocks, hence \gexec.)
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', :'app_role', :'app_password')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_role') \gexec
SELECT format('ALTER ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', :'app_role', :'app_password')
 WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_role') \gexec

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO :"app_role";
GRANT CONNECT ON DATABASE :"dbname" TO :"app_role";

-- Start from nothing, then grant exactly what the application needs.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM :"app_role";
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO :"app_role";
REVOKE TRUNCATE, DELETE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM :"app_role";

-- Migration bookkeeping is owner-only.
REVOKE ALL ON "_prisma_migrations" FROM :"app_role";
GRANT SELECT ON "_prisma_migrations" TO :"app_role";

-- Append-only history: the application may add and read rows, never change or remove them.
REVOKE UPDATE ON "audit_events", "appointment_events", "clinical_note_versions",
                 "treatment_plan_item_events", "payment_allocations" FROM :"app_role";

-- Asset metadata is immutable except the scan result columns.
REVOKE UPDATE ON "imaging_assets" FROM :"app_role";
GRANT UPDATE ("scanStatus", "scannedAt", "scanEngine", "scanAttempts") ON "imaging_assets" TO :"app_role";

-- The only tables the application legitimately deletes from (draft invoice lines, removable contacts and
-- role grants, MFA material, expired sessions/challenges). Everything else is retained.
GRANT DELETE ON "invoice_lines", "patient_contacts", "user_role_assignments", "mfa_recovery_codes",
                "user_mfa", "sessions", "mfa_challenges" TO :"app_role";
