import { useEffect, useState } from 'preact/hooks';
import type { SearchResultDto, Status } from '../../../shared/domain.ts';
import { statusLabel } from '../../../shared/labels.ts';
import { api, errorMessage } from '../api.ts';
import { useFormat } from '../i18n/use-format.ts';
import { useI18n } from '../i18n/index.tsx';
import { useDebounced } from '../lib/hooks.ts';
import { useLibrary } from '../store.tsx';
import { useToast } from '../toast.tsx';
import { Icon } from './Icon.tsx';
import { Modal } from './Modal.tsx';
import { Poster } from './Poster.tsx';

const SEARCH_DEBOUNCE_MS = 350;
const SLOW_SEARCH_MS = 250;
const MIN_QUERY_LENGTH = 2;
const ADDABLE_STATUSES: Status[] = ['planned', 'watching', 'completed'];

type SearchPhase = 'idle' | 'loading' | 'ready' | 'error';

interface AddDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddDialog({ isOpen, onClose }: AddDialogProps) {
  const { t } = useI18n();
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('add.title')}>
      <AddDialogBody />
    </Modal>
  );
}

function AddDialogBody() {
  const { t, lang } = useI18n();
  const [mode, setMode] = useState<'search' | 'manual'>('search');
  const [status, setStatus] = useState<Status>('planned');

  return (
    <>
      <fieldset class="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend class="label">{t('add.startStatus')}</legend>
        <div class="chips">
          {ADDABLE_STATUSES.map((value) => (
            <button key={value} type="button" class="chip" aria-pressed={status === value} onClick={() => setStatus(value)}>
              {statusLabel(lang, value)}
            </button>
          ))}
        </div>
      </fieldset>
      {mode === 'search' ? (
        <SearchPane status={status} onSwitchToManual={() => setMode('manual')} />
      ) : (
        <ManualPane status={status} onSwitchToSearch={() => setMode('search')} />
      )}
    </>
  );
}

