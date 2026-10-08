import { describe, expect, it } from 'vitest';
import type { EntryDto } from '../shared/domain.ts';
import { allGenres, countByStatus, matchesQuery, normalizeText, selectEntries, type DexFilters } from '../web/src/lib/dex.ts';
import { coverBadges, monogram, posterSrc, progressLabel, progressPercent, remainingMinutes, totalMinutes } from '../web/src/lib/format.ts';
import { forgetReturning, isReturning, rememberReturning } from '../web/src/lib/returning.ts';
import { createFormat } from '../web/src/i18n/format.ts';
import { access as englishAccess } from '../web/src/i18n/messages/en/access.ts';
import { app as englishApp } from '../web/src/i18n/messages/en/app.ts';
import { access as frenchAccess } from '../web/src/i18n/messages/fr/access.ts';
import { app as frenchApp } from '../web/src/i18n/messages/fr/app.ts';
import { createTranslate } from '../web/src/i18n/translate.ts';
import { buildColumns, TILE_GAP, tileWidthFor, wallGeometryFor } from '../web/src/lib/backdrop.ts';
import { buildAccessLink, emailProblem, nameProblem, parseAccessLink, requiredPasswordProblem } from '../web/src/lib/access.ts';
import { caretAfterDigits, dateInputFor, dateOrderProblem, isoToFrench, maskEnglishDate, maskFrenchDate, parseEnglishDate, parseFrenchDate, todayIso } from '../web/src/lib/dates.ts';
import { parseProgress, patchForProgress, patchForStatus, primaryActionOf, withPatchApplied } from '../web/src/lib/entry-rules.ts';
import { withEpisodeMarked, withEpisodeUndone } from '../web/src/lib/optimistic.ts';

const fr = createFormat('fr', createTranslate('fr', { ...frenchAccess, ...frenchApp }));
const en = createFormat('en', createTranslate('en', { ...englishAccess, ...englishApp }));

let nextId = 1;

function makeEntry(overrides: Omit<Partial<EntryDto>, 'media'> & { media?: Partial<EntryDto['media']> } = {}): EntryDto {
  const id = nextId++;
  const { media, ...rest } = overrides;
  return {
    id,
    status: 'planned',
    progress: 0,
    rewatchCount: 0,
    bucket: null,
    rankPosition: null,
    score: null,
    tier: null,
    startedOn: null,
    completedOn: null,
    note: null,
    createdAt: `2026-01-${String(id).padStart(2, '0')}T10:00:00.000Z`,
    lastActivityAt: null,
    media: {
      id,
      kitsuId: id,
      title: `Anime ${id}`,
      titleEn: null,
      titleJa: null,
      synopsis: null,
      subtype: 'TV',
      episodeCount: 12,
      episodeLengthMin: 24,
      startDate: null,
      genres: [],
      posterUrl: null,
      communityScore: null,
      ...media,
    },
    ...rest,
  };
}

const NO_FILTER: DexFilters = { status: 'all', genre: '', query: '', sort: 'relevance' };

