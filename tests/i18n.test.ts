import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseAst } from 'rolldown/parseAst';
import { describe, expect, it } from 'vitest';
import { fillMessage, holesOf, lookupMessage, pluralCategory } from '../shared/i18n/format.ts';
import { DEFAULT_LANG, resolveLang } from '../shared/i18n/lang.ts';
import { SERVER_CATALOGUES, serverMessage } from '../shared/i18n/server-messages.ts';
import { bucketLabel, statusLabel, tierLabel } from '../shared/labels.ts';
import { BUCKETS, STATUSES, TIERS } from '../shared/domain.ts';
import { KEPT_GENRES } from '../server/kitsu/schemas.ts';
import { FRENCH_GENRES, genreLabel } from '../web/src/i18n/genres.ts';
import { access as englishAccess } from '../web/src/i18n/messages/en/access.ts';
import { app as englishApp } from '../web/src/i18n/messages/en/app.ts';
import { access as frenchAccess } from '../web/src/i18n/messages/fr/access.ts';
import { app as frenchApp } from '../web/src/i18n/messages/fr/app.ts';
import { createTranslate } from '../web/src/i18n/translate.ts';

const MAX_MESSAGE_LENGTH = 160; // FR-111

const bundles = {
  access: { fr: frenchAccess as Record<string, string>, en: englishAccess as Record<string, string> },
  app: { fr: frenchApp as Record<string, string>, en: englishApp as Record<string, string> },
};

describe('choosing the language', () => {
  it('takes the most wanted of the two, the first listed on a tie, French when nothing is understood', () => {
    expect(resolveLang('en-US,en;q=0.9')).toBe('en');
    expect(resolveLang('fr-FR,fr;q=0.9,en;q=0.8')).toBe('fr');
    expect(resolveLang('de-DE,de;q=0.9,en;q=0.5')).toBe('en');
    expect(resolveLang('fr,en')).toBe('fr');
    expect(resolveLang('en,fr')).toBe('en');
    expect(resolveLang('en;q=0.4, fr;q=0.8')).toBe('fr');
    for (const header of [undefined, null, '', '*', 'de', 'ja-JP,zh;q=0.8', 'en;q=0']) expect(resolveLang(header), String(header)).toBe(DEFAULT_LANG);
  });
});

describe('filling messages', () => {
  it('replaces every hole, writes numbers the way the language does, and leaves unknown holes visible', () => {
    expect(fillMessage('{a} et {b}', { a: 'x', b: 2 }, 'fr')).toBe('x et 2');
    expect(fillMessage('Plein ({max})', { max: 5000 }, 'en')).toBe('Plein (5,000)');
    expect(fillMessage('Plein ({max})', { max: 5000 }, 'fr')).toMatch(/^Plein \(5\s000\)$/u);
    expect(fillMessage('{a} {missing}', { a: 'x' }, 'fr')).toBe('x {missing}');
    expect(holesOf('{b} puis {a} puis {b}')).toEqual(['a', 'b']);
  });

  it('picks the plural form from the count, in each language', () => {
    expect(pluralCategory('fr', 0)).toBe('one'); // "0 jour"
    expect(pluralCategory('fr', 1)).toBe('one');
    expect(pluralCategory('fr', 2)).toBe('other');
    expect(pluralCategory('en', 0)).toBe('other'); // "0 days"
    expect(pluralCategory('en', 1)).toBe('one');
    const catalogue = { 'x.one': '{count} jour', 'x.other': '{count} jours', plain: 'simple' };
    expect(lookupMessage(catalogue, 'x', 'fr', { count: 1 })).toBe('{count} jour');
    expect(lookupMessage(catalogue, 'x', 'fr', { count: 3 })).toBe('{count} jours');
    expect(lookupMessage(catalogue, 'plain', 'fr', { count: 3 })).toBe('simple');
    expect(lookupMessage(catalogue, 'absent', 'fr')).toBeUndefined();
  });

  it('shows the key itself, and reports it, when a text is missing', () => {
    const missing: string[] = [];
    const t = createTranslate('fr', { a: 'ok' }, (key) => missing.push(key));
    expect(t('a' as never)).toBe('ok');
    expect(t('nope' as never)).toBe('nope');
    expect(missing).toEqual(['nope']);
  });
});

