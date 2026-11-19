# ADR-0001 — Initial Technology and Architecture

- Status: Accepted as initial engineering direction; revisit when evidence requires.
- Date: 2026-11-19
- Decision owner: Auris Nexus Technologies engineering

## Context
Build a bespoke four-practice dental management system with sensitive clinical data, imaging, appointments and financial records.

## Decision
Use a TypeScript monorepo:
- Next.js frontend.
- Node.js + NestJS backend API.
- PostgreSQL database.
- Prisma schema and migrations.
- REST API with OpenAPI.
- Tailwind CSS and shadcn/ui.
- pnpm workspace.
- Private S3-compatible object storage for large files.

Start as a modular monolith with clear domain modules rather than microservices.

## Rationale
TypeScript across the stack improves maintainability and shared contracts. NestJS provides explicit module, dependency-injection, validation and guard patterns. PostgreSQL provides relational integrity and transactions. Prisma provides typed data access and migrations. Object storage is better suited than database blobs for large imaging files. A modular monolith reduces early operational complexity.

## Consequences
Web and API deploy independently. Authentication/session design must be threat-modelled. Practice access is enforced in API services and tested. Storage provider/region, backup and retention remain open. Vendor integrations are conditional. Technology selection alone does not establish POPIA compliance or clinical suitability.

## Alternatives
- Next.js route handlers as entire backend: not selected as primary architecture because the domain benefits from a dedicated API boundary.
- Microservices from day one: not selected due to deployment/operational overhead before scale requires it.
- Imaging binaries in PostgreSQL: not selected for large assets; database stores metadata and references.

## Revisit when
Hosting constraints, offline requirements, vendor specifications, security assessment or measured performance justify a change.
