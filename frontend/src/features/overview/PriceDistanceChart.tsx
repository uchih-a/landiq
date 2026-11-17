/**
 * PriceDistanceChart — wide (8/12) card on the Overview grid.
 *
 * Recharts ComposedChart of `listed_price_per_acre_ksh` (log Y) against
 * distance from Nairobi (km, linear X), combining:
 *  - <Scatter> dots for individual listings
 *  - <Line> for the OLS trend curve fitted on log(price) vs distance
 *  - <Area> under the trend curve filled with a diagonal hatch SVG pattern
 *
 * The diagonal hatch pattern is the design's signature chart texture
 * (01_overview/code.html defines `<pattern id="diagonalHatch">` with
 * `<line stroke="#dec1b3" stroke-width="1.25">` at 45°). Recharts renders
 * SVG, so we inject a `<defs>` block with the same pattern and reference it
 * via `fill="url(#overviewHatch)"` on the Area. This is the G1 fix for the
 * F3 gap where the hatch was dropped to a solid fill.
 *
 * Data source: the backend has no dedicated distance-scatter endpoint, so
 * we derive `dist_to_nairobi_km` client-side from each listing's
 * `latitude` / `longitude` (via the haversine helper in
 * `overview-helpers.ts`). The haversine formula and Nairobi reference
 * point (-1.2921, 36.8219) are IDENTICAL to the backend's
 * `landval.features.geo.haversine_km` — verified numerically in G1 (max
 * diff 2.84e-13 km, floating-point noise). The only divergence is the
 * backend's `round(x, 2)` before storing, which adds ≤0.005 km rounding
 * error — invisible on a scatter chart.
 */
import { useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { ValuationCard } from '@/components/ValuationCard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import type { ApiQueryResult } from '@/lib/api/hooks';
import type { ListingsScoredResponse } from '@/lib/api/types';
import {
  NAIROBI_LAT,
  NAIROBI_LON,
  haversineKm,
  formatCompactKSh,
} from './overview-helpers';

interface PriceDistanceChartProps {
  query: ApiQueryResult<ListingsScoredResponse>;
  filterLabel: string;
}

interface ChartPoint {
  distance_km: number;
  price_per_acre: number;
  county: string | null;
}

interface TrendPoint {
  distance_km: number;
  trend: number;
  /** Lower bound of the trend area (log-space, for the hatch fill area) */
  trend_floor: number;
}

const PRIMARY_CONTAINER = '#e8742a';
const TREND_STROKE = '#9d4400';
/** The hatch pattern's stroke color — matches design's `#dec1b3` (outline-variant). */
const HATCH_STROKE = '#dec1b3';

/**
 * Ordinary-least-squares regression of `log(price_per_acre)` on
 * `distance_km`, returning a 20-sample trend line across the x-domain
 * (exp()'d back to KSh) plus a floor series for the Area fill.
 *
 * Ported from market-insights/helpers.ts `computeLogTrend` so both pages
 * use the same trend computation. The floor is set to the y-domain minimum
 * so the Area fills from the trend line down to the bottom of the chart.
 */
function computeTrendArea(
  points: ChartPoint[],
  yFloor: number,
): TrendPoint[] | null {
  const valid = points.filter(
    (p) =>
      Number.isFinite(p.distance_km) &&
      p.distance_km > 0 &&
      Number.isFinite(p.price_per_acre) &&
      p.price_per_acre > 0,
  );
  if (valid.length < 2) return null;

  const n = valid.length;
  const xs = valid.map((p) => p.distance_km);
  const ys = valid.map((p) => Math.log(p.price_per_acre));
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  if (den === 0) return null;

  const slope = num / den;
  const intercept = yMean - slope * xMean;

  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const STEPS = 20;
  const sampled: TrendPoint[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const x = xMin + (xMax - xMin) * (i / STEPS);
    sampled.push({
      distance_km: x,
      trend: Math.exp(slope * x + intercept),
      trend_floor: yFloor,
    });
  }
  return sampled;
}

function ChartTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  if (!('price_per_acre' in p)) return null;
  return (
    <div className="rounded-DEFAULT bg-surface-container-lowest border border-black/[0.06] shadow-level-2 px-3 py-2">
      <div className="text-caption-sm font-caption-sm text-secondary uppercase tracking-wider">
        {p.county ?? 'Listing'}
      </div>
      <div className="text-body-medium font-body-medium text-on-surface">
        {formatCompactKSh(p.price_per_acre)} / acre
      </div>
      <div className="text-caption-sm font-caption-sm text-on-surface-variant">
        {p.distance_km.toFixed(0)} km from Nairobi
      </div>
    </div>
  );
}