describe('the interface catalogues (FR-107, FR-111)', () => {
  for (const [name, { fr, en }] of Object.entries(bundles)) {
    it(`${name}: both languages have the same keys, and the same {holes} in each text`, () => {
      expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
      for (const key of Object.keys(fr)) {
        expect(holesOf(en[key] ?? ''), `${name}:${key}`).toEqual(holesOf(fr[key] ?? ''));
      }
    });

    it(`${name}: no text is empty or longer than ${MAX_MESSAGE_LENGTH} characters`, () => {
      for (const lang of ['fr', 'en'] as const) {
        for (const [key, text] of Object.entries(bundles[name as 'access' | 'app'][lang])) {
          expect(text.trim().length, `${lang} ${key}`).toBeGreaterThan(0);
          expect(text.length, `${lang} ${key}`).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
        }
      }
    });

    it(`${name}: a text that depends on a count has both of its forms`, () => {
      for (const keys of [Object.keys(bundles[name as 'access' | 'app'].fr)]) {
        for (const key of keys.filter((candidate) => candidate.endsWith('.one'))) expect(keys, key).toContain(key.replace(/\.one$/, '.other'));
        for (const key of keys.filter((candidate) => candidate.endsWith('.other'))) expect(keys, key).toContain(key.replace(/\.other$/, '.one'));
      }
    });
  }

  it('the two bundles never claim the same key', () => {
    const shared = Object.keys(frenchAccess).filter((key) => key in frenchApp);
    expect(shared).toEqual([]);
  });

  it('every text is used by the interface (nothing written and forgotten)', () => {
    const root = path.join(import.meta.dirname, '..', 'web', 'src');
    const sources = [...componentFiles(root), ...tsFiles(root)].map((file) => readFileSync(file, 'utf8')).join('\n');
    // The password rules come from shared/account-rules.ts as keys; the rest is named in the code that shows it.
    const NAMED_BY_SHARED_CODE = new Set(['password.tooShort', 'password.tooLong', 'password.tooGuessable']);
    const unused = Object.keys({ ...frenchAccess, ...frenchApp })
      .map((key) => key.replace(/\.(one|other)$/, ''))
      .filter((key) => !NAMED_BY_SHARED_CODE.has(key) && !sources.includes(`'${key}'`) && !sources.includes(`"${key}"`));
    expect([...new Set(unused)]).toEqual([]);
  });

  it('English reads as English: no accented French word slipped into it', () => {
    const frenchLooking = /[éèêàçùôîâ]|\b(le|la|les|des|une|pour|avec|dans|ton|ta|tes)\b/iu;
    for (const [key, text] of Object.entries({ ...englishAccess, ...englishApp })) {
      if (key === 'lang.toFr') continue; // named in the language it leads to
      expect(text, key).not.toMatch(frenchLooking);
    }
  });
});

describe('the server catalogue', () => {
  const fr = SERVER_CATALOGUES.fr;
  const en = SERVER_CATALOGUES.en;

  it('has both languages, with the same keys and holes', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
    for (const key of Object.keys(fr)) {
      expect(holesOf(en[key] ?? ''), key).toEqual(holesOf(fr[key] ?? ''));
      expect((fr[key] ?? '').length, key).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
    }
  });

  it('writes a message in the language asked for, with its numbers', () => {
    expect(serverMessage('library.limitReached', 'fr', { max: 5000 })).toMatch(/^Ton Dex est plein \(5\s000 anime\)\.$/u);
    expect(serverMessage('library.limitReached', 'en', { max: 5000 })).toBe('Your Dex is full (5,000 anime).');
    expect(serverMessage('library.progressTooHigh', 'fr', { count: 1 })).toBe('La progression ne peut pas dépasser 1 épisode.');
    expect(serverMessage('library.progressTooHigh', 'en', { count: 12 })).toBe('Progress can’t go past 12 episodes.');
  });

  it('says the same thing about passwords to the interface and to the server', () => {
    for (const key of ['password.tooShort', 'password.tooLong', 'password.tooGuessable']) {
      expect(frenchAccess[key as keyof typeof frenchAccess], key).toBe(fr[key]);
      expect(englishAccess[key as keyof typeof englishAccess], key).toBe(en[key]);
    }
  });
});

