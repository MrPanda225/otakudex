import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { moveIndicator, staggerIn } from './motion.ts';

/**
 * Makes the `[data-motion="item"]` children of the returned element rise in one after the other,
 * each time `deps` change. Runs before paint, so items never flash in their final place first.
 */
export function useReveal<T extends HTMLElement>(deps: readonly unknown[]) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    staggerIn(ref.current?.querySelectorAll('[data-motion="item"]'));
  }, deps);
  return ref;
}

/**
 * A highlight that slides behind whichever child of the container has `data-active="true"`.
 * Give the container `position: relative`, put the returned indicator element inside it, and pass
 * both returned refs. The container may appear after the first render (when data has loaded).
 */
export function useSlidingIndicator<Container extends HTMLElement>(activeKey: string) {
  const [container, setContainer] = useState<Container | null>(null);
  const [indicator, setIndicator] = useState<HTMLSpanElement | null>(null);

  useLayoutEffect(() => {
    if (!container || !indicator) return;

    const place = (withMotion: boolean) => {
      const active = container.querySelector<HTMLElement>('[data-active="true"]');
      indicator.style.opacity = active ? '' : '0';
      if (active) moveIndicator(indicator, active, container, withMotion);
    };
    place(true);

    // Sizes change with the window and when the web fonts arrive: follow them without animating.
    const settle = () => place(false);
    const observer = new ResizeObserver(settle);
    observer.observe(container);
    void document.fonts?.ready.then(settle);
    return () => observer.disconnect();
  }, [container, indicator, activeKey]);

  return { containerRef: setContainer, indicatorRef: setIndicator };
}
