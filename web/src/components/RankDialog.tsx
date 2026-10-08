import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { BUCKETS, type Bucket, type DuelCandidateDto, type EntryDto } from '../../../shared/domain.ts';
import { bucketLabel, tierLabel } from '../../../shared/labels.ts';
import {
  applyDuelAnswer,
  isSearchDone,
  maxDuels,
  nextOpponentIndex,
  startInsertionSearch,
  type DuelAnswer,
  type InsertionSearch,
} from '../../../shared/ranking.ts';
import { api, errorMessage } from '../api.ts';
import { useI18n, type MessageKey } from '../i18n/index.tsx';
import { launchConfetti } from '../lib/confetti.ts';
import { EASE, bump, play, pulse, springIn } from '../motion/motion.ts';
import { CountUp } from './CountUp.tsx';
import { useLibrary } from '../store.tsx';
import { useToast } from '../toast.tsx';
import { useUi } from '../ui.tsx';
import { Icon } from './Icon.tsx';
import { Modal } from './Modal.tsx';
import { Poster } from './Poster.tsx';

const BUCKET_HINTS = { loved: 'rank.hint.loved', liked: 'rank.hint.liked', meh: 'rank.hint.meh' } as const satisfies Record<Bucket, MessageKey>;

type Stage =
  | { kind: 'bucket' }
  | { kind: 'duel'; bucket: Bucket; candidates: DuelCandidateDto[]; search: InsertionSearch; history: InsertionSearch[] }
  | { kind: 'placing' }
  | { kind: 'done'; entry: EntryDto };

export function RankDialog() {
  const ui = useUi();
  const { t } = useI18n();
  const { entries } = useLibrary();
  const entry = entries.find((candidate) => candidate.id === ui.rankingEntryId) ?? null;
  const isOpen = ui.rankingEntryId !== null;

  return (
    <Modal isOpen={isOpen} onClose={ui.stopRanking} title={entry ? t('rank.title', { title: entry.media.title }) : t('rank.titleShort')}>
      {entry ? <RankFlow entryId={entry.id} title={entry.media.title} posterUrl={entry.media.posterUrl} /> : null}
    </Modal>
  );
}

interface RankFlowProps {
  entryId: number;
  title: string;
  posterUrl: string | null;
}

