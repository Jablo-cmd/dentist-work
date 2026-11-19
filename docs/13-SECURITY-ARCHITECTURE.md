# 13 — Security Architecture (as implemented)

This describes controls that exist in code. It is not a compliance statement: POPIA compliance also needs organisational, legal and operational controls (docs/05). No patient data exists in the system yet.

## Implemented controls

| Area           | Control                                                                                                                                                                                                                              | Where                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Authentication | Named email/password accounts; Argon2id hashing; generic failure message; timing equalisation for unknown users                                                                                                                      | `auth/`                                         |
| Brute force    | Per-account lockout (5 failures → 15 min) and per-IP rate limiting (10/min login, 120/min default)                                                                                                                                   | `auth.service.ts`, `app.module.ts`              |
| Sessions       | 256-bit random token, only SHA-256 stored; HttpOnly, SameSite=Lax, `Secure` + `__Host-` in production; absolute + idle expiry; logout and deactivation revoke immediately                                                            | `session.service.ts`                            |
| Authorisation  | Global guard chain: rate limit → origin check → authenticate → authorise. **Deny by default**: a route must declare `@Public`, `@AuthenticatedOnly` or `@RequirePermission`, else 403                                                | `auth/guards.ts`                                |
| RBAC           | Role→permission table in code; org-wide vs practice-scoped assignments; practice visibility derived from the server-side principal, never from client input                                                                          | `access/permissions.ts`, `practices.service.ts` |
| IDOR           | Out-of-scope resources return 404 (indistinguishable from missing) and are audited; regression test exists (a real bug of this type was caught and fixed during development)                                                         | integration tests                               |
| CSRF           | SameSite cookie + mandatory allow-listed Origin/Referer on state-changing requests                                                                                                                                                   | `OriginGuard`                                   |
| Input          | Zod validation of bodies/queries, UUID param validation, 100 KB body limit                                                                                                                                                           | pipes, `bootstrap.ts`                           |
| HTTP hardening | Helmet (strict CSP `default-src 'none'`, no-sniff, no-referrer, HSTS in production), CORS allow-list, `no-store`, no `X-Powered-By`; web app sets CSP, frame-deny, etc.                                                              | `bootstrap.ts`, `next.config.mjs`               |
| Errors         | Single exception filter; generic messages; correlation id; internals only in server logs                                                                                                                                             | `http-exception.filter.ts`                      |
| Logging        | Structured JSON (pino); cookies/authorization redacted; request/response bodies never logged; query strings stripped; Prisma query logging disabled                                                                                  | `app.module.ts`                                 |
| Audit          | Append-only (`audit_events` trigger); login success/failure/denied, logout, access denied, practice creation, owner bootstrap. Login success **fails closed** (session revoked if audit write fails). Metadata must be non-sensitive | `audit/`                                        |
| Config         | Startup validation; production rejects insecure cookie/origin/Swagger settings                                                                                                                                                       | `config/env.ts`                                 |
| Secrets        | None in repo; `.env*` ignored; CI uses throwaway DB credentials                                                                                                                                                                      | `.gitignore`, CI                                |
| Dependencies   | `pnpm audit` gate in CI (currently: no known vulnerabilities in production deps)                                                                                                                                                     | CI                                              |

## Not implemented yet (do not assume)

- **MFA** — required by docs/05 for privileged users; **awaiting client decision** on method/scope. Until then privileged accounts rely on password + lockout + rate limiting. This must be resolved before production.
- Password change/reset, user management UI/API, session listing, expired-session purge.
- Object storage, signed URLs, upload validation, malware scanning (imaging phase).
- Patient-record access auditing (no patient data yet).
- Row-level security, encryption-at-rest verification, backup/restore evidence, penetration test.
- Cross-practice patient visibility policy (Q05): practice scoping is strict until decided.

## Rules for contributors

- Never trust a client-supplied practice/organisation id; derive scope from `Principal`.
- Combine scope filters with `AND` (a spread that overwrites a filter caused a real defect — see tests).
- Every state-changing sensitive action writes an audit event in the same transaction where possible.
- Never put clinical text, credentials or tokens in logs, errors or audit metadata.
