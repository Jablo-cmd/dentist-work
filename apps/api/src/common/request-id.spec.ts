import { resolveRequestId } from './request-id';

describe('resolveRequestId', () => {
  it('keeps a safe caller-supplied id', () => {
    expect(resolveRequestId('abc-12345678')).toBe('abc-12345678');
  });
  it('replaces unsafe or missing ids (log-injection defence)', () => {
    for (const bad of [
      'short',
      'has space in it 123',
      'x\ny-injected-line',
      undefined,
      'a'.repeat(100),
    ]) {
      const id = resolveRequestId(bad);
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
});
