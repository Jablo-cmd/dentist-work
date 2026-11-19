# 04 — System Architecture and Data Model

## Technology direction
- Frontend: Next.js + TypeScript.
- Backend: Node.js + NestJS + TypeScript.
- Database: PostgreSQL.
- ORM/migrations: Prisma.
- API: REST + OpenAPI.
- UI: Tailwind CSS + shadcn/ui.
- Package manager: pnpm.
- File storage: private S3-compatible object storage.
- Tests: Jest for NestJS; Vitest where appropriate for web/shared packages.

## Proposed monorepo
```text
apps/web       Next.js application
apps/api       NestJS API
packages/database  Prisma schema, migrations and DB utilities
packages/shared    shared contracts and validation
docs           project documentation
```

## Architecture
```mermaid
flowchart TB
  U[Practice users] --> W[Next.js web]
  W -->|HTTPS REST| A[NestJS API]
  A --> DB[(PostgreSQL)]
  A --> S[Private object storage]
  A --> Q[Background jobs]
  Q --> I[Integration adapters]
  I -. pending validation .-> V[VistaSoft]
  I -. pending validation .-> T[3Shape TRIOS]
  A --> M[Logs and monitoring]
```

Start with a modular monolith, not microservices. Keep clear modules: Auth, Organisation, Practices, Users, AccessControl, Patients, MedicalHistory, Appointments, ClinicalRecords, DentalChart, TreatmentPlans, Imaging, Billing, Reports, Audit, Storage and Integrations.

## Data isolation
One organisation contains four practices. Organisation-owned records have organisation relationship; practice-scoped records carry practice scope. Derive access from authenticated server-side identity and assignments. Never trust a browser-supplied practice ID as proof of access. Test cross-practice access denial. PostgreSQL row-level security may be considered as defence in depth after connection/session design is tested.

## Core entities
Organisation; Practice; User; Role; Permission; UserPracticeRole; Patient; PatientPractice; PatientContact; MedicalHistoryEntry; Allergy; PatientDocument; Appointment; ClinicalEncounter; ClinicalNoteVersion; DentalChartEntry; TreatmentPlan; TreatmentPlanItem; ImagingAsset; Invoice; InvoiceLine; Payment; AuditEvent.

## Data rules
Use UUID identifiers, foreign keys, unique constraints and indexes. Persist timestamps in UTC and display in Africa/Johannesburg. Patient identity must support duplicate review and explicit cross-practice policy. Clinical notes need draft/finalised states, author, timestamps and version/amendment history. Posted financial records must not be silently rewritten; use credits/reversals. Currency values use decimal/numeric, not floating point.

## Imaging storage
PostgreSQL stores metadata, ownership, object key, MIME type, size, checksum, modality, source and lifecycle state. Private object storage contains the binary. File access must be authorised on every request; signed URLs, if used, must be short-lived and issued after checks. Never place sensitive patient information in object keys.

## API conventions
Prefix /api/v1; HTTPS; JSON; UUID; ISO 8601; validated DTOs; consistent safe errors; bounded pagination; allow-listed filters; generated OpenAPI. Proposed resources: /auth, /practices, /users, /patients, /appointments, /encounters, /treatment-plans, /imaging, /invoices, /payments, /reports and /audit. This is a design map, not a claim endpoints exist.

## Architecture risks
Vendor access, archive size, practice connectivity, cross-practice privacy policy, migration quality and support model. Revisit decisions when evidence arrives.
