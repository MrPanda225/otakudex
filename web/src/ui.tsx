import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useMemo, useState } from 'preact/hooks';
import { isTypingTarget } from './lib/hooks.ts';

/** Which overlay is open. Only one at a time, except that ranking opens on top of an entry sheet. */
interface UiContextValue {
  isAddOpen: boolean;
  isDataOpen: boolean;
  isAccountOpen: boolean;
  isAdminOpen: boolean;
  openedEntryId: number | null;
  rankingEntryId: number | null;
  /** The entry that was just ranked, so the Arena can scroll to it and light it up. */
  highlightedEntryId: number | null;
  highlightEntry: (entryId: number | null) => void;
  openAdd: () => void;
  closeAdd: () => void;
  openData: () => void;
  closeData: () => void;
  openAccount: () => void;
  closeAccount: () => void;
  openAdmin: () => void;
  closeAdmin: () => void;
  openEntry: (entryId: number) => void;
  closeEntry: () => void;
  startRanking: (entryId: number) => void;
  stopRanking: () => void;
}

const UiContext = createContext<UiContextValue | null>(null);

export function UiProvider({ children }: { children: ComponentChildren }) {
  const [isAddOpen, setAddOpen] = useState(false);
  const [isDataOpen, setDataOpen] = useState(false);
  const [isAccountOpen, setAccountOpen] = useState(false);
  const [isAdminOpen, setAdminOpen] = useState(false);
  const [openedEntryId, setOpenedEntryId] = useState<number | null>(null);
  const [rankingEntryId, setRankingEntryId] = useState<number | null>(null);
  const [highlightedEntryId, setHighlightedEntryId] = useState<number | null>(null);

  // "/" opens the add dialog, unless the user is typing or another overlay is open.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target) || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      setAddOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const value = useMemo<UiContextValue>(
    () => ({
      isAddOpen,
      isDataOpen,
      isAccountOpen,
      isAdminOpen,
      openedEntryId,
      rankingEntryId,
      highlightedEntryId,
      highlightEntry: setHighlightedEntryId,
      openAdd: () => setAddOpen(true),
      closeAdd: () => setAddOpen(false),
      openData: () => setDataOpen(true),
      closeData: () => setDataOpen(false),
      openAccount: () => setAccountOpen(true),
      closeAccount: () => setAccountOpen(false),
      openAdmin: () => setAdminOpen(true),
      closeAdmin: () => setAdminOpen(false),
      openEntry: (entryId) => setOpenedEntryId(entryId),
      closeEntry: () => setOpenedEntryId(null),
      startRanking: (entryId) => setRankingEntryId(entryId),
      stopRanking: () => setRankingEntryId(null),
    }),
    [isAddOpen, isDataOpen, isAccountOpen, isAdminOpen, openedEntryId, rankingEntryId, highlightedEntryId],
  );
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiContextValue {
  const value = useContext(UiContext);
  if (!value) throw new Error('useUi must be used inside UiProvider');
  return value;
}
