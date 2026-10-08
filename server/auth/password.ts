import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { passwordLengthProblem, type PasswordProblem } from '../../shared/account-rules.ts';
import { createLimiter } from '../lib/limiter.ts';

/**
 * Password storage and rules.
 * - Hashing: scrypt (OWASP Password Storage Cheat Sheet: N = 2^17, r = 8, p = 1 is the first of its
 *   equivalent recommended settings), with a random salt per password.
 * - Rules: NIST SP 800-63B-4 (length, no composition rules, a blocklist, NFC normalisation).
 */

export interface ScryptParams {
  /** CPU/memory cost (N), a power of two. Memory used is about 128 x N x blockSize bytes. */
  cost: number;
  blockSize: number;
  parallelization: number;
}

export const PRODUCTION_SCRYPT_PARAMS: ScryptParams = { cost: 2 ** 17, blockSize: 8, parallelization: 1 };

const SALT_BYTES = 16;
const KEY_BYTES = 32;
const HASH_FORMAT = 'scrypt';
const MAX_CONCURRENT_HASHES = 2; // 2 x 128 MiB at most in memory at once
const SCRYPT_MEMORY_HEADROOM = 2;
/** A stored hash asking for more than this is refused without computing: only someone who can write the database could make one. */
const MAX_STORED_HASH_MEMORY_BYTES = 256 * 1024 * 1024;
const MAX_STORED_PARALLELIZATION = 16;

export interface PasswordHasher {
  /** Returns `scrypt$N$r$p$salt$hash` (base64url). The password is normalised to NFC first. */
  hash(password: string): Promise<string>;
  /** True when `password` matches `stored`. A malformed `stored` never matches. */
  verify(password: string, stored: string): Promise<boolean>;
  /** Spends the time of a real check when there is no account to check, so timing does not tell. */
  verifyAgainstNothing(password: string): Promise<void>;
  /** True when `stored` was made with other settings than the current ones. */
  needsRehash(stored: string): boolean;
}

interface ParsedHash {
  params: ScryptParams;
  salt: Buffer;
  key: Buffer;
}

export function createPasswordHasher(options: { params?: ScryptParams; maxConcurrent?: number } = {}): PasswordHasher {
  const params = options.params ?? PRODUCTION_SCRYPT_PARAMS;
  const runLimited = createLimiter(options.maxConcurrent ?? MAX_CONCURRENT_HASHES);

  async function hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const key = await runLimited(() => deriveKey(password, salt, params, KEY_BYTES));
    return [HASH_FORMAT, params.cost, params.blockSize, params.parallelization, salt.toString('base64url'), key.toString('base64url')].join('$');
  }

  // A hash of a password nobody knows, made once and only ever compared against.
  let unknownHash: Promise<string> | undefined;

  return {
    hash,

    async verify(password, stored) {
      const parsed = parseHash(stored);
      if (!parsed) return false;
      const key = await runLimited(() => deriveKey(password, parsed.salt, parsed.params, parsed.key.length));
      return timingSafeEqual(key, parsed.key);
    },

    async verifyAgainstNothing(password) {
      unknownHash ??= hash(randomBytes(32).toString('base64url'));
      const parsed = parseHash(await unknownHash);
      if (parsed) await runLimited(() => deriveKey(password, parsed.salt, parsed.params, parsed.key.length));
    },

    needsRehash(stored) {
      const parsed = parseHash(stored);
      return !parsed || parsed.params.cost !== params.cost || parsed.params.blockSize !== params.blockSize || parsed.params.parallelization !== params.parallelization;
    },
  };
}

