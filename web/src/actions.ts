import { useCallback, useRef } from 'preact/hooks';
import type { EntryDto, EntryPatch } from '../../shared/domain.ts';
import { api, errorMessage } from './api.ts';
import { useI18n } from './i18n/index.tsx';
import { launchConfetti } from './lib/confetti.ts';
import { withPatchApplied } from './lib/entry-rules.ts';
import { withEpisodeMarked, withEpisodeUndone } from './lib/optimistic.ts';
import { useLibrary } from './store.tsx';
import { useToast } from './toast.tsx';
import { useUi } from './ui.tsx';

interface Submission<Answer> {
  entryId: number;
  /** How the entry looks once the server agrees. Shown at once, before any answer. */
  optimistic: (current: EntryDto) => EntryDto;
  send: () => Promise<Answer>;
  entryOf: (answer: Answer) => EntryDto;
  /** Runs when the server has answered; `isLast` is false while newer requests of the same entry are still on their way. */
  onAnswer?: (answer: Answer, isLast: boolean) => void | Promise<void>;
}

/**
 * Actions on one entry, shared by the cards and the detail sheet. Every change shows on the screen at
 * once (the server takes its time, especially a remote database); the server's answer then confirms it,
 * or the screen goes back to what the server holds, with a message, if the server refused.
 */
export function useEntryActions() {
  const { upsert, updateLocal, reload } = useLibrary();
  const notify = useToast();
  const { t } = useI18n();
  const ui = useUi();
  // Requests sent and not answered yet, per entry: only the last answer may overwrite the screen.
  const inFlight = useRef(new Map<number, number>());
  // Requests of one entry run one after the other, so quick successive actions count in order.
  const queue = useRef(new Map<number, Promise<unknown>>());

  const submit = useCallback(
    <Answer>({ entryId, optimistic, send, entryOf, onAnswer }: Submission<Answer>): Promise<boolean> => {
      inFlight.current.set(entryId, (inFlight.current.get(entryId) ?? 0) + 1);
      updateLocal(entryId, optimistic);

      const previous = queue.current.get(entryId) ?? Promise.resolve();
      const request = previous.then(async () => {
        try {
          const answer = await send();
          const remaining = Math.max(0, (inFlight.current.get(entryId) ?? 1) - 1);
          inFlight.current.set(entryId, remaining);
          if (remaining === 0) upsert(entryOf(answer));
          await onAnswer?.(answer, remaining === 0);
          return true;
        } catch (error) {
          inFlight.current.set(entryId, 0);
          notify(errorMessage(error), { tone: 'error' });
          await reload(); // the screen was ahead of the server: show what the server really holds
          return false;
        }
      });
      queue.current.set(entryId, request);
      return request;
    },
    [notify, reload, updateLocal, upsert],
  );

  const undoEpisode = useCallback(
    (entryId: number) =>
      submit({
        entryId,
        optimistic: withEpisodeUndone,
        send: () => api.undoEpisode(entryId),
        entryOf: (confirmed) => confirmed,
        onAnswer: (_confirmed, isLast) => {
          if (isLast) notify(t('action.episodeUndone'));
        },
      }),
    [notify, submit, t],
  );

  const markEpisode = useCallback(
    (entry: EntryDto) => {
      const markedAt = new Date().toISOString();
      void submit({
        entryId: entry.id,
        optimistic: (current) => withEpisodeMarked(current, markedAt),
        send: () => api.markEpisode(entry.id),
        entryOf: (answer) => answer.entry,
        onAnswer: ({ entry: confirmed, justCompleted }, isLast) => {
          if (justCompleted) {
            launchConfetti();
            notify(t('action.completed', { title: confirmed.media.title }), { actionLabel: t('action.rank'), onAction: () => ui.startRanking(confirmed.id) });
          } else if (isLast) {
            notify(t('action.episodeMarked', { progress: confirmed.progress }), { actionLabel: t('action.undo'), onAction: () => void undoEpisode(confirmed.id) });
          }
        },
      });
    },
    [notify, submit, t, ui, undoEpisode],
  );

  /** Saves some fields of an entry. Resolves to false when the server refused (the screen is already back to the server's values). */
  const patchEntry = useCallback(
    (entryId: number, patch: EntryPatch) =>
      submit({
        entryId,
        optimistic: (current) => withPatchApplied(current, patch),
        send: () => api.patchEntry(entryId, patch),
        entryOf: (confirmed) => confirmed,
        // Going back to "to watch" frees a rank: the other entries moved up.
        onAnswer: async () => {
          if (patch.status === 'planned') await reload();
        },
      }),
    [reload, submit],
  );

  return { markEpisode, undoEpisode, patchEntry };
}
