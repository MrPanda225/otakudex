import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../server/db/database.ts';
import { ConflictError, NotFoundError, ValidationError } from '../server/errors.ts';
import { resolvePatch } from '../server/library/patch.ts';
import { createTestDatabase, createTestServices, makeSnapshot, countRows, createTestUser } from './helpers.ts';

describe('library service', () => {
  let db: Database;
  let userId: number;
  const frieren = makeSnapshot({ title: 'Frieren', episodeCount: 3 });
  const longRunner = makeSnapshot({ title: 'Long Runner', episodeCount: null });
  let services: ReturnType<typeof createTestServices>;

  beforeEach(async () => {
    db = await createTestDatabase();
    userId = await createTestUser(db);
    services = createTestServices(db, [frieren, longRunner, makeSnapshot({ title: 'Other' })]);
  });
  afterEach(() => db.close());

  describe('adding', () => {
    it('stores a snapshot and a library entry', async () => {
      const entry = await services.library.addFromKitsu(userId, frieren.kitsuId!, 'planned');
      expect(entry).toMatchObject({ status: 'planned', progress: 0, media: { title: 'Frieren', episodeCount: 3 } });
      expect(await countRows(db, 'media')).toBe(1);
    });

    it('rejects an anime that is already in the library', async () => {
      await services.library.addFromKitsu(userId, frieren.kitsuId!, 'planned');
      await expect(services.library.addFromKitsu(userId, frieren.kitsuId!, 'watching')).rejects.toBeInstanceOf(ConflictError);
    });

    it('rejects an unknown Kitsu id', async () => {
      await expect(services.library.addFromKitsu(userId, 424242, 'planned')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('marks every episode as seen when added as completed', async () => {
      const entry = await services.library.addFromKitsu(userId, frieren.kitsuId!, 'completed');
      expect(entry.progress).toBe(3);
    });

    it('adds an anime by hand without a Kitsu id', async () => {
      const entry = await services.library.addManual(userId, {
        title: 'Vieux souvenir',
        episodeCount: 26,
        episodeLengthMin: null,
        status: 'completed',
      });
      expect(entry.media.kitsuId).toBeNull();
      expect(entry.progress).toBe(26);
    });

    it('flags search results already in the library', async () => {
      await services.library.addFromKitsu(userId, frieren.kitsuId!, 'planned');
      const results = await services.library.search(userId, 'frieren');
      expect(results).toEqual([expect.objectContaining({ kitsuId: frieren.kitsuId, isInLibrary: true, year: 2020 })]);
    });
  });

  describe('episodes', () => {
    it('logs each episode and starts the anime on the first one', async () => {
      const added = await services.library.addFromKitsu(userId, frieren.kitsuId!, 'planned');
      const { entry, justCompleted } = await services.library.markEpisode(userId, added.id);

      expect(justCompleted).toBe(false);
      expect(entry).toMatchObject({ status: 'watching', progress: 1 });
      expect(entry.startedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.lastActivityAt).not.toBeNull();
      expect(await countRows(db, 'watch_log')).toBe(1);
    });

    it('completes the anime on its last episode and refuses more', async () => {
      const added = await services.library.addFromKitsu(userId, frieren.kitsuId!, 'watching');
      await services.library.markEpisode(userId, added.id);
      await services.library.markEpisode(userId, added.id);
      const last = await services.library.markEpisode(userId, added.id);

      expect(last.justCompleted).toBe(true);
      expect(last.entry).toMatchObject({ status: 'completed', progress: 3 });
      expect(last.entry.completedOn).not.toBeNull();
      await expect(services.library.markEpisode(userId, added.id)).rejects.toBeInstanceOf(ConflictError);
    });

    it('never completes automatically when the episode count is unknown', async () => {
      const added = await services.library.addFromKitsu(userId, longRunner.kitsuId!, 'watching');
      const { entry, justCompleted } = await services.library.markEpisode(userId, added.id);
      expect(justCompleted).toBe(false);
      expect(entry.status).toBe('watching');
    });

    it('undoes the last episode and reopens a completed anime', async () => {
      const added = await services.library.addFromKitsu(userId, frieren.kitsuId!, 'watching');
      for (let count = 0; count < 3; count += 1) await services.library.markEpisode(userId, added.id);

      const undone = await services.library.undoEpisode(userId, added.id);
      expect(undone).toMatchObject({ status: 'watching', progress: 2, completedOn: null });
      expect(await countRows(db, 'watch_log')).toBe(2);
    });

    it('has nothing to undo on a fresh entry', async () => {
      const added = await services.library.addFromKitsu(userId, frieren.kitsuId!, 'planned');
      await expect(services.library.undoEpisode(userId, added.id)).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('editing', () => {
    it('updates status, dates and note', async () => {
      const added = await services.library.addFromKitsu(userId, frieren.kitsuId!, 'planned');
      const updated = await services.library.update(userId, added.id, {
        status: 'paused',
        startedOn: '2024-05-01',
        note: 'À reprendre',
      });
      expect(updated).toMatchObject({ status: 'paused', startedOn: '2024-05-01', note: 'À reprendre' });
    });

    it('rejects a progress above the episode count', async () => {
      const added = await services.library.addFromKitsu(userId, frieren.kitsuId!, 'watching');
      await expect(services.library.update(userId, added.id, { progress: 4 })).rejects.toBeInstanceOf(ValidationError);
    });

    it('removes an entry together with its history', async () => {
      const added = await services.library.addFromKitsu(userId, frieren.kitsuId!, 'watching');
      await services.library.markEpisode(userId, added.id);
      await services.library.remove(userId, added.id);

      expect(await countRows(db, 'library_entry')).toBe(0);
      expect(await countRows(db, 'watch_log')).toBe(0);
      expect(await countRows(db, 'media')).toBe(1); // snapshots are kept
    });

    it('reports an unknown entry as not found', async () => {
      await expect(services.library.update(userId, 999, { note: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});

describe('resolvePatch', () => {
  const state = { status: 'watching' as const, progress: 2, episodeCount: 12 };

  it('fills progress when an anime becomes completed', () => {
    expect(resolvePatch(state, { status: 'completed' })).toEqual({ status: 'completed', progress: 12 });
  });

  it('keeps an explicit progress when completing', () => {
    expect(resolvePatch(state, { status: 'completed', progress: 10 }).progress).toBe(10);
  });

  it('leaves progress alone when the episode count is unknown', () => {
    expect(resolvePatch({ ...state, episodeCount: null }, { status: 'completed' })).toEqual({ status: 'completed' });
  });
});
