import { createHash, randomBytes } from 'crypto';

const CODE_BYTES = 6;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1 - easier to read

/**
 * Generate a single human-friendly recovery code:
 *   "K7D9-PXQR-VBNM"
 */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(CODE_BYTES);
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (i === 1 || i === 3) s += '-';
  }
  return s;
}

export function hashRecoveryCode(plaintext: string): string {
  const normalised = plaintext.replace(/[-\s]/g, '').toUpperCase();
  return createHash('sha256').update(normalised).digest('hex');
}

/** Normalize a user-typed code so whitespace/dashes are tolerated */
export function normaliseRecoveryCode(input: string): string {
  return input.replace(/[-\s]/g, '').toUpperCase();
}
