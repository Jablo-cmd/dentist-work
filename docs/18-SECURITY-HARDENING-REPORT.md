# 18 — Security Hardening Report

Branch: `claude/dpms-gap-remediation` (baseline `main` @ `e8e6f4c`).
Scope: verification of audit findings against the real code, fixes, and what remains.
This is an engineering report. It is **not** a penetration test, a POPIA certification or an
independent security assessment. No real patient data was used at any point.

Status vocabulary: RESOLVED, PARTIALLY RESOLVED, BLOCKED, NOT IMPLEMENTED, NOT APPLICABLE.

## 1. Findings

| ID   | Finding (verified against code)                                                                                        | Severity          | Status                                     | Fix / evidence                                                                                                                                                                                                                                                                                                         |
| ---- | ---------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-01 | README said MFA "enforced"; in production the default policy was empty, so nothing was enforced                        | High              | RESOLVED                                   | `apps/api/src/config/env.ts` (`MFA_REQUIRED_ROLES`, `RECOMMENDED_MFA_ROLES`, `MFA_ALLOW_UNENFORCED`); production refuses to boot with an empty policy unless explicitly overridden. Tests: `config/env.spec.ts`, `test/mfa-policy.int-spec.ts`                                                                         |
| S-02 | A user whose role requires MFA could switch MFA off                                                                    | Medium            | RESOLVED                                   | `auth/mfa.service.ts` disable guard; test "does not allow a user whose role requires MFA to switch it off"                                                                                                                                                                                                             |
| S-03 | Sessions opened with the password alone survived MFA enrolment                                                         | Medium            | RESOLVED                                   | Sessions other than the enrolling one are revoked on enrolment; test "revokes sessions opened with the password alone…"                                                                                                                                                                                                |
| S-04 | Recovery-code spend and its audit record were not atomic                                                               | Medium            | RESOLVED                                   | Single transaction, fails closed; test "fails closed: if the audit record cannot be written the recovery code is NOT consumed…"                                                                                                                                                                                        |
| S-05 | Uploaded imaging had no malware workflow                                                                               | High              | RESOLVED (code) / BLOCKED (infrastructure) | Quarantine-by-default; `ScanStatus` enum + migration `20261119170000_malware_scanning`; `scanner/*`; downloads refused unless `CLEAN`; scanner outage fails closed. Tests: `clamd-scanner.spec.ts`, `imaging-scan.int-spec.ts`, `imaging-no-scanner.int-spec.ts`. A real clamd must be deployed and monitored — see §3 |
| S-06 | `q` search used `ILIKE` with unescaped user input, so `%`/`_` enumerated records                                       | Medium            | RESOLVED                                   | `common/like.ts` `escapeLike`; applied in patients, audit, import. Tests: `like.spec.ts`, `test/authz-matrix.int-spec.ts`                                                                                                                                                                                              |
| S-07 | `appointments/practitioners` accepted a practice ID from another organisation                                          | Low               | RESOLVED                                   | Practice-in-organisation check in `appointments.service.ts`; matrix test                                                                                                                                                                                                                                               |
| S-08 | Report audit records could carry a foreign `practiceId`                                                                | Low               | RESOLVED                                   | `billing/reports.service.ts`; matrix test                                                                                                                                                                                                                                                                              |
| S-09 | Web proxy accepted dot-segment/encoded traversal in the forwarded path (deployment-dependent)                          | Medium            | RESOLVED                                   | `apps/web/src/lib/proxy-target.ts` `safeTarget`; route returns 404. Tests: `route.test.ts`                                                                                                                                                                                                                             |
| S-10 | `TRUST_PROXY_HOPS` defaulted to trusting nothing in production, so client IPs (rate limit, audit) would be the proxy's | Medium            | RESOLVED                                   | Required in production, defaults to 0 elsewhere; `env.spec.ts`                                                                                                                                                                                                                                                         |
| S-11 | No systematic authorisation test                                                                                       | Medium            | RESOLVED                                   | `test/authz-matrix.int-spec.ts` walks every route: unauthenticated, wrong role, wrong practice, wrong organisation                                                                                                                                                                                                     |
| S-12 | Application connected to PostgreSQL with a role able to `TRUNCATE` / bypass append-only intent                         | Medium            | RESOLVED (code, CI) / BLOCKED (production) | `ops/db-roles.sql`, `ops/verify-db-roles.sh`; CI runs the full integration suite as the restricted role (177 tests passing). Production provisioning must be done and verified by the operator                                                                                                                         |
| S-13 | Log redaction not asserted                                                                                             | Low               | RESOLVED                                   | `common/logging.ts` `buildPinoHttpOptions`; `logging.spec.ts`                                                                                                                                                                                                                                                          |
| S-14 | Cookie flags not asserted end to end                                                                                   | Low               | RESOLVED                                   | `test/cookies.int-spec.ts`                                                                                                                                                                                                                                                                                             |
| S-15 | No guard against `dangerouslySetInnerHTML` / raw SQL creeping in                                                       | Low               | RESOLVED                                   | `web/src/lib/xss-guard.test.ts`; raw-SQL guard in `auth/auth-surface.spec.ts`                                                                                                                                                                                                                                          |
| S-16 | Dev-tooling dependency advisories (14)                                                                                 | Low (not shipped) | PARTIALLY RESOLVED                         | vitest → 4.x, @nestjs/cli upgraded. 4 remain, all in `apps/api > s3rver` (test-only S3 emulator: `dicer` high, `fast-xml-parser` ×3). Production audit (`pnpm audit:deps`, CI gate) is clean. Accepted risk, bound to test processes on localhost; revisit by replacing s3rver                                         |
| S-17 | MFA secrets encrypted with a single key, no rotation                                                                   | Medium            | NOT IMPLEMENTED                            | Documented limitation. Rotating `MFA_ENCRYPTION_KEY` currently invalidates enrolments (users re-enrol). A key-id prefix + re-encrypt job is the proposed work                                                                                                                                                          |
| S-18 | Secret scan                                                                                                            | —                 | RESOLVED                                   | Scan of tracked files found no credentials or real patient data                                                                                                                                                                                                                                                        |

