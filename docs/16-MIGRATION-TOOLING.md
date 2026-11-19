# 16 — Data Migration Tooling

Status: **Implemented (patient CSV import) · Not implemented: source-system extraction, imaging/document migration, paper scanning.** Archive size, source formats and authority are unknown (Q06, Q09, Q10), so no fixed migration commitment can be made.

## What exists

`apps/api/src/migration` + `apps/api/src/cli/import-patients.ts`:

```bash
pnpm --filter @dpms/api build
node apps/api/dist/cli/import-patients.js patients.csv --practice-code PRACTICE-CODE            # dry run (default)
node apps/api/dist/cli/import-patients.js patients.csv --practice-code PRACTICE-CODE --commit --operator "Name"
```

- CSV columns: required `firstName,lastName,dateOfBirth`; optional `preferredName,sex,idNumber,email,mobilePhone,homePhone,addressLine1,addressLine2,suburb,city,postalCode`. Unknown columns are rejected.
- Rows are validated with the same rules as the API (real calendar dates, SA ID checksum, phone normalisation).
- **Dry run by default.** `--commit` inserts only rows that are valid **and** show no duplicate signal (in the file or in existing data), in one transaction, with an audit event.
- Duplicates and invalid rows are never inserted or merged; they are listed by **row number** for human review.
- Re-running is safe: previously imported rows now match existing patients and are held, not duplicated.
- The reconciliation report contains counts, row numbers and field names only — never patient values.

## Not covered / required before any real migration

Written authorisation to process the source data; sample profiling; mapping rules per source system; clinical history, appointments, imaging and billing history import; checksum reconciliation of files; encrypted transfer and temporary storage; operator access restrictions; rollback/recovery plan; client sign-off (docs/07). Use synthetic data in development.