describe('dex filtering and sorting', () => {
  it('ignores case and accents when searching titles in every language', () => {
    const entry = makeEntry({ media: { title: 'Éclair du soir', titleEn: 'Evening Lightning', titleJa: '夜の稲妻' } });
    expect(normalizeText('  Éclair ')).toBe('eclair');
    expect(matchesQuery(entry, 'ECLAIR')).toBe(true);
    expect(matchesQuery(entry, 'lightning')).toBe(true);
    expect(matchesQuery(entry, '稲妻')).toBe(true);
    expect(matchesQuery(entry, 'zzz')).toBe(false);
    expect(matchesQuery(entry, '   ')).toBe(true);
  });

  it('filters by status, genre and query together', () => {
    const entries = [
      makeEntry({ status: 'watching', media: { title: 'Alpha', genres: ['Action'] } }),
      makeEntry({ status: 'watching', media: { title: 'Beta', genres: ['Drama'] } }),
      makeEntry({ status: 'completed', media: { title: 'Alpha 2', genres: ['Action'] } }),
    ];
    const titles = (filters: Partial<DexFilters>) => selectEntries(entries, { ...NO_FILTER, ...filters, sort: 'title' }).map((entry) => entry.media.title);

    expect(titles({ status: 'watching' })).toEqual(['Alpha', 'Beta']);
    expect(titles({ genre: 'Action' })).toEqual(['Alpha', 'Alpha 2']);
    expect(titles({ status: 'watching', genre: 'Action', query: 'alp' })).toEqual(['Alpha']);
    expect(titles({ query: 'nothing' })).toEqual([]);
  });

  it('puts what is being watched first, most recent activity first', () => {
    const planned = makeEntry({ status: 'planned', media: { title: 'Planned' } });
    const done = makeEntry({ status: 'completed', media: { title: 'Done' } });
    const olderWatch = makeEntry({ status: 'watching', lastActivityAt: '2026-09-01T20:00:00.000Z', media: { title: 'Older' } });
    const newerWatch = makeEntry({ status: 'watching', lastActivityAt: '2026-10-05T20:00:00.000Z', media: { title: 'Newer' } });

    const order = selectEntries([done, planned, olderWatch, newerWatch], NO_FILTER).map((entry) => entry.media.title);
    expect(order).toEqual(['Newer', 'Older', 'Planned', 'Done']);
  });

  it('sorts by rank with unranked entries last, and by title or date added', () => {
    const second = makeEntry({ rankPosition: 2, bucket: 'loved', media: { title: 'Second' } });
    const first = makeEntry({ rankPosition: 1, bucket: 'loved', media: { title: 'First' } });
    const unranked = makeEntry({ media: { title: 'Unranked' } });
    const sorted = (sort: DexFilters['sort']) => selectEntries([unranked, second, first], { ...NO_FILTER, sort }).map((entry) => entry.media.title);

    expect(sorted('rank')).toEqual(['First', 'Second', 'Unranked']);
    expect(sorted('title')).toEqual(['First', 'Second', 'Unranked']);
    expect(sorted('added')).toEqual(['Unranked', 'First', 'Second']); // newest first: they were created Second, First, Unranked
  });

  it('does not modify the list it receives', () => {
    const entries = [makeEntry({ media: { title: 'B' } }), makeEntry({ media: { title: 'A' } })];
    selectEntries(entries, { ...NO_FILTER, sort: 'title' });
    expect(entries.map((entry) => entry.media.title)).toEqual(['B', 'A']);
  });

  it('lists genres once, and counts statuses', () => {
    const entries = [
      makeEntry({ status: 'watching', media: { genres: ['Drama', 'Action'] } }),
      makeEntry({ status: 'watching', media: { genres: ['Action'] } }),
      makeEntry({ status: 'dropped', media: { genres: [] } }),
    ];
    expect(allGenres(entries).sort()).toEqual(['Action', 'Drama']);
    expect(countByStatus(entries)).toEqual({ all: 3, planned: 0, watching: 2, completed: 0, paused: 0, dropped: 1 });
  });
});

describe('formatting', () => {
  it('writes durations in minutes, hours and days, in both languages', () => {
    expect(fr.duration(0)).toBe('0 min');
    expect(fr.duration(45)).toBe('45 min');
    expect(fr.duration(60)).toBe('1 h');
    expect(fr.duration(125)).toBe('2 h 05');
    expect(fr.duration(24 * 60)).toBe('1 j');
    expect(fr.duration(7444)).toBe('5 j 4 h');
    expect(fr.duration(-5)).toBe('0 min');
    expect(en.duration(7444)).toBe('5 d 4 h');
    expect(en.duration(125)).toBe('2 h 05');
  });

  it('builds the same-origin poster route and a monogram fallback', () => {
    expect(posterSrc(null)).toBeNull();
    expect(posterSrc('https://media.kitsu.app/a b.jpg')).toBe('/api/poster?url=https%3A%2F%2Fmedia.kitsu.app%2Fa%20b.jpg');
    expect(monogram('Sousou no Frieren')).toBe('SN');
    expect(monogram('  ')).toBe('?');
    expect(monogram('Bleach')).toBe('B');
  });

  it('describes progress with and without a known episode count', () => {
    const known = makeEntry({ progress: 3, media: { episodeCount: 12 } });
    const unknown = makeEntry({ progress: 3, media: { episodeCount: null } });
    expect(progressLabel(known)).toBe('3 / 12');
    expect(progressLabel(unknown)).toBe('3');
    expect(progressPercent(known)).toBe(25);
    expect(progressPercent(unknown)).toBeNull();
    expect(progressPercent(makeEntry({ progress: 20, media: { episodeCount: 12 } }))).toBe(100);
    expect(totalMinutes(known)).toBe(288);
    expect(totalMinutes(makeEntry({ media: { episodeLengthMin: null } }))).toBeNull();
  });

});

