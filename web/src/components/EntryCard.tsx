import type { EntryDto } from '../../../shared/domain.ts';
import { useFormat } from '../i18n/use-format.ts';
import { useI18n } from '../i18n/index.tsx';
import { coverBadges, progressLabel, progressPercent } from '../lib/format.ts';
import { useUi } from '../ui.tsx';
import { CountUp } from './CountUp.tsx';
import { Icon } from './Icon.tsx';
import { MarkEpisodeButton } from './MarkEpisodeButton.tsx';
import { Poster } from './Poster.tsx';
import { ProgressBar } from './ProgressBar.tsx';

interface EntryCardProps {
  entry: EntryDto;
  onMark: (entry: EntryDto) => void;
}

/** A cover in the collection grid: compact, with a small "+" for the next episode. */
export function EntryCard({ entry, onMark }: EntryCardProps) {
  const ui = useUi();
  const { t, lang } = useI18n();
  const { media } = entry;
  const isCompleted = entry.status === 'completed';
  const canMark = media.episodeCount === null || entry.progress < media.episodeCount;
  const percent = progressPercent(entry);
  const badges = coverBadges(entry, lang);
  const visibleBadges = [badges.tier, badges.status].filter(Boolean).join(' ');
  const openLabel = visibleBadges ? t('card.openWith', { title: media.title, badges: visibleBadges }) : t('card.open', { title: media.title });

  return (
    <li class={`card${isCompleted ? ' card--done' : ''}`} data-motion="item">
      <button type="button" class="card-open" onClick={() => ui.openEntry(entry.id)} aria-label={openLabel}>
        <div class="poster">
          <Poster url={media.posterUrl} title={media.title} />
          {badges.tier ? (
            <span class="badge tier" data-tier={badges.tier} title={t('card.tier', { tier: badges.tier, score: entry.score ?? 0 })}>
              {badges.tier}
            </span>
          ) : null}
          {badges.status ? (
            <span class="badge badge--status">
              {isCompleted ? <Icon name="check" /> : null}
              {badges.status}
            </span>
          ) : null}
        </div>
      </button>
      <div class="card-body">
        <h3 class="card-title">{media.title}</h3>
        <div class="card-foot">
          <div class="progress-block">
            <span class="progress-text">{progressLabel(entry)}</span>
            {percent !== null ? <ProgressBar ratio={percent / 100} label={t('progress.of', { title: media.title })} /> : null}
          </div>
          {canMark && !isCompleted ? <MarkEpisodeButton entry={entry} variant="icon" onMark={onMark} /> : null}
          {isCompleted && entry.rankPosition === null ? (
            <button type="button" class="btn btn--small" onClick={() => ui.startRanking(entry.id)}>
              {t('card.rank')}
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/**
 * A title being watched: bigger, with what is left and one large action. This is the zone of the
 * critical 20 %, so the next step is the biggest thing within reach.
 */
export function ContinueCard({ entry, onMark }: EntryCardProps) {
  const ui = useUi();
  const { t } = useI18n();
  const format = useFormat();
  const { media } = entry;
  const percent = progressPercent(entry);
  const canMark = media.episodeCount === null || entry.progress < media.episodeCount;

  return (
    <li class="continue-card" data-motion="item">
      <button type="button" class="card-open continue-poster" onClick={() => ui.openEntry(entry.id)} aria-label={t('card.open', { title: media.title })}>
        <div class="poster">
          <Poster url={media.posterUrl} title={media.title} />
        </div>
      </button>
      <div class="continue-body">
        <div>
          <h3 class="continue-title">{media.title}</h3>
          <p class="muted text-sm">
            {[format.subtype(media.subtype), media.episodeLengthMin ? t('card.perEpisode', { minutes: media.episodeLengthMin }) : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div class="progress-block">
          <p class="continue-progress">
            {t('card.episode')} <CountUp value={entry.progress} />
            {media.episodeCount ? <> {t('card.episodeOf', { total: media.episodeCount })}</> : null}
            <span class="muted"> · {format.remaining(entry)}</span>
          </p>
          {percent !== null ? <ProgressBar ratio={percent / 100} label={t('progress.of', { title: media.title })} growOnMount /> : null}
        </div>
        {canMark ? <MarkEpisodeButton entry={entry} variant="wide" onMark={onMark} /> : null}
      </div>
    </li>
  );
}
