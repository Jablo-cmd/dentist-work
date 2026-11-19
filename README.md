# Noordwyk Dental DPMS

Custom Dental Practice Management System commissioned by Noordwyk Dental and delivered by Auris Nexus Technologies (Pty) Ltd.

This repository contains the authoritative product requirements, architecture, delivery documentation and application implementation.

## Project purpose

Deliver a secure, centralised dental practice management system for Noordwyk Dental's four Gauteng practices. The system is intended to support patient administration, clinical records, dental charting, treatment planning, appointments, diagnostic imaging, billing, reporting and controlled multi-practice administration.

## Documentation

See [`docs/README.md`](docs/README.md) for the documentation index, project scope, status conventions and links to the requirements, workflows, architecture, security, integrations, migration, testing and delivery documents.

## Technology direction

- Frontend: Next.js + TypeScript
- Backend: Node.js + NestJS + TypeScript
- Database: PostgreSQL + Prisma
- API: REST + OpenAPI
- UI: Tailwind CSS + shadcn/ui
- Package manager: pnpm

The frontend and backend are separate applications. Large imaging and document files belong in private object storage; PostgreSQL stores metadata and secure references.

## Important project boundaries

- One client organisation with four practices; practice-level access is enforced server-side.
- Vendor integrations with VistaSoft and 3Shape TRIOS remain unconfirmed until the relevant vendor interfaces, licences, access and end-to-end tests are verified.
- Medical aid claims are not part of the initial committed scope; they require a separate decision and integration assessment.
- No production patient data may be used in development without documented authorisation and safeguards.
- Documentation distinguishes confirmed direction from assumptions and open client decisions.

## Current status

The foundation and the core modules are implemented: identity and user management, patients and medical history, appointments, clinical records and dental charting, treatment plans, imaging with private object storage, billing and reporting, and patient-import tooling. **Vendor integrations (VistaSoft, 3Shape TRIOS) are not built** (awaiting vendor confirmation); medical aid claims are out of scope. **No real patient data has been loaded, and the system must not be used with live patient data until the production gates in docs/05 are met.** See [`docs/15-IMPLEMENTATION-STATUS.md`](docs/15-IMPLEMENTATION-STATUS.md) for what is implemented versus planned, and [`docs/08-ROADMAP-ACCEPTANCE-AND-OPEN-QUESTIONS.md`](docs/08-ROADMAP-ACCEPTANCE-AND-OPEN-QUESTIONS.md) for the roadmap and open questions. A documented requirement is not evidence of implementation.

## Authentication and MFA (what actually exists)

- **Sign-in:** named email + password accounts (Argon2id), server-side sessions in an HttpOnly cookie, lockout and rate limiting. No social/SSO login, no passwordless or WebAuthn/passkey login, no SMS/e-mail codes.
- **Second factor:** TOTP (authenticator app, RFC 6238). Users enrol under *Two-factor* (QR code or manual key), confirm with a code, and receive 10 single-use recovery codes (shown once, stored only as hashes). Sign-in is two-step: a correct password yields a short-lived single-use challenge and **no session** until a valid code or recovery code is supplied. Codes cannot be replayed; wrong guesses count toward account lockout. TOTP secrets are encrypted at rest (`MFA_ENCRYPTION_KEY`).
- **Enforcement:** controlled by `MFA_REQUIRED_ROLES`. Users in a listed role who have not enrolled are restricted to enrolment, `me` and sign-out until they enrol. See [`docs/13`](docs/13-SECURITY-ARCHITECTURE.md), [`docs/18`](docs/18-SECURITY-HARDENING-REPORT.md) and the decision register [`docs/25`](docs/25-CLIENT-DECISION-REGISTER.md) for the policy and the client decision still required.
- **Recovery:** recovery codes, or an administrator can reset a lost device (audited; sessions revoked). Self-service e-mail reset is not implemented.

## Quick start

See [`docs/09-LOCAL-DEVELOPMENT.md`](docs/09-LOCAL-DEVELOPMENT.md). In short: `pnpm install`, start PostgreSQL, `pnpm db:migrate`, `pnpm dev:api`, `pnpm dev:web`.

## Repository layout

```text
apps/api            NestJS API (Prisma schema and migrations in apps/api/prisma)
apps/web            Next.js web application
packages/contracts  Shared zod schemas and types (API <-> web)
docs                Requirements, architecture, security, delivery documentation
```
