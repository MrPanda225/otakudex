import { useMemo, useState } from 'preact/hooks';
import { STATUSES } from '../../../shared/domain.ts';
import { statusLabel } from '../../../shared/labels.ts';
import { useEntryActions } from '../actions.ts';
import { ContinueCard, EntryCard } from '../components/EntryCard.tsx';
import { Icon } from '../components/Icon.tsx';
import { useFormat } from '../i18n/use-format.ts';
import { useI18n } from '../i18n/index.tsx';
import { allGenres, countByStatus, selectEntries, SORT_KEYS, type SortKey, type StatusFilter } from '../lib/dex.ts';
import { readStored, useSessionState, writeStored } from '../lib/hooks.ts';
import { useReveal, useSlidingIndicator } from '../motion/hooks.ts';
import { useLibrary } from '../store.tsx';
import { useUi } from '../ui.tsx';

const SORT_MESSAGE = {
  relevance: 'dex.sort.relevance',
  title: 'dex.sort.title',
  rank: 'dex.sort.rank',
  added: 'dex.sort.added',
} as const;
const SORT_STORAGE_KEY = 'otakudex.sort';
/** More than this many titles in progress and the rest wait behind a button: the zone stays a glance. */
const CONTINUE_VISIBLE_COUNT = 4;

function readStoredSort(): SortKey {
  const stored = readStored(SORT_STORAGE_KEY);
  return SORT_KEYS.find((key) => key === stored) ?? 'relevance';
}

