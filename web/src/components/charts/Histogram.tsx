import { useId, useLayoutEffect, useRef } from 'preact/hooks';
import type { StatsDto } from '../../../../shared/domain.ts';
import { useI18n } from '../../i18n/index.tsx';
import { niceCeil } from '../../lib/charts.ts';
import { growBars } from '../../motion/motion.ts';

interface HistogramProps {
  bands: StatsDto['scoreDistribution'];
  /** Average score, drawn as a reference line. */
  average: number | null;
}

const WIDTH = 360;
const HEIGHT = 170;
const MARGIN = { left: 8, right: 8, top: 26, bottom: 24 };

/** Distribution of scores by band of ten. Grey bars from zero; the dark line is the average. */
export function Histogram({ bands, average }: HistogramProps) {
  const { t } = useI18n();
  const svg = useRef<SVGSVGElement>(null);
  const titleId = useId();
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const baseline = MARGIN.top + plotHeight;
  const ceiling = niceCeil(Math.max(...bands.map((band) => band.count), 1));
  const slot = plotWidth / bands.length;
  const barWidth = slot * 0.74;
  const barX = (index: number) => MARGIN.left + index * slot + (slot - barWidth) / 2;
  const averageX = average === null ? null : MARGIN.left + (average / 100) * plotWidth;

  useLayoutEffect(() => {
    growBars(svg.current?.querySelectorAll('.bar'), 'y');
  }, []);

  const bandList = bands
    .filter((band) => band.count > 0)
    .map((band) => t('chart.band', { from: band.from, to: band.to, count: band.count }))
    .join(', ');
  const summary = t('chart.scoresSummary', { bands: `${bandList}.${average === null ? '' : ` ${t('chart.scoresAverage', { average })}`}` });

  return (
    <svg ref={svg} class="chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby={titleId}>
      <title id={titleId}>{summary}</title>
      {bands.map((band, index) => {
        const height = (band.count / ceiling) * plotHeight;
        return (
          <g key={band.from}>
            <rect class="bar" x={barX(index)} y={baseline - height} width={barWidth} height={height} rx={3}>
              <title>{t('chart.bandTitle', { from: band.from, to: band.to, count: band.count })}</title>
            </rect>
            <text class="chart-axis-label" x={barX(index) + barWidth / 2} y={HEIGHT - 8} text-anchor="middle">{band.from}</text>
          </g>
        );
      })}
      <line class="chart-baseline" x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={baseline} y2={baseline} />
      {averageX !== null ? <line class="mean-line" x1={averageX} x2={averageX} y1={MARGIN.top - 6} y2={baseline} /> : null}
      {bands.map((band, index) =>
        band.count > 0 ? (
          <text key={`value-${band.from}`} class="value-label" x={barX(index) + barWidth / 2} y={baseline - (band.count / ceiling) * plotHeight - 6} text-anchor="middle">
            {band.count}
          </text>
        ) : null,
      )}
      {averageX !== null && average !== null ? (
        <text class="mean-label" x={averageX} y={MARGIN.top - 10} text-anchor="middle">{t('chart.mean', { average })}</text>
      ) : null}
    </svg>
  );
}