function deriveKey(password: string, salt: Buffer, params: ScryptParams, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const memoryNeeded = 128 * params.cost * params.blockSize;
    scrypt(
      password.normalize('NFC'),
      salt,
      length,
      { N: params.cost, r: params.blockSize, p: params.parallelization, maxmem: memoryNeeded * SCRYPT_MEMORY_HEADROOM },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

function parseHash(stored: string): ParsedHash | null {
  const [format, cost, blockSize, parallelization, salt, key, ...rest] = stored.split('$');
  if (format !== HASH_FORMAT || rest.length > 0 || !salt || !key) return null;
  const numbers = [cost, blockSize, parallelization].map((value) => Number(value));
  if (numbers.some((value) => !Number.isInteger(value) || value < 1)) return null;
  const [N, r, p] = numbers as [number, number, number];
  const isPowerOfTwo = N > 1 && (N & (N - 1)) === 0;
  const saltBytes = Buffer.from(salt, 'base64url');
  const keyBytes = Buffer.from(key, 'base64url');
  if (!isPowerOfTwo || saltBytes.length === 0 || keyBytes.length === 0) return null;
  if (128 * N * r > MAX_STORED_HASH_MEMORY_BYTES || p > MAX_STORED_PARALLELIZATION) return null;
  return { params: { cost: N, blockSize: r, parallelization: p }, salt: saltBytes, key: keyBytes };
}

// ---------------------------------------------------------------------------------------------------

/**
 * Long passwords that are known to be guessed first. Shorter ones never get here: they fail the length
 * rule. This is a small local list on purpose (no third-party service sees a password, not even a
 * fragment of its hash); the length rule and the throttle do most of the work.
 */
const COMMON_LONG_PASSWORDS: ReadonlySet<string> = new Set([
  'passwordpassword', 'password1234567', 'password12345678', 'passwordpassword1', 'motdepassemotdepasse',
  'motdepasse1234567', 'azertyuiopqsdfgh', 'azertyuiopqsdfghjklm', 'qwertyuiopasdfgh', 'qwertyuiopasdfghjkl',
  'qwertyuiopasdfghjklzxcvbnm', 'azertyuiopqsdfghjklmwxcvbn', 'iloveyouiloveyou', 'jetaimejetaimejetaime',
  'letmeinletmeinletmein', 'welcomewelcomewelcome', 'administratoradministrator', 'abcdefghijklmnop',
  'abcdefghijklmnopqrstuvwxyz', '1234567890123456', '123456789012345', '12345678901234567890',
  'correcthorsebatterystaple', 'animeanimeanimeanime', 'narutonarutonaruto', 'onepieceonepieceonepiece',
  'changemechangeme', 'changemechangemechangeme', 'trustno1trustno1trustno1', 'thequickbrownfox',
]);

const CONTEXT_WORD = 'otakudex';
const MIN_CONTEXT_FRAGMENT_LENGTH = 4;
const MAX_REPEATED_UNIT_LENGTH = 4;

export interface PasswordContext {
  email?: string;
  displayName?: string;
}

/** The problem to report when `password` is refused, or null when it is accepted. */
export function checkPassword(password: string, context: PasswordContext = {}): PasswordProblem | null {
  const lengthProblem = passwordLengthProblem(password);
  if (lengthProblem) return lengthProblem;

  const compact = compactForm(password);
  const fragments = [CONTEXT_WORD, context.email?.split('@')[0], context.displayName]
    .map((fragment) => compactForm(fragment ?? ''))
    .filter((fragment) => fragment.length >= MIN_CONTEXT_FRAGMENT_LENGTH);
  const isTooGuessable =
    COMMON_LONG_PASSWORDS.has(compact) || fragments.some((fragment) => compact.includes(fragment)) || isRepetition(compact) || isSequence(compact);
  return isTooGuessable ? { key: 'password.tooGuessable', params: {} } : null;
}

/** Lower case, letters and digits only: "Mot de passe!" and "motdepasse" compare equal. */
function compactForm(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/** "aaaaaaaaaaaaaaaa", "abababababababab", "1231231231231231": one short unit repeated, the last copy possibly cut short. */
function isRepetition(compact: string): boolean {
  for (let period = 1; period <= MAX_REPEATED_UNIT_LENGTH; period += 1) {
    if (compact.slice(period) === compact.slice(0, compact.length - period)) return true;
  }
  return false;
}

/** "abcdefghijklmnop" and "1234567890123456": every character is the next one after the previous. */
function isSequence(compact: string): boolean {
  const codes = [...compact].map((char) => char.codePointAt(0) ?? 0);
  return codes.every((code, index) => {
    if (index === 0) return true;
    const previous = codes[index - 1] ?? 0;
    const isDigitWrap = previous === 0x39 && code === 0x30; // 9 then 0
    return code === previous + 1 || isDigitWrap;
  });
}
