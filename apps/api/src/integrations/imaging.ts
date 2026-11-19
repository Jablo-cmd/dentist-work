/**
 * Vendor-independent imaging integration boundary (docs/06).
 *
 * STATUS: interfaces only. No VistaSoft or 3Shape TRIOS adapter exists, and none may be added
 * until the vendor confirms interface, licence and access in writing and an end-to-end test
 * has passed. Nothing in the application depends on these interfaces yet.
 */

export type IntegrationStatus = 'not_implemented';

export interface VendorConnectionHealth {
  /** Never reports healthy for an adapter that has not passed vendor-approved verification. */
  check(): Promise<{ healthy: boolean; detail?: string }>;
}

export interface ImportedAssetDescriptor {
  /** Vendor-side identifier; opaque to the DPMS. */
  externalId: string;
  modality?: string;
  acquiredAt?: Date;
  /** Sanitised original filename only; never trusted for patient matching. */
  originalFilename?: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

export interface ImagingImportProvider extends VendorConnectionHealth {
  readonly vendor: string;
  listNewAssets(since: Date): Promise<ImportedAssetDescriptor[]>;
  fetchAsset(externalId: string): Promise<NodeJS.ReadableStream>;
}

export interface PatientIdentityMapping {
  /** Returns a DPMS patient id only for an unambiguous match; otherwise null (-> reconciliation queue). */
  resolvePatient(externalPatientRef: string): Promise<string | null>;
}

export interface ImagingMetadataMapper {
  toAssetMetadata(descriptor: ImportedAssetDescriptor): Record<string, unknown>;
}

/** Honest registry of what exists. Update only when verified by vendor end-to-end testing. */
export const INTEGRATIONS: Readonly<Record<'vistasoft' | '3shape-trios', IntegrationStatus>> = {
  vistasoft: 'not_implemented',
  '3shape-trios': 'not_implemented',
};
