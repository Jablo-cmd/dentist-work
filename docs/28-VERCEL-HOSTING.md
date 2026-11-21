# 28 — Vercel + Supabase hosting: first (London) test environment — SUPERSEDED by docs/29

**Status: this London environment is paused and superseded by the Ireland environment in docs/29. It held synthetic data only.** Not production. No real patient data may be loaded
(see docs/22 and docs/25). Vercel Hobby is for non-commercial use; a client deployment needs a paid plan.

## Topology

| Part            | Where                                                                                                            | Notes                                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Web (Next.js)   | Vercel project `nexus-dpms-web` (root `apps/web`)                                                                | Same-origin `/api/*` proxy to the API; sends the protection-bypass secret server-side                                                 |
| API (NestJS)    | Vercel project `nexus-dpms-api` (root `apps/api`) as one Vercel Function (`api/index.js` → `dist/serverless.js`) | Built with `nest build`; migrations run in the build                                                                                  |
| Database        | Supabase project `noordwyk-dps-demo`, region `eu-west-2` (London)                                                | No South African region is offered by the tooling used; fine for synthetic data, **not** for real data (residency, docs/25 D-HOSTING) |
| Files / imaging | **Not configured**                                                                                               | Uploads stay quarantined (fail closed); no scanner or storage is attached                                                             |

Deployments are **preview** deployments of branch `claude/dpms-gap-remediation` (nothing is merged to `main`).
Vercel Authentication ("all except custom domains") protects every `*.vercel.app` URL, so only signed-in team
members can open them. The API is reached from the web tier with an automation-bypass secret.

## Database roles

`dpms_owner` runs migrations at build time (`prisma migrate deploy` via `MIGRATE_DATABASE_URL`, Supavisor
session mode). `dpms_app` is the runtime role with the least-privilege grants of `ops/db-roles.sql` (no
TRUNCATE; append-only history tables cannot be updated or deleted). Grants must be re-applied after any
migration that adds a table (`ops/verify-db-roles.sh` enforces this in CI).

## Environment variables (names only; values live in Vercel as sensitive variables)

API: `NODE_ENV=production`, `DATABASE_URL`, `MIGRATE_DATABASE_URL`, `MFA_ENCRYPTION_KEY`, `WEB_ORIGINS`,
`TRUST_PROXY_HOPS=2` (Vercel edge → web function → API edge; verify via the audit trail's recorded IP),
`LOG_LEVEL`. Web: `API_INTERNAL_URL`, `API_PROTECTION_BYPASS`.
Production defaults apply: MFA is required for the roles in `RECOMMENDED_MFA_ROLES`.

## Known limits

Cold starts; no background jobs (scan retries); no object storage or clamd; London region; Hobby plan terms;
shared preview URL depends on the branch alias (update `WEB_ORIGINS`/`API_INTERNAL_URL` if it changes).

## Live addresses (protected: Vercel Authentication, team members only)

- Web: `https://nexus-dpms-web-git-claude-dpms-gap-remediation-auris-nexus.vercel.app`
  (use this host; `WEB_ORIGINS` on the API allows exactly this origin for the CSRF check)
- API: `https://nexus-dpms-api-git-claude-dpms-gap-remediation-auris-nexus.vercel.app` (reached only by the web tier)
- Database: Supabase project `noordwyk-dps-demo` (`jxhulvieejxdvaoyuxsm`, eu-west-2)

## What was verified on 2026-11-20 (and what was not)

Verified: build and `prisma migrate deploy` succeed on Vercel; `/api/v1/health/ready` returns `database: up`
through the web proxy (so web → protected API → Supabase works with the least-privilege role); security
headers present; sign-in page renders with the brand and punchline; the database has 31 tables, no grants for
Supabase's public API roles, and the app role cannot update/delete/truncate the audit table.
**Not verified:** a real browser sign-in (POST), MFA enrolment, `TRUST_PROXY_HOPS=2` accuracy (check that the
audit event's recorded IP is the client's), imaging (no storage/scanner), cold-start behaviour under load.

## Bootstrap account

One Organisation Owner (`owner@nexus-demo.invalid`) was created directly in SQL with a generated password and
`mustChangePassword = true`; production MFA policy then forces authenticator enrolment at first sign-in.
No other users, practices or patients exist. Rotate or delete this account before any shared use.

## Operational notes

- First deployment of each project was a _production_-targeted deployment; later pushes are previews. Build
  concurrency on Hobby is 1, so web and API builds queue.
- The API build needs `MIGRATE_DATABASE_URL` (owner, Supavisor session mode, port 5432); runtime uses
  `DATABASE_URL` (app role, transaction mode, port 6543, `pgbouncer=true`).
- Re-apply `ops/db-roles.sql`-equivalent grants after any migration that adds a table.

## Naming note

The product was renamed to **Nexus Dental Practice Management System**. Vercel projects were renamed
(`nexus-dpms-web`, `nexus-dpms-api`) and the web/API address settings updated to match. The Supabase project is still
named `noordwyk-dps-demo` (its name cannot be changed with the tooling used here; rename it in the Supabase dashboard).