function RankFlow({ entryId, title, posterUrl }: RankFlowProps) {
  const ui = useUi();
  const { t, lang } = useI18n();
  const notify = useToast();
  const { upsert, reload } = useLibrary();
  const [stage, setStage] = useState<Stage>({ kind: 'bucket' });
  const [isLoading, setLoading] = useState(false);

  async function chooseBucket(bucket: Bucket) {
    setLoading(true);
    try {
      const candidates = await api.duelCandidates(bucket, entryId);
      const search = startInsertionSearch(candidates.length);
      if (isSearchDone(search)) await place(bucket, search.low);
      else setStage({ kind: 'duel', bucket, candidates, search, history: [] });
    } catch (error) {
      notify(errorMessage(error), { tone: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function place(bucket: Bucket, index: number) {
    setStage({ kind: 'placing' });
    try {
      const placed = await api.placeRank(entryId, bucket, index);
      upsert(placed);
      await reload(); // every score in the bucket may have moved
      launchConfetti();
      setStage({ kind: 'done', entry: placed });
    } catch (error) {
      notify(errorMessage(error), { tone: 'error' });
      setStage({ kind: 'bucket' });
    }
  }

  function answer(duel: Extract<Stage, { kind: 'duel' }>, choice: DuelAnswer) {
    const opponentIndex = nextOpponentIndex(duel.search);
    if (opponentIndex === null) return;
    const search = applyDuelAnswer(duel.search, opponentIndex, choice);
    if (isSearchDone(search)) void place(duel.bucket, search.low);
    else setStage({ ...duel, search, history: [...duel.history, duel.search] });
  }

  function goBack(duel: Extract<Stage, { kind: 'duel' }>) {
    const previous = duel.history.at(-1);
    if (previous) setStage({ ...duel, search: previous, history: duel.history.slice(0, -1) });
  }

  useDuelKeys(stage, answer);

  if (stage.kind === 'bucket') {
    return (
      <>
        <p>{t('rank.bucketIntro')}</p>
        <div class="bucket-choices" aria-busy={isLoading}>
          {BUCKETS.map((bucket) => (
            <button key={bucket} type="button" class="bucket-choice" disabled={isLoading} onClick={() => void chooseBucket(bucket)}>
              <strong>{bucketLabel(lang, bucket)}</strong>
              <span class="muted">{t(BUCKET_HINTS[bucket])}</span>
            </button>
          ))}
        </div>
      </>
    );
  }

  if (stage.kind === 'placing') {
    return <p role="status">{t('rank.placing')}</p>;
  }

  if (stage.kind === 'done') {
    return (
      <ResultView
        entry={stage.entry}
        onFinish={() => {
          ui.highlightEntry(stage.entry.id);
          ui.stopRanking();
          window.location.hash = '#/arena';
        }}
      />
    );
  }

  const opponentIndex = nextOpponentIndex(stage.search);
  const opponent = opponentIndex === null ? undefined : stage.candidates[opponentIndex];
  if (!opponent) return <p role="alert">{t('rank.error')}</p>;
  const duelLimit = maxDuels(stage.candidates.length);

  return (
    <DuelView
      // A new key per duel: each pair of covers arrives by itself, from either side.
      key={stage.history.length}
      title={title}
      posterUrl={posterUrl}
      opponent={opponent}
      duelNumber={stage.history.length + 1}
      duelLimit={duelLimit}
      doneCount={stage.history.length}
      canGoBack={stage.history.length > 0}
      onAnswer={(choice) => answer(stage, choice)}
      onBack={() => goBack(stage)}
    />
  );
}

interface DuelViewProps {
  title: string;
  posterUrl: string | null;
  opponent: DuelCandidateDto;
  duelNumber: number;
  duelLimit: number;
  doneCount: number;
  canGoBack: boolean;
  onAnswer: (choice: DuelAnswer) => void;
  onBack: () => void;
}

function DuelView({ title, posterUrl, opponent, duelNumber, duelLimit, doneCount, canGoBack, onAnswer, onBack }: DuelViewProps) {
  const { t } = useI18n();
  const left = useRef<HTMLButtonElement>(null);
  const right = useRef<HTMLButtonElement>(null);
  const versus = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    play(left.current, { opacity: [0, 1], translateX: [-36, 0], duration: 260, ease: EASE.enter });
    play(right.current, { opacity: [0, 1], translateX: [36, 0], duration: 260, ease: EASE.enter });
    play(versus.current, { opacity: [0, 1], scale: [0.6, 1], duration: 260, delay: 120, ease: EASE.enter });
  }, []);

  function choose(choice: DuelAnswer, button: HTMLElement | null) {
    bump(button);
    onAnswer(choice);
  }

  return (
    <>
      <p>
        <strong>{t('rank.which')}</strong> {t('rank.whichHelp')}
      </p>
      <div class="duel-progress" role="img" aria-label={t('rank.duelProgress', { number: duelNumber, limit: duelLimit })}>
        {Array.from({ length: duelLimit }, (_, index) => (
          <span key={index} class={index < doneCount ? 'done' : ''} />
        ))}
      </div>
      <div class="duel">
        <button ref={left} type="button" class="duel-card" onClick={() => choose('better', left.current)} aria-label={t('rank.isBetter', { title })}>
          <div class="poster"><Poster url={posterUrl} title={title} /></div>
          <span class="card-title">{title}</span>
        </button>
        <span ref={versus} class="duel-vs" aria-hidden="true">VS</span>
        <button ref={right} type="button" class="duel-card" onClick={() => choose('worse', right.current)} aria-label={t('rank.isBetter', { title: opponent.title })}>
          <div class="poster"><Poster url={opponent.posterUrl} title={opponent.title} /></div>
          <span class="card-title">{opponent.title}</span>
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
        <button type="button" class="btn btn--quiet" disabled={!canGoBack} onClick={onBack}>
          <Icon name="undo" />
          {t('rank.back')}
        </button>
        <button type="button" class="btn" onClick={() => choose('tie', null)}>
          {t('rank.tie')}
        </button>
      </div>
      <p class="muted text-sm">{t('rank.keys')}</p>
    </>
  );
}

/** The moment the whole flow leads to: the rank counts up, the card arrives, the tier lights up. */
function ResultView({ entry, onFinish }: { entry: EntryDto; onFinish: () => void }) {
  const { t, lang } = useI18n();
  const card = useRef<HTMLDivElement>(null);
  const badge = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    springIn(card.current);
    const timer = setTimeout(() => pulse(badge.current), 350);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div class="result-reveal" role="status">
      <p class="muted">{t('rank.enters', { title: entry.media.title })}</p>
      <p class="big">
        #<CountUp value={entry.rankPosition ?? 0} />
      </p>
      {entry.tier ? (
        <div class="reveal-card" ref={card}>
          <div class="poster" style={{ borderBottom: 0 }}>
            <Poster url={entry.media.posterUrl} title={entry.media.title} />
            <span ref={badge} class="badge tier" data-tier={entry.tier}>{entry.tier}</span>
          </div>
        </div>
      ) : null}
      <p>
        <strong>{entry.score}/100</strong> · {entry.bucket ? bucketLabel(lang, entry.bucket) : ''}
        {entry.tier ? ` · ${tierLabel(lang, entry.tier)}` : ''}
      </p>
      <button type="button" class="btn btn--primary" onClick={onFinish}>
        {t('rank.see')}
      </button>
    </div>
  );
}

/** Arrow keys answer the duel while it is on screen. */
function useDuelKeys(stage: Stage, answer: (duel: Extract<Stage, { kind: 'duel' }>, choice: DuelAnswer) => void) {
  useEffect(() => {
    if (stage.kind !== 'duel') return;
    const choices: Record<string, DuelAnswer> = { ArrowLeft: 'better', ArrowRight: 'worse', ArrowDown: 'tie' };
    const onKeyDown = (event: KeyboardEvent) => {
      const choice = choices[event.key];
      if (!choice) return;
      event.preventDefault();
      answer(stage, choice);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });
}
