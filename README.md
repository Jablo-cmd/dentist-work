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

The **engineering foundation** is implemented: monorepo, API, database/migrations, shared contracts, authentication/RBAC/audit, web shell, tests and CI. Clinical, patient, imaging and billing modules are **not yet built**. See [`docs/15-IMPLEMENTATION-STATUS.md`](docs/15-IMPLEMENTATION-STATUS.md) for what is implemented versus planned, and [`docs/08-ROADMAP-ACCEPTANCE-AND-OPEN-QUESTIONS.md`](docs/08-ROADMAP-ACCEPTANCE-AND-OPEN-QUESTIONS.md) for the roadmap and open questions. A documented requirement is not evidence of implementation.

## Quick start

See [`docs/09-LOCAL-DEVELOPMENT.md`](docs/09-LOCAL-DEVELOPMENT.md). In short: `pnpm install`, start PostgreSQL, `pnpm db:migrate`, `pnpm dev:api`, `pnpm dev:web`.

## Repository layout

```text
apps/api            NestJS API (Prisma schema and migrations in apps/api/prisma)
apps/web            Next.js web application
packages/contracts  Shared zod schemas and types (API <-> web)
docs                Requirements, architecture, security, delivery documentation
```
