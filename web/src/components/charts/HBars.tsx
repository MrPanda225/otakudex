import { useLayoutEffect, useRef } from 'preact/hooks';
import { growBars } from '../../motion/motion.ts';

export interface BarRow {
  label: string;
  value: number;
  /** The one row that deserves the accent colour. */
  isAccent?: boolean;
}

interface HBarsProps {
  rows: readonly BarRow[];
  /** Describes the chart for assistive technology. */
  label: string;
}

/**
 * Horizontal bars for comparing categories, from zero, sorted by the caller. Each value is written at
 * the end of its bar, so nothing has to be decoded from length or colour alone.
 */
export function HBars({ rows, label }: HBarsProps) {
  const list = useRef<HTMLUListElement>(null);
  const highest = Math.max(...rows.map((row) => row.value), 1);

  useLayoutEffect(() => {
    growBars(list.current?.querySelectorAll('.hbar-fill'), 'x');
  }, []);

  return (
    <ul class="hbars" aria-label={label}>
      {rows.map((row) => (
        <li key={row.label} class="hbar-row">
          <span class="hbar-label">{row.label}</span>
          <span class="hbar-track" aria-hidden="true">
            <span class={`hbar-fill${row.isAccent ? ' hbar-fill--accent' : ''}`} style={{ width: `${(row.value / highest) * 100}%` }} />
          </span>
          <span class="hbar-value">{row.value}</span>
        </li>
      ))}
    </ul>
  );
}
