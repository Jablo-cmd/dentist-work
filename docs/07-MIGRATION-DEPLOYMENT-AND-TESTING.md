# 07 — Migration, Deployment and Testing

## Migration strategy
1. Inventory source systems and paper archives per practice.
2. Record record counts, date ranges, file formats, imaging volume, naming conventions, data quality, export capability and access authority.
3. Profile a sample export and define mapping rules.
4. Identify duplicate patients for human review.
5. Test file checksums and patient-image matching.
6. Run isolated sample migration.
7. Reconcile source/destination counts and exceptions.
8. Obtain client review and sign-off.
9. Execute controlled production cutover with rollback/recovery plan.
10. Verify post-migration and retain exception register.

Paper scanning volume, indexing, OCR, physical custody and manual verification must be separately scoped. Archive size and migration duration are unknown. Use encrypted transfers and temporary storage; restrict and audit operator access; do not use production records in developer environments without explicit authority and safeguards.

## Deployment
Separate local development, shared integration, staging/UAT and production. Deploy Next.js web and NestJS API as separately managed applications. Operate PostgreSQL with encryption, patching, monitoring and backups. Object storage must be private and encrypted. Keep secrets outside source control and separate keys/buckets/environments.

Assess each practice's LAN, Wi-Fi, firewall, internet reliability/upload speed, workstations, imaging devices, UPS and remote administration needs. Do not implement an on-site sync agent unless offline/local-device requirements are validated.

RAID is not backup. Define independent backups, retention, immutability where appropriate, encryption and restore testing. Agree recovery point objective (RPO), recovery time objective (RTO) and availability targets before promising service levels.

## Quality assurance
Test layers: unit, integration, API, end-to-end, security, migration, performance, recovery and client UAT. Use synthetic data only.

Critical scenarios:
- Practice A user cannot access Practice B records without explicit permission.
- Reception cannot read restricted clinical notes.
- Finalised clinical notes cannot be silently overwritten.
- Duplicate candidates are surfaced for review.
- Concurrent appointment conflicts are detected.
- Imaging downloads re-check permission.
- Invoice/payment retries do not double-post.
- Financial corrections preserve posted history.
- Audit events identify actor/action/target without sensitive content.
- Backup restore is demonstrated.
- Migration failures are reconciled and retry-safe.

Critical/high defects block production unless formally risk-accepted by an authorised client representative with mitigation. CI should run formatting, lint, type checks, tests, build and migration checks.
