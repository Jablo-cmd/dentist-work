# 21 — Quality and Performance Report

Date of measurement: 2026-11-19. Developer container, not production hardware.

## 1. Automated test inventory

See `docs/14-TESTING-AND-QUALITY.md` for the layers. Counts at the last full run on this branch:
API unit and integration (including a second integration pass as the least-privilege DB role, 177
passing before the validation suite was added), web, contracts, and Playwright e2e with axe. The
final gate run is recorded in the engineering report; counts are not duplicated here so they cannot go stale.

## 2. Load test

Tool: `ops/load/seed.cjs` (synthetic dataset: 5,000 patients, 2,000 appointments, 1 practice;
refuses any database whose name lacks "load") and `ops/load/run.mjs` (single-process Node client,
20 concurrent clients, 10 s per scenario). API built from this branch, PostgreSQL 16 local,
rate limits raised for the test only.

| Scenario                        | Requests | RPS   | p50 ms | p95 ms | p99 ms | Errors | **Proposed** p95 target | Result |
| ------------------------------- | -------- | ----- | ------ | ------ | ------ | ------ | ----------------------- | ------ |
| Patient search (name prefix)    | 1,977    | 198   | 100.8  | 131.4  | 166.5  | 0      | 300                     | within |
| Patient search (phone)          | 4,135    | 414   | 47.6   | 65.6   | 74.6   | 0      | 300                     | within |
| Calendar read (7 days)          | 1,846    | 185   | 107.5  | 137.2  | 151.3  | 0      | 400                     | within |
| Authenticated read (`/auth/me`) | 10,672   | 1,067 | 18.4   | 28.6   | 35.8   | 0      | 150                     | within |
| Login (Argon2id, sequential ×5) | 5        | –     | 51.8   | 64.2   | –      | 0      | 1000                    | within |

**The targets are proposals for client approval (decision register D-PERF), not agreed service levels.**

### Limits of this evidence

- One client process on the same machine as the database and API: it shares CPU with them, which
  both understates and distorts real network latency.
- 5,000 patients is far below a multi-practice archive. Name search uses case-insensitive pattern
  matching; patients have B-tree indexes on `(organisationId, lastName, firstName)`, phone, ID number and
  date of birth, but **no trigram index**, so a contains-style search will not scale linearly. Re-test at
  the client's real patient count (Q06) and add a `pg_trgm` index (needs a migration + rollback) if p95 grows.
- Every read is audited (audit insert per request); that cost is included, but audit table growth is
  not modelled. Partitioning/archival of `audit_events` is an operational decision.
- Not tested: billing, imaging upload/download throughput, report queries on large histories,
  sustained soak, failure injection, multi-instance behaviour, TLS/proxy overhead.
- Login was measured sequentially because it is deliberately rate-limited and CPU-expensive;
  it is not a throughput figure.

## 3. Accessibility

Automated axe-core scans cover the sign-in page and every signed-in page (Playwright). **Automated
scans find only a subset of accessibility problems and do not replace manual screen-reader testing**
(NVDA/JAWS/VoiceOver), keyboard-only walkthroughs on real tasks and contrast review by a person.
Manual testing has not been performed.

## 4. Known gaps

No browser matrix beyond Chromium; no visual-regression tests; no mutation testing; no external
penetration test; no chaos/failure-injection tests.