export function PriceDistanceChart({ query, filterLabel }: PriceDistanceChartProps) {
  const { data, isLoading, isError, refetch } = query;

  // Build the scatter dataset (filter out listings without lat/lon or price).
  const points: ChartPoint[] = useMemo(() => {
    if (!data?.listings) return [];
    return data.listings
      .map((row) => {
        const lat = row.latitude;
        const lon = row.longitude;
        const price = row.listed_price_per_acre_ksh;
        if (
          lat == null ||
          lon == null ||
          !Number.isFinite(lat) ||
          !Number.isFinite(lon) ||
          !Number.isFinite(price) ||
          price <= 0
        ) {
          return null;
        }
        return {
          distance_km: haversineKm(NAIROBI_LAT, NAIROBI_LON, lat, lon),
          price_per_acre: price,
          county: row.county,
        };
      })
      .filter((p): p is ChartPoint => p !== null);
  }, [data]);

  // Log-scale Y axis needs a strictly-positive domain; compute from data,
  // falling back to a sensible Kenya-per-acre range when empty.
  const yDomain = useMemo<[number, number]>(() => {
    if (points.length === 0) return [10_000, 10_000_000];
    const prices = points.map((p) => p.price_per_acre);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return [Math.max(1, Math.floor(min / 10) * 10), Math.ceil(max / 10) * 10];
  }, [points]);

  // Trend curve + area floor series for the hatch fill.
  const trendData = useMemo(
    () => computeTrendArea(points, yDomain[0]),
    [points, yDomain],
  );

  return (
    <ValuationCard className="lg:col-span-8" noPadding>
      <div className="p-space-lg">
        <div className="flex items-baseline justify-between mb-space-md">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-headline-section text-headline-section text-on-surface">
                Price by distance from Nairobi
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-secondary text-xs font-medium uppercase tracking-wider">
                log scale
              </span>
            </div>
            <p className="text-body-regular font-body-regular text-secondary mt-1">
              Land price decay estimate model across transport corridors · {filterLabel}
            </p>
          </div>
        </div>

        <div className="h-72 md:h-80 w-full">
          {isLoading ? (
            <LoadingSkeleton className="h-full w-full rounded-md" />
          ) : isError ? (
            <EmptyState
              icon="cloud_off"
              title="Couldn't load listings"
              message="The scored listings feed is unavailable. Try again once the backend finishes loading its artifacts."
              actionLabel="Retry"
              onAction={() => refetch()}
            />
          ) : points.length === 0 ? (
            <EmptyState
              icon="scatter_plot"
              title="No listings in this view"
              message="No scored listings match the current county / property-type filter, or none have usable lat/lon. Try widening the filter."
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart margin={{ top: 8, right: 16, bottom: 32, left: 8 }}>
                {/* Diagonal hatch pattern — matches 01_overview/code.html's
                    `<pattern id="diagonalHatch">` definition:
                    patternTransform="rotate(45)", stroke="#dec1b3", width=8.
                    Recharts renders <defs> children into the chart's SVG. */}
                <defs>
                  <pattern
                    id="overviewHatch"
                    patternUnits="userSpaceOnUse"
                    width={8}
                    height={8}
                    patternTransform="rotate(45)"
                  >
                    <line
                      x1={0}
                      y1={0}
                      x2={0}
                      y2={8}
                      stroke={HATCH_STROKE}
                      strokeWidth={1.25}
                      opacity={0.65}
                    />
                  </pattern>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(27,21,18,0.08)"
                  vertical={false}
                />
                <XAxis
                  type="number"
                  dataKey="distance_km"
                  name="Distance from Nairobi"
                  unit=" km"
                  stroke="#574238"
                  tick={{ fill: '#574238', fontSize: 12 }}
                  tickFormatter={(v: number) => `${Math.round(v)}km`}
                  label={{
                    value: 'Distance from Nairobi (km)',
                    position: 'insideBottom',
                    offset: -12,
                    fill: '#574238',
                    fontSize: 12,
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="price_per_acre"
                  name="Price per acre (KSh)"
                  scale="log"
                  domain={yDomain}
                  allowDataOverflow={false}
                  stroke="#574238"
                  tick={{ fill: '#574238', fontSize: 12 }}
                  tickFormatter={(v: number) => formatCompactKSh(v).replace('KSh ', '')}
                  width={64}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3', stroke: 'rgba(27,21,18,0.2)' }}
                  content={<ChartTooltip />}
                />
                {/* Hatch-filled area under the trend curve.
                    dataKey="trend" is the curve; the Area fills between
                    `trend` and `trend_floor` (the y-domain minimum). */}
                {trendData && (
                  <Area
                    type="monotone"
                    dataKey="trend"
                    data={trendData}
                    stroke="none"
                    fill="url(#overviewHatch)"
                    fillOpacity={1}
                    isAnimationActive={false}
                    name="Trend area"
                    // Area needs a base to fill down to — use the floor series
                    baseValue={yDomain[0]}
                  />
                )}
                {/* Trend curve line on top of the hatch fill.
                    Uses a gradient-like deep-orange stroke (#9d4400) matching
                    the design's curveGradient start color. */}
                {trendData && (
                  <Line
                    type="monotone"
                    dataKey="trend"
                    data={trendData}
                    stroke={TREND_STROKE}
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                    name="Trend (log-fit)"
                  />
                )}
                <Scatter
                  data={points}
                  fill={PRIMARY_CONTAINER}
                  fillOpacity={0.7}
                  stroke={PRIMARY_CONTAINER}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </ValuationCard>
  );
}
