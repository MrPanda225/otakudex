import { useId, useLayoutEffect, useRef } from 'preact/hooks';
import { indexOfMax, niceCeil, type WeekBucket } from '../../lib/charts.ts';
import { useFormat } from '../../i18n/use-format.ts';
import { useI18n } from '../../i18n/index.tsx';
import { EASE, growBars, play } from '../../motion/motion.ts';

interface WeeklyChartProps {
  weeks: readonly WeekBucket[];
  /** One value per week; null for the unfinished current week. */
  average: readonly (number | null)[];
  /** Narrower drawing for phones: fewer weeks, so the text keeps a readable size. */
  isCompact?: boolean;
}

const WIDTH = 720;
const COMPACT_WIDTH = 380;
const HEIGHT = 220;
const MARGIN = { left: 34, right: 66, top: 26, bottom: 26 };
const BAR_FILL_RATIO = 0.66;
const MAX_MONTH_LABELS = 8;
const COMPACT_MONTH_LABELS = 4;

/**
 * Episodes per week. Bars start at zero; the unfinished current week is the only one in colour (it is
 * the thing that is happening now), the others are grey. The dashed line is the average of the last
 * four finished weeks. Values are written on the two bars worth reading, so no legend is needed.
 */
export function WeeklyChart({ weeks, average, isCompact = false }: WeeklyChartProps) {
  const { t } = useI18n();
  const format = useFormat();
  const svg = useRef<SVGSVGElement>(null);
  const width = isCompact ? COMPACT_WIDTH : WIDTH;
  const titleId = useId();
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const baseline = MARGIN.top + plotHeight;

  const values = weeks.map((week) => week.episodes);
  const ceiling = niceCeil(Math.max(...values, ...average.map((value) => value ?? 0), 1));
  const slot = plotWidth / Math.max(weeks.length, 1);
  const barWidth = slot * BAR_FILL_RATIO;
  const x = (index: number) => MARGIN.left + index * slot + (slot - barWidth) / 2;
  const centerX = (index: number) => x(index) + barWidth / 2;
  const y = (value: number) => baseline - (value / ceiling) * plotHeight;

  const bestIndex = indexOfMax(values);
  const currentIndex = weeks.findIndex((week) => week.isCurrent);
  const labelledIndexes = new Set([bestIndex, currentIndex].filter((index) => index >= 0 && (values[index] ?? 0) > 0));

  const linePoints = average.flatMap((value, index) => (value === null ? [] : [`${centerX(index).toFixed(1)},${y(value).toFixed(1)}`]));
  const lastAverage = [...average].reverse().find((value) => value !== null) ?? null;

  const monthTicks = weeks
    .map((week, index) => ({ index, month: week.start.slice(0, 7), label: format.monthShort(week.start) }))
    .filter((tick, position, all) => position === 0 || tick.month !== all[position - 1]?.month)
    .slice(-(isCompact ? COMPACT_MONTH_LABELS : MAX_MONTH_LABELS));

  useLayoutEffect(() => {
    const element = svg.current;
    if (!element) return;
    growBars(element.querySelectorAll('.bar'), 'y');
    const line = element.querySelector('.avg-line, .avg-label');
    if (line) play(element.querySelectorAll('.avg-line, .avg-label'), { opacity: [0, 1], duration: 300, delay: 450, ease: EASE.soft });
  }, []);

  const summary = `${t('chart.weeklySummary', { weeks: weeks.length, best: values[bestIndex] ?? 0 })}${
    lastAverage === null ? '' : ` ${t('chart.weeklyAverage', { value: format.decimal(lastAverage) })}`
  }`;

  return (
    <svg ref={svg} class="chart weekly-chart" viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-labelledby={titleId}>
      <title id={titleId}>{summary}</title>
      <line class="chart-grid" x1={MARGIN.left} x2={width - MARGIN.right} y1={y(ceiling)} y2={y(ceiling)} />
      <text class="chart-axis-label" x={MARGIN.left - 6} y={y(ceiling) + 4} text-anchor="end">{ceiling}</text>
      <text class="chart-axis-label" x={MARGIN.left - 6} y={baseline + 4} text-anchor="end">0</text>

      {weeks.map((week, index) => (
        <rect
          key={week.start}
          class={`bar${week.isCurrent ? ' bar--now' : ''}`}
          x={x(index)}
          y={y(week.episodes)}
          width={barWidth}
          height={baseline - y(week.episodes)}
          rx={3}
        >
          <title>{t(week.isCurrent ? 'chart.weekCurrent' : 'chart.week', { day: format.dayLong(week.start), episodes: t('stats.episodes', { count: week.episodes }) })}</title>
        </rect>
      ))}

      <line class="chart-baseline" x1={MARGIN.left} x2={width - MARGIN.right} y1={baseline} y2={baseline} />

      {linePoints.length > 1 ? <polyline class="avg-line" points={linePoints.join(' ')} fill="none" /> : null}
      {lastAverage !== null && linePoints.length > 1 ? (
        <text class="avg-label" x={width - MARGIN.right + 8} y={y(lastAverage) + 4}>
          {t('chart.averageShort', { value: format.decimal(lastAverage) })}
        </text>
      ) : null}

      {[...labelledIndexes].map((index) => (
        <text key={`value-${index}`} class={`value-label${index === currentIndex ? ' value-label--now' : ''}`} x={centerX(index)} y={y(values[index] ?? 0) - 6} text-anchor="middle">
          {values[index]}
        </text>
      ))}

      {monthTicks.map((tick) => (
        <text key={tick.month} class="chart-axis-label" x={centerX(tick.index)} y={HEIGHT - 8} text-anchor="middle">
          {tick.label}
        </text>
      ))}
    </svg>
  );
}
