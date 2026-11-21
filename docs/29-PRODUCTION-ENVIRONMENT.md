# 29 — Production environment (Ireland, free tier, no real patient data yet)

**Status: production-configured, on free plans, EMPTY.** The environment is built the way production will run,
so going live later is a billing change, not a migration. **Real patient data must not be loaded until the
go-live gates below are met.** Free plans are not suitable for it (see "What the free plans cannot give you").

## Where things are

| Part                     | Location                                                                                                     | Notes                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Database                 | Supabase project `nexus-dpms-production` (`fjdovaccybqjkjdonqky`), **eu-west-1 (Ireland)**                   | PostgreSQL 17, free plan                                     |
| Imaging storage          | Private bucket `dpms-imaging` in the same project (25 MB limit; JPEG/PNG/PDF/DICOM only; no public policies) | Not yet connected to the app (needs an S3 access key, below) |
| API                      | Vercel project `nexus-dpms-api`, functions in **dub1 (Dublin)**                                              | Protected by Vercel Authentication                           |
| Web                      | Vercel project `nexus-dpms-web`, functions in **dub1 (Dublin)**                                              | Protected by Vercel Authentication                           |
| Earlier test environment | Supabase `nexus-dental-practice-management-system` (London), **paused**; restorable                          | Synthetic data only; delete when no longer needed            |

Data residency: Ireland (EU). POPIA permits transfer where the recipient country gives substantially similar
protection; the EU is generally accepted, but **a South African lawyer must confirm this and the operator contracts**.

## Security configuration

Separate database roles: `dpms_owner` (migrations only, at build time) and `dpms_app` (runtime, least privilege per
`ops/db-roles.sql`: no TRUNCATE; append-only history tables cannot be updated or deleted). Supabase's public API
roles (`anon`, `authenticated`, `service_role`) have no table grants. Secrets (DB URLs, `MFA_ENCRYPTION_KEY`, bypass
secret) are Vercel _sensitive_ variables, unique to this environment (nothing reused from the test environment).
Production defaults are enforced by the API at boot: MFA required for the roles in `RECOMMENDED_MFA_ROLES`,
secure cookies, `TRUST_PROXY_HOPS`, https-only origins.

## What the free plans cannot give you (why no real data yet)

- Supabase free: projects **auto-pause after inactivity**; no point-in-time recovery; no guaranteed backups; 1 GB storage.
- Vercel Hobby: **non-commercial use only**.
- No virus scanner is attached, so uploaded images stay quarantined (by design).

## Upgrade path when the first client signs (no data migration needed)

1. Supabase: upgrade the organisation to **Pro**; enable **point-in-time recovery**; (optional) compute upgrade.
2. Vercel: move the team to a paid plan.
3. Create an **S3 access key** (Supabase → Storage → S3 Connection) and add `STORAGE_ACCESS_KEY_ID`,
   `STORAGE_SECRET_ACCESS_KEY` as sensitive variables on `nexus-dpms-api`; then set `STORAGE_ENDPOINT`
   (`https://fjdovaccybqjkjdonqky.supabase.co/storage/v1/s3`), `STORAGE_REGION=eu-west-1`,
   `STORAGE_BUCKET=dpms-imaging`, `STORAGE_FORCE_PATH_STYLE=true` **together** (the API refuses to start with a partial set).
4. Run a ClamAV scanner on an always-on host and set `SCANNER_HOST`/`SCANNER_PORT`.
5. With the owner's explicit approval, merge to `main` so Vercel deploys production from it; attach the custom domain
   and update `WEB_ORIGINS`/`API_INTERNAL_URL` to it.
6. Schedule backups (`ops/backup.sh`) and rehearse a restore in this environment (`ops/restore-drill.sh`).

## Go-live gates (all still open — docs/22, docs/23, docs/25)

Paid plans active · restore rehearsed in this environment · scanner and storage connected · monitoring and alerts ·
Information Officer, privacy notices, retention rules · the 13 blocking client decisions · independent penetration test ·
manual screen-reader test · user acceptance sign-off.

## Bootstrap

One Organisation Owner exists (created by SQL with a generated password and forced change on first sign-in).
Production MFA policy then forces authenticator enrolment. No practices or patients exist.

## Domain

The web app is served from **`dental.aurisnexus.co.za`** (domain `aurisnexus.co.za` is held in the Auris Nexus Vercel team;
its DNS is hosted at `host-ww.net`, so the record below must be created there). The API keeps its Vercel address
(reached only by the web tier). `WEB_ORIGINS` on the API allows both `https://dental.aurisnexus.co.za` and the
Vercel branch address.

DNS record to add at the DNS host:

| Type  | Name     | Value                                                                         |
| ----- | -------- | ----------------------------------------------------------------------------- |
| CNAME | `dental` | `9da14b6e0fff7f62.vercel-dns-017.com.` (alternative: `cname.vercel-dns.com.`) |

**Exposure note:** Vercel Authentication does not cover custom domains, so the sign-in page on this domain is publicly
reachable (protected by lockout, rate limiting and mandatory MFA). The Vercel-generated addresses stay private.

## Enquiry email (sign-in page form)

The form is built and tested; **it sends nothing until SMTP credentials are added**, and until then it tells visitors to email
`info@aurisnexus.co.za` directly. To enable: in Zoho Mail create an _app-specific password_ for the sending mailbox (My Account →
Security → App Passwords; SMTP access must be enabled), then add to Vercel project `nexus-dpms-api` as **sensitive** variables
(Production and Preview) and redeploy:

```
SMTP_HOST      = smtp.zoho.com        (smtppro.zoho.com for a paid organisation; smtp.zoho.eu for the EU data centre)
SMTP_PORT      = 465
SMTP_USER      = info@aurisnexus.co.za
SMTP_PASSWORD  = <the app-specific password>
```

Recipient defaults to `info@aurisnexus.co.za` (`ENQUIRY_TO`). Safeguards: fixed recipient, visitor address only as Reply-To,
5 enquiries per client per hour, honeypot field, input validation (no line breaks in headers), origin check, audit entries
without visitor content, generic errors (no provider details). Visitor personal information is only emailed, not stored.
