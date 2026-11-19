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

A manual browser walkthrough (Playwright) covering sign-in, staff, patient registration, medical history, clinical notes/amendment, chart, treatment plan, imaging upload, appointment booking/check-in, invoicing, payment/reversal, reports, forced password change and role-based navigation was executed against the live stack with no console errors. **That script is not committed as an automated suite**; a committed browser e2e suite in CI remains to do. Not yet covered: load/performance, backup/restore, security testing beyond the above.
