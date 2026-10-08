import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EntryDto } from '../shared/domain.ts';
import { loadConfig, securityWarnings } from '../server/config.ts';
import type { Database } from '../server/db/database.ts';
import { createDeepLTranslator, createLibreTranslator, createTranslatorFromSettings, TranslationFailure, type TextTranslator } from '../server/translate/providers.ts';
import { MAX_TRANSLATED_CHARACTERS } from '../server/translate/service.ts';
import { genreLabel } from '../web/src/i18n/genres.ts';
import { createTestApp, createTestClock, createTestDatabase, createTestServices, inviteAndJoin, makeSnapshot, signUpFirstAccount, type TestSession } from './helpers.ts';

interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** A fetch that records what it was asked and answers with `answer`. */
function recordingFetch(answer: () => Response): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fake = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return answer();
  };
  return { fetch: fake as typeof fetch, calls };
}

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

describe('translation services', () => {
  it('DeepL: free key to the free address, key in the header only, French as target', async () => {
    const { fetch, calls } = recordingFetch(() => json({ translations: [{ detected_source_language: 'EN', text: 'Bonjour' }] }));
    const free = createDeepLTranslator('abcdef-0123456789:fx', fetch);
    expect(await free.translate('Hello', 'en', 'fr')).toBe('Bonjour');
    expect(calls[0]?.url).toBe('https://api-free.deepl.com/v2/translate');
    expect(calls[0]?.headers.Authorization).toBe('DeepL-Auth-Key abcdef-0123456789:fx');
    expect(calls[0]?.body).toEqual({ text: ['Hello'], source_lang: 'EN', target_lang: 'FR' });
    expect(JSON.stringify(calls[0]?.body)).not.toContain('abcdef');

    const paid = recordingFetch(() => json({ translations: [{ text: 'Hi' }] }));
    await createDeepLTranslator('abcdef-0123456789', paid.fetch).translate('Salut', 'fr', 'en');
    expect(paid.calls[0]?.url).toBe('https://api.deepl.com/v2/translate');
    expect(paid.calls[0]?.body).toMatchObject({ source_lang: 'FR', target_lang: 'EN-GB' }); // English as a target must say which
  });

  it('LibreTranslate: the address of the owner, the key only when there is one', async () => {
    const open = recordingFetch(() => json({ translatedText: 'Bonjour' }));
    expect(await createLibreTranslator('http://homelab:5000/', null, open.fetch).translate('Hello', 'en', 'fr')).toBe('Bonjour');
    expect(open.calls[0]?.url).toBe('http://homelab:5000/translate');
    expect(open.calls[0]?.body).toEqual({ q: 'Hello', source: 'en', target: 'fr', format: 'text' });

    const keyed = recordingFetch(() => json({ translatedText: 'x' }));
    await createLibreTranslator('http://homelab:5000', 'secret-key', keyed.fetch).translate('Hello', 'en', 'fr');
    expect(keyed.calls[0]?.body).toMatchObject({ api_key: 'secret-key' });
  });

  it('a refusal, an unreachable service or a strange answer is a failure that never repeats the key or the text', async () => {
    const refused = createDeepLTranslator('secret-key-1234567890:fx', recordingFetch(() => json({ message: 'no' }, 456)).fetch);
    const error = await refused.translate('Private words', 'en', 'fr').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TranslationFailure);
    expect(String((error as Error).message)).toBe('DeepL answered 456');

    const down = createLibreTranslator('http://homelab:5000', null, (async () => {
      throw new Error('connect ECONNREFUSED with secret-key');
    }) as typeof fetch);
    await expect(down.translate('x', 'en', 'fr')).rejects.toThrow('LibreTranslate is unreachable');

    const odd = createDeepLTranslator('secret-key-1234567890', recordingFetch(() => json({ translations: [] })).fetch);
    await expect(odd.translate('x', 'en', 'fr')).rejects.toThrow('unexpected answer');
  });

  it('refuses to follow a redirect, which would carry the body and its key elsewhere', async () => {
    const seen: (string | undefined)[] = [];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      seen.push(init?.redirect);
      return json({ translatedText: 'x' });
    }) as typeof fetch;
    await createLibreTranslator('http://homelab:5000', 'k', fetchImpl).translate('Hello', 'en', 'fr');
    await createDeepLTranslator('abcdefghij:fx', (async (_url: string | URL | Request, init?: RequestInit) => (seen.push(init?.redirect), json({ translations: [{ text: 'x' }] }))) as typeof fetch).translate('Hello', 'en', 'fr');
    expect(seen).toEqual(['error', 'error']);
  });

  it('tells a refusal of one text from a problem of the service', async () => {
    const aboutTheText = await createLibreTranslator('http://homelab:5000', null, recordingFetch(() => json({}, 400)).fetch).translate('x', 'en', 'fr').catch((e: unknown) => e);
    expect((aboutTheText as TranslationFailure).isServiceProblem).toBe(false);
    for (const status of [403, 429, 456, 500, 503]) {
      const error = await createLibreTranslator('http://homelab:5000', null, recordingFetch(() => json({}, status)).fetch).translate('x', 'en', 'fr').catch((e: unknown) => e);
      expect((error as TranslationFailure).isServiceProblem, String(status)).toBe(true);
    }
  });

  it('picks DeepL first, then LibreTranslate, then nothing', () => {
    const none = { deeplApiKey: null, libreTranslateUrl: null, libreTranslateApiKey: null };
    expect(createTranslatorFromSettings(none)).toBeNull();
    expect(createTranslatorFromSettings({ ...none, libreTranslateUrl: 'http://homelab:5000' })?.name).toBe('libretranslate');
    expect(createTranslatorFromSettings({ ...none, deeplApiKey: 'abcdefghijk', libreTranslateUrl: 'http://homelab:5000' })?.name).toBe('deepl');
  });

  it('is configured from the environment, and refuses an address that is not http(s)', () => {
    expect(loadConfig({ DEEPL_API_KEY: 'abcdefghij:fx', LIBRETRANSLATE_URL: 'http://homelab:5000' }).translation).toEqual({
      deeplApiKey: 'abcdefghij:fx',
      libreTranslateUrl: 'http://homelab:5000',
      libreTranslateApiKey: null,
    });
    expect(loadConfig({}).translation).toEqual({ deeplApiKey: null, libreTranslateUrl: null, libreTranslateApiKey: null });
    expect(loadConfig({ DEEPL_API_KEY: '' }).translation.deeplApiKey).toBeNull();
    expect(() => loadConfig({ LIBRETRANSLATE_URL: 'file:///etc/passwd' })).toThrow(/LIBRETRANSLATE_URL/);
    expect(() => loadConfig({ LIBRETRANSLATE_URL: 'https://user:pw@homelab:5000' })).toThrow(/user name or password/);
  });

  it('warns when a key would travel in clear text to another machine', () => {
    const base = { host: '127.0.0.1', isCookieSecure: false, setupCode: null };
    const settings = (libreTranslateUrl: string, libreTranslateApiKey: string | null) => ({ deeplApiKey: null, libreTranslateUrl, libreTranslateApiKey });
    expect(securityWarnings({ ...base, translation: settings('http://homelab:5000', 'k') }).join(' ')).toMatch(/travels unencrypted/);
    expect(securityWarnings({ ...base, translation: settings('http://localhost:5000', 'k') })).toEqual([]);
    expect(securityWarnings({ ...base, translation: settings('https://libre.example.org', 'k') })).toEqual([]);
    expect(securityWarnings({ ...base, translation: settings('http://homelab:5000', null) })).toEqual([]);
  });

  it('never looks a genre up on the prototype chain', () => {
    expect(genreLabel('fr', 'constructor')).toBe('constructor');
    expect(genreLabel('fr', '__proto__')).toBe('__proto__');
    expect(genreLabel('fr', 'Comedy')).toBe('Comédie');
  });
});

