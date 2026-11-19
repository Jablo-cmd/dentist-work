# 22 — Production Operations Readiness

Status: **not production-ready.** Nothing has been deployed, no real patient data is enabled, and
all figures marked _recommended_ are proposals for client decision — **not client-approved RPO/RTO**.
Complements `docs/17-BACKUP-RESTORE-AND-OPERATIONS.md` (tooling and runbook outline).

## 1. Restore drill (fresh evidence)

| Item                 | Result                                                                    |
| -------------------- | ------------------------------------------------------------------------- |
| Date                 | 2026-11-19                                                                |
| Data                 | Synthetic only (integration-test dataset in a local `dpms_test` database) |
| Command              | `DATABASE_URL=… ADMIN_DATABASE_URL=… ./ops/restore-drill.sh`              |
| Checksum             | OK                                                                        |
| Restore verification | migrations=9, tables=31, integrity-triggers=14                            |
| Row counts           | identical across all 31 tables                                            |
| Duration             | 4 s (tiny dataset; **not** a measure of production RTO)                   |
| Exit status          | 0                                                                         |

This proves the tooling and schema restore correctly. It does not prove production backups run,
are off-site, are encrypted with separately held keys, or restore object storage.

## 2. Recommended targets (for client decision, D-RPO-RTO)

| Aspect           | Recommendation                                                                                | Basis                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| RPO              | ≤ 15 minutes with WAL archiving / managed PITR; a nightly logical dump alone gives up to 24 h | Clinical and financial records are entered during the day                                         |
| RTO              | 4 hours for a full restore to a clean instance                                                | Practice can fall back to paper for part of a day; needs client agreement (Q17 offline operation) |
| Backup frequency | Continuous WAL + daily full; daily object-storage versioning                                  |                                                                                                   |
| Retention        | Operational: 35 days; long-term follows legal retention (Q20, undefined)                      | Do not set before Q20                                                                             |
| Restore test     | Monthly drill + after every schema change; keep output as evidence                            |                                                                                                   |

## 3. Production checklist

| Area              | Requirement                                                                                                       | Status                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Hosting           | Provider and South African region approved (Q18)                                                                  | BLOCKED (client)            |
| Database          | Managed PostgreSQL 16, encrypted volume, PITR, `ops/db-roles.sql` applied, `ops/verify-db-roles.sh` passing       | NOT DONE                    |
| Object storage    | Private bucket, SSE, versioning, cross-account copy, restore test                                                 | NOT DONE                    |
| Malware scanning  | clamd running, signature updates, `/health` scanner state alerted                                                 | NOT DONE                    |
| Secrets           | Secrets manager; rotation owners and schedule; `MFA_ENCRYPTION_KEY` backed up separately                          | NOT DONE                    |
| MFA policy        | `MFA_REQUIRED_ROLES` set per client decision; production refuses to boot with it empty                            | Code DONE, decision BLOCKED |
| Monitoring        | Uptime on `/api/v1/health` and `/health/ready`; error-rate, DB, disk, backup-age, cert-expiry alerts              | NOT DONE                    |
| Logging           | Structured logs with request IDs and redaction exist; central aggregation and retention not set                   | PARTIAL                     |
| Incident response | Named responders, severity levels, breach decision tree, Information Officer contact (Q21)                        | NOT DONE                    |
| Deployment        | Migrations via `prisma migrate deploy` only (never `reset`); backup immediately before; documented rollback below | Procedure only              |
| Capacity          | Re-run `ops/load/run.mjs` against production-sized data (Q06)                                                     | NOT DONE                    |

## 4. Proxy topology (must match `TRUST_PROXY_HOPS`)

The API trusts `X-Forwarded-For` only for the configured number of hops; production refuses to
start without `TRUST_PROXY_HOPS`.

- The edge proxy/load balancer must **overwrite or append** `X-Forwarded-For`, never pass a client-supplied value through unchanged.
- Next.js (the web tier) must **not** be directly internet-facing: it keeps a client-supplied `x-forwarded-for`, which would then reach the API's rate limiter and audit log.
- Set `TRUST_PROXY_HOPS` to the number of proxies between the internet and the API (e.g. `1` for one load balancer in front of the web tier that forwards to the API with an appended header — verify by sending a spoofed header from outside and checking the audit record).
- Verification test to run after deployment: request with `X-Forwarded-For: 1.2.3.4` from an external host; the audit event must show the real client address, not `1.2.3.4`.

## 5. Secret rotation

| Secret               | Rotation today                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| DB credentials       | Rotate in secrets manager, restart API; no code change                                                      |
| Storage keys         | Same                                                                                                        |
| `MFA_ENCRYPTION_KEY` | **Not rotatable without re-enrolment** (no key-id/re-encrypt support). Documented limitation (docs/18 S-17) |
| Session tokens       | Server-side and hashed; rotated per login; admin can revoke all sessions for a user                         |

## 6. Deployment rollback

1. Back up before every deploy (`ops/backup.sh`).
2. Prefer **expand/contract** migrations: additive first, destructive in a later release, so the previous app version keeps working.
3. App rollback: redeploy the previous image; safe when the migration was additive.
4. Migration rollback: Prisma has no automatic down-migration. Each migration needs a written rollback (e.g. `20261119170000_malware_scanning`: drop the three added columns and revert the enum only if no row uses the new values; otherwise restore from backup). Restore-from-backup is the fallback of last resort and loses data after the backup.
5. Never run `prisma migrate reset` outside disposable databases.

## 7. Not decided / not built

Offline mode (Q17), reminders infrastructure (Q13), background job runner, multi-instance
deployment validation, formal availability target.
