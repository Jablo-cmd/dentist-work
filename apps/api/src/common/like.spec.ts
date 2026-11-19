import { escapeLike } from './like';

describe('escapeLike', () => {
  it('escapes the LIKE metacharacters and leaves everything else alone', () => {
    expect(escapeLike('100%_off\\now')).toBe('100\\%\\_off\\\\now');
    expect(escapeLike('Plain Name')).toBe('Plain Name');
    expect(escapeLike("O'Brien")).toBe("O'Brien");
    expect(escapeLike('')).toBe('');
  });
  it('is applied once: escaping twice would change the meaning, so callers must not double-escape', () => {
    expect(escapeLike(escapeLike('%'))).toBe('\\\\\\%');
  });
});
