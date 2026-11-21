# 09 — Local Development

Status: **Implemented and verified** (commands below were executed during the foundation delivery).

## Prerequisites

Node.js ≥ 22 (`.nvmrc`), pnpm 10 (`corepack enable`), PostgreSQL 16 (Docker Compose provided, or a local install).

## First-time setup

```bash
pnpm install
docker compose up -d postgres        # or use a local PostgreSQL 16
cp .env.example apps/api/.env        # edit if needed; never commit .env files
cp .env.example apps/web/.env.local  # only API_INTERNAL_URL is used by web
```

Create the test and shadow databases once (used by integration tests and migration validation):

```bash
docker compose exec postgres psql -U dpms -c 'CREATE DATABASE dpms_test' -c 'CREATE DATABASE dpms_shadow'
```

Apply migrations and create the first Organisation Owner (password is read from an environment variable, never an argument):

```bash
pnpm db:migrate
pnpm --filter @dpms/api build
DPMS_BOOTSTRAP_PASSWORD='<choose-a-12+-char-password>' \
  pnpm --filter @dpms/api admin:bootstrap "Nexus Dental" owner@example.com "Owner Name"
```

The command refuses to run once any user exists.

## Run

```bash
pnpm dev:api   # http://localhost:4000  (Swagger UI: /api/docs, dev only)
pnpm dev:web   # http://localhost:3000
```

The web app proxies `/api/*` to `API_INTERNAL_URL`.

## Optional: local object storage for imaging

Imaging needs an S3-compatible bucket. Any private bucket works (e.g. MinIO via Docker). Set the `STORAGE_*` variables in `apps/api/.env` (docs/10). Without them the rest of the system works and imaging reports "not configured". Automated tests use an in-process S3-compatible test server (`s3rver`), so no external service is needed to run them.

## Quality commands

| Command                             | Purpose                                                                                                  |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                         | ESLint, zero warnings allowed                                                                            |
| `pnpm format:check` / `pnpm format` | Prettier                                                                                                 |
| `pnpm typecheck`                    | Strict TypeScript, all packages                                                                          |
| `pnpm test`                         | Unit tests (contracts, api, web) — no database needed                                                    |
| `pnpm test:integration`             | API against real PostgreSQL (`TEST_DATABASE_URL`, default `dpms_test`; migrations must be applied to it) |
| `pnpm db:validate`                  | Migrations vs schema drift check (needs `SHADOW_DATABASE_URL`)                                           |
| `pnpm test:e2e`                     | Browser end-to-end + accessibility (needs the `dpms_e2e` database and built apps; see docs/14)           |
| `pnpm build`                        | Production builds                                                                                        |
| `pnpm audit:deps`                   | Production dependency vulnerability audit                                                                |

Test database setup: `DATABASE_URL=<test db url> pnpm db:migrate`.

## Data rules

Use synthetic data only. Never load real patient data into a development database.
