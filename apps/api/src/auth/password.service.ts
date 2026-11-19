import { HttpStatus, Injectable } from '@nestjs/common';
import { CodedHttpException } from '../common/http-exception.filter';
import * as argon2 from 'argon2';

/** OWASP-recommended Argon2id parameters (m=19 MiB, t=2, p=1) — revisit against deployed hardware. */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 256;

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

/** Rejects passwords that embed the account identifier. Length rules are enforced by the contract. */
export function assertAcceptablePassword(password: string, email: string): void {
  const local = email.split('@')[0]!.toLowerCase();
  if (local.length >= 4 && password.toLowerCase().includes(local)) {
    throw new CodedHttpException(
      HttpStatus.BAD_REQUEST,
      'VALIDATION_FAILED',
      'Password must not contain your email name.',
    );
  }
  if (new Set(password).size < 4) {
    throw new CodedHttpException(
      HttpStatus.BAD_REQUEST,
      'VALIDATION_FAILED',
      'Password is too repetitive.',
    );
  }
}

@Injectable()
export class PasswordService {
  private dummyHash: Promise<string> | undefined;

  hash(plain: string): Promise<string> {
    return hashPassword(plain);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false; // malformed hash must never authenticate
    }
  }

  /** Burns equivalent CPU when the account does not exist, to blunt user-enumeration by timing. */
  async verifyDummy(plain: string): Promise<void> {
    this.dummyHash ??= hashPassword('dummy-password-for-timing-equalisation');
    await this.verify(await this.dummyHash, plain);
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, ARGON2_OPTIONS);
  }
}
