import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { EntryDto } from '../../../shared/domain.ts';
import { useI18n } from '../i18n/index.tsx';
import { bump, floatUp } from '../motion/motion.ts';
import { Icon } from './Icon.tsx';

interface MarkEpisodeButtonProps {
  entry: EntryDto;
  /** "wide" carries a label ("Watched: episode 20"); "icon" is the compact round "+" for dense lists. */
  variant: 'wide' | 'icon';
  onMark: (entry: EntryDto) => void;
}

/**
 * The most frequent action of the app. It answers the press at once: a short elastic press and a
 * "+1" that rises from the button, while the progress behind it already counts up.
 */
export function MarkEpisodeButton({ entry, variant, onMark }: MarkEpisodeButtonProps) {
  const { t } = useI18n();
  const [bursts, setBursts] = useState<number[]>([]);
  const nextBurst = useRef(0);
  const nextEpisode = entry.progress + 1;
  const label = t('mark.label', { episode: nextEpisode, title: entry.media.title });

  function press(event: MouseEvent) {
    bump(event.currentTarget as HTMLElement);
    const id = nextBurst.current++;
    setBursts((current) => [...current, id]);
    onMark(entry);
  }

  return (
    <span class="mark-wrap">
      {variant === 'wide' ? (
        <button type="button" class="btn btn--primary btn--wide" aria-label={label} onClick={press}>
          <Icon name="check" />
          {t('mark.wide', { episode: nextEpisode })}
        </button>
      ) : (
        <button type="button" class="icon-btn" aria-label={label} onClick={press}>
          <Icon name="plus" />
        </button>
      )}
      {bursts.map((id) => (
        <Burst key={id} onDone={() => setBursts((current) => current.filter((candidate) => candidate !== id))} />
      ))}
    </span>
  );
}

function Burst({ onDone }: { onDone: () => void }) {
  const element = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => floatUp(element.current, onDone), [onDone]);
  return (
    <span ref={element} class="burst" aria-hidden="true">
      +1
    </span>
  );
}
