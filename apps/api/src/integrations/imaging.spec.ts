import { INTEGRATIONS } from './imaging';

describe('integration registry', () => {
  it('keeps every unverified vendor integration disabled', () => {
    expect(Object.values(INTEGRATIONS).every((s) => s === 'not_implemented')).toBe(true);
  });
});
