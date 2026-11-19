import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * XSS guard: user-entered data (patient names, clinical notes, filenames, reasons) is only ever rendered
 * through React's escaping. Introducing a raw-HTML sink must be a deliberate, reviewed change.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p) ? [p] : [];
  });
}

describe('web source has no raw-HTML or code-evaluation sinks', () => {
  const root = join(__dirname, '..');
  const patterns: [string, RegExp][] = [
    ['dangerouslySetInnerHTML', /dangerouslySetInnerHTML/],
    ['innerHTML / outerHTML assignment', /\.(inner|outer)HTML\s*=/],
    ['document.write', /document\.write\s*\(/],
    ['eval / new Function', /\b(eval\s*\(|new Function\s*\()/],
    ['javascript: URLs', /href=\{?["'`]javascript:/],
  ];
  for (const [name, re] of patterns) {
    it(`contains no ${name}`, () => {
      const hits = files(root).filter((f) => re.test(readFileSync(f, 'utf8')));
      expect(hits.map((f) => f.replace(root, ''))).toEqual([]);
    });
  }
});
