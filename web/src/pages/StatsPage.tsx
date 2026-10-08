import { useMemo } from 'preact/hooks';
import { STATUSES, type StatsDto } from '../../../shared/domain.ts';
import { statusLabel } from '../../../shared/labels.ts';
import { HBars, type BarRow } from '../components/charts/HBars.tsx';
import { Heatmap } from '../components/charts/Heatmap.tsx';
import { Histogram } from '../components/charts/Histogram.tsx';
import { Sparkline } from '../components/charts/Sparkline.tsx';
import { WeeklyChart } from '../components/charts/WeeklyChart.tsx';
import { Icon } from '../components/Icon.tsx';
import { Kpi } from '../components/Kpi.tsx';
import { useFormat } from '../i18n/use-format.ts';
import { useI18n } from '../i18n/index.tsx';
import { formatDelta } from '../lib/charts.ts';
import { buildOverview } from '../lib/dashboard.ts';
import { useMediaQuery, useSessionState } from '../lib/hooks.ts';
import { useReveal, useSlidingIndicator } from '../motion/hooks.ts';
import { useStats } from '../stats-cache.ts';
import { useLibrary } from '../store.tsx';
import { useUi } from '../ui.tsx';

type View = 'overview' | 'details';

const writeHours = (minutes: number) => String(Math.round(minutes / 60));

export function StatsPage() {
  const ui = useUi();
  const { t } = useI18n();
  const { entries, phase } = useLibrary();
  const { stats, errorText } = useStats(entries, phase === 'ready');
  const [view, setView] = useSessionState<View>('stats.view', 'overview');
  const tabs = useSlidingIndicator<HTMLDivElement>(view);
  const page = useReveal<HTMLDivElement>([view, stats === null]);

  if (errorText && !stats) {
    return (
      <p class="notice notice--error" role="alert">
        <Icon name="alert" />
        {errorText}
      </p>
    );
  }

  if (!stats) {
    return (
      <>
        <div class="page-head"><h1 tabIndex={-1} data-page-title>{t('stats.title')}</h1></div>
        <div class="kpi-grid" aria-busy="true" aria-label={t('stats.loading')}>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} class="skeleton skeleton--kpi" />
          ))}
        </div>
      </>
    );
  }

  if (stats.totalEntries === 0) {
    return (
      <>
        <div class="page-head"><h1 tabIndex={-1} data-page-title>{t('stats.title')}</h1></div>
        <div class="empty">
          <h2>{t('stats.empty.title')}</h2>
          <p>{t('stats.empty.text')}</p>
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
          <h1 tabIndex={-1} data-page-title>{t('stats.title')}</h1>
        </div>
        <div class="tabs tabs--solid" role="group" aria-label={t('stats.view')} ref={tabs.containerRef}>
          <span class="indicator" ref={tabs.indicatorRef} aria-hidden="true" />
          <button type="button" class="tab" data-active={view === 'overview'} aria-pressed={view === 'overview'} onClick={() => setView('overview')}>{t('stats.overview')}</button>
          <button type="button" class="tab" data-active={view === 'details'} aria-pressed={view === 'details'} onClick={() => setView('details')}>{t('stats.details')}</button>
        </div>
      </div>

      {view === 'overview' ? <Overview stats={stats} /> : <Details stats={stats} />}
    </div>
  );
}

