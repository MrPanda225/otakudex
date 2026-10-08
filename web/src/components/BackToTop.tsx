import { useEffect, useState } from 'preact/hooks';
import { useI18n } from '../i18n/index.tsx';
import { prefersReducedMotion } from '../lib/hooks.ts';
import { Icon } from './Icon.tsx';

/** The button shows once the page has been scrolled past this many window heights (FR-110). */
const SHOW_AFTER_SCREENS = 1.5;

/** Whether the page is scrolled far enough to offer the way back; one cheap check per animation frame. */
function useScrolledFar(): boolean {
  const [isFar, setFar] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setFar(window.scrollY > window.innerHeight * SHOW_AFTER_SCREENS);
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  return isFar;
}

/**
 * A round button, bottom right, that takes the page back to its top. Hidden while a window is open (it would sit
 * over it). The focus goes to the page too, so a keyboard user starts again from the top instead of being lost
 * when the button disappears.
 */
export function BackToTop({ isHidden }: { isHidden: boolean }) {
  const { t } = useI18n();
  const isFar = useScrolledFar();
  if (!isFar || isHidden) return null;

  function goToTop() {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    document.getElementById('contenu')?.focus({ preventScroll: true });
  }

  return (
    <button type="button" class="back-to-top" onClick={goToTop} aria-label={t('backToTop')} title={t('backToTop')}>
      <Icon name="arrow-up" />
    </button>
  );
}
