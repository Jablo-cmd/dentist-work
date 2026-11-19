# 14 — Testing and Quality Controls

Status: **Implemented** for the foundation scope.

| Layer                | Tooling                            | Location                                                                                                                  | Needs                        |
| -------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Contracts            | Vitest                             | `packages/contracts/test`                                                                                                 | —                            |
| API unit             | Jest                               | `apps/api/src/**/*.spec.ts` (env validation, permission policy, hashing, error filter, request ids, integration registry) | —                            |
| API integration      | Jest + supertest, real PostgreSQL  | `apps/api/test/*.int-spec.ts`                                                                                             | PostgreSQL, migrated test DB |
| Web unit/component   | Vitest + Testing Library           | `apps/web/src/**/*.test.ts(x)`                                                                                            | —                            |
| Migration validation | `prisma migrate diff` vs shadow DB | `pnpm db:validate`                                                                                                        | PostgreSQL                   |

Counts at this delivery: contracts 7, API unit 51, API integration 140 (real PostgreSQL), web 11. MFA coverage includes RFC vectors, replay, brute-force limits, concurrent challenge use, encryption at rest, recovery codes, disable, admin reset and role enforcement.

Integration coverage includes: health/readiness (DB down → 503 without leaks; storage informational), security headers, CORS, CSRF, error envelopes (incl. malformed/oversized bodies), login/lockout/idle expiry/deactivation/forced password change, enumeration resistance, rate limiting; user-management privilege boundaries; patient isolation (IDOR), duplicate handling, audit contents (no personal data); appointment conflicts **including concurrent bookings**; clinical lifecycle locks (API and DB), amendments, concurrent draft saves, role denial; imaging against a real S3-compatible server (byte-for-byte round trip, content sniffing, duplicates, permission re-check); billing exactness, gap-free numbering under concurrency, idempotent payments (sequential and concurrent), over-allocation/over-credit races, reversals, reports; patient import dry-run/commit/re-run; and the database immutability triggers.

Defects found by these tests and fixed during development are recorded in the commit history (e.g. a practice-scope bypass, `PATCH` resetting `sex` through a schema default, impossible dates accepted, error messages being discarded).

CI (`.github/workflows/ci.yml`): lint → format → typecheck → unit → migrate from scratch → drift check → integration → build → dependency audit.

**Browser end-to-end and accessibility suite (committed, runs in CI):** `e2e/` (Playwright + axe-core) starts the real API, web app, PostgreSQL and an S3-compatible server on isolated ports/database with synthetic data. 30 tests: the full practice workflow (practice and staff set-up, registration, duplicate review, medical history, clinical note draft/finalise/amend, chart, treatment plan, imaging upload and authorised download, appointment booking and conflict protection, check-in, invoice/payment/reversal, reports, audit trail, forced password change, role-limited navigation), MFA enrolment/sign-in/recovery codes, automated WCAG 2.1 A/AA scans of every page (no serious or critical violations), a keyboard skip-link check, security headers, CSRF and unauthenticated access. Run locally with `pnpm test:e2e` (set `PW_CHROMIUM_PATH` to reuse an installed Chromium; the database `dpms_e2e` must exist and is wiped on every run).

Accessibility note: automated scans catch only part of the problems. **Manual keyboard and screen-reader testing, and review by users with access needs, remain to do.**

The e2e run found and fixed a real deployment defect: the web proxy used a build-time `rewrites()` destination and ignored `API_INTERNAL_URL` at runtime. It is now a runtime route handler.

Not yet covered: load/performance, and restore drills in an environment other than the developer machine.
