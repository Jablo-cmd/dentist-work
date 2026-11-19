import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const TOTP_PERIOD = 30;
export const TOTP_DIGITS = 6;

/** RFC 6238 (HMAC-SHA1, 6 digits, 30 s). The step is the counter value (floor(unixSeconds / 30)). */
export function totpAt(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', secret).update(counter).digest();
  const off = h[h.length - 1]! & 0x0f;
  const bin = ((h[off]! & 0x7f) << 24) | (h[off + 1]! << 16) | (h[off + 2]! << 8) | h[off + 3]!;
  return String(bin % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

export const stepFor = (ms: number): number => Math.floor(ms / 1000 / TOTP_PERIOD);

/**
 * Checks a code against the current step ±1 (clock drift). Returns the matching step, or null.
 * Callers must reject steps <= the last accepted step to prevent replay of a used code.
 */
export function verifyTotp(
  secret: Buffer,
  code: string,
  nowMs = Date.now(),
  window = 1,
): number | null {
  const current = stepFor(nowMs);
  const given = Buffer.from(code);
  let match: number | null = null;
  for (let d = -window; d <= window; d++) {
    const expected = Buffer.from(totpAt(secret, current + d));
    // Evaluate every candidate (no early exit) to keep timing independent of which step matched.
    if (given.length === expected.length && timingSafeEqual(given, expected)) match = current + d;
  }
  return match;
}

export const newSecret = (): Buffer => randomBytes(20);

export function otpauthUri(issuer: string, account: string, secret: Buffer): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${base32Encode(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}

/** 80 bits of entropy, grouped for readability: xxxx-xxxx-xxxx-xxxx (base32 lower-case). */
export function newRecoveryCode(): string {
  const raw = base32Encode(randomBytes(10)).toLowerCase(); // 16 chars
  return raw.match(/.{4}/g)!.join('-');
}