function Overview({ stats }: { stats: StatsDto }) {
  const { t, lang } = useI18n();
  const format = useFormat();
  const isCompact = useMediaQuery('(max-width: 599px)');
  const overview = useMemo(() => buildOverview(stats, isCompact ? 13 : 26), [stats, isCompact]);
  const { sevenDays, pacePerWeek, weeksToClearBacklog } = overview;

  const statusRows: BarRow[] = STATUSES.map((status) => ({ label: statusLabel(lang, status), value: stats.byStatus[status], isAccent: status === 'watching' }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);

  const backlogContext =
    stats.backlogEpisodes === 0
      ? t('stats.backlog.none')
      : weeksToClearBacklog === null
        ? t('stats.backlog.noPace')
        : t('stats.backlog.weeks', { count: weeksToClearBacklog, pace: format.decimal(pacePerWeek) });
  const unknownNote = stats.backlogUnknownCount > 0 ? ` · ${t('stats.backlog.unknown', { count: stats.backlogUnknownCount })}` : '';
  const streakContext =
    stats.currentWeekStreak > 0 && stats.currentWeekStreak === stats.longestWeekStreak
      ? t('stats.streak.record')
      : t('stats.streak.best', { count: stats.longestWeekStreak });
  const hours = t('stats.unit.hours');

  return (
    <>
      <div class="kpi-grid">
        <Kpi
          label={t('stats.last7')}
          value={sevenDays.current}
          unit={t('stats.unit.episodes', { count: sevenDays.current })}
          context={
            sevenDays.delta === 0
              ? t('stats.last7.same', { previous: sevenDays.previous })
              : t('stats.last7.delta', { delta: formatDelta(sevenDays.delta), previous: sevenDays.previous })
          }
        >
          <Sparkline values={overview.sparkline} />
        </Kpi>
        <Kpi label={t('stats.backlog')} value={stats.backlogMinutes} format={writeHours} unit={hours} context={`${backlogContext}${unknownNote}`} />
        <Kpi label={t('stats.streak')} value={stats.currentWeekStreak} unit={t('stats.unit.weeks', { count: stats.currentWeekStreak })} context={streakContext} />
        <Kpi
          label={t('stats.watched')}
          value={stats.minutesWatched}
          format={writeHours}
          unit={hours}
          context={t('stats.watched.context', {
            episodes: t('stats.episodes', { count: stats.episodesWatched }),
            completed: t('stats.completed', { count: stats.byStatus.completed }),
          })}
        />
      </div>
      {stats.entriesWithoutDuration > 0 ? <p class="muted text-sm">{t('stats.noLength', { count: stats.entriesWithoutDuration })}</p> : null}

      <section class="panel" aria-labelledby="weekly-title" data-motion="item">
        <div class="panel-head">
          <h2 id="weekly-title">{t('stats.weekly')}</h2>
          <p class="muted text-sm">
            {pacePerWeek > 0 ? `${t('stats.weekly.pace', { pace: format.decimal(pacePerWeek) })} ` : ''}
            {t('stats.weekly.legend', { count: overview.weeks.length })}
          </p>
        </div>
        <WeeklyChart weeks={overview.weeks} average={overview.average} isCompact={isCompact} />
      </section>

      <section class="panel" aria-labelledby="status-title" data-motion="item">
        <div class="panel-head">
          <h2 id="status-title">{t('stats.status')}</h2>
          <p class="muted text-sm">{t('stats.status.total', { count: stats.totalEntries })}</p>
        </div>
        <HBars rows={statusRows} label={t('stats.status.chart')} />
      </section>
    </>
  );
}

function Details({ stats }: { stats: StatsDto }) {
  const { t } = useI18n();
  const format = useFormat();
  return (
    <>
      <section class="panel" aria-labelledby="heatmap-title" data-motion="item">
        <div class="panel-head">
          <h2 id="heatmap-title">{t('stats.heatmap')}</h2>
        </div>
        <Heatmap cells={stats.heatmap} />
      </section>

      <div class="dash-grid">
        <section class="panel" aria-labelledby="scores-title" data-motion="item">
          <div class="panel-head">
            <h2 id="scores-title">{t('stats.scores')}</h2>
            <p class="muted text-sm">{stats.rankedCount > 0 ? t('stats.scores.sub', { count: stats.rankedCount }) : ''}</p>
          </div>
          {stats.rankedCount === 0 ? (
            <p class="muted">{t('stats.scores.empty')}</p>
          ) : (
            <Histogram bands={stats.scoreDistribution} average={stats.averageScore} />
          )}
        </section>

        <section class="panel" aria-labelledby="genres-title" data-motion="item">
          <div class="panel-head">
            <h2 id="genres-title">{t('stats.genres')}</h2>
          </div>
          {stats.topGenres.length === 0 ? (
            <p class="muted">{t('stats.genres.empty')}</p>
          ) : (
            <HBars rows={stats.topGenres.map((genre) => ({ label: format.genre(genre.genre), value: genre.count }))} label={t('stats.genres.chart')} />
          )}
        </section>
      </div>
    </>
  );
}
