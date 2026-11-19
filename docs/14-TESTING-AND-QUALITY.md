# 14 — Testing and Quality Controls

Status: **Implemented** for the foundation scope.

| Layer                | Tooling                            | Location                                                                                                                  | Needs                        |
| -------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Contracts            | Vitest                             | `packages/contracts/test`                                                                                                 | —                            |
| API unit             | Jest                               | `apps/api/src/**/*.spec.ts` (env validation, permission policy, hashing, error filter, request ids, integration registry) | —                            |
| API integration      | Jest + supertest, real PostgreSQL  | `apps/api/test/*.int-spec.ts`                                                                                             | PostgreSQL, migrated test DB |
| Web unit/component   | Vitest + Testing Library           | `apps/web/src/**/*.test.ts(x)`                                                                                            | —                            |
| Migration validation | `prisma migrate diff` vs shadow DB | `pnpm db:validate`                                                                                                        | PostgreSQL                   |

Integration coverage includes: health/readiness (incl. DB-down → 503 without leaks), security headers, CORS, CSRF, error envelope, login/logout/lockout/idle expiry/deactivation/forged cookies, enumeration resistance, token hashing, rate limiting, practice isolation (IDOR), RBAC denial and audit, audit append-only trigger, DB constraints.

CI (`.github/workflows/ci.yml`): lint → format → typecheck → unit → migrate from scratch → drift check → integration → build → dependency audit.

Not yet covered: browser end-to-end tests (Playwright) in CI, load/performance, backup/restore, security testing beyond the above. The web UI was verified manually with Playwright during delivery but there is no committed e2e suite.
