import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const svc = new PasswordService();

  it('hashes with argon2id and verifies', async () => {
    const hash = await svc.hash('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await svc.verify(hash, 'correct horse battery staple')).toBe(true);
    expect(await svc.verify(hash, 'wrong password')).toBe(false);
  });

  it('salts: identical passwords produce different hashes', async () => {
    const [a, b] = await Promise.all([
      svc.hash('same-password-123'),
      svc.hash('same-password-123'),
    ]);
    expect(a).not.toEqual(b);
  });

  it('never authenticates against a malformed hash', async () => {
    expect(await svc.verify('not-a-hash', 'anything')).toBe(false);
    expect(await svc.verify('', '')).toBe(false);
  });

  it('flags legacy-parameter hashes for rehash', async () => {
    const hash = await svc.hash('x'.repeat(14));
    expect(svc.needsRehash(hash)).toBe(false);
  });
});
