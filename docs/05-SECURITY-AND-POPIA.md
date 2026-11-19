# 05 — Security and POPIA

## Purpose and limitation
This document defines engineering safeguards and privacy workstreams. It is not legal advice and does not certify compliance. Noordwyk Dental and its advisers must confirm lawful basis, notices, retention, data-subject processes, operator agreements and cross-border arrangements. Health information is special personal information under POPIA and requires heightened care.

## Governance
Before production processing, document responsible-party/operator roles; processing purposes and lawful justification; patient/staff privacy notices and consent where applicable; data minimisation and accuracy; retention and secure disposal; data-subject request process; breach escalation/notification responsibilities; operator agreements and subcontractors; cross-border transfer assessment.

## Identity and access
Named individual accounts; modern password hashing (Argon2id or equivalent); secure session lifecycle and revocation; MFA for privileged users and preferably all users; rate limiting; least-privilege role/practice assignments; server-side authorisation on every sensitive resource; prompt revocation for departing staff.

## Data protection
TLS for network traffic; encryption at rest for database, backups and object storage; managed secrets never committed; separate environments and keys; minimise sensitive data in logs/telemetry; private object buckets; short-lived authorised file access; file signature validation, size limits and malware scanning where available.

## Audit and monitoring
Log authentication, access-denied events, patient record access as policy requires, clinical finalisation/amendment, imaging upload/download/export, financial posting/reversal, permission changes and administrative actions. Protect logs from ordinary user modification. Never log clinical note bodies, passwords, tokens or image contents.

## Application security
Address OWASP risks including broken access control/IDOR, injection, XSS, CSRF where applicable, SSRF, unsafe file processing, security misconfiguration, vulnerable dependencies, mass assignment, weak authentication/session handling and sensitive data exposure. Use code review, dependency scanning and security tests.

## Data residency and transfers
POPIA does not mean all data must universally remain in South Africa; cross-border transfers must be assessed against applicable legal conditions. Client must approve hosting regions and subprocessors after legal review.

## Production gates
No live patient data until privacy roles, notices and agreements are documented; access-control tests pass; backup/restore is tested; secure storage is verified; incident ownership is agreed; security review and UAT are complete. Do not claim POPIA compliance merely because technical controls exist.
