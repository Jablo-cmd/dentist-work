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

Documentation and implementation are being established. A documented requirement is not evidence that the feature has been implemented. See [`docs/17-ASSUMPTIONS-AND-OPEN-QUESTIONS.md`](docs/17-ASSUMPTIONS-AND-OPEN-QUESTIONS.md) and [`docs/15-IMPLEMENTATION-ROADMAP.md`](docs/15-IMPLEMENTATION-ROADMAP.md).
