import type { EntryDto } from '../../../../shared/domain.ts';
import { tierLabel } from '../../../../shared/labels.ts';
import { useFormat } from '../../i18n/use-format.ts';
import { useI18n } from '../../i18n/index.tsx';
import { Poster } from '../Poster.tsx';

interface EntryHeroProps {
  entry: EntryDto;
  onRank: () => void;
}

/** The cover and the few facts that say which anime this is, then where it stands in the ranking. */
export function EntryHero({ entry, onRank }: EntryHeroProps) {
  const { media } = entry;
  const format = useFormat();
  const facts = [format.subtype(media.subtype), media.startDate?.slice(0, 4), format.episodesLine(entry)].filter((part) => part).join(' · ');

  return (
    <div class="sheet-hero">
      <div class="poster sheet-poster">
        <Poster url={media.posterUrl} title={media.title} />
      </div>
      <div class="sheet-meta">
        <p class="muted text-sm">{facts}</p>
        {media.titleEn && media.titleEn !== media.title ? <p class="text-sm">{media.titleEn}</p> : null}
        {media.titleJa ? <p class="muted text-sm" lang="ja">{media.titleJa}</p> : null}
        {media.genres.length > 0 ? <p class="muted text-sm">{media.genres.slice(0, 3).map(format.genre).join(', ')}</p> : null}
        <RankLine entry={entry} onRank={onRank} />
      </div>
    </div>
  );
}

function RankLine({ entry, onRank }: EntryHeroProps) {
  const { t, lang } = useI18n();
  if (entry.rankPosition !== null && entry.tier) {
    return (
      <div class="rank-line">
        <p>
          <span class="badge tier" data-tier={entry.tier}>{entry.tier}</span> <strong>#{entry.rankPosition}</strong> · {entry.score}/100
          <span class="muted"> · {tierLabel(lang, entry.tier)}</span>
        </p>
        <button type="button" class="btn btn--quiet btn--small" onClick={onRank}>{t('entry.reclassify')}</button>
      </div>
    );
  }
  if (entry.status === 'planned') return <p class="muted text-sm">{t('entry.startToRank')}</p>;
  if (entry.status === 'completed') return <p class="muted text-sm">{t('entry.notRanked')}</p>; // the footer holds the action
  return (
    <div class="rank-line">
      <p class="muted text-sm">{t('entry.notRanked')}</p>
      <button type="button" class="btn btn--quiet btn--small" onClick={onRank}>{t('card.rank')}</button>
    </div>
  );
}
