# 11 — API Conventions

Status: **Implemented** for the endpoints below. Everything else in docs/04's resource map is **Proposed**.

- Base path `/api/v1` (URI versioning). JSON only; request bodies ≤ 100 KB.
- Contracts live in `packages/contracts`; the API validates input with them (`ZodValidationPipe`) and the web client validates responses with them.
- Identifiers are UUIDs; timestamps are ISO-8601 UTC.
- Error envelope for every non-2xx response: `{ "error": { "code", "message", "requestId", "issues?" } }`. Codes are enumerated in `packages/contracts/src/common.ts`. Messages are generic; no stack traces, SQL or internals.
- `X-Request-Id`: accepted if `[A-Za-z0-9-]{8,64}`, otherwise generated; always echoed. Logged with every request.
- Pagination: `?page=1&pageSize=25` (max 100) → `{ data: [], meta: { page, pageSize, total, totalPages } }`.
- All responses carry `Cache-Control: no-store`.
- OpenAPI: Swagger UI at `/api/docs`, JSON at `/api/docs/openapi.json` (non-production); `pnpm --filter @dpms/api openapi:export` prints it.

## Endpoints implemented

| Method & path        | Access                       | Purpose                                                            |
| -------------------- | ---------------------------- | ------------------------------------------------------------------ |
| `GET /health`        | public                       | Liveness (never touches the DB)                                    |
| `GET /health/ready`  | public                       | Readiness; `503` with `not_ready` when the database is unreachable |
| `POST /auth/login`   | public, 10/min/IP            | Start session (HttpOnly cookie)                                    |
| `POST /auth/logout`  | authenticated                | Revoke session                                                     |
| `GET /auth/me`       | authenticated                | Current user, assignments, effective permissions                   |
| `GET /practices`     | `practice.read`              | Practices in the caller's scope                                    |
| `GET /practices/:id` | `practice.read`              | One practice; out-of-scope returns 404 and is audited              |
| `POST /practices`    | `practice.manage` (org-wide) | Create practice (audited)                                          |
| `GET /audit-events`  | `audit.read` (org-wide)      | Paginated audit events (no metadata exposed)                       |

State-changing requests must carry an allow-listed `Origin` header (CSRF defence).