describe('remaining time', () => {
  it('multiplies the episodes left by their length, or says it is unknown', () => {
    const entry = makeEntry({ progress: 19, media: { episodeCount: 28, episodeLengthMin: 24 } });
    expect(remainingMinutes(entry)).toBe(216);
    expect(fr.remaining(entry)).toBe('reste 3 h 36');
    expect(en.remaining(entry)).toBe('3 h 36 left');
    expect(remainingMinutes(makeEntry({ progress: 30, media: { episodeCount: 28, episodeLengthMin: 24 } }))).toBe(0);
    expect(fr.remaining(makeEntry({ media: { episodeCount: null } }))).toBe('durée inconnue');
    expect(en.remaining(makeEntry({ media: { episodeLengthMin: null } }))).toBe('length unknown');
  });
});

describe('optimistic episode', () => {
  const now = '2026-10-08T10:00:00.000Z';

  it('starts a planned anime and moves its progress up by one', () => {
    const result = withEpisodeMarked(makeEntry({ status: 'planned', progress: 0, media: { episodeCount: 12 } }), now);
    expect(result).toMatchObject({ status: 'watching', progress: 1, lastActivityAt: now });
  });

  it('completes the anime on its last episode, like the server', () => {
    expect(withEpisodeMarked(makeEntry({ status: 'watching', progress: 11, media: { episodeCount: 12 } }), now).status).toBe('completed');
  });

  it('never completes by itself when the episode count is unknown', () => {
    expect(withEpisodeMarked(makeEntry({ status: 'watching', progress: 99, media: { episodeCount: null } }), now).status).toBe('watching');
  });

  it('keeps a completed anime completed and leaves the original untouched', () => {
    const original = makeEntry({ status: 'completed', progress: 5, media: { episodeCount: null } });
    expect(withEpisodeMarked(original, now).status).toBe('completed');
    expect(original.progress).toBe(5);
  });
});

describe('optimistic undo', () => {
  it('removes one episode and leaves "completed"', () => {
    const result = withEpisodeUndone(makeEntry({ status: 'completed', progress: 12, completedOn: '2026-10-01' }));
    expect(result.progress).toBe(11);
    expect(result.status).toBe('watching');
    expect(result.completedOn).toBeNull();
  });

  it('never goes below zero and keeps other statuses', () => {
    const result = withEpisodeUndone(makeEntry({ status: 'paused', progress: 0 }));
    expect(result.progress).toBe(0);
    expect(result.status).toBe('paused');
  });
});

describe('french dates', () => {
  it('reads the usual ways of writing a day', () => {
    for (const text of ['03/10/2026', '3/10/2026', '03-10-2026', '03.10.2026', '03102026', ' 3 10 2026 ']) {
      expect(parseFrenchDate(text)).toEqual({ kind: 'date', iso: '2026-10-03' });
    }
  });

  it('tells empty from invalid, and refuses days that do not exist', () => {
    expect(parseFrenchDate('  ')).toEqual({ kind: 'empty' });
    for (const text of ['31/02/2026', '10/13/2026', '03/10/26', 'hier', '03/10', '00/01/2026', '01/01/1800']) {
      expect(parseFrenchDate(text)).toEqual({ kind: 'invalid' });
    }
    expect(parseFrenchDate('29/02/2028')).toEqual({ kind: 'date', iso: '2028-02-29' });
    expect(parseFrenchDate('29/02/2027')).toEqual({ kind: 'invalid' });
  });

  it('writes an ISO date the French way and back', () => {
    expect(isoToFrench('2026-10-03')).toBe('03/10/2026');
    expect(isoToFrench(null)).toBe('');
    expect(fr.shortDate('2026-10-03')).toBe('3 oct. 2026');
    expect(en.shortDate('2026-10-03')).toBe('3 Oct 2026');
  });

  it('inserts the slashes while typing, one digit at a time', () => {
    expect(maskFrenchDate('0')).toBe('0');
    expect(maskFrenchDate('03')).toBe('03');
    expect(maskFrenchDate('031')).toBe('03/1');
    expect(maskFrenchDate('0310')).toBe('03/10');
    expect(maskFrenchDate('03/10/20')).toBe('03/10/20');
    expect(maskFrenchDate('03102026')).toBe('03/10/2026');
    expect(maskFrenchDate('0310202699')).toBe('03/10/2026');
    expect(maskFrenchDate('a3b1')).toBe('31');
  });

  it('puts the caret after the digits typed, not after the slashes', () => {
    expect(caretAfterDigits('03/1', 3)).toBe(4);
    expect(caretAfterDigits('03/10/2026', 2)).toBe(2);
    expect(caretAfterDigits('03/10/2026', 4)).toBe(5);
    expect(caretAfterDigits('', 0)).toBe(0);
  });

  it('gives today in the local calendar, not in UTC', () => {
    expect(todayIso(new Date(2026, 9, 3, 23, 30))).toBe('2026-10-03');
    expect(todayIso(new Date(2026, 0, 5, 0, 5))).toBe('2026-01-05');
  });

  it('refuses an end before the start, with a way out, and accepts the same day', () => {
    expect(dateOrderProblem('2026-10-05', '2026-10-03', 'completedOn', isoToFrench)).toEqual({ key: 'date.beforeStart', params: { date: '05/10/2026' } });
    expect(dateOrderProblem('2026-10-05', '2026-10-03', 'startedOn', isoToFrench)).toEqual({ key: 'date.afterEnd', params: { date: '03/10/2026' } });
    expect(dateOrderProblem('2026-10-03', '2026-10-03', 'completedOn', isoToFrench)).toBeNull();
    expect(dateOrderProblem(null, '2026-10-03', 'completedOn', isoToFrench)).toBeNull();
    expect(dateOrderProblem('2026-10-05', null, 'startedOn', isoToFrench)).toBeNull();
  });
});

