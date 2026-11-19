import { z } from 'zod';
import { uuidSchema } from './common';

export const IMAGING_MODALITIES = [
  'XRAY_INTRAORAL',
  'XRAY_PANORAMIC',
  'XRAY_CEPHALOMETRIC',
  'PHOTO',
  'DOCUMENT',
  'SCAN_3D',
  'OTHER',
] as const;

/**
 * Formats accepted today (verified by file signature, not by the declared type).
 * STL / PLY (3D scans) are NOT accepted until required formats are confirmed (Q09).
 */
export const ACCEPTED_IMAGING_MIME = [
  'image/jpeg',
  'image/png',
  'application/pdf',
  'application/dicom',
] as const;

export const uploadImagingFieldsSchema = z.object({
  practiceId: uuidSchema,
  modality: z.enum(IMAGING_MODALITIES),
  encounterId: uuidSchema.optional(),
  acquiredAt: z.string().datetime({ offset: true }).optional(),
});
export type UploadImagingFields = z.infer<typeof uploadImagingFieldsSchema>;

export const SCAN_STATUSES = ['NOT_SCANNED'] as const;
export const imagingAssetSchema = z.object({
  id: uuidSchema,
  patientId: uuidSchema,
  practiceId: uuidSchema,
  encounterId: uuidSchema.nullable(),
  modality: z.enum(IMAGING_MODALITIES),
  mimeType: z.enum(ACCEPTED_IMAGING_MIME),
  originalFilename: z.string(),
  sizeBytes: z.number().int(),
  sha256: z.string().length(64),
  source: z.string(),
  /** No malware scanner is deployed yet; every asset is honestly reported as not scanned. */
  scanStatus: z.enum(SCAN_STATUSES),
  acquiredAt: z.string().datetime().nullable(),
  uploadedByUserId: uuidSchema,
  uploadedAt: z.string().datetime(),
});
export type ImagingAsset = z.infer<typeof imagingAssetSchema>;
