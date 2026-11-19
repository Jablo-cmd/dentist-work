# 20 — Dental Imaging Roadmap

Nothing in this document claims an integration exists. **There is no VistaSoft, 3Shape TRIOS or
3Shape Unite integration in this system.** Vendor capabilities below are _unknowns to be confirmed
with the vendors_; nothing is assumed about their APIs, SDKs, licensing or fees.

## 1. What exists today (verified in code and tests)

| Capability                                                                                  | Where                                               | Tests                                                                                 |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Private S3-compatible object storage adapter; files never in PostgreSQL                     | `apps/api/src/imaging/`, `storage/`                 | `imaging.int-spec.ts` (s3rver)                                                        |
| Upload of JPEG, PNG, PDF, DICOM (by file signature, not filename; declared type must match) | `imaging/file-signature.ts`, `contracts/imaging.ts` | `file-signature.spec.ts`, "a non-image upload is rejected even when named .jpg" (e2e) |
| SHA-256 recorded per file; assets are append-only/immutable in the DB                       | migration triggers                                  | `imaging.int-spec.ts`                                                                 |
| Quarantine-by-default malware scanning (clamd), fail closed; download only when `CLEAN`     | `scanner/`, `imaging-scan.service.ts`               | `clamd-scanner.spec.ts`, `imaging-scan.int-spec.ts`, `imaging-no-scanner.int-spec.ts` |
| Authorised, audited download; inline display only for JPEG/PNG                              | `imaging.service.ts`                                | `imaging.int-spec.ts`, authz matrix                                                   |

**DICOM is stored, not interpreted.** There is no DICOM parser, viewer, windowing, measurement or
PACS (C-STORE/WADO) interface. STL/PLY (3D scans) are not accepted. `SCAN_3D` exists only as a
modality label.

## 2. Roadmap (proposed — needs client scope and priority)

| Step | Description                                                                                    | Depends on                                                 | Risk / notes                                                                                        |
| ---- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| I-1  | 2D viewing: zoom/pan/rotate/invert for JPEG/PNG in the browser                                 | none                                                       | Low. Annotation/measurement is a separate clinical-safety decision                                  |
| I-2  | DICOM metadata parsing (patient/study tags) with **mismatch check** against the linked patient | library choice                                             | Tag content is untrusted input; must be sanitised; mismatched patient identity must block, not warn |
| I-3  | DICOM viewing (single image, then series)                                                      | I-2; web DICOM library licence review                      | Diagnostic-use claims need clinical sign-off; do not label as diagnostic without it                 |
| I-4  | STL/PLY acceptance and a 3D preview                                                            | Q09; file-size limits; scanner behaviour on large binaries | Large files: streaming upload, direct-to-storage signed URLs                                        |
| I-5  | Import from vendor export folders (manual/batch), no live API                                  | Q07/Q08                                                    | Lowest-risk interim path; patient matching must be human-confirmed                                  |
| I-6  | Live vendor integration                                                                        | Vendor approval, licence, API                              | See §3; blocked until confirmed                                                                     |
| I-7  | Retention and deletion workflow for imaging                                                    | Q20                                                        | Nothing is deleted today; deletion needs legal retention periods, dual approval and audit           |

## 3. Vendor requirements to establish (all UNKNOWN until the vendor confirms in writing)

For each of VistaSoft (Q07) and 3Shape TRIOS / Unite (Q08) the client must obtain:

1. Which product versions the practices run, and the licence tier.
2. Whether a supported API/SDK/export mechanism exists, its documentation, and any approval or
   partner programme required to use it.
3. Licensing and commercial terms (per-seat, per-integration, per-call fees).
4. Authentication model and where credentials/keys would live.
5. Data exchange: formats, direction (read/write), patient identifier matching, and whether images
   or only metadata are exchanged.
6. Runtime dependencies (on-premise bridge, Windows service, network access from the practice).
7. A vendor-provided test/sandbox environment and test data (synthetic only).
8. Commercial and legal implications (data-processing terms, support responsibilities, liability).

## 4. Network and storage considerations to size (Q09, Q15, Q16)

Archive size and daily growth drive object-storage cost, upload time on practice internet links,
backup volume (docs/17) and malware-scan throughput. Offline operation (Q17) is not supported
by the current web design.