describe('english dates', () => {
  it('are typed year first, so no one reads day and month the wrong way round', () => {
    for (const text of ['2026-10-03', '2026/10/03', '2026.10.03', '20261003', ' 2026 10 03 ']) {
      expect(parseEnglishDate(text), text).toEqual({ kind: 'date', iso: '2026-10-03' });
    }
    expect(parseEnglishDate('2026-1-3')).toEqual({ kind: 'date', iso: '2026-01-03' });
    for (const text of ['03/10/2026', '2026-02-31', '10-03', 'yesterday']) expect(parseEnglishDate(text), text).toEqual({ kind: 'invalid' });
    expect(parseEnglishDate(' ')).toEqual({ kind: 'empty' });
  });

  it('inserts the dashes while typing', () => {
    expect(maskEnglishDate('2026')).toBe('2026');
    expect(maskEnglishDate('20261')).toBe('2026-1');
    expect(maskEnglishDate('202610')).toBe('2026-10');
    expect(maskEnglishDate('2026100399')).toBe('2026-10-03');
  });

  it('are chosen by the language of the screen', () => {
    expect(dateInputFor('fr').toText('2026-10-03')).toBe('03/10/2026');
    expect(dateInputFor('en').toText('2026-10-03')).toBe('2026-10-03');
    expect(dateInputFor('en').mask('20261003')).toBe('2026-10-03');
  });
});

