import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const DIST = path.resolve(import.meta.dirname, '..', 'web', 'dist');
const ENTRY_BUDGET_GZIP_BYTES = 20 * 1024; // NFR-55
const HAS_BUILD = existsSync(path.join(DIST, 'index.html'));

function readEntry(): { entryPath: string; entry: Buffer } {
  const html = readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const entryPath = /<script[^>]+src="([^"]+\.js)"/.exec(html)?.[1] ?? '';
  return { entryPath, entry: entryPath ? readFileSync(path.join(DIST, entryPath)) : Buffer.alloc(0) };
}

/** What the sign-in screen downloads first. Needs a build: `npm run check` makes one before the tests. */
describe.skipIf(!HAS_BUILD)('what the sign-in screen downloads (NFR-55)', () => {
  it('keeps the first JavaScript file under 20 KB compressed', () => {
    const { entryPath, entry } = readEntry();
    expect(entryPath).toMatch(/^\/assets\/index-.+\.js$/);
    expect(gzipSync(entry).length).toBeLessThanOrEqual(ENTRY_BUDGET_GZIP_BYTES);
  });

  it('leaves the application to a separate file: none of its pages or texts is in the first one', () => {
    const text = readEntry().entry.toString('utf8');
    for (const marker of ['Prochain duel', 'Reste à voir', 'Retirer du Dex', 'Next duel', 'Left to watch']) expect(text, marker).not.toContain(marker);
    expect(text).toContain('Content de te revoir'); // the sign-in screen itself, in French, is there
    expect(text).not.toContain('Welcome back'); // English comes only when someone asks for it
  });

  /** The built file (other than the first one) that holds `marker`. */
  function fileHolding(marker: string): string | undefined {
    const entryName = path.basename(readEntry().entryPath);
    return readdirSync(path.join(DIST, 'assets'))
      .filter((name) => name.endsWith('.js') && name !== entryName)
      .find((name) => readFileSync(path.join(DIST, 'assets', name), 'utf8').includes(marker));
  }

  it('has the application file next to it, which the sign-in screen fetches later', () => {
    const application = readdirSync(path.join(DIST, 'assets')).find((name) => /^SignedInApp-.+\.js$/.test(name));
    expect(application).toBeDefined();
  });

  it('keeps each language apart: the other language and the application texts load only on demand (NFR-58)', () => {
    const englishSignIn = fileHolding('Welcome back');
    const frenchApplication = fileHolding('Prochain duel');
    const englishApplication = fileHolding('Next duel');
    for (const file of [englishSignIn, frenchApplication, englishApplication]) expect(file).toBeDefined();
    expect(new Set([englishSignIn, frenchApplication, englishApplication]).size).toBe(3); // three files, none shared
  });
});

/** Budgets for the rest of what a signed-in person downloads, and what the page announces up front. */
describe.skipIf(!HAS_BUILD)('what the built application costs and announces (NFR-63, NFR-66)', () => {
  const APPLICATION_BUDGET_GZIP_BYTES = 48 * 1024;
  const STYLES_BUDGET_GZIP_BYTES = 10 * 1024;

  function gzipSizeOf(pattern: RegExp): number {
    const name = readdirSync(path.join(DIST, 'assets')).find((candidate) => pattern.test(candidate));
    expect(name, String(pattern)).toBeDefined();
    return gzipSync(readFileSync(path.join(DIST, 'assets', name!))).length;
  }

  it('keeps the application file under 48 KB compressed', () => {
    expect(gzipSizeOf(/^SignedInApp-.+\.js$/)).toBeLessThanOrEqual(APPLICATION_BUDGET_GZIP_BYTES);
  });

  it('keeps the styles under 10 KB compressed', () => {
    expect(gzipSizeOf(/^index-.+\.css$/)).toBeLessThanOrEqual(STYLES_BUDGET_GZIP_BYTES);
  });

  it('asks for the two fonts of the first screen with the page itself, from its own origin', () => {
    const html = readFileSync(path.join(DIST, 'index.html'), 'utf8');
    const preloads = [...html.matchAll(/<link[^>]+rel="preload"[^>]*>/g)].map((match) => match[0]);
    expect(preloads).toHaveLength(2);
    for (const link of preloads) {
      expect(link).toMatch(/as="font"/);
      expect(link).toMatch(/type="font\/woff2"/);
      expect(link).toMatch(/crossorigin/);
      expect(link).toMatch(/href="\/assets\/[^"/]+\.woff2"/); // no other domain
    }
    expect(preloads.some((link) => link.includes('figtree-latin-wght'))).toBe(true);
    expect(preloads.some((link) => link.includes('dela-gothic-one-latin-400'))).toBe(true);
    expect(preloads.some((link) => link.includes('-ext-'))).toBe(false); // the rare-character files stay on demand
  });

  it('describes the page for search engines', () => {
    const html = readFileSync(path.join(DIST, 'index.html'), 'utf8');
    expect(html).toMatch(/<meta name="description" content="[^"]{40,}"/);
  });
});
