import { useCallback, useState } from 'preact/hooks';
import type { EntryDto, EntryPatch, Status } from '../../../../shared/domain.ts';
import type { useEntryActions } from '../../actions.ts';
import { api, errorMessage } from '../../api.ts';
import { useI18n } from '../../i18n/index.tsx';
import { todayIso } from '../../lib/dates.ts';
import { patchForStatus } from '../../lib/entry-rules.ts';
import { useLibrary } from '../../store.tsx';
import { useToast } from '../../toast.tsx';
import { useUi } from '../../ui.tsx';
import { DetailsSection } from './DetailsSection.tsx';
import { EntryHero } from './EntryHero.tsx';
import { ProgressPanel } from './ProgressPanel.tsx';
import { RemoveEntry } from './RemoveEntry.tsx';
import { SAVED_ANNOUNCEMENT, type SavedField, type SavedStamps } from './saved.ts';
import { StatusChoice } from './StatusChoice.tsx';
import { Synopsis } from './Synopsis.tsx';

interface EntryDetailsProps {
  entry: EntryDto;
  actions: ReturnType<typeof useEntryActions>;
}

/**
 * The body of the sheet, in the order of what matters: which anime, where I stand (status, progress),
 * then the rarely used details, then the one destructive action. The main action lives in the footer.
 */
export function EntryDetails({ entry, actions }: EntryDetailsProps) {
  const ui = useUi();
  const { t } = useI18n();
  const notify = useToast();
  const { dropLocal, reload } = useLibrary();
  const [stamps, setStamps] = useState<SavedStamps>({});
  const [announcement, setAnnouncement] = useState('');
  const { patchEntry, undoEpisode } = actions;

  const save = useCallback(
    async (field: SavedField, patch: EntryPatch) => {
      const isSaved = await patchEntry(entry.id, patch);
      if (isSaved) {
        setStamps((current) => ({ ...current, [field]: Date.now() }));
        setAnnouncement(t(SAVED_ANNOUNCEMENT[field]));
      }
      return isSaved;
    },
    [entry.id, patchEntry, t],
  );

  async function remove() {
    try {
      await api.removeEntry(entry.id);
      dropLocal(entry.id);
      await reload(); // the ranks of the other entries moved up
      ui.closeEntry();
      notify(t('entry.removed', { title: entry.media.title }));
    } catch (error) {
      notify(errorMessage(error), { tone: 'error' });
    }
  }

  function startRanking() {
    ui.closeEntry();
    ui.startRanking(entry.id);
  }

  return (
    <>
      <EntryHero entry={entry} onRank={startRanking} />
      <Synopsis entry={entry} />
      <section class="zone" aria-label={t('entry.tracking')}>
        <StatusChoice entry={entry} onChoose={(status: Status) => void save('status', patchForStatus(entry, status, todayIso()))} savedStamp={stamps.status ?? 0} />
        <ProgressPanel entry={entry} onUndo={() => void undoEpisode(entry.id)} />
      </section>
      <DetailsSection entry={entry} save={save} stamps={stamps} />
      <hr class="sheet-rule" />
      <RemoveEntry title={entry.media.title} onRemove={() => void remove()} />
      <p class="visually-hidden" role="status">{announcement}</p>
    </>
  );
}