describe('entry sheet rules', () => {
  const today = '2026-10-08';

  it('fills the dates a status implies and never overwrites one', () => {
    const fresh = makeEntry({ status: 'planned' });
    expect(patchForStatus(fresh, 'watching', today)).toEqual({ status: 'watching', startedOn: today });
    expect(patchForStatus(fresh, 'completed', today)).toEqual({ status: 'completed', startedOn: today, completedOn: today });
    expect(patchForStatus(fresh, 'paused', today)).toEqual({ status: 'paused' });
    const started = makeEntry({ status: 'watching', startedOn: '2026-09-01', completedOn: '2026-09-30' });
    expect(patchForStatus(started, 'completed', today)).toEqual({ status: 'completed' });
  });

  it('makes the status follow a hand-set progress', () => {
    const planned = makeEntry({ status: 'planned', media: { episodeCount: 12 } });
    expect(patchForProgress(planned, 8, today)).toEqual({ progress: 8, startedOn: today, status: 'watching' });
    expect(patchForProgress(planned, 12, today)).toEqual({ progress: 12, startedOn: today, status: 'completed', completedOn: today });
    expect(patchForProgress(planned, 0, today)).toEqual({ progress: 0 });
    const done = makeEntry({ status: 'completed', progress: 12, startedOn: '2026-09-01', completedOn: '2026-09-20', media: { episodeCount: 12 } });
    expect(patchForProgress(done, 10, today)).toEqual({ progress: 10, status: 'watching' });
    expect(patchForProgress(done, 12, today)).toEqual({ progress: 12 });
    const unknownTotal = makeEntry({ status: 'planned', media: { episodeCount: null } });
    expect(patchForProgress(unknownTotal, 30, today)).toEqual({ progress: 30, startedOn: today, status: 'watching' });
  });

  it('reads a typed progress and names the allowed range', () => {
    expect(parseProgress(' 8 ', 12)).toEqual({ ok: true, value: 8 });
    expect(parseProgress('0', 12)).toEqual({ ok: true, value: 0 });
    expect(parseProgress('13', 12)).toEqual({ ok: false, problem: { key: 'progress.integerBetween', params: { max: 12 } } });
    expect(parseProgress('', 12).ok).toBe(false);
    expect(parseProgress('3,5', 12).ok).toBe(false);
    expect(parseProgress('-1', null)).toEqual({ ok: false, problem: { key: 'progress.integer' } });
    expect(parseProgress('500', null)).toEqual({ ok: true, value: 500 });
  });

  it('shows a patch before the server answers, with the same rules as the server', () => {
    const watching = makeEntry({ status: 'watching', progress: 3, media: { episodeCount: 12 } });
    expect(withPatchApplied(watching, { status: 'completed' }).progress).toBe(12);
    expect(withPatchApplied(watching, { status: 'completed', progress: 5 }).progress).toBe(5);
    expect(withPatchApplied(watching, { note: 'top' }).note).toBe('top');
    expect(withPatchApplied(watching, { note: null }).note).toBeNull();
    expect(withPatchApplied(watching, { startedOn: '2026-10-01', rewatchCount: 2 })).toMatchObject({ startedOn: '2026-10-01', rewatchCount: 2, progress: 3 });
  });

  it('drops the rank when an entry goes back to "to watch"', () => {
    const ranked = makeEntry({ status: 'completed', bucket: 'loved', rankPosition: 3, score: 88, tier: 'A' });
    expect(withPatchApplied(ranked, { status: 'planned' })).toMatchObject({ status: 'planned', bucket: null, rankPosition: null, score: null, tier: null });
    expect(withPatchApplied(ranked, { note: 'x' })).toMatchObject({ rankPosition: 3, tier: 'A' });
  });

  it('puts one action forward from the state of the entry', () => {
    expect(primaryActionOf(makeEntry({ status: 'planned', progress: 0, media: { episodeCount: 12 } }))).toBe('mark');
    expect(primaryActionOf(makeEntry({ status: 'watching', progress: 4, media: { episodeCount: 12 } }))).toBe('mark');
    expect(primaryActionOf(makeEntry({ status: 'watching', progress: 40, media: { episodeCount: null } }))).toBe('mark');
    expect(primaryActionOf(makeEntry({ status: 'completed', progress: 12, media: { episodeCount: 12 } }))).toBe('rank');
    expect(primaryActionOf(makeEntry({ status: 'completed', progress: 12, rankPosition: 2, bucket: 'loved', media: { episodeCount: 12 } }))).toBeNull();
    expect(primaryActionOf(makeEntry({ status: 'dropped', progress: 12, media: { episodeCount: 12 } }))).toBeNull();
  });

  it('summarises what the closed details hold', () => {
    expect(fr.detailsSummary(makeEntry())).toBe('Dates, revisionnages, note');
    expect(fr.detailsSummary(makeEntry({ startedOn: '2026-10-03', rewatchCount: 2, note: 'bien' }))).toBe('Commencé le 3 oct. 2026 · 2 revisionnages · Note');
    expect(fr.detailsSummary(makeEntry({ completedOn: '2026-10-10', rewatchCount: 1 }))).toBe('Terminé le 10 oct. 2026 · 1 revisionnage');
    expect(en.detailsSummary(makeEntry({ completedOn: '2026-10-10', rewatchCount: 1 }))).toBe('Completed 10 Oct 2026 · 1 rewatch');
  });
});

