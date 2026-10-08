import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { EntryDto, PickerFilters } from '../../../shared/domain.ts';
import { api, errorMessage } from '../api.ts';
import { Icon } from '../components/Icon.tsx';
import { Synopsis } from '../components/entry/Synopsis.tsx';
import { Poster } from '../components/Poster.tsx';
import { statusLabel } from '../../../shared/labels.ts';
import { useFormat } from '../i18n/use-format.ts';
import { useI18n, type MessageKey } from '../i18n/index.tsx';
import { totalMinutes } from '../lib/format.ts';
import { prefersReducedMotion } from '../lib/hooks.ts';
import { useReveal } from '../motion/hooks.ts';
import { play, springIn } from '../motion/motion.ts';
import { useLibrary } from '../store.tsx';
import { useToast } from '../toast.tsx';
import { useUi } from '../ui.tsx';

const SPIN_DURATION_MS = 1_200;
const SPIN_TICK_MS = 90;

const DURATION_CHOICES: { label: MessageKey; minutes: number | null }[] = [
  { label: 'tonight.duration.any', minutes: null },
  { label: 'tonight.duration.120', minutes: 120 },
  { label: 'tonight.duration.360', minutes: 360 },
  { label: 'tonight.duration.720', minutes: 720 },
];

const TYPE_CHOICES: { label: MessageKey; subtype: string }[] = [
  { label: 'tonight.type.all', subtype: '' },
  { label: 'tonight.type.tv', subtype: 'TV' },
  { label: 'tonight.type.movie', subtype: 'movie' },
  { label: 'tonight.type.ova', subtype: 'OVA' },
  { label: 'tonight.type.ona', subtype: 'ONA' },
];

type Phase = 'idle' | 'spinning' | 'done';

