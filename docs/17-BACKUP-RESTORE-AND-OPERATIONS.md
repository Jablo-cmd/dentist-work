# 17 — Backup, Restore and Operations

Status: **Database backup/restore tooling implemented and drilled locally** (`ops/`). **Not provisioned:** scheduling, off-site storage, object-storage backup, monitoring, alerting, on-call. Hosting, RPO/RTO and retention are open client decisions (Q18, Q19, Q20) — nothing here is a service-level commitment.

## What exists

| Script                           | Purpose                                                                                                                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ops/backup.sh <dir>`            | `pg_dump` (custom format, compressed) + SHA-256 manifest. Optional AES-256 encryption with `BACKUP_PASSPHRASE_FILE`.                                                              |
| `ops/restore.sh <file> <new-db>` | Verifies the checksum, restores into a **new, empty** database (refuses if it exists), then verifies migrations, tables and integrity triggers are present. Never drops anything. |
| `ops/restore-drill.sh`           | Backup → restore into a scratch database → compare row counts for every table → remove the scratch database. Non-zero exit on any difference.                                     |

```bash
DATABASE_URL=postgresql://… ADMIN_DATABASE_URL=postgresql://admin@host/postgres ./ops/restore-drill.sh
```

**Drill evidence (developer machine, synthetic data):** backup → restore into a scratch database → row counts identical across all 31 tables; encrypted backups contain no plaintext markers and restore with the passphrase; a tampered backup is refused before any database is created; restore refuses an existing database. This is _not_ evidence for the production environment.

A backup is not a backup until a restore has been demonstrated: run the drill after setup, after schema changes, and on a regular schedule. Keep the output as pre-production evidence (docs/05).

## Not covered — must be designed before go-live

- **Object storage (imaging files)** is not in the database dump. Use provider-side versioning and cross-region/offline replication, and restore-test it. The database stores each file's SHA-256, which allows verifying restored files.
- **Point-in-time recovery** (WAL archiving / managed PITR) is the right tool for a low RPO; the logical dump is a baseline, not PITR.
- **Independent copy:** RAID or replicas are not backups (docs/07). Keep at least one copy outside the primary provider/account, immutable if possible, encrypted, with separate keys.
- **Secrets backup:** `MFA_ENCRYPTION_KEY` and storage credentials must be recoverable separately. Without `MFA_ENCRYPTION_KEY`, enrolled authenticators cannot be decrypted (users would re-enrol via admin reset).
- **Retention and deletion** of backups follows the retention policy (Q20, undefined).
- **Backups contain patient data:** treat them as production data (access control, encryption, audit, no developer laptops).

## Restore runbook (outline)

1. Declare the incident; identify the target recovery point.
2. Provision a clean PostgreSQL instance. Restore with `ops/restore.sh` into a new database; confirm the verification line.
3. Run `pnpm db:migrate` against it (applies any newer migrations; never `migrate reset`).
4. Restore object storage to the matching point; spot-check files against stored SHA-256 values.
5. Point a staging API at the restored copy; verify sign-in, a patient record, a finalised note, an invoice and an audit event before switching production traffic.
6. Record what was lost (data between recovery point and incident) for the Information Officer; follow the breach/incident process if personal information was affected (POPIA — client-defined, Q21).

## Monitoring (proposed, not built)

Liveness/readiness endpoints exist (`/api/v1/health`, `/health/ready`). Needed: uptime probes, database/storage alerts, error-rate alerts from the structured logs (`requestId` correlation), disk/backup-age alerts, certificate expiry, dependency-vulnerability alerts, and audit-event anomaly review (repeated denials/failed sign-ins).