describe('access links', () => {
  const token = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN-_0'; // 43 characters

  it('reads an invitation or a reset link from the address hash', () => {
    expect(token).toHaveLength(43);
    expect(parseAccessLink(`#/invitation/${token}`)).toEqual({ kind: 'invitation', token });
    expect(parseAccessLink(`#/reinitialisation/${token}`)).toEqual({ kind: 'reset', token });
  });

  it('ignores everything else, including the normal pages', () => {
    for (const hash of ['', '#', '#/dex', '#/stats', '#/invitation', '#/invitation/short', `#/invitation/${token}x`, `#/invitation/${token}/more`, `#/autre/${token}`, `#/invitation/${token.replace('a', '!')}`]) {
      expect(parseAccessLink(hash), hash).toBeNull();
    }
  });

  it('builds the link the administrator shares, secret after the "#"', () => {
    const link = buildAccessLink('https://dex.example.org', { kind: 'invitation', token });
    expect(link).toBe(`https://dex.example.org/#/invitation/${token}`);
    expect(parseAccessLink(link.slice(link.indexOf('#')))).toEqual({ kind: 'invitation', token });
  });
});

describe('access form checks', () => {
  it('catches an e-mail typo with a hint, and lets a plausible one through', () => {
    expect(emailProblem('')).toEqual({ key: 'problem.emailEmpty' });
    for (const value of ['camille', 'camille@', 'camille@exemple', 'ca mille@exemple.fr', '@exemple.fr']) {
      expect(emailProblem(value), value).toEqual({ key: 'problem.emailInvalid' });
    }
    expect(emailProblem(' camille@exemple.fr ')).toBeNull();
    expect(emailProblem('prenom.nom+dex@mail.example.org')).toBeNull();
  });

  it('asks for a name, of a sensible length', () => {
    expect(nameProblem('  ')).toEqual({ key: 'problem.nameEmpty' });
    expect(nameProblem('Camille')).toBeNull();
    expect(nameProblem('x'.repeat(61))).toEqual({ key: 'problem.nameTooLong', params: { max: 60 } });
  });

  it('only asks the sign-in form for a password, not for a length', () => {
    expect(requiredPasswordProblem('')).toEqual({ key: 'problem.passwordEmpty' });
    expect(requiredPasswordProblem('x')).toBeNull();
  });

  it('says how long an invitation still has to live', () => {
    const now = new Date('2026-10-08T10:00:00Z');
    const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000).toISOString();
    expect(fr.expiresIn(at(-1), now)).toBe('expiré');
    expect(fr.expiresIn(at(5), now)).toBe('expire aujourd’hui');
    expect(fr.expiresIn(at(30), now)).toBe('expire dans 2 jours');
    expect(fr.expiresIn(at(24), now)).toBe('expire demain');
    expect(fr.expiresIn(at(7 * 24), now)).toBe('expire dans 7 jours');
    expect(en.expiresIn(at(30), now)).toBe('expires in 2 days');
    expect(en.expiresIn(at(24), now)).toBe('expires tomorrow');
    expect(en.expiresIn(at(5), now)).toBe('expires today');
  });
});

