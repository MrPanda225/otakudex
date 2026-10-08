import { linePoints } from '../../lib/charts.ts';

interface SparklineProps {
  values: readonly number[];
}

const WIDTH = 120;
const HEIGHT = 32;
const PADDING = 4;

/**
 * A tiny trend line with its last point marked. It carries no numbers of its own: the figure it
 * accompanies is written next to it, so it is hidden from assistive technology.
 */
export function Sparkline({ values }: SparklineProps) {
  if (values.length < 2) return null;
  const points = linePoints(values, WIDTH - PADDING * 2, HEIGHT - PADDING * 2).map((point) => ({ x: point.x + PADDING, y: point.y + PADDING }));
  const last = points[points.length - 1];
  return (
    <svg class="sparkline" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
      <polyline class="sparkline-line" points={points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')} fill="none" />
      {last ? <circle class="sparkline-dot" cx={last.x} cy={last.y} r={3} /> : null}
    </svg>
  );
}
