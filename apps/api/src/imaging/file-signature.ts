import type { ACCEPTED_IMAGING_MIME } from '@dpms/contracts';

export type ImagingMime = (typeof ACCEPTED_IMAGING_MIME)[number];

const startsWith = (b: Buffer, sig: number[], offset = 0) =>
  sig.every((byte, i) => b[offset + i] === byte);

/**
 * Identifies a file from its leading bytes. The client-declared content type and filename are
 * never trusted. Returns null for anything not on the accepted list.
 */
export function sniffMime(buf: Buffer): ImagingMime | null {
  if (buf.length >= 3 && startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (buf.length >= 8 && startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return 'image/png';
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-')
    return 'application/pdf';
  // DICOM Part 10: 128-byte preamble followed by "DICM".
  if (buf.length >= 132 && buf.subarray(128, 132).toString('latin1') === 'DICM')
    return 'application/dicom';
  return null;
}

/** Reduces an uploaded filename to a safe display name (no paths, control or markup characters). */
export function sanitiseFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // Drop control characters (by code point) and characters that are unsafe in headers or markup.
  const cleaned = [...base]
    .filter((ch) => {
      const c = ch.codePointAt(0)!;
      return c > 0x1f && c !== 0x7f && !'<>:"|?*;'.includes(ch);
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned && !/^\.+$/.test(cleaned) ? cleaned : 'upload';
}