describe('the wall of covers behind the sign-in screens', () => {
  const sizes = [[375, 812], [390, 844], [768, 1024], [1280, 800], [1920, 1080], [2560, 1440], [3840, 2160]] as const;

  it('scales the tile with the screen, within bounds', () => {
    expect(tileWidthFor(320)).toBe(104);
    expect(tileWidthFor(1280)).toBe(109);
    expect(tileWidthFor(1920)).toBe(163);
    expect(tileWidthFor(3840)).toBe(180);
  });

  it('has columns and rows enough to cover every screen once tilted, whatever the number of covers', () => {
    for (const [width, height] of sizes) {
      for (const imageCount of [0, 1, 2, 7, 14, 16]) {
        const { tileWidth, columns, tilesPerColumn } = wallGeometryFor(width, height, imageCount);
        const columnLength = tilesPerColumn * (tileWidth * 1.5 + TILE_GAP);
        const needed = height * 1.08 + width * 0.2;
        expect(columns * (tileWidth + TILE_GAP), `${width}x${height} columns`).toBeGreaterThanOrEqual(width * 1.2);
        expect(columnLength, `${width}x${height} rows`).toBeGreaterThanOrEqual(needed);
      }
    }
  });

  it('never loops a column onto the same cover: the last row and the first one differ', () => {
    for (const imageCount of [2, 3, 4, 5, 6, 7, 8, 12, 14, 16]) {
      for (const [width, height] of sizes) {
        const { tilesPerColumn } = wallGeometryFor(width, height, imageCount);
        expect((tilesPerColumn - 1) % imageCount, `${imageCount} covers at ${width}x${height}`).not.toBe(0);
      }
    }
  });

  it('puts no cover next to itself, sideways or downwards, nor across the loop', () => {
    const images = Array.from({ length: 16 }, (_, index) => `/api/backdrop/${index}?v=a`);
    for (const imageCount of [2, 3, 5, 8, 16]) {
      const used = images.slice(0, imageCount);
      for (const columnCount of [4, 6, 9, 13]) {
        const { tilesPerColumn } = wallGeometryFor(1920, 1080, imageCount);
        const wall = buildColumns(used, columnCount, tilesPerColumn);
        for (let column = 0; column < columnCount; column += 1) {
          for (let row = 0; row < tilesPerColumn; row += 1) {
            const tile = wall[column]![row]!;
            const below = wall[column]![(row + 1) % tilesPerColumn]!; // modulo: the loop
            expect(below.src, `${imageCount} covers, ${columnCount} columns, column ${column} row ${row}`).not.toBe(tile.src);
            const right = wall[column + 1]?.[row];
            if (right) expect(right.src, `${imageCount} covers, row ${row}, columns ${column}/${column + 1}`).not.toBe(tile.src);
          }
        }
      }
    }
  });

  it('shows placeholders only when there is no cover, and spells the name round the wall', () => {
    const wall = buildColumns([], 4, 8);
    expect(wall).toHaveLength(4);
    expect(wall.every((column) => column.length === 8 && column.every((tile) => tile.src === null))).toBe(true);
    expect(wall[0]!.map((tile) => tile.letter).join('')).toBe('OTAKUDEX');
    expect(buildColumns(['/a'], 2, 3).flat().every((tile) => tile.src === '/a')).toBe(true); // one cover: it repeats, nothing to avoid
  });

  it('uses every cover somewhere, so the wall is not made of the first few', () => {
    const images = Array.from({ length: 16 }, (_, index) => `/c${index}`);
    const { tilesPerColumn } = wallGeometryFor(1920, 1080, 16);
    const shown = new Set(buildColumns(images, 13, tilesPerColumn).flat().map((tile) => tile.src));
    expect(shown.size).toBe(16);
  });
});

describe('cover badges and the name of the cover button (NFR-62)', () => {
  const t = createTranslate('fr', { ...frenchAccess, ...frenchApp });

  it('shows the tier and the status, and nothing for a title being watched', () => {
    expect(coverBadges(makeEntry({ status: 'completed', tier: 'S' }), 'fr')).toEqual({ tier: 'S', status: 'Terminé' });
    expect(coverBadges(makeEntry({ status: 'completed', tier: 'S' }), 'en').status).toBe('Completed');
    expect(coverBadges(makeEntry({ status: 'watching' }), 'fr')).toEqual({ tier: null, status: null });
    expect(coverBadges(makeEntry({ status: 'planned' }), 'fr')).toEqual({ tier: null, status: 'À voir' });
  });

  it('puts every visible badge text into the name that opens the entry', () => {
    const { tier, status } = coverBadges(makeEntry({ status: 'completed', tier: 'S' }), 'fr');
    const visibleText = [tier, status].join(' ');
    const name = t('card.openWith', { title: 'Frieren', badges: visibleText });
    expect(name).toBe('Ouvrir Frieren, S Terminé');
    expect(name).toContain(visibleText);
  });
});

describe('the "returning" mark that lets the application load early (NFR-61)', () => {
  /** A storage that lives in a Map, like the browser's but without the browser. */
  function memoryStore() {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
      values,
    };
  }

  it('is absent at first, set by a sign-in and dropped by a sign-out', () => {
    const store = memoryStore();
    expect(isReturning(store)).toBe(false);
    rememberReturning(store);
    expect(isReturning(store)).toBe(true);
    forgetReturning(store);
    expect(isReturning(store)).toBe(false);
  });

  it('holds nothing about the person: one fixed word, no name, no token', () => {
    const store = memoryStore();
    rememberReturning(store);
    expect([...store.values.values()]).toEqual(['1']);
  });

  it('does not break when the storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(isReturning(blocked)).toBe(false);
    expect(() => rememberReturning(blocked)).not.toThrow();
    expect(() => forgetReturning(blocked)).not.toThrow();
    expect(isReturning(null)).toBe(false);
  });
});