export function DexPage() {
  const ui = useUi();
  const { t, lang } = useI18n();
  const format = useFormat();
  const { entries, phase, errorText, reload } = useLibrary();
  const { markEpisode } = useEntryActions();
  // Filters are kept for the session: coming back from another page finds the Dex as it was left.
  const [status, setStatus] = useSessionState<StatusFilter>('dex.status', 'all');
  const [genre, setGenre] = useSessionState('dex.genre', '');
  const [query, setQuery] = useSessionState('dex.query', '');
  const [sort, setSort] = useState<SortKey>(readStoredSort);
  const [isContinueExpanded, setContinueExpanded] = useState(false);

  const counts = useMemo(() => countByStatus(entries), [entries]);
  const genres = useMemo(() => allGenres(entries).sort((a, b) => format.compare(format.genre(a), format.genre(b))), [entries, format]);
  const watching = useMemo(() => selectEntries(entries, { status: 'watching', genre: '', query: '', sort: 'relevance' }), [entries]);
  const visible = useMemo(() => selectEntries(entries, { status, genre, query, sort }), [entries, status, genre, query, sort]);

  // "Continue" is shown only on the unfiltered Dex, and those titles are not repeated in the collection.
  const showContinue = status === 'all' && genre === '' && query.trim() === '' && watching.length > 0;
  const collection = showContinue ? visible.filter((entry) => entry.status !== 'watching') : visible;
  const continueEntries = isContinueExpanded ? watching : watching.slice(0, CONTINUE_VISIBLE_COUNT);
  const activeFilterCount = (genre === '' ? 0 : 1) + (sort === 'relevance' ? 0 : 1);

  const tabs = useSlidingIndicator<HTMLDivElement>(status);
  const page = useReveal<HTMLDivElement>([phase, status, genre, sort, showContinue]);

  function changeSort(next: SortKey) {
    setSort(next);
    writeStored(SORT_STORAGE_KEY, next);
  }

  if (phase === 'loading') {
    return (
      <>
        <PageHead />
        <ul class="card-grid" aria-busy="true" aria-label={t('dex.loading')}>
          {Array.from({ length: 8 }, (_, index) => (
            <li key={index} class="skeleton" />
          ))}
        </ul>
      </>
    );
  }

  if (phase === 'error') {
    return (
      <>
        <PageHead />
        <div class="notice notice--error" role="alert">
          <Icon name="alert" />
          <div>
            <p>{errorText}</p>
            <button type="button" class="btn btn--small" style={{ marginTop: 'var(--space-3)' }} onClick={() => void reload()}>
              {t('common.retry')}
            </button>
          </div>
        </div>
      </>
    );
  }

  if (entries.length === 0) {
    return (
      <>
        <PageHead />
        <div class="empty">
          <svg class="art" viewBox="0 0 96 96" fill="none" aria-hidden="true">
            <rect x="14" y="10" width="52" height="76" rx="8" fill="var(--surface-alt)" stroke="var(--ink)" stroke-width="4" />
            <rect x="30" y="6" width="52" height="76" rx="8" fill="var(--surface)" stroke="var(--ink)" stroke-width="4" />
            <path d="M44 62V34l24 28V34" stroke="var(--accent)" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" />
          </svg>
          <h2>{t('dex.empty.title')}</h2>
          <p>{t('dex.empty.text')}</p>
          <button type="button" class="btn btn--primary" onClick={ui.openAdd}>
            <Icon name="plus" />
            {t('dex.empty.add')}
          </button>
        </div>
      </>
    );
  }

  return (
    <div class="stack-page" ref={page}>
      <div class="page-head">
        <div>
          <h1 tabIndex={-1} data-page-title>{t('dex.title')}</h1>
          <p class="muted">{t('dex.summary', { count: entries.length, watching: counts.watching })}</p>
        </div>
        <div class="field search-field">
          <label for="dex-query" class="visually-hidden">{t('dex.search')}</label>
          <input id="dex-query" class="input" type="search" autocomplete="off" placeholder={t('dex.search')} value={query} onInput={(event) => setQuery(event.currentTarget.value)} />
        </div>
      </div>

      {showContinue ? (
        <section aria-labelledby="continue-title" class="section">
          <h2 id="continue-title" class="section-title">{t('dex.continue')}</h2>
          <ul class="continue-grid">
            {continueEntries.map((entry) => (
              <ContinueCard key={entry.id} entry={entry} onMark={markEpisode} />
            ))}
          </ul>
          {watching.length > CONTINUE_VISIBLE_COUNT ? (
            <button type="button" class="btn btn--quiet" aria-expanded={isContinueExpanded} onClick={() => setContinueExpanded(!isContinueExpanded)}>
              {isContinueExpanded ? t('dex.continue.less') : t('dex.continue.more', { count: watching.length - CONTINUE_VISIBLE_COUNT })}
            </button>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="collection-title" class="section">
        <div class="section-head">
          <h2 id="collection-title" class="section-title">{showContinue ? t('dex.collection.rest') : t('dex.collection')}</h2>
          <details class="filters">
            <summary>
              {t('dex.filters')}
              {activeFilterCount > 0 ? <span class="badge badge--count">{activeFilterCount}</span> : null}
            </summary>
            <div class="filters-body">
              <div class="field">
                <label for="dex-genre">{t('dex.genre')}</label>
                <select id="dex-genre" class="select" value={genre} onChange={(event) => setGenre(event.currentTarget.value)}>
                  <option value="">{t('dex.genre.all')}</option>
                  {genres.map((name) => (
                    <option key={name} value={name}>{format.genre(name)}</option>
                  ))}
                </select>
              </div>
              <div class="field">
                <label for="dex-sort">{t('dex.sortBy')}</label>
                <select id="dex-sort" class="select" value={sort} onChange={(event) => changeSort(event.currentTarget.value as SortKey)}>
                  {SORT_KEYS.map((key) => (
                    <option key={key} value={key}>{t(SORT_MESSAGE[key])}</option>
                  ))}
                </select>
              </div>
            </div>
          </details>
        </div>

        <div class="tabs" role="group" aria-label={t('dex.statusGroup')} ref={tabs.containerRef}>
          <span class="indicator" ref={tabs.indicatorRef} aria-hidden="true" />
          <button type="button" class="tab" data-active={status === 'all'} aria-pressed={status === 'all'} onClick={() => setStatus('all')}>
            {t('dex.statusAll')} <span class="count">{counts.all}</span>
          </button>
          {STATUSES.map((value) => (
            <button key={value} type="button" class="tab" data-active={status === value} aria-pressed={status === value} onClick={() => setStatus(value)}>
              {statusLabel(lang, value)} <span class="count">{counts[value]}</span>
            </button>
          ))}
        </div>

        <p class="visually-hidden" role="status">{t('dex.results', { count: visible.length })}</p>

        {collection.length === 0 ? (
          <div class="empty">
            <h2>{t(showContinue ? 'dex.emptyContinue.title' : 'dex.noMatch.title')}</h2>
            <p>{t(showContinue ? 'dex.emptyContinue.text' : 'dex.noMatch.text')}</p>
            {!showContinue ? (
              <button
                type="button"
                class="btn"
                onClick={() => {
                  setStatus('all');
                  setGenre('');
                  setQuery('');
                }}
              >
                {t('dex.clearFilters')}
              </button>
            ) : null}
          </div>
        ) : (
          <ul class="card-grid">
            {collection.map((entry) => (
              <EntryCard key={entry.id} entry={entry} onMark={markEpisode} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PageHead() {
  const { t } = useI18n();
  return (
    <div class="page-head">
      <div>
        <h1 tabIndex={-1} data-page-title>{t('dex.title')}</h1>
      </div>
    </div>
  );
}
