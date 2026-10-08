import type { ComponentChildren } from 'preact';
import { CountUp } from './CountUp.tsx';

interface KpiProps {
  label: string;
  value: number;
  /** How the animated number is written. */
  format?: (value: number) => string;
  unit: string;
  /** The reference that gives the number its meaning: a comparison, a record, an estimate. */
  context: string;
  children?: ComponentChildren;
}

/** One indicator: what it is, its value, and what to compare it with. A number alone means nothing. */
export function Kpi({ label, value, format, unit, context, children }: KpiProps) {
  return (
    <div class="kpi" data-motion="item">
      <p class="kpi-label">{label}</p>
      <p class="kpi-value">
        <CountUp value={value} {...(format ? { format } : {})} /> <span class="kpi-unit">{unit}</span>
      </p>
      <p class="kpi-context">{context}</p>
      {children}
    </div>
  );
}
