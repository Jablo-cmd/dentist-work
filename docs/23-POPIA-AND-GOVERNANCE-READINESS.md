# 23 — POPIA and Governance Readiness

**This is not legal advice and the system is not "POPIA certified" or "POPIA compliant".** POPIA
compliance is an organisational responsibility; software can only support it. Health information is
special personal information, which raises the bar. Legal review by a qualified South African
practitioner is required.

Items are split by who must act: **Code** (implemented here), **Infrastructure** (deployment),
**Policy** (client procedures), **Legal** (counsel).

## 1. Code — supports POPIA-aligned operation

| Control                                                                                 | Evidence                               |
| --------------------------------------------------------------------------------------- | -------------------------------------- |
| Access control by role and practice; deny by default; out-of-scope reads return 404     | `test/authz-matrix.int-spec.ts`        |
| Append-only audit of access and changes, without clinical text or amounts               | audit tests; DB triggers               |
| Minimal data in logs (redaction)                                                        | `common/logging.ts`, `logging.spec.ts` |
| Authentication hardening, lockout, MFA capability with enforceable policy               | docs/18 S-01..S-04                     |
| Integrity of clinical and financial records (immutability, amendments instead of edits) | docs/19                                |
| Nothing is ever deleted (no retention workflow yet)                                     | docs/15                                |
| Quarantine-by-default for uploaded files                                                | docs/18 S-05                           |

**Not implemented:** data-subject access/export tooling, correction workflow beyond normal edits
with history, deletion/de-identification, consent records, reminder consent (Q13), breach register,
retention scheduler, patient-facing notices.

## 2. Infrastructure (client / operator)

Encryption at rest and in transit, South African or adequate-protection hosting and cross-border
transfer position (Q18), backups and their access, key custody, network segmentation, monitoring,
scanner operation, patching. Checklist: docs/18 §3 and docs/22. All **BLOCKED** until an environment exists.

## 3. Policy (client)

Information Officer appointed and registered (Q21); privacy notices; consent wording; retention
schedule (Q20); data-subject request procedure and response times; breach notification procedure
(to the Information Regulator and affected persons); staff confidentiality and training; access
review schedule; who may be granted cross-practice visibility (Q05); operator agreements with
hosting and any vendors.

## 4. Legal (counsel)

Lawful basis and special-personal-information conditions for health data; minimum retention periods
for clinical and financial records under health-professions and tax law; cross-border transfers;
operator (data-processing) agreements; electronic-signature/record-keeping requirements for clinical
notes; source-code and data ownership terms (Q25).

## 5. Go-live gates (all open)

Information Officer named; retention decided; hosting approved; encryption and backups evidenced;
restore drill in the target environment; privacy notices ready; incident process rehearsed; DPIA
or equivalent risk assessment completed by the client.
