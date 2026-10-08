import { useEffect, useMemo } from 'preact/hooks';
import { TIERS, type EntryDto, type Tier } from '../../../shared/domain.ts';
import { bucketLabel, tierLabel } from '../../../shared/labels.ts';
import { Icon } from '../components/Icon.tsx';
import { Poster } from '../components/Poster.tsx';
import { useI18n } from '../i18n/index.tsx';
import { prefersReducedMotion, useSessionState } from '../lib/hooks.ts';
import { useReveal, useSlidingIndicator } from '../motion/hooks.ts';
import { flash } from '../motion/motion.ts';
import { useLibrary } from '../store.tsx';
import { useUi } from '../ui.tsx';

type View = 'ranking' | 'tiers';

/** The most recently finished anime is the freshest memory: it is the one to rank first. */
function recency(entry: EntryDto): string {
  return entry.completedOn ?? entry.lastActivityAt ?? entry.createdAt;
}

export function ArenaPage() {
  const ui = useUi();
  const { t } = useI18n();
  const { entries, phase } = useLibrary();
  const [view, setView] = useSessionState<View>('arena.view', 'ranking');
  const tabs = useSlidingIndicator<HTMLDivElement>(view);
  const page = useReveal<HTMLDivElement>([phase, view]);

  const ranked = useMemo(
    () => entries.filter((entry) => entry.rankPosition !== null).sort((a, b) => (a.rankPosition ?? 0) - (b.rankPosition ?? 0)),
    [entries],
  );
  const toRank = useMemo(
    () => entries.filter((entry) => entry.status !== 'planned' && entry.rankPosition === null).sort((a, b) => recency(b).localeCompare(recency(a))),
    [entries],
  );
  const [nextToRank, ...otherToRank] = toRank;

  // After a ranking, scroll to the entry and light its row up: this is where the result lives.
  const highlightedId = ui.highlightedEntryId;
  useEffect(() => {
    if (highlightedId === null || phase !== 'ready') return;
    const row = page.current?.querySelector<HTMLElement>(`[data-entry-id="${highlightedId}"]`);
    if (!row) return;
    row.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    flash(row);
    ui.highlightEntry(null);
  }, [highlightedId, phase, view, ranked.length]);

  if (phase !== 'ready') {
    return (
      <div class="page-head">
        <h1 tabIndex={-1} data-page-title>{t('arena.title')}</h1>
      </div>
    );
  }

  return (
    <div class="stack-page" ref={page}>
      <div class="page-head">
        <div>
          <h1 tabIndex={-1} data-page-title>{t('arena.title')}</h1>
          <p class="muted">{t('arena.intro')}</p>
        </div>
        {ranked.length > 0 ? (
          <div class="tabs tabs--solid" role="group" aria-label={t('arena.view')} ref={tabs.containerRef}>
            <span class="indicator" ref={tabs.indicatorRef} aria-hidden="true" />
            <button type="button" class="tab" data-active={view === 'ranking'} aria-pressed={view === 'ranking'} onClick={() => setView('ranking')}>{t('arena.viewRanking')}</button>
            <button type="button" class="tab" data-active={view === 'tiers'} aria-pressed={view === 'tiers'} onClick={() => setView('tiers')}>{t('arena.viewTiers')}</button>
          </div>
        ) : null}
      </div>

      {nextToRank ? (
        <section class="next-duel" aria-labelledby="next-duel-title" data-motion="item">
          <div class="poster"><Poster url={nextToRank.media.posterUrl} title={nextToRank.media.title} /></div>
          <div class="next-duel-body">
            <p class="eyebrow">{t('arena.nextDuel')}</p>
            <h2 id="next-duel-title">{nextToRank.media.title}</h2>
            <p class="muted">{t('arena.nextText')}</p>
            <button type="button" class="btn btn--primary btn--wide" onClick={() => ui.startRanking(nextToRank.id)}>
              <Icon name="trophy" />
              {t('arena.launch')}
            </button>
          </div>
        </section>
      ) : null}

      {otherToRank.length > 0 ? (
        <details class="others" data-motion="item">
          <summary>{t('arena.others', { count: otherToRank.length })}</summary>
          <ul class="result-list">
            {otherToRank.map((entry) => (
              <li key={entry.id} class="result-row">
                <div class="poster"><Poster url={entry.media.posterUrl} title={entry.media.title} /></div>
                <p class="result-title">{entry.media.title}</p>
                <button type="button" class="btn btn--small" aria-label={t('arena.rankLabel', { title: entry.media.title })} onClick={() => ui.startRanking(entry.id)}>
                  {t('card.rank')}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {ranked.length === 0 ? (
        <div class="empty">
          <svg class="art" viewBox="0 0 96 96" fill="none" aria-hidden="true">
            <path d="M30 80h36M48 62v18M26 14h44v26a22 22 0 0 1-44 0V14zM70 20h14v8a12 12 0 0 1-12 12M26 20H12v8a12 12 0 0 0 12 12" stroke="var(--ink)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="var(--highlight)" />
          </svg>
          <h2>{t('arena.emptyTitle')}</h2>
          <p>{t(toRank.length > 0 ? 'arena.emptyWith' : 'arena.emptyWithout')}</p>
        </div>
      ) : view === 'ranking' ? (
        <RankingList ranked={ranked} />
      ) : (
        <TierBoard ranked={ranked} />
      )}
    </div>
  );
}

function RankingList({ ranked }: { ranked: EntryDto[] }) {
  const ui = useUi();
  const { t, lang } = useI18n();
  return (
    <section aria-labelledby="ranking-title">
      <h2 id="ranking-title" class="visually-hidden">{t('arena.fullRanking', { count: ranked.length })}</h2>
      <ol class="rank-list">
        {ranked.map((entry) => (
          <li key={entry.id} class="rank-row" data-entry-id={entry.id} data-motion="item">
            <span class="rank-no" aria-label={t('arena.rank', { rank: entry.rankPosition ?? 0 })}>{entry.rankPosition}</span>
            <div class="poster"><Poster url={entry.media.posterUrl} title={entry.media.title} /></div>
            <button type="button" class="rank-open" onClick={() => ui.openEntry(entry.id)}>
              <span class="result-title">{entry.media.title}</span>
              <span class="muted text-sm">{entry.bucket ? bucketLabel(lang, entry.bucket) : ''}</span>
            </button>
            {entry.tier ? <span class="badge tier" data-tier={entry.tier} title={tierLabel(lang, entry.tier)}>{entry.tier}</span> : null}
            <span class="rank-score" aria-label={t('arena.score', { score: entry.score ?? 0 })}>{entry.score}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function TierBoard({ ranked }: { ranked: EntryDto[] }) {
  const ui = useUi();
  const { t, lang } = useI18n();
  const byTier = useMemo(() => {
    const groups = Object.fromEntries(TIERS.map((tier) => [tier, [] as EntryDto[]])) as Record<Tier, EntryDto[]>;
    for (const entry of ranked) if (entry.tier) groups[entry.tier].push(entry);
    return groups;
  }, [ranked]);

  return (
    <div class="tier-board">
      {TIERS.map((tier) => (
        <section key={tier} class="tier-row" aria-label={t('arena.tierLabel', { tier, name: tierLabel(lang, tier) })} data-motion="item">
          <div class="tier-label" data-tier={tier}>
            <span class="letter">{tier}</span>
            <span class="name">{tierLabel(lang, tier)}</span>
          </div>
          <ul class="tier-items">
            {byTier[tier].length === 0 ? <li class="tier-empty">{t('arena.tierEmpty')}</li> : null}
            {byTier[tier].map((entry) => (
              <li key={entry.id}>
                <button type="button" class="tier-item" data-entry-id={entry.id} aria-label={t('arena.tierItem', { title: entry.media.title, rank: entry.rankPosition ?? 0, score: entry.score ?? 0 })} title={entry.media.title} onClick={() => ui.openEntry(entry.id)}>
                  <div class="poster"><Poster url={entry.media.posterUrl} title={entry.media.title} /></div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
