import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Architecture guard (MFA enforcement cannot be bypassed by a side door): a session may only be
 * created by AuthService.completeLogin, and the set of unauthenticated routes is fixed.
 * Adding a new way to sign in or a new public route must be a conscious, reviewed change here.
 */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sources(p);
    return p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
  });
}
const root = join(__dirname, '..');
const files = sources(root);
const read = (f: string) => readFileSync(f, 'utf8');

describe('authentication attack surface', () => {
  it('creates sessions in exactly one place (AuthService.completeLogin)', () => {
    const hits = files.filter((f) => /sessions\.create\(/.test(read(f)));
    expect(hits.map((f) => f.replace(root, ''))).toEqual(['/auth/auth.service.ts']);
    expect(
      (read(join(root, 'auth/auth.service.ts')).match(/sessions\.create\(/g) ?? []).length,
    ).toBe(1);
    expect(
      files
        .filter((f) => /prisma\.session\.create|tx\.session\.create/.test(read(f)))
        .map((f) => f.replace(root, '')),
    ).toEqual(['/auth/session.service.ts']);
  });

  it('only login, MFA verification and health checks are reachable without a session', () => {
    const publicFiles = files
      .filter((f) => /@Public\(\)/.test(read(f)))
      .map((f) => f.replace(root, ''))
      .sort();
    expect(publicFiles).toEqual(['/auth/auth.controller.ts', '/health/health.controller.ts']);
    const authPublic = (
      read(join(root, 'auth/auth.controller.ts')).match(/@Public\(\)\s*\n\s*@Post\('([^']+)'\)/g) ??
      []
    ).map((m) => /'([^']+)'/.exec(m)![1]);
    expect(authPublic.sort()).toEqual(['login', 'mfa/verify']);
  });

  it('only a fixed set of routes stay open while setup (password change / MFA enrolment) is pending', () => {
    const src = read(join(root, 'auth/auth.controller.ts'));
    const allowed = [
      ...src.matchAll(/@AllowPasswordChangePending\(\)[\s\S]*?@(?:Get|Post)\('([^']+)'\)/g),
    ]
      .map((m) => m[1])
      .sort();
    expect(allowed).toEqual(['change-password', 'logout', 'me', 'mfa/confirm', 'mfa/enrol']);
    // No other controller may opt out of the pending-setup restriction.
    expect(
      files.filter(
        (f) =>
          !f.endsWith('auth.controller.ts') &&
          !f.endsWith('decorators.ts') &&
          !f.endsWith('guards.ts') &&
          /AllowPasswordChangePending/.test(read(f)),
      ),
    ).toEqual([]);
  });

  it('never builds SQL from strings: no unsafe raw-query APIs in application code, and raw queries are tagged templates only', () => {
    const offenders = files
      .filter((f) => /\$(queryRawUnsafe|executeRawUnsafe)/.test(read(f)))
      .map((f) => f.replace(root, ''));
    expect(offenders).toEqual([]);
    // $queryRaw(...) / $executeRaw(...) called as a function (not a tagged template) would accept a concatenated string.
    const called = files
      .filter((f) => /\$(queryRaw|executeRaw)\s*\(/.test(read(f)))
      .map((f) => f.replace(root, ''));
    expect(called).toEqual([]);
  });
});
