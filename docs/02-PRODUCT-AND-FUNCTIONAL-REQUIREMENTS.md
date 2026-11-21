# 02 — Product and Functional Requirements

## Product definition
A browser-based operations platform for one Nexus Dental organisation with four practices. It supports the patient journey from registration and appointment through consultation, clinical documentation, imaging, treatment and billing.

## Functional requirements

### Organisation and access
- Maintain organisation and four practice records.
- Assign named users to roles and practice scopes.
- Provide central administration for authorised organisation owners.
- Enforce practice scope and permissions in the backend on every relevant operation.
- Audit user creation, role changes and access-sensitive actions.

### Patient administration
- Register and update patient demographics and contact details.
- Search by approved identifiers and demographic fields.
- Display a consolidated profile to authorised users.
- Record emergency contacts/next of kin.
- Maintain medical history, allergies and clinical alerts with source/date.
- Attach documents securely.
- Identify likely duplicate registrations for human review; never auto-merge uncertain matches.
- Retain attribution and history of changes.

### Appointments
- Create, view, reschedule and cancel appointments.
- Associate patient, practice, practitioner/resource, date, duration and status.
- Provide day/week calendars and practice/practitioner filters.
- Detect scheduling conflicts.
- Preserve cancellation and rescheduling history.
- Reminders are conditional on consent, communication channel and provider approval.

### Clinical management
- Create encounters linked to patient, practice and practitioner.
- Capture dated clinical notes, findings and relevant treatment.
- Preserve author, timestamps, status and history.
- Prevent silent modification/deletion of finalised notes; use amendments/addenda.
- Display authorised clinical history chronologically.
- Support practitioner-approved templates where agreed.

### Dental charting and treatment
- Model teeth and surfaces using a client-approved notation system.
- Record findings with author, time and encounter context.
- Create treatment plans and track proposed, accepted, declined, deferred and completed items as agreed.
- Preserve historical chart and treatment states.
- Interactive visual chart is subject to practitioner validation.

### Imaging and documents
- Store metadata and secure references for X-rays, photos, scans and documents.
- Link assets to patient and optionally encounter/practice.
- Keep binary files in private object storage, not database rows.
- Re-check permissions for every view/download.
- Record uploader, source, timestamp, checksum, type and size.
- DICOM, VistaSoft and TRIOS functionality is conditional on technical validation.

### Billing and accounts
- Maintain patient accounts, charges, invoices and payments.
- Use decimal arithmetic for currency.
- Track payment allocations and outstanding balances.
- Preserve posted financial history; corrections use credits/reversals.
- Tax, invoice numbering and accounting workflow require client/accountant confirmation.
- Medical aid claims are separately scoped and not in the initial baseline.

### Reporting and administration
- Provide role-authorised operational and financial summaries.
- Filter by practice and date range.
- Maintain audit logs for sensitive access and material actions.
- Provide controlled data export and handover.

## Non-functional requirements
Security and privacy by design; least privilege; encryption in transit/at rest; dependable backups; monitored services; responsive search and common workflows; modular maintainable TypeScript; automated tests; accessible keyboard-friendly interface; documented data export and deployment.

## Product principles
No fake functionality. No unverified integration claims. Clinical and financial integrity before convenience. Every material requirement must map to an implementation and acceptance test.
