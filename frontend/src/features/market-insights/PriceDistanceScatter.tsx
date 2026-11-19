/**
 * PriceDistanceScatter — the per-county scatter plot (P3b real-data round).
 *
 * Data source: `useCountyDistanceProfile(county, propType)` — the
 * whole-county deterministic UNBIASED sample + the SERVER-side OLS trend
 * (replaces the old client-side approach, which plotted page 1 of the
 * county listings sorted cheapest-first — a biased sample — and fitted
 * the trend client-side on that page).
 *
 * Axis domains come from the response's ranges (tick rounding for
 * niceness only).  The card subtitle shows "showing X of N" from the
 * response.  When the county is low-support the trend is hidden and a
 * "limited data" note shows instead (the server omits the trend).
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
import { useCountyDistanceProfile } from '@/lib/api/hooks';
import type { CountyDistanceProfileResponse } from '@/lib/api/types';
import { formatMoney } from '@/lib/currency/format';

import { ALL_VALUE } from './helpers';

interface Props {
  county: string | null;
  propType: string;
}

interface ChartPoint {
  distance_km: number;
  price_per_acre: number;
  verdict: string | null;
}

// Design tokens for chart strokes (raw SVG colours — UI constants).
const PRIMARY_CONTAINER = '#e8742a';
const TREND_COLOR = '#1f1b16';

/** Nice-tick rounding for the Y domain: round outward to 1 significant
 * digit so the ticks are readable (rounding for tick niceness only —
 * the DOMAIN itself comes from the response's price_range). */
function niceRound(v: number, up: boolean): number {
  if (v <= 0) return up ? 10 : 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const scaled = v / mag;
  const rounded = up ? Math.ceil(scaled) : Math.floor(scaled);
  return Math.max(1, rounded * mag);
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
}) {
  const { t } = useTranslation();
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-DEFAULT bg-surface-container-lowest border border-black/[0.06] shadow-level-2 px-3 py-2">
      <div className="text-body-medium font-body-medium text-on-surface">
        {formatMoney(p.price_per_acre)} {t('market.perAcre')}
      </div>
      <div className="text-caption-sm text-on-surface-variant">
        {t('market.kmFromNairobi', { n: p.distance_km.toFixed(0) })}
      </div>
    </div>
  );
}

export function PriceDistanceScatter({ county, propType }: Props) {
  const { t } = useTranslation();
  const profileQ = useCountyDistanceProfile(
    county,
    propType === ALL_VALUE ? undefined : propType,
  );
  const profile: CountyDistanceProfileResponse | undefined = profileQ.data;

  const points = useMemo<ChartPoint[]>(() => {
    if (!profile?.sample) return [];
    return profile.sample
      .map((p) => {
        if (p.distance_km == null || !Number.isFinite(p.distance_km)) return null;
        if (!Number.isFinite(p.price_per_acre_ksh) || p.price_per_acre_ksh <= 0) return null;
        return {
          distance_km: p.distance_km,
          price_per_acre: p.price_per_acre_ksh,
          verdict: p.verdict,
        };
      })
      .filter((p): p is ChartPoint => p !== null);
  }, [profile]);

  // Server trend — sampled to 20 points across the response's distance
  // range (the fit itself is server-side; this only renders it).
  const trendData = useMemo(() => {
    const tr = profile?.trend;
    const range = profile?.distance_range_km;
    if (!tr || tr.slope == null || tr.intercept == null || !range) return [];
    const [xMin, xMax] = range;
    if (!(xMax > xMin)) return [];
    const STEPS = 20;
    const out: { distance_km: number; trend: number }[] = [];
    for (let i = 0; i <= STEPS; i++) {
      const x = xMin + (xMax - xMin) * (i / STEPS);
      out.push({ distance_km: x, trend: Math.exp(tr.slope * x + tr.intercept) });
    }
    return out;
  }, [profile]);

  // Y domain from the response's price_range (nice-rounded for ticks).
  const yDomain = useMemo<[number, number]>(() => {
    const range = profile?.price_range;
    if (!range || range[0] == null || range[1] == null || !(range[1] > range[0])) {
      return [50_000, 20_000_000];
    }
    return [niceRound(range[0], false), niceRound(range[1], true)];
  }, [profile]);

  // X domain from the response's distance_range.
  const xDomain = useMemo<[number, number]>(() => {
    const range = profile?.distance_range_km;
    if (!range || range[0] == null || range[1] == null) return [0, 400];
    return [niceRound(range[0], false), niceRound(range[1], true)];
  }, [profile]);

  if (!county) {
    return (
      <EmptyState
        icon="trending_up"
        title={t('market.pickCounty')}
        message={t('market.pickCountyHint')}
      />
    );
  }

  const lowSupport = profile?.low_support ?? false;

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <h2 className="font-headline-section text-headline-section text-on-surface">
          {t('market.priceVsDistance')}
        </h2>
        <p className="text-caption-sm text-on-surface-variant mt-1">
          {t('market.scatterSubtitle', {
            county,
            shown: profile?.n_returned ?? 0,
            total: profile?.n_total ?? 0,
          })}
        </p>
        {/* Visually hidden text summary for screen readers (a11y). */}
        <p className="sr-only">
          {t('market.scatterSummary', {
            county,
            n: profile?.n ?? 0,
            shown: profile?.n_returned ?? 0,
            total: profile?.n_total ?? 0,
          })}
        </p>

        <div className="mt-space-md h-72 md:h-80 w-full">
          {profileQ.isLoading ? (
            <LoadingSkeleton className="h-full w-full rounded-md" />
          ) : profileQ.isError ? (
            <EmptyState
              icon="cloud_off"
              title={t('common.dataUnavailable')}
              message={t('market.scatterLoadFailed')}
              actionLabel={t('common.retry')}
              onAction={() => profileQ.refetch()}
            />
          ) : points.length === 0 ? (
            <EmptyState
              icon="scatter_plot"
              title={t('market.noListingsToPlot')}
              message={t('market.noListingsToPlotHint')}
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
                  name={t('market.distanceName')}
                  stroke="#574238"
                  tick={{ fill: '#574238', fontSize: 12 }}
                  domain={xDomain}
                  tickFormatter={(v: number) => `${Math.round(v)} km`}
                  label={{
                    value: t('market.distanceLabel'),
                    position: 'insideBottom',
                    offset: -12,
                    fill: '#574238',
                    fontSize: 12,
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="price_per_acre"
                  name={t('market.priceName')}
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
                {trendData.length > 0 && !lowSupport && (
                  <Line
                    type="monotone"
                    dataKey="trend"
                    data={trendData}
                    stroke={TREND_COLOR}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    name={t('market.trendName')}
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
          {/* Low-support note: the server omitted the trend (the county
              is below min_county_n) — show why instead of a misleading
              line on a thin sample. */}
          {lowSupport && !profileQ.isLoading && !profileQ.isError && points.length > 0 && (
            <p className="text-caption-sm text-secondary mt-2 text-center" role="status">
              {t('market.trendHiddenLowSupport', {
                n: profile?.n ?? 0,
                min: profile?.min_county_n ?? '—',
              })}
            </p>
          )}
        </div>
      </div>
    </ValuationCard>
  );
}
