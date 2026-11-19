# 11 — API Conventions

Status: **Implemented** for every endpoint listed below. Anything not listed does not exist.

- Base path `/api/v1` (URI versioning). JSON, except multipart for imaging upload and binary for downloads. JSON bodies ≤ 100 KB.
- Contracts live in `packages/contracts`; the API validates input with them and the web client validates responses with them.
- Identifiers are UUIDs; instants are ISO-8601 UTC; dates are `YYYY-MM-DD`. **Money and quantities are decimal strings** (`"150.00"`), never floats.
- Error envelope for every non-2xx: `{ "error": { "code", "message", "requestId", "issues?" } }`. Codes: `packages/contracts/src/common.ts`. 401/403/404/5xx messages are fixed and generic; authored 400/409 messages (e.g. "That practitioner is already booked") are passed through. Malformed or oversized bodies return 400/413 in the same envelope.
- `X-Request-Id`: accepted if `[A-Za-z0-9-]{8,64}`, otherwise generated; always echoed and logged.
- Pagination: `?page=1&pageSize=25` (max 100) → `{ data, meta: { page, pageSize, total, totalPages } }`.
- All responses carry `Cache-Control: no-store`.
- State-changing requests need an allow-listed `Origin` (CSRF defence). Out-of-scope resources return `404` (indistinguishable from missing) and are audited.
- Retry safety: `POST /patients/:id/payments` **requires** an `Idempotency-Key` header (16–100 URL-safe chars). Same key + same body returns the original (`200`, `Idempotent-Replay: true`); same key + different body returns `409`.
- OpenAPI: `/api/docs` and `/api/docs/openapi.json` (non-production); `pnpm --filter @dpms/api openapi:export`.

## Endpoints

Permission names are in `packages/contracts/src/access.ts`; role mapping in `apps/api/src/access/permissions.ts`.

| Area            | Endpoints                                                                                                                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health (public) | `GET /health`, `GET /health/ready` (503 when the database is down; storage reported informationally)                                                                                                                                            |
| Auth            | `POST /auth/login` (public, 10/min/IP), `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password`                                                                                                                                       |
| Practices       | `GET /practices`, `GET /practices/:id`, `POST /practices`, `PATCH /practices/:id`                                                                                                                                                               |
| Users           | `GET /users`, `POST /users`, `PATCH /users/:id`, `POST /users/:id/assignments`, `DELETE /users/:id/assignments/:aid`, `POST /users/:id/reset-password`                                                                                          |
| Audit           | `GET /audit-events`                                                                                                                                                                                                                             |
| Patients        | `POST /patients`, `GET /patients?q=&dateOfBirth=`, `GET/PATCH /patients/:id`, `GET /patients/:id/revisions`, `POST /patients/:id/practices` (explicit cross-practice link), `POST/DELETE /patients/:id/contacts…`                               |
| Duplicates      | `GET /patients/duplicates`, `POST /patients/duplicates/:id/review`                                                                                                                                                                              |
| Medical history | `GET/POST /patients/:id/medical-history`, `POST /patients/:id/allergies`, `POST …/medical-history/:id/resolve`, `POST …/allergies/:id/resolve`                                                                                                  |
| Appointments    | `GET /appointments?from&to`, `GET /appointments/practitioners`, `POST /appointments`, `GET /appointments/:id`, `…/history`, `POST …/reschedule`, `…/cancel`, `…/status`                                                                         |
| Clinical        | `POST/GET /patients/:id/encounters`, `GET /encounters/:id`, `PUT …/draft`, `POST …/finalise`, `…/amendments`, `…/addenda`                                                                                                                       |
| Dental chart    | `GET/POST /patients/:id/chart`, `POST …/chart/:id/resolve`                                                                                                                                                                                      |
| Treatment plans | `GET/POST /patients/:id/treatment-plans`, `GET /treatment-plans/:id`, `POST …/items`, `POST /treatment-plans/items/:id/status`                                                                                                                  |
| Imaging         | `POST /patients/:id/imaging` (multipart), `GET /patients/:id/imaging`, `GET /imaging/:id`, `GET /imaging/:id/file`                                                                                                                              |
| Billing         | `POST/GET /patients/:id/invoices`, `GET /patients/:id/account`, `GET /invoices/:id`, `PUT …/lines`, `POST …/post`, `…/discard`, `…/credit-notes`; `POST /patients/:id/payments`, `POST /payments/:id/allocations`, `POST /payments/:id/reverse` |
| Reports         | `GET /reports/financial-summary`, `GET /reports/operational-summary` (`from`, `to`, optional `practiceId`; max 366 days)                                                                                                                        |
