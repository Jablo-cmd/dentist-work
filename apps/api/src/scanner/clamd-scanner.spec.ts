import { ClamdScanner } from './clamd-scanner';
import { UnconfiguredScanner } from './unconfigured-scanner';
import { MALWARE_MARKER, startFakeClamd, type FakeClamd } from '../../test/support/fake-clamd';

describe('ClamdScanner (real client, protocol-faithful fake server)', () => {
  let fake: FakeClamd;
  const client = (over: Partial<{ port: number; timeoutMs: number }> = {}) =>
    new ClamdScanner({
      host: '127.0.0.1',
      port: over.port ?? fake.port,
      timeoutMs: over.timeoutMs ?? 2000,
    });
  beforeEach(async () => {
    fake = await startFakeClamd(0);
  });
  afterEach(async () => fake.close());

  it('reports clean content as clean', async () => {
    expect(await client().scan(Buffer.from('perfectly ordinary bytes'))).toEqual({
      verdict: 'clean',
      engine: 'clamd',
    });
  });

  it('reports malware with the signature (for the audit trail)', async () => {
    const r = await client().scan(Buffer.from(`prefix ${MALWARE_MARKER} suffix`));
    expect(r).toEqual({ verdict: 'infected', engine: 'clamd', signature: 'Fake.Test.Signature' });
  });

  it('frames large and multi-chunk payloads correctly (malware at the very end is still found)', async () => {
    const big = Buffer.concat([Buffer.alloc(3 * 64 * 1024 + 123, 7), Buffer.from(MALWARE_MARKER)]);
    expect((await client().scan(big)).verdict).toBe('infected');
    expect((await client().scan(Buffer.alloc(200_000, 1))).verdict).toBe('clean');
    expect((await client().scan(Buffer.alloc(0))).verdict).toBe('clean');
  });

  it.each([
    ['ERROR replies', 'error', 'size_limit'],
    ['unexpected replies', 'garbage', 'protocol'],
  ] as const)('never calls the file clean on %s (fail closed)', async (_n, mode, reason) => {
    fake.state.mode = mode;
    expect(await client().scan(Buffer.from('x'))).toEqual({ verdict: 'error', reason });
  });

  it('times out instead of waiting forever, and reports an error', async () => {
    fake.state.mode = 'slow';
    const started = Date.now();
    expect(await client({ timeoutMs: 400 }).scan(Buffer.from('x'))).toEqual({
      verdict: 'error',
      reason: 'timeout',
    });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('reports an unreachable scanner as an error', async () => {
    const dead = await startFakeClamd(0);
    const { port } = dead;
    await dead.close();
    expect(await client({ port }).scan(Buffer.from('x'))).toEqual({
      verdict: 'error',
      reason: 'unavailable',
    });
  });

  it('pings: up when it answers, down when it does not', async () => {
    expect(await client().ping()).toBe('up');
    const { port } = fake;
    await fake.close();
    expect(await client({ port }).ping()).toBe('down');
    fake = await startFakeClamd(0);
  });
});

describe('UnconfiguredScanner', () => {
  it('can never produce a clean verdict', async () => {
    const s = new UnconfiguredScanner();
    expect(s.configured).toBe(false);
    expect(await s.scan()).toEqual({ verdict: 'error', reason: 'not_configured' });
    expect(await s.ping()).toBe('not_configured');
  });
});
