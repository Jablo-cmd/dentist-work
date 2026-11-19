# 12 — Database and Migrations

Status: **Implemented** (foundation schema). Clinical, patient, imaging and billing tables are **not yet modelled**.

## Schema (migration `20261119140551_init_foundation`)

`organisations`, `practices`, `users`, `user_role_assignments`, `sessions`, `audit_events`.

- UUID primary keys (`gen_random_uuid()`), `timestamptz` timestamps (UTC), foreign keys with `RESTRICT` (no cascading deletes of business records; assignments/sessions cascade from users).
- Practices unique per organisation on `code` and `name`. Role assignment with `practiceId = NULL` means organisation-wide; a partial unique index prevents duplicate org-wide grants.
- CHECK constraints: lower-case email, practice code format, non-negative failed-login count.
- `audit_events`: indexed by time, actor, action and organisation; **UPDATE/DELETE blocked by trigger**.
- Users and practices are deactivated (`isActive`), never deleted.

## Workflow

- Change `apps/api/prisma/schema.prisma`, then `pnpm db:migrate:dev` (local only) to create a migration. Hand-written SQL (constraints, triggers, partial indexes) is appended to the generated migration file and reviewed in the PR.
- Deploy with `pnpm db:migrate` (`prisma migrate deploy`) — applies committed migrations only, never resets.
- CI applies all migrations to an empty database and runs `pnpm db:validate` (fails on schema/migration drift).
- **Never** run `migrate dev`, `migrate reset` or `db push` against shared/production databases.

## Rollback strategy

Prisma has no automatic down-migrations. Policy: migrations are _forward-only and additive_ (expand → migrate data → contract in a later release). Before each production migration: take and verify a backup (point-in-time recovery enabled), apply in staging first, and prepare a reviewed corrective forward migration. Destructive changes (drop/rename) require a two-step release and explicit sign-off. Restore from backup is the last resort.

## Production requirements (not yet provisioned — awaiting Q18/Q19)

- Run the API as a role with `INSERT/SELECT` on `audit_events` only (no UPDATE/DELETE/TRUNCATE); run migrations with a separate owner role.
- Encryption at rest, TLS to the database, automated backups with restore tests, agreed RPO/RTO.
- Retention/deletion rules per Q20 (not yet defined; nothing is auto-deleted today, including audit events and expired sessions — a session purge job is **planned**).
- PostgreSQL row-level security was considered (docs/04) and is **not** enabled; practice isolation is enforced in the API. Revisit after connection/session design for RLS is tested.
