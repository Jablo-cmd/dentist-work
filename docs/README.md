# Nexus Dental Practice Management System — Project Documentation

This directory is the working source of truth for product requirements, user workflows, architecture, security, integrations, migration, testing and delivery.

## Documents
- [01 Project overview](01-PROJECT-OVERVIEW.md)
- [02 Product and functional requirements](02-PRODUCT-AND-FUNCTIONAL-REQUIREMENTS.md)
- [03 Roles and workflows](03-ROLES-AND-WORKFLOWS.md)
- [04 System architecture and data model](04-ARCHITECTURE-AND-DATA-MODEL.md)
- [05 Security and POPIA](05-SECURITY-AND-POPIA.md)
- [06 Imaging and integrations](06-IMAGING-AND-INTEGRATIONS.md)
- [07 Migration, deployment and testing](07-MIGRATION-DEPLOYMENT-AND-TESTING.md)
- [08 Roadmap, acceptance and open questions](08-ROADMAP-ACCEPTANCE-AND-OPEN-QUESTIONS.md)
- [09 Local development](09-LOCAL-DEVELOPMENT.md)
- [10 Environment variables](10-ENVIRONMENT-VARIABLES.md)
- [11 API conventions](11-API-CONVENTIONS.md)
- [12 Database and migrations](12-DATABASE-AND-MIGRATIONS.md)
- [13 Security architecture (as implemented)](13-SECURITY-ARCHITECTURE.md)
- [14 Testing and quality](14-TESTING-AND-QUALITY.md)
- [15 Implementation status and outstanding decisions](15-IMPLEMENTATION-STATUS.md)
- [16 Data migration tooling](16-MIGRATION-TOOLING.md)
- [17 Backup, restore and operations](17-BACKUP-RESTORE-AND-OPERATIONS.md)
- [ADR-0001 Technology and architecture](decisions/ADR-0001-TECHNOLOGY-AND-ARCHITECTURE.md)
- [ADR-0002 Foundation implementation decisions](decisions/ADR-0002-FOUNDATION-IMPLEMENTATION.md)

## Status language
**Confirmed direction** means explicitly established project direction. **Proposed** means a recommended design to validate. **To confirm** means a client/vendor/legal decision is outstanding. **Implemented** means code exists and has been verified. A documented requirement is not proof of implementation.

## Product and ownership
A bespoke Dental Practice Management System commissioned by Nexus Dental for its four Gauteng practices and delivered by Auris Nexus Technologies (Pty) Ltd. This is a client-funded custom project, not an Auris SaaS/product monetisation initiative. Source-code and bespoke deliverable ownership follow the executed agreement; third-party/open-source components remain under their own licences.

## Technology direction
Next.js + TypeScript frontend; Node.js + NestJS + TypeScript API; PostgreSQL + Prisma; REST/OpenAPI; Tailwind CSS + shadcn/ui; pnpm. Large imaging/document binaries belong in private object storage; PostgreSQL stores metadata and secure references.

## Important boundaries
VistaSoft and 3Shape TRIOS integrations are conditional until vendor interface, licence, access and end-to-end testing are confirmed. Medical aid claims are not in the initial baseline. No production patient data in development without documented authorisation and safeguards. Keep assumptions visible and update these documents as client decisions are confirmed.
