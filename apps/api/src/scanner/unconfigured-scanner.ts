import type { MalwareScanner, ScanResult } from './malware-scanner';

/**
 * Used when no scanner is configured. It never reports a file as clean: every upload stays
 * quarantined until a real scanner is deployed. This is deliberate (fail closed).
 */
export class UnconfiguredScanner implements MalwareScanner {
  readonly configured = false;
  scan(): Promise<ScanResult> {
    return Promise.resolve({ verdict: 'error', reason: 'not_configured' });
  }
  ping(): Promise<'not_configured'> {
    return Promise.resolve('not_configured');
  }
}