describe('labels written from Kitsu data (FR-108)', () => {
  it('every genre the server keeps has a French form, and an unknown one is left as Kitsu wrote it', () => {
    for (const genre of KEPT_GENRES) expect(FRENCH_GENRES[genre.toLowerCase()], genre).toBeTruthy();
    expect(genreLabel('fr', 'Slice of Life')).toBe('Tranche de vie');
    expect(genreLabel('en', 'Slice of Life')).toBe('Slice of Life');
    expect(genreLabel('fr', 'Something Brand New')).toBe('Something Brand New');
  });

  it('statuses, tastes and tiers exist in both languages', () => {
    for (const lang of ['fr', 'en'] as const) {
      for (const status of STATUSES) expect(statusLabel(lang, status)).toBeTruthy();
      for (const bucket of BUCKETS) expect(bucketLabel(lang, bucket)).toBeTruthy();
      for (const tier of TIERS) expect(tierLabel(lang, tier)).toBeTruthy();
    }
    expect(statusLabel('fr', 'paused')).toBe('En pause');
    expect(statusLabel('en', 'paused')).toBe('On hold');
  });
});

/** The .ts files of the interface, except the catalogues themselves. */
function tsFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'messages' ? [] : tsFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

/** The .tsx files of the interface, except the catalogues themselves. */
function componentFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'messages' ? [] : componentFiles(full);
    return entry.name.endsWith('.tsx') ? [full] : [];
  });
}

interface AstNode {
  type: string;
  value?: unknown;
  name?: unknown;
  [key: string]: unknown;
}

const NAMES_THAT_ARE_READ = new Set(['aria-label', 'title', 'placeholder', 'alt']);
const ALLOWED_WORDS = new Set(['VS']); // the duel's "versus" mark
const hasWord = (text: string) => /\p{L}{2,}/u.test(text);

/** Text a person would read that is written straight into a component, instead of coming from a catalogue. */
function literalTexts(file: string): string[] {
  const program = parseAst(readFileSync(file, 'utf8'), { lang: 'tsx' }) as unknown as AstNode;
  const found: string[] = [];
  function visit(node: unknown): void {
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node !== 'object' || node === null) return;
    const candidate = node as AstNode;
    if (candidate.type === 'JSXText' && typeof candidate.value === 'string' && hasWord(candidate.value) && !ALLOWED_WORDS.has(candidate.value.trim())) {
      found.push(candidate.value.trim());
    }
    if (candidate.type === 'JSXAttribute') {
      const name = (candidate.name as AstNode).name;
      const value = candidate.value as AstNode | null;
      if (typeof name === 'string' && NAMES_THAT_ARE_READ.has(name) && value?.type === 'Literal' && typeof value.value === 'string' && hasWord(value.value)) {
        found.push(`${name}="${value.value}"`);
      }
    }
    for (const child of Object.values(candidate)) visit(child);
  }
  visit(program);
  return found;
}

describe('no text is written into a component (FR-107)', () => {
  const root = path.join(import.meta.dirname, '..', 'web', 'src');
  for (const file of componentFiles(root)) {
    it(path.relative(root, file), () => {
      expect(literalTexts(file)).toEqual([]);
    });
  }
});