function SearchPane({ status, onSwitchToManual }: { status: Status; onSwitchToManual: () => void }) {
  const { t } = useI18n();
  const format = useFormat();
  const { upsert } = useLibrary();
  const notify = useToast();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query.trim(), SEARCH_DEBOUNCE_MS);
  const [results, setResults] = useState<SearchResultDto[]>([]);
  const [phase, setPhase] = useState<SearchPhase>('idle');
  const [isSlow, setSlow] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<number | null>(null);

  useEffect(() => {
    if (debouncedQuery.length < MIN_QUERY_LENGTH) {
      setPhase('idle');
      setResults([]);
      return;
    }
    let isStale = false;
    setPhase('loading');
    setSlow(false);
    const slowTimer = setTimeout(() => setSlow(true), SLOW_SEARCH_MS);
    api
      .search(debouncedQuery)
      .then((found) => {
        if (isStale) return;
        setResults(found);
        setPhase('ready');
        setErrorText(null);
      })
      .catch((error: unknown) => {
        if (isStale) return;
        setPhase('error');
        setErrorText(errorMessage(error));
      })
      .finally(() => clearTimeout(slowTimer));
    return () => {
      isStale = true;
      clearTimeout(slowTimer);
    };
  }, [debouncedQuery]);

  async function add(result: SearchResultDto) {
    setAddingId(result.kitsuId);
    try {
      const entry = await api.addFromKitsu(result.kitsuId, status);
      upsert(entry);
      setResults((current) => current.map((item) => (item.kitsuId === result.kitsuId ? { ...item, isInLibrary: true } : item)));
      notify(t('add.toast', { title: entry.media.title }));
    } catch (error) {
      notify(errorMessage(error), { tone: 'error' });
    } finally {
      setAddingId(null);
    }
  }

  return (
    <>
      <div class="field">
        <label for="add-search">{t('add.titleLabel')}</label>
        <input
          id="add-search"
          class="input"
          type="search"
          autocomplete="off"
          spellcheck={false}
          placeholder={t('add.placeholder')}
          value={query}
          onInput={(event) => setQuery(event.currentTarget.value)}
          autofocus
        />
        <p class="field-hint">{t('add.hint', { min: MIN_QUERY_LENGTH })}</p>
      </div>

      <div aria-live="polite">
        {phase === 'loading' && isSlow ? <p class="muted">{t('add.searching')}</p> : null}
        {phase === 'error' ? (
          <p class="notice notice--error" role="alert">
            <Icon name="alert" />
            <span>{errorText}</span>
          </p>
        ) : null}
        {phase === 'ready' && results.length === 0 ? <p class="muted">{t('add.noResult', { query: debouncedQuery })}</p> : null}
      </div>

      {results.length > 0 ? (
        <ul class="result-list">
          {results.map((result) => (
            <li key={result.kitsuId} class="result-row">
              <div class="poster">
                <Poster url={result.posterUrl} title={result.title} />
              </div>
              <div>
                <p class="result-title">{result.title}</p>
                <p class="muted text-sm">
                  {[format.subtype(result.subtype), result.year, result.episodeCount ? t('entry.episodesCount', { count: result.episodeCount }) : null]
                    .filter((part) => part !== null)
                    .join(' · ')}
                </p>
              </div>
              {result.isInLibrary ? (
                <span class="badge">
                  <Icon name="check" />
                  {t('add.added')}
                </span>
              ) : (
                <button
                  type="button"
                  class={`btn btn--small btn--primary${addingId === result.kitsuId ? ' is-loading' : ''}`}
                  disabled={addingId !== null}
                  aria-label={t('add.addLabel', { title: result.title })}
                  onClick={() => void add(result)}
                >
                  <Icon name="plus" />
                  {t('add.add')}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <p class="muted text-sm">
        {t('add.notFound')}{' '}
        <button type="button" class="btn btn--quiet btn--small" onClick={onSwitchToManual}>
          {t('add.manual')}
        </button>
      </p>
    </>
  );
}

function ManualPane({ status, onSwitchToSearch }: { status: Status; onSwitchToSearch: () => void }) {
  const { t } = useI18n();
  const { upsert } = useLibrary();
  const notify = useToast();
  const [title, setTitle] = useState('');
  const [episodes, setEpisodes] = useState('');
  const [length, setLength] = useState('');
  const [hasTitleError, setHasTitleError] = useState(false);
  const [isSaving, setSaving] = useState(false);

  function validateTitle(): boolean {
    const isValid = title.trim().length > 0;
    setHasTitleError(!isValid);
    return isValid;
  }

  async function submit(event: Event) {
    event.preventDefault();
    if (!validateTitle()) return;
    setSaving(true);
    try {
      const entry = await api.addManual({
        title: title.trim(),
        episodeCount: episodes === '' ? null : Number(episodes),
        episodeLengthMin: length === '' ? null : Number(length),
        status,
      });
      upsert(entry);
      notify(t('add.toast', { title: entry.media.title }));
      setTitle('');
      setEpisodes('');
      setLength('');
    } catch (error) {
      notify(errorMessage(error), { tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate style={{ display: 'contents' }}>
      <div class="field">
        <label for="manual-title">{t('manual.title')}</label>
        <input
          id="manual-title"
          class="input"
          value={title}
          aria-invalid={hasTitleError}
          aria-describedby={hasTitleError ? 'manual-title-error' : undefined}
          onInput={(event) => setTitle(event.currentTarget.value)}
          onBlur={validateTitle}
          maxLength={200}
          autocomplete="off"
        />
        {hasTitleError ? (
          <p id="manual-title-error" class="field-error" role="alert">
            <Icon name="alert" />
            {t('manual.titleError')}
          </p>
        ) : null}
      </div>
      <div class="field-row">
        <div class="field">
          <label for="manual-episodes">{t('manual.episodes')}</label>
          <input id="manual-episodes" class="input" type="number" inputMode="numeric" min={1} max={5000} value={episodes} onInput={(event) => setEpisodes(event.currentTarget.value)} />
        </div>
        <div class="field">
          <label for="manual-length">{t('manual.length')}</label>
          <input id="manual-length" class="input" type="number" inputMode="numeric" min={1} max={600} value={length} onInput={(event) => setLength(event.currentTarget.value)} />
        </div>
      </div>
      <p class="field-hint">{t('manual.hint')}</p>
      <div class="dialog-foot" style={{ padding: 0, border: 0 }}>
        <button type="button" class="btn btn--quiet" onClick={onSwitchToSearch}>
          {t('manual.back')}
        </button>
        <button type="submit" class={`btn btn--primary${isSaving ? ' is-loading' : ''}`} disabled={isSaving}>
          {t('add.add')}
        </button>
      </div>
    </form>
  );
}
