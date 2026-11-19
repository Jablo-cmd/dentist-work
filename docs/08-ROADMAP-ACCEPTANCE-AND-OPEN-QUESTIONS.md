# 08 — Roadmap, Acceptance and Open Questions

## Implementation roadmap
0. Discovery and foundation: validate workflows, set up monorepo/CI, PostgreSQL/Prisma, access/audit foundations.
1. Identity and practices: authentication, organisation/four practices, users, permissions and isolation tests.
2. Patient administration: registration, search, duplicate review, profiles, medical history, allergies and documents.
3. Appointments: practitioner schedules, calendar, booking, conflicts, check-in and changes.
4. Clinical management: encounters, notes, amendment lifecycle, dental notation/chart and treatment plans.
5. Imaging foundation: private storage, metadata, authorised access, imports and reconciliation.
6. Vendor integrations: VistaSoft/TRIOS only after written technical/licensing confirmation and end-to-end tests.
7. Billing/reporting: patient accounts, invoices, payments, corrections and reports.
8. Migration/rollout: sample migration, reconciliation, client approval, practice rollout, training and hypercare.
9. Stabilisation: monitoring, backup evidence, defect resolution, support transition.

No production clinical records before access control/audit tests. No imaging production imports before secure storage and patient-link tests. No fixed migration commitment before archive profiling. No go-live before UAT, privacy/security gates and recovery tests.

## Acceptance criteria
- Web and API run independently; PostgreSQL and Prisma migrations work from clean setup.
- CI runs lint, type checks, tests and build; secrets are not committed.
- Named authentication works; deactivated users cannot start sessions.
- Role and practice scope are enforced server-side and cross-practice access denial is tested.
- Patient registration/search/profile work end-to-end; duplicate candidates are reviewable; actions are audited.
- Encounters and notes preserve authorship, timestamps and lifecycle; finalised records use addenda/amendments.
- Appointments can be created/changed/cancelled; conflicts are detected.
- Imaging uploads store private binary objects and metadata; access is rechecked on download; checksum and patient association are verified.
- Vendor integrations pass agreed vendor-approved end-to-end tests before being described as operational.
- Financial amounts use decimal arithmetic; posted transactions are corrected through controlled adjustments; retries do not duplicate.
- Backup restore, monitoring, incident escalation, UAT and migration reconciliation are evidenced.

Client representatives approve workflows, clinical terminology, cross-practice policy, migration reconciliation and UAT. Rendering a page is not acceptance.

## Open questions register
| ID | Question | Status |
|---|---|---|
| Q01 | Contracting legal entity name and details? | To confirm |
| Q02 | Names, addresses and contacts of four practices? | To confirm |
| Q03 | User counts and concurrent users per practice? | To confirm |
| Q04 | Final roles and reporting lines? | To confirm |
| Q05 | Cross-practice patient/clinical record visibility policy? | To confirm |
| Q06 | Existing patient identifiers, patient count and growth? | To confirm |
| Q07 | VistaSoft versions, licences, interfaces and vendor approval? | To confirm |
| Q08 | TRIOS/Unite versions, licence tier, API access and vendor fees? | To confirm |
| Q09 | Required imaging formats, viewers, archive size and daily growth? | To confirm |
| Q10 | Paper file volume, scanning/indexing and quality? | To confirm |
| Q11 | Medical aid claims required in initial scope? | To confirm |
| Q12 | Billing, tax, invoice numbering and payment workflows? | To confirm |
| Q13 | Reminders required; which channels and consent? | To confirm |
| Q14 | Microsoft 365 integration required? | To confirm |
| Q15 | Network/internet/workstation/imaging setup at each practice? | To confirm |
| Q16 | Existing NAS, UPS, firewall or hardware to reuse? | To confirm |
| Q17 | Offline operation required during internet outages? | To confirm |
| Q18 | Hosting provider/region and backup location approved? | To confirm |
| Q19 | RPO, RTO and service availability expectations? | To confirm |
| Q20 | Clinical, imaging and financial retention periods? | To confirm |
| Q21 | Information Officer, privacy notices and data-subject process? | To confirm |
| Q22 | Clinical templates, dental notation and terminology? | To confirm |
| Q23 | UAT participants and sign-off authority? | To confirm |
| Q24 | Training and post-go-live support expectations? | To confirm |
| Q25 | Source-code ownership/handover terms in executed agreement? | To confirm |

## Working assumptions — not confirmed facts
Four Gauteng practices; one organisation with practice-scoped access; ZAR and Africa/Johannesburg timezone defaults; browser-based desktop-first app; existing VistaSoft, TRIOS, Microsoft 365 and paper records. Confirm all with client before treating as fixed requirements.
