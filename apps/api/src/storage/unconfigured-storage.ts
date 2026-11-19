import { ServiceUnavailableException } from '@nestjs/common';
import type { ObjectStorage, StoredObject } from './object-storage';

/** Used when no storage credentials are configured. Fails loudly instead of pretending to store files. */
export class UnconfiguredStorage implements ObjectStorage {
  readonly configured = false;
  private fail(): never {
    throw new ServiceUnavailableException(
      'Object storage is not configured; imaging is unavailable.',
    );
  }
  put(): Promise<void> {
    return this.fail();
  }
  get(): Promise<StoredObject> {
    return this.fail();
  }
  remove(): Promise<void> {
    return this.fail();
  }
  check(): Promise<'not_configured'> {
    return Promise.resolve('not_configured');
  }
}
