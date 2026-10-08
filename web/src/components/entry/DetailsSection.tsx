import { useLayoutEffect, useRef } from 'preact/hooks';
import type { EntryDto, EntryPatch } from '../../../../shared/domain.ts';
import { useFormat } from '../../i18n/use-format.ts';
import { useI18n } from '../../i18n/index.tsx';
import { dateInputFor, dateOrderProblem, todayIso, type DateInput } from '../../lib/dates.ts';
import { parseProgress, patchForProgress } from '../../lib/entry-rules.ts';
import { prefersReducedMotion, useSessionState } from '../../lib/hooks.ts';
import { staggerIn } from '../../motion/motion.ts';
import { Icon } from '../Icon.tsx';
import { CommitField, type Parsed } from './CommitField.tsx';
import { NoteField } from './NoteField.tsx';
import type { SavedField, SavedStamps } from './saved.ts';
import { Stepper } from './Stepper.tsx';

interface DetailsSectionProps {
  entry: EntryDto;
  save: (field: SavedField, patch: EntryPatch) => Promise<boolean>;
  stamps: SavedStamps;
}

function dateParser(changed: 'startedOn' | 'completedOn', entry: EntryDto, dates: DateInput) {
  return (text: string): Parsed<string | null> => {
    const parsed = dates.parse(text);
    if (parsed.kind === 'invalid') return { ok: false, problem: { key: 'date.unrecognized', params: { example: dates.toText(todayIso()) } } };
    const value = parsed.kind === 'empty' ? null : parsed.iso;
    const started = changed === 'startedOn' ? value : entry.startedOn;
    const completed = changed === 'completedOn' ? value : entry.completedOn;
    const problem = dateOrderProblem(started, completed, changed, dates.toText);
    return problem === null ? { ok: true, value } : { ok: false, problem };
  };
}

/**
 * What is rarely touched: dates, rewatches, a manual correction of the progress, the note. Closed at
 * first, with a one-line summary of what it holds; the choice (open or closed) is kept for the session.
 */
export function DetailsSection({ entry, save, stamps }: DetailsSectionProps) {
  const { t, lang } = useI18n();
  const format = useFormat();
  const dates = dateInputFor(lang);
  const [isOpen, setOpen] = useSessionState('sheet.details-open', false);
  const details = useRef<HTMLDetailsElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);
  const total = entry.media.episodeCount;
  const showCompletedOn = entry.status === 'completed' || entry.completedOn !== null;

  useLayoutEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!isOpen) return;
    staggerIn(body.current?.querySelectorAll('[data-motion="item"]'));
    details.current?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [isOpen]);

  return (
    <details class="disclosure" open={isOpen} ref={details}>
      <summary
        onClick={(event) => {
          event.preventDefault(); // the open state is ours, so it can be kept and animated
          setOpen(!isOpen);
        }}
      >
        <span class="disclosure-title">{t('details.title')}</span>
        <span class="disclosure-hint">{format.detailsSummary(entry)}</span>
        <span class="disclosure-chevron"><Icon name="chevron" /></span>
      </summary>
      <div class="disclosure-body" ref={body}>
        <div data-motion="item">
          <CommitField<string | null>
            label={t('details.startedOn')}
            value={entry.startedOn}
            toText={dates.toText}
            parse={dateParser('startedOn', entry, dates)}
            onCommit={(startedOn) => void save('startedOn', { startedOn })}
            mask={dates.mask}
            placeholder={t('date.placeholder')}
            maxLength={10}
            quickFill={{ label: t('date.today'), value: todayIso }}
            savedStamp={stamps.startedOn ?? 0}
          />
        </div>
        {showCompletedOn ? (
          <div data-motion="item">
            <CommitField<string | null>
              label={t('details.completedOn')}
              value={entry.completedOn}
              toText={dates.toText}
              parse={dateParser('completedOn', entry, dates)}
              onCommit={(completedOn) => void save('completedOn', { completedOn })}
              mask={dates.mask}
              placeholder={t('date.placeholder')}
              maxLength={10}
              quickFill={{ label: t('date.today'), value: todayIso }}
              savedStamp={stamps.completedOn ?? 0}
            />
          </div>
        ) : null}
        <div data-motion="item">
          <Stepper
            label={t('details.rewatchLabel')}
            value={entry.rewatchCount}
            hint={t('details.rewatchHint')}
            onChange={(rewatchCount) => void save('rewatchCount', { rewatchCount })}
            savedStamp={stamps.rewatchCount ?? 0}
          />
        </div>
        <div data-motion="item">
          <CommitField<number>
            label={t('details.fixProgress')}
            value={entry.progress}
            toText={String}
            parse={(text) => parseProgress(text, total)}
            onCommit={(progress) => void save('progress', patchForProgress(entry, progress, todayIso()))}
            maxLength={5}
            hint={total === null ? t('details.progressHint') : t('details.progressHintMax', { max: total })}
            savedStamp={stamps.progress ?? 0}
          />
        </div>
        <div data-motion="item">
          <NoteField note={entry.note} onSave={(note) => save('note', { note })} savedStamp={stamps.note ?? 0} />
        </div>
      </div>
    </details>
  );
}
