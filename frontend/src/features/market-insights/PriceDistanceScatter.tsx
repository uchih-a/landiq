/**
 * PriceDistanceScatter — the F5 per-county scatter plot.
 *
 * Plots `listed_price_per_acre_ksh` (log Y) against
 * `dist_to_nairobi_km` (linear X) for the selected county's first 200
 * listings, with a client-side OLS trend line fitted on `log(price)` so
 * the long tail of cheap rural plots stays readable next to Nairobi's
 * seven-figure prices.
 *
 * Data source: `useCountyListings(county, 1, 200)`. The hook is disabled
 * until a county is picked, so this component renders an EmptyState
 * prompt until then.
 *
 * Recharts note: we use `ComposedChart` (not `ScatterChart`) because the
 * trend line is a `<Line>` and Recharts only allows `<Line>` children
 * inside `LineChart` or `ComposedChart`. `<Scatter>` is still a valid
 * child of `ComposedChart`.
 */
import { useMemo } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { EmptyState, LoadingSkeleton, ValuationCard } from '@/components';
import { useCountyListings } from '@/lib/api/hooks';
import { formatMoney } from '@/lib/currency/format';

import { computeLogTrend } from './helpers';

interface Props {
  county: string | null;
}

interface ChartPoint {
  distance_km: number;
  price_per_acre: number;
  county: string | null;
}

const PRIMARY_CONTAINER = '#e8742a';
const TREND_COLOR = '#1f1b16';

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-DEFAULT bg-surface-container-lowest border border-black/[0.06] shadow-level-2 px-3 py-2">
      <div className="text-caption-sm font-caption-sm text-secondary uppercase tracking-wider">
        {p.county ?? 'Listing'}
      </div>
      <div className="text-body-medium font-body-medium text-on-surface">
        {formatMoney(p.price_per_acre)} / acre
      </div>
      <div className="text-caption-sm text-on-surface-variant">
        {p.distance_km.toFixed(0)} km from Nairobi
      </div>
    </div>
  );
}

export function PriceDistanceScatter({ county }: Props) {
  const safeCounty = county ?? '';
  const listingsQ = useCountyListings(safeCounty, 1, 200);

  const points = useMemo<ChartPoint[]>(() => {
    if (!listingsQ.data?.listings) return [];
    const out: ChartPoint[] = [];
    for (const row of listingsQ.data.listings) {
      const dist = row.dist_to_nairobi_km;
      const price = row.listed_price_per_acre_ksh;
      if (dist == null || !Number.isFinite(dist)) continue;
      if (!Number.isFinite(price) || price <= 0) continue;
      out.push({ distance_km: dist, price_per_acre: price, county: safeCounty });
    }
    return out;
  }, [listingsQ.data, safeCounty]);

  const trend = useMemo(() => computeLogTrend(points), [points]);
  const trendData = trend?.points ?? [];
  // G3 fix: don't show the trend line when there are too few points for a
  // meaningful OLS fit. With <5 points the regression line is noisy and
  // misleading (a 2-3 point scatter produces a near-perfect fit that
  // doesn't reflect any real price-distance relationship). Show a note
  // instead so the user understands why the trend is absent.
  const TREND_MIN_POINTS = 5;
  const showTrend = trend !== null && points.length >= TREND_MIN_POINTS;

  const yDomain = useMemo<[number, number]>(() => {
    if (points.length === 0) return [10_000, 10_000_000];
    const prices = points.map((p) => p.price_per_acre);
    return [
      Math.max(1, Math.floor(Math.min(...prices) / 10) * 10),
      Math.ceil(Math.max(...prices) / 10) * 10,
    ];
  }, [points]);

  if (!county) {
    return (
      <EmptyState
        icon="trending_up"
        title="Pick a county"
        message="Select a county from the rank list or the coloured grid to plot its price-vs-distance scatter with a fitted trend line."
      />
    );
  }

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <h2 className="font-headline-section text-headline-section text-on-surface">
          Price vs distance from Nairobi
        </h2>
        <p className="text-caption-sm text-on-surface-variant mt-1">
          Listed KSh/acre vs great-circle km from Nairobi · log scale · {county}
        </p>

        <div className="mt-space-md h-72 md:h-80 w-full">
          {listingsQ.isLoading ? (
            <LoadingSkeleton className="h-full w-full rounded-md" />
          ) : listingsQ.isError ? (
            <EmptyState
              icon="cloud_off"
              title="Couldn't load listings"
              message="The county listings feed is unavailable right now."
              actionLabel="Retry"
              onAction={() => listingsQ.refetch()}
            />
          ) : points.length === 0 ? (
            <EmptyState
              icon="scatter_plot"
              title="No listings to plot"
              message="No listings in this county have a usable price or distance. Try another county."
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
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
                  tickFormatter={(v: number) =>
                    formatMoney(v).replace(/KES\s*/, '').replace('KSh', '').trim()
                  }
                  width={72}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3', stroke: 'rgba(27,21,18,0.2)' }}
                  content={<ChartTooltip />}
                />
                {showTrend && (
                  <Line
                    type="monotone"
                    dataKey="trend"
                    data={trendData}
                    stroke={TREND_COLOR}
                    strokeWidth={2}
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
          {/* G3 fix: when there are points but too few for a meaningful
              trend line, show a note explaining why the trend is absent
              rather than silently leaving a misleading line on a 3-point
              scatter. */}
          {points.length > 0 && points.length < TREND_MIN_POINTS && (
            <p className="text-caption-sm text-secondary mt-2 text-center">
              Trend line hidden — too few listings ({points.length}) for a reliable fit.
            </p>
          )}
        </div>
      </div>
    </ValuationCard>
  );
}
