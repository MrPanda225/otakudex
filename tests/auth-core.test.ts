import { describe, expect, it } from 'vitest';
import { checkPassword, createPasswordHasher, PRODUCTION_SCRYPT_PARAMS } from '../server/auth/password.ts';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, passwordLengthProblem } from '../shared/account-rules.ts';
import { addressKey, createLoginThrottle, createRequestRateLimiter } from '../server/auth/throttle.ts';
import { generateToken, hashToken, isWellFormedToken } from '../server/auth/tokens.ts';
import { loadConfig, securityWarnings } from '../server/config.ts';
import { TEST_SCRYPT_PARAMS } from './helpers.ts';

describe('password hashing', () => {
  const hasher = createPasswordHasher({ params: TEST_SCRYPT_PARAMS });

  it('writes a self-describing hash with its own random salt', async () => {
    const first = await hasher.hash('une phrase de passe tres longue');
    const second = await hasher.hash('une phrase de passe tres longue');
    expect(first).toMatch(/^scrypt\$1024\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    expect(first).not.toBe(second); // different salts
    expect(first).not.toContain('phrase');
  });

  it('accepts the right password and only that one', async () => {
    const stored = await hasher.hash('une phrase de passe tres longue');
    expect(await hasher.verify('une phrase de passe tres longue', stored)).toBe(true);
    expect(await hasher.verify('une phrase de passe tres longuE', stored)).toBe(false);
    expect(await hasher.verify('', stored)).toBe(false);
  });

  it('never matches a malformed stored value', async () => {
    for (const stored of ['', 'x', 'scrypt$1$2', 'scrypt$1024$8$1$$', 'bcrypt$1024$8$1$c2FsdA$a2V5', 'scrypt$1000$8$1$c2FsdA$a2V5', 'scrypt$1024$8$1$c2FsdA$a2V5$extra']) {
      expect(await hasher.verify('anything', stored), stored).toBe(false);
    }
  });

  it('treats a composed and a decomposed accent as the same password (NFC)', async () => {
    const stored = await hasher.hash('café au lait du matin');
    expect(await hasher.verify('café au lait du matin', stored)).toBe(true);
  });

  it('spots hashes made with other settings so they can be upgraded', async () => {
    const stored = await hasher.hash('une phrase de passe tres longue');
    expect(hasher.needsRehash(stored)).toBe(false);
    expect(createPasswordHasher({ params: { ...TEST_SCRYPT_PARAMS, cost: 2 ** 11 } }).needsRehash(stored)).toBe(true);
    expect(hasher.needsRehash('garbage')).toBe(true);
  });

  it('spends the work of a real check when there is no account', async () => {
    await expect(hasher.verifyAgainstNothing('whatever')).resolves.toBeUndefined();
  });

  it('uses the OWASP-recommended scrypt settings in production (N = 2^17, r = 8, p = 1)', async () => {
    expect(PRODUCTION_SCRYPT_PARAMS).toEqual({ cost: 131_072, blockSize: 8, parallelization: 1 });
    const stored = await createPasswordHasher().hash('une phrase de passe tres longue');
    expect(stored.startsWith('scrypt$131072$8$1$')).toBe(true);
  }, 20_000);
});

/** The problem of a password that is too short: its key and the numbers its sentence needs. */
const tooShort = (count: number) => ({ key: 'password.tooShort', params: { min: MIN_PASSWORD_LENGTH, max: MAX_PASSWORD_LENGTH, count } });

describe('password rules', () => {
  it('asks for at least 15 characters and says how many there are', () => {
    expect(checkPassword('trop court')).toEqual(tooShort(10));
    expect(checkPassword('zebra-lamp-1984')).toBeNull(); // exactly 15
    expect(checkPassword('zebra-lamp-198')).toEqual(tooShort(14));
  });

  it('counts characters after NFC normalisation, not code units', () => {
    expect(checkPassword('pomme-de-terr' + 'é')).toEqual(tooShort(14));
    expect(checkPassword('pomme-de-terre' + 'é')).toBeNull();
  });

  it('accepts up to 128 characters and refuses more', () => {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const ofLength = (length: number) => Array.from({ length }, (_, index) => alphabet.charAt((index * 7) % alphabet.length)).join('');
    expect(checkPassword(ofLength(128))).toBeNull();
    expect(checkPassword(ofLength(129))).toMatchObject({ key: 'password.tooLong' });
  });

  it('imposes no composition rule', () => {
    expect(checkPassword('uniquementdesminuscules')).toBeNull();
    expect(checkPassword('UNIQUEMENT DES MAJUSCULES')).toBeNull();
    expect(checkPassword('0192837465019283')).toBeNull();
  });

  it('refuses passwords everybody tries first', () => {
    for (const password of ['qwertyuiopasdfgh', 'Qwerty Uiop Asdfgh', 'passwordpassword', 'motdepassemotdepasse', 'abcdefghijklmnop', '1234567890123456', 'aaaaaaaaaaaaaaaa', 'abababababababab', '1231231231231231']) {
      expect(checkPassword(password), password).toEqual({ key: 'password.tooGuessable', params: {} });
    }
  });

  it('refuses a password built from the account itself or the application', () => {
    expect(checkPassword('Camille.Dupont2026!', { email: 'camille.dupont@example.com' })?.key).toBe('password.tooGuessable');
    expect(checkPassword('le dex de Camille ici', { displayName: 'Camille' })?.key).toBe('password.tooGuessable');
    expect(checkPassword('mon otakudex perso ici')?.key).toBe('password.tooGuessable');
    expect(checkPassword('une phrase sans rapport ici', { email: 'camille@example.com', displayName: 'Camille' })).toBeNull();
    // fragments shorter than four characters would block too much: "al" in an e-mail is not a risk
    expect(checkPassword('le dex de cette personne', { displayName: 'al' })).toBeNull();
  });
});

describe('tokens', () => {
  it('are 256 random bits in a URL-safe form, and different each time', () => {
    const tokens = new Set(Array.from({ length: 50 }, generateToken));
    expect(tokens.size).toBe(50);
    for (const token of tokens) {
      expect(token).toHaveLength(43);
      expect(isWellFormedToken(token)).toBe(true);
    }
  });

  it('are stored as a 32-byte SHA-256, the same every time for the same token', () => {
    const token = generateToken();
    expect(hashToken(token)).toHaveLength(32);
    expect(hashToken(token).equals(hashToken(token))).toBe(true);
    expect(hashToken(token).equals(hashToken(generateToken()))).toBe(false);
  });

  it('refuse obviously wrong input before any query', () => {
    for (const value of ['', 'short', 'x'.repeat(44), `${'a'.repeat(42)}!`, `${'a'.repeat(42)} `]) {
      expect(isWellFormedToken(value), value).toBe(false);
    }
  });
});

describe('login throttle', () => {
  const start = new Date('2026-10-08T10:00:00Z');
  const at = (seconds: number) => new Date(start.getTime() + seconds * 1000);

  it('lets the first four failures through, then waits 1 s, doubling each time', () => {
    const throttle = createLoginThrottle();
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      expect(throttle.waitSeconds('a@b.c', at(0))).toBe(0);
      throttle.recordFailure('a@b.c', at(0));
    }
    expect(throttle.waitSeconds('a@b.c', at(0))).toBe(0);
    throttle.recordFailure('a@b.c', at(0)); // 5th
    expect(throttle.waitSeconds('a@b.c', at(0))).toBe(1);
    expect(throttle.waitSeconds('a@b.c', at(1))).toBe(0);
    throttle.recordFailure('a@b.c', at(1)); // 6th
    expect(throttle.waitSeconds('a@b.c', at(1))).toBe(2);
    throttle.recordFailure('a@b.c', at(3)); // 7th
    expect(throttle.waitSeconds('a@b.c', at(3))).toBe(4);
  });

  it('caps the wait at 15 minutes', () => {
    const throttle = createLoginThrottle();
    let now = 0;
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      throttle.recordFailure('a@b.c', at(now));
      now += throttle.waitSeconds('a@b.c', at(now));
    }
    throttle.recordFailure('a@b.c', at(now));
    expect(throttle.waitSeconds('a@b.c', at(now))).toBe(900);
  });

  it('starts over after a success, and keeps accounts apart', () => {
    const throttle = createLoginThrottle();
    for (let attempt = 1; attempt <= 6; attempt += 1) throttle.recordFailure('a@b.c', at(0));
    expect(throttle.waitSeconds('a@b.c', at(0))).toBeGreaterThan(0);
    expect(throttle.waitSeconds('other@b.c', at(0))).toBe(0);
    throttle.recordSuccess('a@b.c');
    expect(throttle.waitSeconds('a@b.c', at(0))).toBe(0);
  });

  it('forgets a name that stayed quiet for an hour', () => {
    const throttle = createLoginThrottle();
    for (let attempt = 1; attempt <= 6; attempt += 1) throttle.recordFailure('a@b.c', at(0));
    expect(throttle.waitSeconds('a@b.c', at(3601))).toBe(0);
    throttle.recordFailure('a@b.c', at(3601));
    expect(throttle.waitSeconds('a@b.c', at(3601))).toBe(0); // counted from one again
  });
});

