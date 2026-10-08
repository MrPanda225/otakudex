import { useLayoutEffect, useRef } from 'preact/hooks';
import type { EntryDto } from '../../../shared/domain.ts';
import { useEntryActions } from '../actions.ts';
import { useI18n } from '../i18n/index.tsx';
import { primaryActionOf, type PrimaryAction } from '../lib/entry-rules.ts';
import { springIn } from '../motion/motion.ts';
import { useLibrary } from '../store.tsx';
import { useUi } from '../ui.tsx';
import { EntryDetails } from './entry/EntryDetails.tsx';
import { Icon } from './Icon.tsx';
import { MarkEpisodeButton } from './MarkEpisodeButton.tsx';
import { Modal } from './Modal.tsx';

/** The side sheet of one entry. Its main action sits in the footer, always in reach of the thumb. */
export function EntryDialog() {
  const ui = useUi();
  const { t } = useI18n();
  const { entries } = useLibrary();
  const actions = useEntryActions();
  const entry = entries.find((candidate) => candidate.id === ui.openedEntryId) ?? null;
  const action = entry ? primaryActionOf(entry) : null;

  // The footer button changes from "mark" to "rank" when the last episode is marked: that arrival is animated.
  const previousAction = useRef<PrimaryAction>(null);
  const hasJustSwitchedToRank = previousAction.current === 'mark' && action === 'rank';
  previousAction.current = action;

  const footer =
    entry && action ? (
      <div class="sheet-foot">
        {action === 'mark' ? (
          <MarkEpisodeButton entry={entry} variant="wide" onMark={actions.markEpisode} />
        ) : (
          <RankButton entry={entry} animateArrival={hasJustSwitchedToRank} />
        )}
      </div>
    ) : null;

  return (
    <Modal isOpen={entry !== null} onClose={ui.closeEntry} title={entry?.media.title ?? t('entry.fallbackTitle')} variant="sheet" footer={footer}>
      {entry ? <EntryDetails entry={entry} actions={actions} /> : null}
    </Modal>
  );
}

function RankButton({ entry, animateArrival }: { entry: EntryDto; animateArrival: boolean }) {
  const ui = useUi();
  const { t } = useI18n();
  const button = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (animateArrival) springIn(button.current);
  }, []);
  return (
    <button
      type="button"
      ref={button}
      class="btn btn--primary btn--wide"
      onClick={() => {
        ui.closeEntry();
        ui.startRanking(entry.id);
      }}
    >
      <Icon name="trophy" />
      {t('card.rank')}
    </button>
  );
}
