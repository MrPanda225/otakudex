import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useI18n } from '../../i18n/index.tsx';
import { fadeOut, flagIn } from '../../motion/motion.ts';
import { Icon } from '../Icon.tsx';

const VISIBLE_MS = 2_000;

/**
 * "Saved" beside a field, shown for a moment each time `stamp` changes (0: nothing saved yet).
 * Purely visual: the sheet announces saves once, in its own live region.
 */
export function SavedFlag({ stamp }: { stamp: number }) {
  const { t } = useI18n();
  const [shownStamp, setShownStamp] = useState(0);
  const element = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (stamp === 0) return;
    setShownStamp(stamp);
    const timer = setTimeout(() => {
      fadeOut(element.current, () => setShownStamp((current) => (current === stamp ? 0 : current)));
    }, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [stamp]);

  useLayoutEffect(() => {
    if (shownStamp !== 0) flagIn(element.current);
  }, [shownStamp]);

  if (shownStamp === 0) return null;
  return (
    <span class="saved-flag" ref={element} aria-hidden="true">
      <Icon name="check" />
      {t('saved.flag')}
    </span>
  );
}
