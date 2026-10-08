import type { EntryDto } from '../../../../shared/domain.ts';
import { useFormat } from '../../i18n/use-format.ts';
import { useI18n } from '../../i18n/index.tsx';
import { progressPercent } from '../../lib/format.ts';
import { CountUp } from '../CountUp.tsx';
import { Icon } from '../Icon.tsx';
import { ProgressBar } from '../ProgressBar.tsx';

interface ProgressPanelProps {
  entry: EntryDto;
  onUndo: () => void;
}

/**
 * Where the user stands: the count, the bar, what is left. The count and the bar move by themselves
 * when an episode is marked. The undo button exists only when there is something to undo.
 */
export function ProgressPanel({ entry, onUndo }: ProgressPanelProps) {
  const { media } = entry;
  const { t } = useI18n();
  const format = useFormat();
  const total = media.episodeCount;
  const percent = progressPercent(entry);
  const sideNote = total === null ? '' : entry.progress >= total ? t('progress.allWatched') : format.remaining(entry);

  return (
    <div class="progress-panel">
      <div class="progress-panel-head">
        <h3 class="zone-label">{t('progress.title')}</h3>
        <span class="muted text-sm">{sideNote}</span>
      </div>
      <div class="progress-counter">
        {/* The count is drawn frame by frame: hidden from screen readers, which hear the sentence below once. */}
        <p class="counter" aria-hidden="true">
          <CountUp value={entry.progress} from={entry.progress} />
          <span class="counter-total">{total === null ? ` ${t('progress.watchedSuffix')}` : ` / ${total}`}</span>
        </p>
        {entry.progress > 0 ? (
          <button type="button" class="icon-btn" aria-label={t('progress.undoLabel', { episode: entry.progress })} title={t('progress.undoTitle')} onClick={onUndo}>
            <Icon name="minus" />
          </button>
        ) : null}
      </div>
      {percent !== null ? <ProgressBar ratio={percent / 100} label={t('progress.of', { title: media.title })} growOnMount /> : null}
      <p class="visually-hidden" role="status">
        {total === null ? t('progress.sr', { progress: entry.progress }) : t('progress.srOf', { progress: entry.progress, total })}
      </p>
    </div>
  );
}