describe('request rate limiter', () => {
  it('allows `limit` requests per window and a fresh start after it', () => {
    const limiter = createRequestRateLimiter({ limit: 3, windowMs: 60_000 });
    const start = new Date('2026-10-08T10:00:00Z');
    const results = [0, 1, 2, 3, 4].map(() => limiter.allow('1.2.3.4', start));
    expect(results).toEqual([true, true, true, false, false]);
    expect(limiter.allow('5.6.7.8', start)).toBe(true); // another address
    expect(limiter.allow('1.2.3.4', new Date(start.getTime() + 60_001))).toBe(true);
  });
});

describe('startup security warnings', () => {
  const secured = { isCookieSecure: true, setupCode: null };
  const plain = { isCookieSecure: false, setupCode: null };

  it('warns only when the server is reachable from outside without a secure cookie', () => {
    expect(securityWarnings({ host: '127.0.0.1', ...plain })).toEqual([]);
    expect(securityWarnings({ host: 'localhost', ...plain })).toEqual([]);
    expect(securityWarnings({ host: '::1', ...plain })).toEqual([]);
    expect(securityWarnings({ host: '0.0.0.0', ...secured })).toEqual([]);
    const [warning] = securityWarnings({ host: '0.0.0.0', ...plain });
    expect(warning).toContain('COOKIE_SECURE=true');
    expect(securityWarnings({ host: '192.168.1.20', ...plain })).toHaveLength(1);
  });

  it('warns that the first visitor would become administrator, unless a setup code is set or an account exists', () => {
    const open = securityWarnings({ host: '0.0.0.0', ...secured }, { hasAccount: false });
    expect(open).toHaveLength(1);
    expect(open[0]).toContain('SETUP_CODE');
    expect(securityWarnings({ host: '0.0.0.0', isCookieSecure: true, setupCode: 'a secret code' }, { hasAccount: false })).toEqual([]);
    expect(securityWarnings({ host: '0.0.0.0', ...secured }, { hasAccount: true })).toEqual([]);
    expect(securityWarnings({ host: '127.0.0.1', ...secured }, { hasAccount: false })).toEqual([]); // only this machine can reach it
    expect(securityWarnings({ host: '0.0.0.0', ...plain }, { hasAccount: false })).toHaveLength(2);
  });
});

