import { createConnection, type Socket } from 'node:net';
import type { MalwareScanner, ScanResult } from './malware-scanner';

const CHUNK = 64 * 1024;

export interface ClamdOptions {
  host: string;
  port: number;
  timeoutMs: number;
}

/**
 * ClamAV `clamd` client over TCP using the documented INSTREAM protocol:
 *   "zINSTREAM\0", then repeated [4-byte big-endian length][data], terminated by a zero length;
 *   the reply is a NUL-terminated line: "stream: OK", "stream: <Signature> FOUND" or "... ERROR".
 * Run clamd on a private network only (the protocol has no authentication or encryption); in
 * production put it on the same host/pod or behind a private network policy. Set clamd's
 * StreamMaxLength to at least IMAGING_MAX_BYTES.
 *
 * Any failure to obtain a definite answer is reported as `error` — never as clean.
 */
export class ClamdScanner implements MalwareScanner {
  readonly configured = true;
  constructor(private readonly opts: ClamdOptions) {}

  private exchange(write: (s: Socket) => void, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ host: this.opts.host, port: this.opts.port });
      const chunks: Buffer[] = [];
      let settled = false;
      const done = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        fn();
      };
      const timer = setTimeout(() => done(() => reject(new Error('timeout'))), timeoutMs);
      socket.on('connect', () => write(socket));
      socket.on('data', (d) => chunks.push(d));
      socket.on('end', () => done(() => resolve(Buffer.concat(chunks).toString('utf8'))));
      socket.on('error', (e) => done(() => reject(e)));
      socket.on('close', () => done(() => resolve(Buffer.concat(chunks).toString('utf8'))));
    });
  }

  async scan(content: Buffer): Promise<ScanResult> {
    let reply: string;
    try {
      reply = await this.exchange((s) => {
        s.write('zINSTREAM\0');
        for (let off = 0; off < content.length; off += CHUNK) {
          const part = content.subarray(off, Math.min(off + CHUNK, content.length));
          const len = Buffer.alloc(4);
          len.writeUInt32BE(part.length);
          s.write(len);
          s.write(part);
        }
        s.write(Buffer.alloc(4)); // zero-length chunk terminates the stream
      }, this.opts.timeoutMs);
    } catch (e) {
      return {
        verdict: 'error',
        reason: (e as Error).message === 'timeout' ? 'timeout' : 'unavailable',
      };
    }
    const line = reply.replace(/\0/g, '').trim();
    if (/size limit exceeded/i.test(line)) return { verdict: 'error', reason: 'size_limit' };
    if (/^stream: OK$/.test(line)) return { verdict: 'clean', engine: 'clamd' };
    const found = /^stream: (.+) FOUND$/.exec(line);
    if (found) return { verdict: 'infected', engine: 'clamd', signature: found[1]!.slice(0, 120) };
    return { verdict: 'error', reason: 'protocol' }; // ERROR replies, empty replies, anything unexpected
  }

  async ping(): Promise<'up' | 'down'> {
    try {
      const r = await this.exchange((s) => s.write('zPING\0'), Math.min(this.opts.timeoutMs, 2000));
      return r.replace(/\0/g, '').trim() === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }
}
