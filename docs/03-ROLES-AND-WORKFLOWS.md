# 03 — Roles and Workflows

## Initial roles
- **Organisation Owner:** organisation-wide configuration, practices, users, access oversight and approved reporting.
- **Practice Administrator:** day-to-day administration for assigned practice(s), users and schedules within delegated authority.
- **Dentist / Practitioner:** authorised patient and clinical history access, encounters, notes, dental charting and treatment plans.
- **Receptionist:** patient registration/search, appointments and check-in; minimum necessary clinical information only.
- **Billing Administrator:** invoices, patient accounts, payments and authorised financial reporting.

## Permission principles
Deny by default; grant least privilege; enforce on the server. Practice assignment and role grants must both be checked. UI hiding is not security. Role and practice changes are audited. Shared accounts are prohibited. MFA should be enabled for privileged users and preferably all users.

Proposed permissions include patient.create/read/update; medical_history.read/update; clinical_record.read/create/finalise/amend; appointment.manage; imaging.upload/view/export; billing.read/manage; payment.record; financial_report.read; practice.manage; user.manage; audit.read.

### Cross-practice patient access — decision required
The client must choose whether records are visible only to the registering practice, visible across all four practices, or shared through explicit transfer/consent/exception. Until decided, use explicit practice scope and do not assume unrestricted sharing.

## Workflow: patient registration
1. Reception selects active practice and searches for an existing patient.
2. System shows possible matches with minimum necessary data.
3. If no match is confirmed, receptionist captures required details and relevant notices.
4. System validates fields and flags possible duplicates.
5. Patient is saved with immutable internal ID, practice association and audit event.
6. Uncertain duplicate candidates require human review; no automatic merge.

## Workflow: appointment
1. Select patient, practice, practitioner/resource, date and duration.
2. Check availability and conflicts.
3. Save appointment and status.
4. Preserve rescheduling/cancellation history.
5. Send reminders only after consent, channel and provider are approved.

## Workflow: check-in and consultation
1. Reception verifies patient identity and marks arrival.
2. Practitioner verifies identity and reviews relevant history/allergies.
3. Practitioner creates encounter and records notes/findings.
4. Dental chart and treatment plan are updated.
5. Encounter is saved as draft or finalised according to permissions.
6. Finalised records are preserved; later corrections use addendum/amendment.

## Workflow: imaging
1. Authorised user imports an image/scan using approved workflow.
2. File type/size and security checks run.
3. User confirms patient and optional encounter.
4. Metadata is saved; binary file is placed in private object storage.
5. Checksum, source, uploader and timestamps are recorded.
6. View/download requires server authorisation.
7. Failed or unmatched imports enter a reconciliation queue.

## Workflow: billing
1. Authorised staff create draft charges/invoice from approved information.
2. Validate patient, practice, amounts and reference.
3. Post invoice under permission.
4. Record payment and allocation.
5. System calculates balance.
6. Corrections use controlled credit/reversal entries, not silent edits.

## Workflow: migration
Inventory sources; approve scope and authority; sample export; map and deduplicate; test migration; reconcile counts and file checksums; client review/sign-off; controlled production cutover and post-migration verification.
