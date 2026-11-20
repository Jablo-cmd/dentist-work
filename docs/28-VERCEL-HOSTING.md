# 28 — Vercel + Supabase demo hosting

**Status: demo / staging with synthetic data only.** Not production. No real patient data may be loaded
(see docs/22 and docs/25). Vercel Hobby is for non-commercial use; a client deployment needs a paid plan.

## Topology

| Part            | Where                                                                                                              | Notes                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Web (Next.js)   | Vercel project `noordwyk-dps-web` (root `apps/web`)                                                                | Same-origin `/api/*` proxy to the API; sends the protection-bypass secret server-side                                                 |
| API (NestJS)    | Vercel project `noordwyk-dps-api` (root `apps/api`) as one Vercel Function (`api/index.js` → `dist/serverless.js`) | Built with `nest build`; migrations run in the build                                                                                  |
| Database        | Supabase project `noordwyk-dps-demo`, region `eu-west-2` (London)                                                  | No South African region is offered by the tooling used; fine for synthetic data, **not** for real data (residency, docs/25 D-HOSTING) |
| Files / imaging | **Not configured**                                                                                                 | Uploads stay quarantined (fail closed); no scanner or storage is attached                                                             |

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
