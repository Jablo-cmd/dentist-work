# 15 — Implementation Status and Outstanding Decisions

Last updated: foundation delivery (2026-11-19). Status words follow docs/README.

## Implemented (code exists and verified)

Monorepo (pnpm), strict TypeScript, ESLint/Prettier, CI workflow definition · NestJS API (versioned REST, OpenAPI, health/readiness, correlation ids, structured logging, exception filter, env validation) · PostgreSQL/Prisma foundation schema and migration workflow · shared contracts · authentication, sessions, lockout, rate limiting, RBAC with practice scope, audit trail · practices list/get/create · audit-event listing · Next.js shell (login, overview, practices) with loading/empty/error states and toasts · owner bootstrap CLI.

## In progress

None.

## Proposed (documented, not built)

Everything in docs/02 beyond the above: patients, medical history, appointments, clinical records, charting, treatment plans, imaging/storage, billing, reporting, user management, background jobs, MFA, expired-session purge, e2e suite.

## Awaiting client confirmation

Q04 final roles/permissions · Q05 cross-practice visibility · Q02 practice details · MFA policy/method · Q18/Q19 hosting, backup, RPO/RTO · Q20 retention · Q21 Information Officer/POPIA process · Q22 notation/templates.

## Awaiting vendor confirmation

VistaSoft (Q07) and 3Shape TRIOS (Q08). Only interface definitions exist (`apps/api/src/integrations/imaging.ts`); both are registered `not_implemented`. No adapter, mock or simulated success exists.

## Known limitations

- Practices cannot be created from the UI (API only); no user-management API/UI — additional users currently require direct database administration or a future feature.
- Session rows are not purged after expiry.
- Web CSP allows `'unsafe-inline'` scripts/styles (Next.js hydration); tighten with nonces once the hosting target is fixed.
- The web proxy assumes the web server can reach the API directly.
- Argon2 parameters are the OWASP baseline, not tuned to production hardware.
- No object storage, no malware scanning, no backups configured — none provisioned in this phase.
- Not POPIA-certified; no claim of compliance is made.

## Risks and recommended next phase

1. Resolve MFA and role decisions (Q04, MFA) — gate for any real user.
2. Phase 1 completion: user management (create/deactivate/assign, password reset), session purge, practice-management UI, Playwright e2e in CI.
3. Then Phase 2 (patients) designed with the Q05 policy, patient-access auditing, duplicate review and field-level logging rules.
4. Obtain vendor documentation early; it gates Phase 6 and may affect Phase 5 imaging design.
