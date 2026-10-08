import { useLayoutEffect, useRef } from 'preact/hooks';
import { scaleBarX } from '../motion/motion.ts';

interface ProgressBarProps {
  /** 0 to 1. */
  ratio: number;
  /** Names what progresses, for screen readers: "Progression de Frieren". */
  label: string;
  /** Grow from empty when the bar first appears. */
  growOnMount?: boolean;
}

/**
 * The fill is a horizontal scale (a transform), never a width, so it can animate smoothly.
 * The value is always also available as text next to the bar: colour and length are not the only cue.
 */
export function ProgressBar({ ratio, label, growOnMount = false }: ProgressBarProps) {
  const fill = useRef<HTMLSpanElement>(null);
  const previous = useRef(growOnMount ? 0 : ratio);

  useLayoutEffect(() => {
    if (previous.current !== ratio) scaleBarX(fill.current, previous.current, ratio);
    previous.current = ratio;
  }, [ratio]);

  const clamped = Math.min(1, Math.max(0, ratio));
  return (
    <div class="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clamped * 100)}>
      <span class="progress-fill" ref={fill} style={{ transform: `scaleX(${clamped})` }} />
    </div>
  );
}
