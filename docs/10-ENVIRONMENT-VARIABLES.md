# 10 — Environment Variables

Status: **Implemented.** The API validates its environment at startup (`apps/api/src/config/env.ts`) and exits with a list of invalid variable names (never values). Secrets are supplied by the environment/secret manager, never committed (`.env*` is git-ignored except `.env.example`).

## API

| Variable                       | Default                            | Notes                                                                                                                 |
| ------------------------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                     | `development`                      | `production` enforces the rules marked ★                                                                              |
| `API_PORT`                     | `4000`                             |                                                                                                                       |
| `WEB_ORIGINS`                  | required                           | Comma-separated browser origins for CORS and CSRF origin checks. ★ must be `https://` in production                   |
| `DATABASE_URL`                 | required                           | `postgresql://…`. Secret.                                                                                             |
| `LOG_LEVEL`                    | `info`                             | `silent` … `trace`                                                                                                    |
| `SESSION_TTL_MINUTES`          | `480`                              | Absolute session lifetime                                                                                             |
| `SESSION_IDLE_TIMEOUT_MINUTES` | `60`                               | Must not exceed TTL                                                                                                   |
| `COOKIE_SECURE`                | `true` in production, else `false` | ★ must be `true` in production; enables `__Host-` cookie prefix                                                       |
| `LOGIN_MAX_FAILED_ATTEMPTS`    | `5`                                | Then account is locked                                                                                                |
| `LOGIN_LOCKOUT_MINUTES`        | `15`                               |                                                                                                                       |
| `RATE_LIMIT_PER_MINUTE`        | `120`                              | Per client IP, all routes except health                                                                               |
| `LOGIN_RATE_LIMIT_PER_MINUTE`  | `10`                               | Per client IP on `/auth/login`                                                                                        |
| `TRUST_PROXY_HOPS`             | `0`                                | Reverse-proxy hops to trust for client IP. Set correctly behind a load balancer, or rate limiting/audit IPs are wrong |
| `SWAGGER_ENABLED`              | on outside production              | ★ rejected if enabled in production                                                                                   |

### Object storage (imaging) — optional; leave all unset to disable imaging

| Variable                                                                                 | Default     | Notes                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STORAGE_BUCKET`, `STORAGE_REGION`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` | unset       | Must be set together or the API refuses to start. Secrets. Bucket must be **private** with provider encryption at rest. Region/provider are an open client decision (Q18). |
| `STORAGE_ENDPOINT`                                                                       | AWS default | For S3-compatible providers (MinIO, etc.). ★ must be `https://` in production                                                                                              |
| `STORAGE_FORCE_PATH_STYLE`                                                               | `false`     | Needed by some S3-compatible servers                                                                                                                                       |
| `IMAGING_MAX_BYTES`                                                                      | `25000000`  | Per-file upload limit (files are buffered in memory up to this size)                                                                                                       |

Without storage, upload endpoints return `503` and `/health/ready` reports `storage: not_configured` (informational; the API stays ready).

CLI-only: `DPMS_BOOTSTRAP_PASSWORD` (see docs/09). Import tool: see docs/16. Tests: `TEST_DATABASE_URL`, `SHADOW_DATABASE_URL` (migration validation).

## Web

| Variable           | Default                 | Notes                                                                  |
| ------------------ | ----------------------- | ---------------------------------------------------------------------- |
| `API_INTERNAL_URL` | `http://localhost:4000` | Used by the Next.js server to proxy `/api/*`; evaluated at build/start |
