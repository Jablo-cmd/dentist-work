import type { Readable } from 'node:stream';

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export interface StoredObject {
  stream: Readable;
  sizeBytes: number;
}

/**
 * Private object storage port. Binary clinical files live here; PostgreSQL holds only metadata
 * and the opaque object key. Keys never contain patient information.
 */
export interface ObjectStorage {
  readonly configured: boolean;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject>;
  remove(key: string): Promise<void>;
  /** Cheap reachability check. */
  check(): Promise<'up' | 'down' | 'not_configured'>;
}
