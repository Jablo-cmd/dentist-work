export const MALWARE_MARKER: string;
export interface FakeClamd {
  server: import('node:net').Server;
  port: number;
  state: { mode: 'ok' | 'error' | 'garbage' | 'slow'; delayMs: number; scans: number };
  close(): Promise<void>;
}
export function startFakeClamd(
  port: number,
  opts?: { mode?: FakeClamd['state']['mode']; delayMs?: number },
): Promise<FakeClamd>;
