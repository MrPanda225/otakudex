import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../server/db/database.ts';
import { ConflictError, ValidationError } from '../server/errors.ts';
import { entriesToCsv, escapeCsvCell } from '../server/export/csv.ts';
import { exportFileSchema } from '../server/export/schema.ts';
import { assertValidRanking } from '../server/export/service.ts';
import { createTestDatabase, createTestServices, createTestUser, makeSnapshot } from './helpers.ts';

describe('csv', () => {
  it('quotes cells that contain separators, quotes or line breaks', () => {
    expect(escapeCsvCell('plain')).toBe('plain');
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('two\nlines')).toBe('"two\nlines"');
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(42)).toBe('42');
  });

  it('neutralises spreadsheet formulas in text but leaves numbers alone', () => {
    expect(escapeCsvCell('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(escapeCsvCell('+1234')).toBe("'+1234");
    expect(escapeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(escapeCsvCell(-5)).toBe('-5');
  });

  it('writes a header, one row per entry and a UTF-8 byte order mark', async () => {
    const db = await createTestDatabase();
    const userId = await createTestUser(db);
    const snapshot = makeSnapshot({ title: 'Cowboy, Bebop', genres: ['Action', 'Sci-Fi'] });
    const services = createTestServices(db, [snapshot]);
    const entry = await services.library.addFromKitsu(userId, snapshot.kitsuId!, 'completed');
    await services.ranking.place(userId, entry.id, 'loved', 0);

    const csv = await services.exporter.toCsv(userId);
    const [header, row] = csv.replace('﻿', '').split('\r\n');

    expect(csv.startsWith('﻿')).toBe(true);
    expect(header).toBe(
      'Titre,Type,Statut,Épisodes vus,Épisodes total,Compartiment,Rang,Note sur 100,Tier,Début,Fin,Revisionnages,Genres,Note privée',
    );
    expect(row).toBe('"Cowboy, Bebop",TV,Terminé,12,12,Adoré,1,100,S,,,0,Action / Sci-Fi,');
    expect(entriesToCsv([])).toBe(`﻿${header}\r\n`);
    await db.close();
  });
});

describe('ranking validation of an import file', () => {
  const entry = (bucket: 'loved' | 'liked' | 'meh' | null, rankPosition: number | null, status: 'completed' | 'planned' = 'completed') => ({ bucket, rankPosition, status });

  it('accepts a coherent ranking, ranked or not', () => {
    expect(() => assertValidRanking([entry('loved', 1), entry('liked', 2), entry(null, null)])).not.toThrow();
    expect(() => assertValidRanking([])).not.toThrow();
  });

  it('rejects gaps, duplicates, broken bucket order and half-ranked entries', () => {
    expect(() => assertValidRanking([entry('loved', 1), entry('loved', 3)])).toThrow(ValidationError);
    expect(() => assertValidRanking([entry('loved', 1), entry('loved', 1)])).toThrow(ValidationError);
    expect(() => assertValidRanking([entry('meh', 1), entry('loved', 2)])).toThrow(ValidationError);
    expect(() => assertValidRanking([entry('loved', null)])).toThrow(ValidationError);
    expect(() => assertValidRanking([entry('loved', 1, 'planned')])).toThrow(ValidationError);
  });
});

describe('json export and restore', () => {
  let source: Database;
  let target: Database;
  let sourceUser: number;
  let targetUser: number;

  beforeEach(async () => {
    source = await createTestDatabase();
    target = await createTestDatabase();
    sourceUser = await createTestUser(source);
    targetUser = await createTestUser(target);
  });
  afterEach(async () => {
    await source.close();
    await target.close();
  });

  async function buildLibrary() {
    const finished = makeSnapshot({ title: 'Finished', episodeCount: 2, genres: ['Drama'] });
    const running = makeSnapshot({ title: 'Running', episodeCount: null });
    const planned = makeSnapshot({ title: 'Planned' });
    const services = createTestServices(source, [finished, running, planned]);

    const a = await services.library.addFromKitsu(sourceUser, finished.kitsuId!, 'watching');
    await services.library.markEpisode(sourceUser, a.id);
    await services.library.markEpisode(sourceUser, a.id);
    const b = await services.library.addFromKitsu(sourceUser, running.kitsuId!, 'watching');
    await services.library.markEpisode(sourceUser, b.id);
    await services.library.addFromKitsu(sourceUser, planned.kitsuId!, 'planned');
    const manual = await services.library.addManual(sourceUser, { title: 'By hand', episodeCount: 5, episodeLengthMin: 20, status: 'completed' });
    await services.library.update(sourceUser, a.id, { note: 'Superbe', rewatchCount: 1 });

    await services.ranking.place(sourceUser, a.id, 'loved', 0);
    await services.ranking.place(sourceUser, manual.id, 'loved', 1);
    await services.ranking.place(sourceUser, b.id, 'meh', 0);
    return services;
  }

  it('restores a library identically into an empty database', async () => {
    const original = await buildLibrary();
    const exported = await original.exporter.toJson(sourceUser, new Date('2026-10-07T12:00:00Z'));
    const parsed = exportFileSchema.parse(JSON.parse(JSON.stringify(exported)));

    const restored = createTestServices(target);
    expect(await restored.exporter.restore(targetUser, parsed)).toEqual({ entryCount: 4 });

    const again = await restored.exporter.toJson(targetUser, new Date('2026-10-07T12:00:00Z'));
    expect(again).toEqual(exported);
    expect(await restored.library.list(targetUser)).toEqual(await original.library.list(sourceUser));
  });

  it('refuses to restore into a library that already has entries', async () => {
    const original = await buildLibrary();
    const exported = await original.exporter.toJson(sourceUser);
    await expect(original.exporter.restore(sourceUser, exported)).rejects.toBeInstanceOf(ConflictError);
  });

  it('leaves the database empty when a restore fails halfway', async () => {
    const original = await buildLibrary();
    const exported = await original.exporter.toJson(sourceUser);
    const broken = structuredClone(exported);
    broken.entries[3]!.media.title = 'x'.repeat(10); // valid on its own...
    broken.entries[3]!.progress = 1;
    broken.entries[1]!.log.push({ episodeNumber: 1, watchedAt: 'not a date' }); // ...but this row breaks the insert

    const restored = createTestServices(target);
    await expect(restored.exporter.restore(targetUser, broken)).rejects.toThrow();
    expect(await restored.library.list(targetUser)).toEqual([]);
  });

  it('applies the same limits as the API to what a file contains', async () => {
    const original = await buildLibrary();
    const valid = JSON.parse(JSON.stringify(await original.exporter.toJson(sourceUser)));
    expect(exportFileSchema.safeParse(valid).success).toBe(true);

    const withChange = (change: (file: typeof valid) => void) => {
      const copy = structuredClone(valid);
      change(copy);
      return exportFileSchema.safeParse(copy).success;
    };
    expect(withChange((file) => (file.entries[0].media.episodeCount = 100_000))).toBe(false);
    expect(withChange((file) => (file.entries[0].media.episodeLengthMin = 100_000))).toBe(false);
    expect(withChange((file) => (file.entries[0].rewatchCount = 100_000))).toBe(false);
    expect(withChange((file) => (file.entries[0].progress = file.entries[0].media.episodeCount + 1))).toBe(false);
    expect(withChange((file) => (file.entries[0].createdAt = 'yesterday'))).toBe(false);
    expect(withChange((file) => (file.entries[0].media.posterUrl = 'https://evil.example/a.jpg'))).toBe(false);
    expect(withChange((file) => (file.entries[0].media.posterUrl = null))).toBe(true);
  });

  it('rejects files that are not an Otakudex export', () => {
    expect(exportFileSchema.safeParse({ format: 'other', version: 1, entries: [] }).success).toBe(false);
    expect(exportFileSchema.safeParse({ format: 'otakudex-export', version: 2, exportedAt: 'x', entries: [] }).success).toBe(false);
  });

  it('restores the demo export shipped in examples/', async () => {
    const content: unknown = JSON.parse(await readFile(new URL('../examples/demo-export.json', import.meta.url), 'utf8'));
    const restored = createTestServices(target);

    expect(await restored.exporter.restore(targetUser, exportFileSchema.parse(content))).toEqual({ entryCount: 14 });
    const stats = await restored.stats.compute(targetUser, new Date('2026-10-07T12:00:00Z'));
    expect(stats).toMatchObject({ totalEntries: 14, rankedCount: 6, episodesWatched: 307 });
  });
});