export function TonightPage() {
  const ui = useUi();
  const { t, lang } = useI18n();
  const format = useFormat();
  const notify = useToast();
  const { entries, phase: libraryPhase, upsert } = useLibrary();
  const [durationIndex, setDurationIndex] = useState(0);
  const [subtype, setSubtype] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [shown, setShown] = useState<EntryDto | null>(null);
  const [candidateCount, setCandidateCount] = useState<number | null>(null);
  const spinTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const dice = useRef<HTMLSpanElement>(null);
  const resultCard = useRef<HTMLElement>(null);
  const [drawCount, setDrawCount] = useState(0);
  const page = useReveal<HTMLDivElement>([libraryPhase]);

  const planned = entries.filter((entry) => entry.status === 'planned');

  useEffect(() => () => clearInterval(spinTimer.current), []);

  // The drawn anime arrives with a spring once the draw is over, not while the covers are still spinning.
  useLayoutEffect(() => {
    if (phase === 'done' && shown) springIn(resultCard.current);
  }, [phase, drawCount]);

  async function draw() {
    const filters: PickerFilters = {};
    const maxMinutes = DURATION_CHOICES[durationIndex]?.minutes ?? null;
    if (maxMinutes !== null) filters.maxTotalMinutes = maxMinutes;
    if (subtype !== '') filters.subtype = subtype;

    const shouldAnimate = !prefersReducedMotion() && planned.length > 1;
    setPhase('spinning');
    setDrawCount((count) => count + 1);
    play(dice.current, { rotate: [0, 360], duration: SPIN_DURATION_MS, ease: 'inOutQuad' });
    if (shouldAnimate) {
      let tick = 0;
      spinTimer.current = setInterval(() => {
        setShown(planned[tick % planned.length] ?? null);
        tick += 1;
      }, SPIN_TICK_MS);
    }

    try {
      const [result] = await Promise.all([api.pick(filters), new Promise((resolve) => setTimeout(resolve, shouldAnimate ? SPIN_DURATION_MS : 0))]);
      setShown(result.entry);
      setCandidateCount(result.candidateCount);
    } catch (error) {
      notify(errorMessage(error), { tone: 'error' });
      setShown(null);
    } finally {
      clearInterval(spinTimer.current);
      setPhase('done');
    }
  }

  async function start(entry: EntryDto) {
    try {
      upsert(await api.patchEntry(entry.id, { status: 'watching' }));
      notify(t('tonight.started', { title: entry.media.title }));
      window.location.hash = '#/dex';
    } catch (error) {
      notify(errorMessage(error), { tone: 'error' });
    }
  }

  if (libraryPhase !== 'ready') return <p class="muted">{t('common.loading')}</p>;

  if (planned.length === 0) {
    return (
      <>
        <div class="page-head"><h1 tabIndex={-1} data-page-title>{t('tonight.title')}</h1></div>
        <div class="empty">
          <h2>{t('tonight.emptyTitle', { planned: statusLabel(lang, 'planned') })}</h2>
          <p>{t('tonight.emptyText', { planned: statusLabel(lang, 'planned') })}</p>
          <button type="button" class="btn btn--primary" onClick={ui.openAdd}>
            <Icon name="plus" />
            {t('add.title')}
          </button>
        </div>
      </>
    );
  }

  return (
    <div class="stack-page" ref={page}>
      <div class="page-head">
        <div>
          <h1 tabIndex={-1} data-page-title>{t('tonight.title')}</h1>
          <p class="muted">{t('tonight.intro', { planned: statusLabel(lang, 'planned'), count: planned.length })}</p>
        </div>
      </div>

      <div class="tonight">
        <section class="panel" aria-labelledby="criteria-title">
          <h2 id="criteria-title">{t('tonight.criteria')}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div class="field">
              <label for="tonight-duration">{t('tonight.duration')}</label>
              <select id="tonight-duration" class="select" value={durationIndex} onChange={(event) => setDurationIndex(Number(event.currentTarget.value))}>
                {DURATION_CHOICES.map((choice, index) => (
                  <option key={choice.label} value={index}>{t(choice.label)}</option>
                ))}
              </select>
            </div>
            <div class="field">
              <label for="tonight-type">{t('tonight.type')}</label>
              <select id="tonight-type" class="select" value={subtype} onChange={(event) => setSubtype(event.currentTarget.value)}>
                {TYPE_CHOICES.map((choice) => (
                  <option key={choice.subtype} value={choice.subtype}>{t(choice.label)}</option>
                ))}
              </select>
            </div>
            <button type="button" class={`btn btn--primary${phase === 'spinning' ? ' is-loading' : ''}`} disabled={phase === 'spinning'} onClick={() => void draw()}>
              <span ref={dice} class="dice"><Icon name="dice" /></span>
              {t(phase === 'done' ? 'tonight.redraw' : 'tonight.draw')}
            </button>
          </div>
        </section>

        <div aria-live="polite">
          {shown ? (
            <section ref={resultCard} class={`tonight-card${phase === 'spinning' ? ' is-spinning' : ''}`} aria-label={t('tonight.result')}>
              <div class="poster"><Poster url={shown.media.posterUrl} title={shown.media.title} /></div>
              <div class="card-body">
                <h2 style={{ fontSize: 'var(--text-lg)' }}>{shown.media.title}</h2>
                {phase === 'done' ? (
                  <>
                    <p class="muted text-sm">
                      {[format.subtype(shown.media.subtype), shown.media.episodeCount ? t('entry.episodesCount', { count: shown.media.episodeCount }) : null, totalMinutes(shown) !== null ? format.duration(totalMinutes(shown) ?? 0) : null]
                        .filter((part) => part)
                        .join(' · ')}
                    </p>
                    <Synopsis entry={shown} />
                    <button type="button" class="btn btn--primary" onClick={() => void start(shown)}>
                      <Icon name="play" />
                      {t('tonight.start')}
                    </button>
                  </>
                ) : null}
              </div>
            </section>
          ) : phase === 'done' ? (
            <div class="notice" role="status">
              <Icon name="alert" />
              <p>{t('tonight.noMatch')}</p>
            </div>
          ) : null}
          {phase === 'done' && candidateCount !== null && shown ? (
            <p class="muted text-sm" style={{ marginTop: 'var(--space-3)' }}>{t('tonight.matches', { count: candidateCount })}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
