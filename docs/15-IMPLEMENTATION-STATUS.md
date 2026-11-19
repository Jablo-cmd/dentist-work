# 15 — Implementation Status and Outstanding Decisions

Last updated: modules delivery (2026-11-19). Status words follow docs/README.

## Implemented (code exists and verified by the tests in docs/14)

- **Foundation:** monorepo, API, web shell, contracts, CI, security baseline (docs/13).
- **Identity:** authentication (incl. TOTP two-factor with recovery codes and configurable enforcement), sessions, lockout, rate limiting, RBAC with practice scope, user management (create, deactivate, roles, admin password reset), change password, session purge, practice management, audit trail and listing.
- **Patients:** registration with validation, practice-scoped access and explicit cross-practice linking, search, revisions, emergency contacts, medical history and allergies (append-only), duplicate candidates with human review.
- **Appointments:** day/week calendar, booking, reschedule, cancel, check-in/complete/no-show, history, DB-enforced conflict prevention.
- **Clinical:** encounters, versioned notes with finalise/amend/addendum, FDI dental chart, treatment plans with status workflow.
- **Imaging:** private S3-compatible storage adapter, validated uploads, authorised/audited downloads (needs storage configured; otherwise reports unavailable).
- **Billing and reporting:** invoices, credit notes, payments with allocation/reversal, patient account, financial and operational reports.
- **Migration tooling:** patient CSV import with dry-run, duplicate holding and reconciliation report (docs/16).

## In progress

None.

## Proposed (documented, not built)

Patient record merge; user self-service password reset/email; WebAuthn/passkeys; committed browser e2e suite; malware scanning; DICOM viewing/processing and STL/PLY formats; reminders/communications; background job runner; invoice PDF/printing; statement generation; patient-level data export; imaging/clinical/billing history migration.

## Awaiting client confirmation

| Item                                                       | Why it matters now                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Q04 final roles/permissions                                | Current mapping is a conservative default (apps/api/src/access/permissions.ts)             |
| Q05 cross-practice visibility                              | Implemented strictly (explicit link only)                                                  |
| **MFA enforcement policy** (which roles must use it)       | Capability built; set `MFA_REQUIRED_ROLES` once decided                                    |
| Q02 practice details                                       | Practices are created by the owner in the UI                                               |
| Q12 billing: tax, invoice numbering/format, rounding       | Tax is entered not calculated; `INV-`/`CN-` numbering and half-up rounding are assumptions |
| Q13 reminders (consent/channels)                           | Not built                                                                                  |
| Q18/Q19 hosting, backups, RPO/RTO, storage provider/region | Nothing provisioned                                                                        |
| Q20 retention                                              | Nothing is ever deleted until defined                                                      |
| Q21 Information Officer / POPIA process                    | Governance gate for go-live                                                                |
| Q22 dental notation and templates                          | FDI and the condition list are working defaults                                            |
| Q09 imaging formats                                        | JPEG/PNG/PDF/DICOM accepted; STL/PLY not                                                   |

## Awaiting vendor confirmation

VistaSoft (Q07) and 3Shape TRIOS (Q08). Only interface definitions exist (`apps/api/src/integrations/imaging.ts`); both are registered `not_implemented`. No adapter, mock or simulated success exists.

## Known limitations

- No malware scanning; uploads are buffered in memory (bounded by `IMAGING_MAX_BYTES`).
- Clinical/billing UIs are functional but plain (no templates, printing, or bulk operations).
- Billing: single currency (ZAR); no tax computation; credit after payment can leave a negative outstanding (patient credit) by design; no refunds workflow.
- Appointments have practitioners but no separate chair/resource model; no recurring appointments; no reminders.
- Web CSP allows `'unsafe-inline'` (Next.js hydration); tighten with nonces once hosting is fixed.
- Argon2 parameters are the OWASP baseline, not tuned to production hardware.
- The S3 adapter is tested against an S3-compatible test server, not yet against the chosen production provider.
- Not POPIA-certified; no claim of compliance is made.

## Risks and recommended next steps

1. Decide MFA enforcement (which roles), roles (Q04), retention (Q20) and hosting (Q18/Q19) — these gate real data.
2. Security review and penetration test; restore drill; commit browser e2e to CI.
3. Client UAT of workflows and terminology (notation, templates, billing rules) with synthetic data.
4. Obtain vendor documentation early; it gates VistaSoft/TRIOS work.
5. Migration profiling once source systems and archive sizes are known.
