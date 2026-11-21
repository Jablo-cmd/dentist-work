# 01 — Project Overview

## Purpose and context
Nexus Dental is commissioning a custom Dental Practice Management System (DPMS) for four dental practices in Gauteng. The platform is intended to bring patient administration, appointments, clinical records, dental charting, treatment plans, diagnostic imaging, billing and practice administration into one secure digital environment.

Known context: the client currently uses VistaSoft, 3Shape TRIOS, Microsoft 365 and paper patient files. Nexus is the initial/main practice for discovery and rollout planning. An estimate of approximately 20 patients per day has been discussed but is not a validated capacity baseline. User counts, imaging volumes, archive size, network conditions and record quality remain unknown.

## Vision
Give authorised reception, clinical and administrative staff a dependable shared workspace, with reliable patient identity, traceable clinical records, secure imaging and controlled multi-practice access.

## Expected outcomes
1. Reduce dependence on paper patient files.
2. Improve patient registration, search and record retrieval.
3. Provide structured clinical documentation, dental charting and treatment plans.
4. Associate X-rays and scans with the correct patient and encounter.
5. Coordinate appointments and practitioner schedules.
6. Record billing and patient account activity.
7. Enable appropriate central oversight across four practices.
8. Improve auditability, backup and recovery.
9. Support controlled migration from existing records.

## Users
Organisation owner; practice administrators; dentists/practitioners; receptionists; billing administrators. Additional roles require workflow and permission review.

## Scope
**Core intended scope:** organisation/practice administration, authentication and permissions, patient registry, medical history/allergies, appointments, clinical encounters/notes, dental charting, treatment plans, imaging metadata and secure files, billing/accounts, reporting, audit, migration, training and deployment.

**Conditional scope:** VistaSoft and TRIOS integrations, DICOM workflows, medical aid claims, large-scale paper scanning and automated conversion. These depend on vendor access, licensing, technical compatibility and client decisions.

**Not assumed:** autonomous diagnosis, AI radiograph interpretation, pharmacy, payroll, accounting-ledger replacement or medical aid claims in the initial baseline.

## Operating model
One organisation contains four practices. Users receive explicit practice assignments and permissions. Central administrators may have organisation-wide access. Practice users receive only approved access. Patient visibility across practices is a client policy decision and must be enforced server-side.

## Success measures
Agreed UAT scenarios pass; patient identity and record integrity are demonstrated; practice boundaries are tested; imaging retrieval is reliable; migration is reconciled; backup restoration is proven; staff are trained. Numeric service levels must be agreed after discovery.
