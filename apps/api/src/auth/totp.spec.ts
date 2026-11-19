import {
  base32Decode,
  base32Encode,
  newRecoveryCode,
  otpauthUri,
  totpAt,
  verifyTotp,
} from './totp';

// RFC 6238 Appendix B vectors (SHA-1, secret "12345678901234567890"), truncated to the last 6 digits.
const secret = Buffer.from('12345678901234567890');
const vectors: [number, string][] = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
  [20000000000, '353130'],
];

describe('TOTP (RFC 6238)', () => {
  it.each(vectors)('matches the RFC test vector at t=%i', (t, expected) => {
    expect(totpAt(secret, Math.floor(t / 30))).toBe(expected);
  });

  it('accepts the current and adjacent steps only', () => {
    const now = 1_234_567_890_000;
    const step = Math.floor(now / 30000);
    expect(verifyTotp(secret, totpAt(secret, step), now)).toBe(step);
    expect(verifyTotp(secret, totpAt(secret, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(secret, totpAt(secret, step + 1), now)).toBe(step + 1);
    expect(verifyTotp(secret, totpAt(secret, step + 2), now)).toBeNull();
    expect(verifyTotp(secret, totpAt(secret, step - 2), now)).toBeNull();
    expect(verifyTotp(secret, '000000', now)).toBeNull();
    expect(verifyTotp(secret, '12345', now)).toBeNull();
  });
});

describe('base32 and provisioning', () => {
  it('round-trips arbitrary bytes and matches a known encoding', () => {
    expect(base32Encode(Buffer.from('12345678901234567890'))).toBe(
      'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
    );
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
    expect(() => base32Decode('abc1')).toThrow();
  });
  it('builds an otpauth URI with the issuer and no trailing padding', () => {
    const uri = otpauthUri('Noordwyk DPMS', 'a@b.invalid', secret);
    expect(uri).toContain(
      'otpauth://totp/Noordwyk%20DPMS%3Aa%40b.invalid?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
    );
    expect(uri).toContain('issuer=Noordwyk%20DPMS');
  });
  it('generates unique, well-formed recovery codes', () => {
    const codes = new Set(Array.from({ length: 200 }, newRecoveryCode));
    expect(codes.size).toBe(200);
    for (const c of codes) expect(c).toMatch(/^[a-z2-7]{4}(-[a-z2-7]{4}){3}$/);
  });
});
