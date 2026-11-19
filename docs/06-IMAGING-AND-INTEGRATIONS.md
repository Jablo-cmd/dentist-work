# 06 — Imaging and Third-Party Integrations

## Objective
Provide a reliable patient-centred imaging record for X-rays, photographs, documents and 3D dental scans while preserving source metadata and access controls.

## Asset metadata
Record patient and optional encounter; practice/organisation; modality/type; acquisition date/time; source device/system; sanitised original filename; MIME type and size; checksum; private object key; uploader/import service; timestamps; DICOM study/series/instance identifiers where applicable; lifecycle and retention state.

## Formats and viewers
Potential formats include JPEG, PNG, PDF, DICOM, STL and PLY. Supported formats, file limits, preview behaviour and clinical viewer requirements must be confirmed. Preserve originals; identify derived previews clearly. Do not assume every format can be safely or accurately rendered in a browser.

## VistaSoft — conditional
Obtain exact product/version and deployment details; vendor-supported interface specification; DICOM workflow/configuration; authentication/security model; test environment; licensing/certification/fees/support requirements; written confirmation of permitted exchange. Do not reverse-engineer unsupported interfaces or claim compatibility without end-to-end testing.

## 3Shape TRIOS — conditional
Confirm scanner and Unite versions; active subscription/licence tier and enabled integration entitlements; supported APIs/SDKs/web services/export workflows; file formats and metadata; patient synchronisation/matching; authentication, partner approval and fees; test equipment/environment. Export file availability does not prove automated integration is licensed or available.

## Adapter design
Create vendor-independent backend interfaces such as ImagingImportProvider, PatientIdentityMapping, ImagingMetadataMapper and VendorConnectionHealth. Mock adapters may be used in tests but must be labelled. Real adapters remain disabled until vendor credentials, licences and approvals exist.

## Import safety
Validate content, checksum and size; quarantine suspicious files; detect duplicate imports; log failures; provide a reconciliation queue for files that cannot confidently be linked. Never associate images solely from ambiguous filenames.

## Acceptance
Test patient linkage, practice permissions, file integrity, supported preview/download, audit, failure recovery, duplicate detection and performance at agreed archive sizes.

## Other integrations
Microsoft 365 and medical aid claims are not initial confirmed scope. Each future integration requires a defined use case, provider terms, data-flow/security review and separate scope approval.