describe('configuration of accounts', () => {
  it('has safe defaults: no proxy trusted, no setup code, plain cookie', () => {
    expect(loadConfig({})).toMatchObject({ trustProxy: false, setupCode: null, isCookieSecure: false });
  });

  it('reads TRUST_PROXY and a SETUP_CODE of at least 8 characters, and treats an empty one as unset', () => {
    expect(loadConfig({ TRUST_PROXY: 'true', SETUP_CODE: '  un code secret  ' })).toMatchObject({ trustProxy: true, setupCode: 'un code secret' });
    expect(loadConfig({ SETUP_CODE: '' }).setupCode).toBeNull();
    expect(() => loadConfig({ SETUP_CODE: 'court' })).toThrow(/SETUP_CODE/);
  });
});

describe('address keys of the rate limiter', () => {
  it('keep an IPv4 address as it is, and see through an IPv4-mapped IPv6 one', () => {
    expect(addressKey('203.0.113.5')).toBe('203.0.113.5');
    expect(addressKey('::ffff:203.0.113.5')).toBe('203.0.113.5');
  });

  it('count an IPv6 address by its /64, however it is written', () => {
    const key = addressKey('2001:db8:abcd:12::1');
    expect(key).toBe('2001:db8:abcd:12::/64');
    expect(addressKey('2001:0DB8:abcd:0012:ffff:eeee:dddd:cccc')).toBe(key);
    expect(addressKey('2001:db8:abcd:12:1:2:3:4%eth0')).toBe(key);
    expect(addressKey('2001:db8:abcd:13::1')).not.toBe(key);
    expect(addressKey('::1')).toBe('0:0:0:0::/64');
  });
});

describe('the rate limiter table', () => {
  it('stays bounded when a flood of distinct addresses arrives', () => {
    const limiter = createRequestRateLimiter({ limit: 1, windowMs: 60_000 });
    const now = new Date('2026-10-08T10:00:00Z');
    for (let index = 0; index < 12_000; index += 1) limiter.allow(`198.51.${Math.floor(index / 250)}.${index % 250}`, now);
    // the oldest windows were dropped, so the very first address is counted afresh
    expect(limiter.allow('198.51.0.0', now)).toBe(true);
    expect(limiter.allow('198.51.0.0', now)).toBe(false);
  });
});

describe('stored hashes with absurd settings', () => {
  it('are refused without any computation', async () => {
    const hasher = createPasswordHasher({ params: TEST_SCRYPT_PARAMS });
    const started = Date.now();
    for (const stored of ['scrypt$1073741824$8$1$c2FsdA$a2V5', 'scrypt$1024$8192$1$c2FsdA$a2V5', 'scrypt$1024$8$4096$c2FsdA$a2V5']) {
      expect(await hasher.verify('anything', stored), stored).toBe(false);
      expect(hasher.needsRehash(stored)).toBe(true);
    }
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe('rules shared with the interface', () => {
  it('state the documented limits', () => {
    expect([MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH]).toEqual([15, 128]);
  });

  it('give the same length problem to the interface and to the server', () => {
    expect(passwordLengthProblem('court')).toEqual(tooShort(5));
    expect(passwordLengthProblem('x'.repeat(15))).toBeNull();
    expect(passwordLengthProblem('x'.repeat(129))).toMatchObject({ key: 'password.tooLong' });
    expect(checkPassword('court')).toEqual(passwordLengthProblem('court'));
  });
});