describe('synopsis translation over http', () => {
  let db: Database;
  let app: FastifyInstance;
  let admin: TestSession;
  let entry: EntryDto;
  const clock = createTestClock();
  const synopsis = 'After the party of heroes defeated the Demon King, they returned to lives of solitude.';
  let translations: string[];
  let failing: boolean;

  const translator: TextTranslator = {
    name: 'fake',
    async translate(text, from, to) {
      translations.push(`${from}>${to}:${text.slice(0, 20)}`);
      if (failing) throw new Error('down');
      await new Promise((resolve) => setTimeout(resolve, 5)); // long enough for two requests to overlap
      return `FR(${text.slice(0, 12)})`;
    },
  };

  const ask = (session: TestSession, id: number, query = 'lang=fr', headers: Record<string, string> = {}) =>
    app.inject({ method: 'GET', url: `/api/library/${id}/synopsis?${query}`, headers: { cookie: session.cookie, ...headers } });

  async function start(options: { translator: TextTranslator | null; translationBudget?: { perHour?: number; perAccount?: number } }) {
    db = await createTestDatabase();
    // `raw` is what Kitsu's own answer leaves in the row: it tells a text that came from Kitsu from one that was imported.
    app = await createTestApp(createTestServices(db, [makeSnapshot({ title: 'Frieren', synopsis, raw: { data: { id: '1' } } })], clock, options));
    admin = await signUpFirstAccount(app);
    const [found] = (await app.inject({ method: 'GET', url: '/api/search?q=Frieren', headers: { cookie: admin.cookie } })).json<{ kitsuId: number }[]>();
    const added = await app.inject({ method: 'POST', url: '/api/library', headers: { cookie: admin.cookie }, payload: { kitsuId: found?.kitsuId, status: 'planned' } });
    entry = added.json<EntryDto>();
  }

  beforeEach(() => {
    translations = [];
    failing = false;
  });
  afterEach(async () => {
    await app.close();
    await db.close();
  });

  it('translates once, keeps it in the database, and serves the second request from there', async () => {
    await start({ translator });
    const first = await ask(admin, entry.id);
    expect(first.json()).toEqual({ text: 'FR(After the pa)', status: 'translated' });
    const second = await ask(admin, entry.id);
    expect(second.json()).toEqual({ text: 'FR(After the pa)', status: 'translated' });
    expect(translations).toHaveLength(1);
    expect(translations[0]).toMatch(/^en>fr:/);
    const [row] = await db.query<{ provider: string; lang: string }>('SELECT provider, lang FROM media_translation');
    expect(row).toEqual({ provider: 'fake', lang: 'fr' });
  });

  it('sends one request to the service when several arrive together', async () => {
    await start({ translator });
    const answers = await Promise.all([ask(admin, entry.id), ask(admin, entry.id), ask(admin, entry.id)]);
    expect(answers.map((answer) => answer.json<{ status: string }>().status)).toEqual(['translated', 'translated', 'translated']);
    expect(translations).toHaveLength(1);
  });

  it('gives the original for English, and never calls the service', async () => {
    await start({ translator });
    expect((await ask(admin, entry.id, 'lang=en')).json()).toEqual({ text: synopsis, status: 'original' });
    expect(translations).toHaveLength(0);
  });

  it('translates again when the synopsis changed at the source', async () => {
    await start({ translator });
    await ask(admin, entry.id);
    await db.query(`UPDATE media SET synopsis = 'A new text, rewritten by the community.'`);
    const again = await ask(admin, entry.id);
    expect(again.json<{ status: string }>().status).toBe('translated');
    expect(translations).toHaveLength(2);
  });

  it('without a service, says so plainly and still gives the original text', async () => {
    await start({ translator: null });
    expect((await ask(admin, entry.id)).json()).toEqual({ text: synopsis, status: 'unavailable' });
  });

  it('leaves a failing service alone for five minutes, then tries again', async () => {
    await start({ translator });
    failing = true;
    expect((await ask(admin, entry.id)).json()).toEqual({ text: synopsis, status: 'unavailable' });
    expect((await ask(admin, entry.id)).json<{ status: string }>().status).toBe('unavailable');
    expect(translations).toHaveLength(1); // the second request did not call the service
    expect(await db.query('SELECT 1 FROM media_translation')).toHaveLength(0); // a failure is never kept

    failing = false;
    clock.advance(5 * 60 * 1000 + 1);
    expect((await ask(admin, entry.id)).json<{ status: string }>().status).toBe('translated');
    expect(translations).toHaveLength(2);
  });

  it('never sends more than the allowed length to the service', async () => {
    await start({ translator });
    await db.query('UPDATE media SET synopsis = $1', ['x'.repeat(MAX_TRANSLATED_CHARACTERS * 3)]);
    let sent = 0;
    const measuring: TextTranslator = { name: 'measure', translate: async (text) => ((sent = text.length), 'ok') };
    await app.close();
    app = await createTestApp(createTestServices(db, [], clock, { translator: measuring }));
    const session = (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@example.com', password: 'une phrase de passe pour les tests' } }));
    const cookie = session.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    await app.inject({ method: 'GET', url: `/api/library/${entry.id}/synopsis?lang=fr`, headers: { cookie } });
    expect(sent).toBe(MAX_TRANSLATED_CHARACTERS);
  });

  /** Puts anime straight into the account's Dex (the fake catalogue only knows one): `fromKitsu` tells where the text came from. */
  async function addRows(owner: TestSession, rows: { title: string; synopsis: string; fromKitsu: boolean }[]): Promise<number[]> {
    const ids: number[] = [];
    for (const row of rows) {
      const [media] = await db.query<{ id: number }>(`INSERT INTO media (title, synopsis, raw) VALUES ($1, $2, $3::jsonb) RETURNING id`, [row.title, row.synopsis, JSON.stringify(row.fromKitsu ? { data: { id: row.title } } : null)]);
      const [entryRow] = await db.query<{ id: number }>(`INSERT INTO library_entry (media_id, user_id, status) VALUES ($1, $2, 'planned') RETURNING id`, [media?.id, owner.user.id]);
      ids.push(entryRow?.id ?? 0);
    }
    return ids;
  }

  it('never sends a text that someone imported: only the texts Kitsu gave', async () => {
    await start({ translator });
    const [imported] = await addRows(admin, [{ title: 'Imported', synopsis: 'A synopsis written by a member in a file.', fromKitsu: false }]);
    expect((await ask(admin, imported ?? 0)).json()).toEqual({ text: 'A synopsis written by a member in a file.', status: 'unavailable' });
    expect(translations).toHaveLength(0);
  });

  it('keeps an hourly budget in characters, for everyone and for each account, and starts again after the hour', async () => {
    await start({ translator, translationBudget: { perHour: 250, perAccount: 120 } });
    const friend = await inviteAndJoin(app, admin, { displayName: 'Camille', email: 'camille@example.com' });
    const texts = Array.from({ length: 4 }, (_, index) => ({ title: `Row ${index}`, synopsis: `${'x'.repeat(59)}${index}`, fromKitsu: true })); // 60 characters each
    const mine = await addRows(admin, texts);
    const theirs = await addRows(friend, texts.map((row) => ({ ...row, title: `Friend ${row.title}` })));
    const status = async (session: TestSession, id: number) => (await ask(session, id)).json<{ status: string }>().status;
    // One account may send 120 characters an hour: two texts of 60 fit, the third does not.
    expect([await status(admin, mine[0] ?? 0), await status(admin, mine[1] ?? 0), await status(admin, mine[2] ?? 0)]).toEqual(['translated', 'translated', 'unavailable']);
    // The friend has a share of their own: together 240 of the 250 allowed, and the friend's third text would be 300.
    expect([await status(friend, theirs[0] ?? 0), await status(friend, theirs[1] ?? 0), await status(friend, theirs[2] ?? 0)]).toEqual(['translated', 'translated', 'unavailable']);
    expect(translations).toHaveLength(4);
    clock.advance(60 * 60 * 1000 + 1);
    expect(await status(admin, mine[2] ?? 0)).toBe('translated');
  });

  it('does not stop for everybody because the service refused one text', async () => {
    const picky: TextTranslator = {
      name: 'picky',
      async translate(text) {
        translations.push(text.slice(0, 8));
        if (text.startsWith('TOO LONG')) throw new TranslationFailure('LibreTranslate answered 400', false);
        return `FR(${text.slice(0, 8)})`;
      },
    };
    await start({ translator: picky });
    const [bad, good] = await addRows(admin, [
      { title: 'Bad', synopsis: 'TOO LONG for this service', fromKitsu: true },
      { title: 'Good', synopsis: 'A normal synopsis that goes through', fromKitsu: true },
    ]);
    expect((await ask(admin, bad ?? 0)).json<{ status: string }>().status).toBe('unavailable');
    expect((await ask(admin, good ?? 0)).json<{ status: string }>().status).toBe('translated'); // the service is not paused
    expect((await ask(admin, bad ?? 0)).json<{ status: string }>().status).toBe('unavailable');
    expect(translations.filter((sent) => sent.startsWith('TOO LONG'))).toHaveLength(1); // and the bad text is not asked again at once
    clock.advance(5 * 60 * 1000 + 1);
    await ask(admin, bad ?? 0);
    expect(translations.filter((sent) => sent.startsWith('TOO LONG'))).toHaveLength(2);
  });

  it('cuts a long text on whole characters: an emoji is never sent in half', async () => {
    let sentText = '';
    const spy: TextTranslator = { name: 'spy', translate: async (text) => ((sentText = text), 'ok') };
    await start({ translator: spy });
    const [long] = await addRows(admin, [{ title: 'Emoji', synopsis: `${'a'.repeat(MAX_TRANSLATED_CHARACTERS - 1)}😀😀😀`, fromKitsu: true }]);
    await ask(admin, long ?? 0);
    expect(Array.from(sentText)).toHaveLength(MAX_TRANSLATED_CHARACTERS);
    expect(sentText).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/); // no lone surrogate
  });

  it('does not hand one text\'s translation to a request about another text of the same anime', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow: TextTranslator = {
      name: 'slow',
      async translate(text) {
        translations.push(text.slice(0, 5));
        if (text.startsWith('FIRST')) await gate;
        return `FR(${text.slice(0, 6)})`;
      },
    };
    await start({ translator: slow });
    const [id] = await addRows(admin, [{ title: 'Moving', synopsis: 'FIRST text of the synopsis', fromKitsu: true }]);
    const firstAsk = ask(admin, id ?? 0);
    await new Promise((resolve) => setTimeout(resolve, 50)); // the first translation is now waiting
    await db.query(`UPDATE media SET synopsis = 'SECOND text of the synopsis' WHERE title = 'Moving'`);
    const secondAnswer = await ask(admin, id ?? 0);
    expect(secondAnswer.json()).toEqual({ text: 'FR(SECOND)', status: 'translated' }); // its own text, not the pending one
    release();
    await firstAsk;
    expect(translations).toEqual(['FIRST', 'SECON']);
  });

  it('only answers for the entries of the signed-in account, and for a language it knows', async () => {
    await start({ translator });
    const friend = await inviteAndJoin(app, admin, { displayName: 'Camille', email: 'camille@example.com' });
    const stranger = await ask(friend, entry.id);
    expect(stranger.statusCode).toBe(404);
    expect(translations).toHaveLength(0);
    expect((await ask(admin, entry.id, 'lang=de')).statusCode).toBe(400);
    expect((await ask(admin, entry.id, '')).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: `/api/library/${entry.id}/synopsis?lang=fr` })).statusCode).toBe(401);
  });

  it('answers its refusals in the language the page asks for', async () => {
    await start({ translator });
    const english = await ask(admin, 999_999, 'lang=fr', { 'accept-language': 'en' });
    expect(english.statusCode).toBe(404);
    expect(english.json()).toEqual({ message: 'Anime not found in your Dex.', code: 'library.entryNotFound' });
    const french = await ask(admin, 999_999, 'lang=fr', { 'accept-language': 'fr' });
    expect(french.json()).toEqual({ message: 'Anime introuvable dans ton Dex.', code: 'library.entryNotFound' });
    const signedOut = await app.inject({ method: 'GET', url: '/api/library', headers: { 'accept-language': 'en-GB,en;q=0.9' } });
    expect(signedOut.json()).toEqual({ message: 'Sign in to continue.', code: 'auth.loginRequired' });
    const unknown = await app.inject({ method: 'GET', url: '/api/library', headers: { 'accept-language': 'de' } });
    expect(unknown.json().message).toBe('Connecte-toi pour continuer.'); // French when nothing is understood
  });

  it('writes the CSV export in the language asked for', async () => {
    await start({ translator });
    const asEnglish = await app.inject({ method: 'GET', url: '/api/export.csv?lang=en', headers: { cookie: admin.cookie } });
    expect(asEnglish.body).toContain('Title,Type,Status,Episodes watched');
    expect(asEnglish.body).toContain('To watch');
    expect(asEnglish.headers['content-disposition']).toContain('otakudex-library.csv');
    const asFrench = await app.inject({ method: 'GET', url: '/api/export.csv', headers: { cookie: admin.cookie } });
    expect(asFrench.body).toContain('Titre,Type,Statut,Épisodes vus');
    expect(asFrench.body).toContain('À voir');
    expect(asFrench.headers['content-disposition']).toContain('otakudex-bibliotheque.csv');
    const fromHeader = await app.inject({ method: 'GET', url: '/api/export.csv', headers: { cookie: admin.cookie, 'accept-language': 'en' } });
    expect(fromHeader.body).toContain('Title,Type');
  });
});
