import { useId, useLayoutEffect, useMemo, useRef } from 'preact/hooks';
import type { StatsDto } from '../../../../shared/domain.ts';
import { useFormat } from '../../i18n/use-format.ts';
import { useI18n } from '../../i18n/index.tsx';
import { waveIn } from '../../motion/motion.ts';

const CELL = 12;
const GAP = 3;
const STEP = CELL + GAP;
const LABEL_HEIGHT = 18;
const RIGHT_ROOM = 24; // keeps the last month label inside the drawing

function level(episodes: number): number {
  if (episodes === 0) return 0;
  if (episodes === 1) return 1;
  if (episodes === 2) return 2;
  return episodes <= 4 ? 3 : 4;
}

/**
 * One column per week (Monday first), one row per weekday, one hue from light to dark for the number
 * of episodes. The numbers are in each cell's title and in the summary, so colour is not the only cue.
 */
export function Heatmap({ cells }: { cells: StatsDto['heatmap'] }) {
  const { t } = useI18n();
  const format = useFormat();
  const svg = useRef<SVGSVGElement>(null);
  const titleId = useId();

  const layout = useMemo(() => {
    const firstWeekday = (new Date(`${cells[0]?.day ?? '1970-01-05'}T00:00:00Z`).getUTCDay() + 6) % 7;
    const placed = cells.map((cell, index) => ({ ...cell, column: Math.floor((index + firstWeekday) / 7), row: (index + firstWeekday) % 7 }));
    const columns = (placed.at(-1)?.column ?? 0) + 1;
    const monthLabels = placed
      .filter((cell) => cell.row === 0 && Number(cell.day.slice(8)) <= 7)
      .map((cell) => ({ column: cell.column, label: format.monthShort(cell.day) }));
    return { placed, columns, monthLabels };
  }, [cells, format]);

  useLayoutEffect(() => {
    waveIn(svg.current?.querySelectorAll('rect[data-day]'));
  }, []);

  const activeDays = cells.filter((cell) => cell.episodes > 0).length;
  const episodes = cells.reduce((sum, cell) => sum + cell.episodes, 0);
  const width = layout.columns * STEP + RIGHT_ROOM;
  const height = LABEL_HEIGHT + 7 * STEP;
  const summary =
    episodes === 0 ? t('heat.none') : t('heat.summary', { episodes: t('stats.episodes', { count: episodes }), days: t('heat.activeDays', { count: activeDays }) });

  return (
    <>
      <p class="muted" style={{ marginBottom: 'var(--space-3)' }}>{summary}</p>
      <div class="heatmap-scroll">
        <svg ref={svg} class="heatmap" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={titleId}>
          <title id={titleId}>{t('heat.title', { summary })}</title>
          {layout.monthLabels.map((month) => (
            <text key={month.column} class="chart-axis-label" x={month.column * STEP} y={11}>{month.label}</text>
          ))}
          {layout.placed.map((cell) => (
            <rect key={cell.day} data-day={cell.day} class={`heat-${level(cell.episodes)}`} x={cell.column * STEP} y={LABEL_HEIGHT + cell.row * STEP} width={CELL} height={CELL} rx={3}>
              <title>{t('heat.cell', { day: format.day(cell.day), episodes: t('stats.episodes', { count: cell.episodes }) })}</title>
            </rect>
          ))}
        </svg>
      </div>
      <div class="heat-legend" aria-hidden="true">
        {t('heat.less')}
        <svg width={STEP * 5} height={CELL} viewBox={`0 0 ${STEP * 5} ${CELL}`}>
          {[0, 1, 2, 3, 4].map((step) => (
            <rect key={step} class={`heat-${step}`} x={step * STEP} y={0} width={CELL} height={CELL} rx={3} />
          ))}
        </svg>
        {t('heat.more')}
      </div>
    </>
  );
}