## 2. Row-level security (RLS) evaluation

**Recommendation: do not enable PostgreSQL RLS in this release.**

Reasons:

- Authorisation is enforced in the application (guards plus practice-scoped queries) and verified
  by the matrix test. RLS would be a second layer, not a replacement.
- It needs a per-request database context (`SET LOCAL app.user_id`, `app.practice_ids`) inside
  every transaction. With Prisma and connection pooling (PgBouncer in transaction mode) this means
  wrapping every query in an interactive transaction or using a client extension; a missed path
  silently returns zero rows or, with a permissive fallback, everything.
- Audit and background paths (scanner, import, reports) would need a separate bypass role,
  which becomes the new high-value credential.

Migration plan if the client wants defence in depth later: (1) add `practice_id` to every
clinical table that lacks it; (2) a Prisma client extension setting the context per request;
(3) policies in shadow mode (log only) → enforce on one table (`patient`) → extend; (4) run the
whole integration suite as the non-owner role (already in CI); (5) rollback by `ALTER TABLE … DISABLE ROW LEVEL SECURITY`.
Pooling note: use session variables with `SET LOCAL` only; never session-level `SET` behind a pooler.

## 3. Encryption at rest and key management — deployment checklist

The application does **not** encrypt the database or object storage itself, apart from MFA
secrets (AES-256-GCM). The following must be true in the deployed environment and evidenced
before real data is loaded. None of it is verifiable from this repository.

| Item                                                                                                                     | Evidence required                         | Status                    |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ------------------------- |
| PostgreSQL volume encrypted at rest (disk/KMS)                                                                           | Provider console screenshot or IaC output | BLOCKED (no environment)  |
| Backups encrypted, key held separately from the data                                                                     | Backup job config, restore with the key   | BLOCKED                   |
| Object storage (imaging) server-side encryption enabled                                                                  | Bucket policy / encryption config         | BLOCKED                   |
| TLS at the edge, HSTS, TLS ≥ 1.2                                                                                         | Scan of the live host                     | BLOCKED                   |
| `MFA_ENCRYPTION_KEY` and DB credentials in a secrets manager, not in images or env files in git                          | Secrets-manager reference                 | BLOCKED                   |
| Key custody, rotation schedule, and break-glass owner named                                                              | Signed-off runbook                        | BLOCKED (client decision) |
| clamd deployed, signatures updating, health endpoint monitored                                                           | `/health` scanner status, alert rule      | BLOCKED                   |
| Least-privilege DB role created and `ops/verify-db-roles.sh` passing against production                                  | Script output                             | BLOCKED                   |
| Proxy overwrites/appends `X-Forwarded-For`; `TRUST_PROXY_HOPS` matches topology; web server not directly internet-facing | Network diagram + test                    | BLOCKED                   |

## 4. Residual risks and limits

- Authorisation correctness is demonstrated by tests against synthetic data only.
- The matrix discovers the route inventory automatically, so new routes are swept for unauthenticated/forbidden access; resource-level (wrong practice/organisation) cases for new resources still need explicit fixtures.
- Automated accessibility checks do not replace manual screen-reader testing.
- No external penetration test has been performed.
- ClamAV detects known signatures only; it is not a guarantee a file is safe.

## 5. Decisions needed from the client

MFA role policy (which roles, any exceptions); hosting region and key custody; malware-scanner
operating model; acceptance of the s3rver test-tooling advisories. Tracked in
`docs/25-CLIENT-DECISION-REGISTER.md`.
