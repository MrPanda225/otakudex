import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useState } from 'preact/hooks';
import type { EntryDto } from '../../shared/domain.ts';
import { api, errorMessage } from './api.ts';

type Phase = 'loading' | 'ready' | 'error';

interface LibraryContextValue {
  entries: EntryDto[];
  phase: Phase;
  errorText: string | null;
  /** Reloads the whole library: needed after anything that moves other entries (ranking, import). */
  reload: () => Promise<void>;
  /** Replaces one entry (or adds it) with the fresh copy returned by the server. */
  upsert: (entry: EntryDto) => void;
  /** Changes one entry from its latest local copy, so quick successive edits never start from a stale one. */
  updateLocal: (entryId: number, change: (entry: EntryDto) => EntryDto) => void;
  dropLocal: (entryId: number) => void;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({ children }: { children: ComponentChildren }) {
  const [entries, setEntries] = useState<EntryDto[]>([]);
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorText, setErrorText] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setEntries(await api.listLibrary());
      setPhase('ready');
      setErrorText(null);
    } catch (error) {
      setPhase('error');
      setErrorText(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const upsert = useCallback((entry: EntryDto) => {
    setEntries((current) =>
      current.some((candidate) => candidate.id === entry.id)
        ? current.map((candidate) => (candidate.id === entry.id ? entry : candidate))
        : [...current, entry],
    );
  }, []);

  const updateLocal = useCallback((entryId: number, change: (entry: EntryDto) => EntryDto) => {
    setEntries((current) => current.map((candidate) => (candidate.id === entryId ? change(candidate) : candidate)));
  }, []);

  const dropLocal = useCallback((entryId: number) => {
    setEntries((current) => current.filter((entry) => entry.id !== entryId));
  }, []);

  const value = useMemo(
    () => ({ entries, phase, errorText, reload, upsert, updateLocal, dropLocal }),
    [entries, phase, errorText, reload, upsert, updateLocal, dropLocal],
  );
  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryContextValue {
  const value = useContext(LibraryContext);
  if (!value) throw new Error('useLibrary must be used inside LibraryProvider');
  return value;
}
