# 12 — Database and Migrations

Status: **Implemented**. Seven migrations; all verified from an empty database in CI (`db:migrate` + `db:validate` drift check).

## Schema overview

| Migration             | Tables                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `init_foundation`     | `organisations`, `practices`, `users`, `user_role_assignments`, `sessions`, `audit_events`                                                       |
| `user_password_flags` | forced-change and password-changed columns                                                                                                       |
| `patients`            | `patients`, `patient_practices`, `patient_contacts`, `patient_revisions`, `medical_history_entries`, `allergies`, `patient_duplicate_flags`      |
| `appointments`        | `appointments`, `appointment_events`                                                                                                             |
| `clinical`            | `clinical_encounters`, `clinical_note_versions`, `dental_chart_entries`, `treatment_plans`, `treatment_plan_items`, `treatment_plan_item_events` |
| `imaging`             | `imaging_assets` (metadata only; binaries are in object storage)                                                                                 |
| `billing`             | `invoice_sequences`, `invoices`, `invoice_lines`, `payments`, `payment_allocations`                                                              |

Conventions: UUID keys (`gen_random_uuid()`), `timestamptz` (UTC), money `NUMERIC(12,2)`, foreign keys `RESTRICT`, deactivate-not-delete.

## Integrity enforced by the database itself (independent of the API)

- **Append-only:** `audit_events`, `appointment_events`, `clinical_note_versions`, `treatment_plan_item_events`, `payment_allocations`, `imaging_assets`.
- **Append-only except resolution:** `medical_history_entries`, `allergies`, `dental_chart_entries`.
- **Lifecycle locks:** finalised clinical encounters cannot revert, change identity, be deleted or receive draft versions; posted/cancelled invoices and their lines cannot change; invoices and payments cannot be deleted; payment amount/identity is fixed and a payment can only go `RECORDED → REVERSED`.
- **No double-booking:** exclusion constraints on practitioner and on patient for live appointments (`btree_gist`), safe under concurrent requests.
- **Financial guards (row-locked, race-safe):** credit notes cannot exceed the invoice total; allocations cannot exceed the payment or the invoice's outstanding balance; allocation only to posted invoices of the same patient/practice.
- **Shape checks:** lower-case email, practice code format, FDI tooth numbers, positive amounts, `total = subtotal + tax`, accepted MIME types, SHA-256 format, date-of-birth range.

## Workflow

- Change `apps/api/prisma/schema.prisma`; run `prisma migrate dev --create-only` locally; append hand-written SQL (constraints, triggers) to the generated file; declare matching relations in the schema (the drift check enforces that schema and migrations agree).
- Deploy with `pnpm db:migrate` (`prisma migrate deploy`) — applies committed migrations only.
- **Never** run `migrate dev`, `migrate reset` or `db push` against shared or production databases. (Prisma itself refuses `reset` without explicit user consent; do not bypass that.)
- Do not edit a migration after it has been applied anywhere.

## Rollback strategy

Forward-only and additive (expand → migrate data → contract in a later release). Before each production migration: verified backup with point-in-time recovery, apply in staging first, prepare a reviewed corrective forward migration. Destructive changes need a two-step release and sign-off. Restore from backup is the last resort. Because many tables are protected by immutability triggers, data-correcting migrations must temporarily and explicitly manage those triggers inside the migration and be reviewed as security-sensitive.

## Production requirements (not provisioned — awaiting Q18/Q19/Q20)

- Run the API as a role without `UPDATE/DELETE/TRUNCATE` on append-only tables (triggers are the second line of defence); migrations run as a separate owner role.
- Encryption at rest, TLS to the database, automated backups with restore tests, agreed RPO/RTO.
- Object storage: private bucket, provider-side encryption, versioning/backup, lifecycle rules. The API never issues pre-signed URLs; every download goes through an authorised, audited API request.
- Retention and deletion rules (Q20) are undefined: **nothing is deleted** — assets, clinical records, financial records and audit events are retained indefinitely until a policy exists.
- Row-level security is not enabled; practice isolation is enforced in the API (and covered by tests).
