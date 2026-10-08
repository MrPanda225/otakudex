import { createHash, randomBytes } from 'node:crypto';

/**
 * Random secrets of 256 bits: session cookies, invitation links, reset links. They are shown or sent
 * once; the database keeps only their SHA-256 (OWASP Session Management: store a one-way verifier).
 * A fast hash is right here: a random 256-bit value has no dictionary to attack.
 */

const TOKEN_BYTES = 32;
const TOKEN_LENGTH = 43; // 32 bytes in base64url, no padding

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

/** True for the shape generateToken() produces: lets obviously wrong input be refused before any query. */
export function isWellFormedToken(value: string): boolean {
  return value.length === TOKEN_LENGTH && /^[A-Za-z0-9_-]+$/.test(value);
}
