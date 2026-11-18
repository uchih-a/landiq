/**
 * PriceDistanceChart — wide (8/12) card on the Overview grid.
 *
 * O2 build round:
 *  - Data: every number comes from the /overview/summary response's
 *    `scatter_sample` (the deterministic, unbiased sample) + `trend`
 *    (server-computed OLS log-linear fit) + `by_distance_band` (the
 *    pinned corridor tooltip).  No client-side haversine / OLS / verdict
 *    counting.
 *  - Axis fix: the X axis tickFormatter used to render "150km km" because
 *    both the `unit` prop and the tickFormatter added "km".  Render each
 *    unit once.
 *  - Card header controls: refresh (spinning state via isFetching),
 *    download (CSV of the plotted sample, with active filters in the
 *    filename).  The design's calendar/quarterly button is NOT rendered
 *    because listings carry no date column — see known-gaps.md #96.
 *  - Pinned corridor tooltip: built from `by_distance_band` so the user
 *    sees "<from>-<to> KM · Median KSh X · Range q1-q3 · N lst" without
 *    hovering.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import type { OverviewSummaryResponse } from '@/lib/api/types';
import { formatCompactMoney } from '@/lib/currency/format';

import { exportScatterCsv, formatCompactKSh } from './overview-helpers';

interface PriceDistanceChartProps {
  overview: OverviewSummaryResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  county: string;
  propType: string;
}

interface ChartPoint {
  distance_km: number;
  price_per_acre: number;
  county: string | null;
  listing_no: string | null;
  verdict: string | null;
}

interface TrendPoint {
  distance_km: number;
  trend: number;
  trend_floor: number;
}

const PRIMARY_CONTAINER = '#e8742a';
const TREND_STROKE = '#9d4400';
const HATCH_STROKE = '#dec1b3';

function ChartTooltip({
  active,
  payload,
}: {
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
        {formatCompactMoney(p.price_per_acre)} / acre
      </div>
      <div className="text-caption-sm font-caption-sm text-on-surface-variant">
        {p.distance_km.toFixed(0)} km from Nairobi
      </div>
    </div>
  );
}

export function PriceDistanceChart({
  overview,
  isLoading,
  isError,
  onRetry,
  county,
  propType,
}: PriceDistanceChartProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<'listings' | 'bands'>('listings');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pinnedBandIdx, setPinnedBandIdx] = useState<number | null>(null);

  // Build the scatter dataset from the response's `scatter_sample`.
  const points: ChartPoint[] = useMemo(() => {
    if (!overview?.scatter_sample) return [];
    return overview.scatter_sample.points
      .map((p) => {
        const d = p.distance_km;
        if (d == null || !Number.isFinite(d) || d < 0) return null;
        if (!Number.isFinite(p.price_per_acre_ksh) || p.price_per_acre_ksh <= 0) return null;
        return {
          distance_km: d,
          price_per_acre: p.price_per_acre_ksh,
          county: p.county,
          listing_no: p.listing_no,
          verdict: p.verdict,
        };
      })
      .filter((p): p is ChartPoint => p !== null);
  }, [overview]);

  // Y domain — log scale, strictly positive.  Computed from the scatter
  // sample (with a sensible Kenya-per-acre fallback when empty).
  const yDomain = useMemo<[number, number]>(() => {
    if (points.length === 0) return [50_000, 20_000_000];
    const prices = points.map((p) => p.price_per_acre);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return [Math.max(1, Math.floor(min / 10) * 10), Math.ceil(max / 10) * 10];
  }, [points]);

  // Trend line + area floor — uses the SERVER-COMPUTED slope / intercept
  // (no client-side OLS).  We sample 20 points across the data's x-domain
  // and exp() them back to KSh.
  const trendData = useMemo<TrendPoint[] | null>(() => {
    if (!overview?.trend || overview.trend.slope == null || overview.trend.intercept == null) {
      return null;
    }
    if (points.length === 0) return null;
    const xs = points.map((p) => p.distance_km);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const STEPS = 20;
    const out: TrendPoint[] = [];
    for (let i = 0; i <= STEPS; i++) {
      const x = xMin + (xMax - xMin) * (i / STEPS);
      out.push({
        distance_km: x,
        trend: Math.exp(overview.trend.slope * x + overview.trend.intercept),
        trend_floor: yDomain[0],
      });
    }
    return out;
  }, [overview, points, yDomain]);

  // Pinned corridor tooltip — built from by_distance_band.  Defaults to
  // the band with the most listings.
  const bands = useMemo(() => overview?.by_distance_band?.bands ?? [], [overview]);
  const pinnedBand = useMemo(() => {
    if (bands.length === 0) return null;
    const idx =
      pinnedBandIdx != null
        ? pinnedBandIdx
        : bands.reduce((best, b, i, arr) => (b.n > arr[best].n ? i : best), 0);
    return { ...bands[idx], idx };
  }, [bands, pinnedBandIdx]);

  const onDownload = () => {
    if (!overview) return;
    const { csv, filename } = exportScatterCsv(overview.scatter_sample.points, {
      county,
      propType,
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const onRefresh = () => {
    setIsRefreshing(true);
    onRetry();
    // Spin for ~600ms minimum so the user sees the refresh affordance.
    setTimeout(() => setIsRefreshing(false), 600);
  };

  return (
    <ValuationCard className="lg:col-span-8" noPadding>
      <div className="p-space-lg">
        {/* ---- Header ---- */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-headline-section text-headline-section text-on-surface">
                {t('overview.priceByDistance')}
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-secondary text-xs font-medium uppercase tracking-wider">
                {t('overview.logScale')}
              </span>
            </div>
            <p className="text-body-regular font-body-regular text-secondary mt-1">
              {t('overview.showingNSample', {
                shown: overview?.scatter_sample?.n_returned ?? 0,
                total: overview?.scatter_sample?.n_total ?? 0,
              })}
            </p>
          </div>
          {/* Card header controls — refresh + download only (no calendar). */}
          <div className="flex items-center gap-1.5 shrink-0" role="toolbar" aria-label="Chart controls">
            <button
              type="button"
              onClick={onRefresh}
              title={t('overview.refresh')}
              aria-label={t('overview.refresh')}
              className="w-9 h-9 rounded-full bg-surface-container-low text-on-surface-variant hover:text-primary hover:bg-surface-container flex items-center justify-center transition-colors"
            >
              <span
                className={`material-symbols-outlined text-[18px] ${isRefreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              >
                refresh
              </span>
            </button>
            <button
              type="button"
              onClick={onDownload}
              title={t('overview.download')}
              aria-label={t('overview.download')}
              className="w-9 h-9 rounded-full bg-surface-container-low text-on-surface-variant hover:text-primary hover:bg-surface-container flex items-center justify-center transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                download
              </span>
            </button>
          </div>
        </div>

        {/* View toggle (Listings / Bands) */}
        <div className="flex items-center gap-1 mb-3" role="tablist" aria-label="Chart view">
          {(['listings', 'bands'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                view === v
                  ? 'bg-[#1e1a17] text-white'
                  : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {t(`overview.${v}`)}
            </button>
          ))}
        </div>

        <div className="h-72 md:h-80 w-full">
          {isLoading ? (
            <LoadingSkeleton className="h-full w-full rounded-md" />
          ) : isError ? (
            <EmptyState
              icon="cloud_off"
              title={t('common.error')}
              message={t('common.dataUnavailable')}
              actionLabel={t('common.retry')}
              onAction={onRetry}
            />
          ) : points.length === 0 && view === 'listings' ? (
            <EmptyState
              icon="scatter_plot"
              title={t('overview.emptySelection')}
              message=""
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                margin={{ top: 8, right: 16, bottom: 32, left: 8 }}
                onClick={(e) => {
                  // Click on a band's x-region to pin the corridor tooltip.
                  if (e && typeof e === 'object' && 'activeLabel' in e) {
                    const label = (e as { activeLabel?: number }).activeLabel;
                    if (typeof label === 'number') {
                      // Find the band whose [lower, upper) contains `label`.
                      const idx = bands.findIndex(
                        (b) => label >= b.lower_km && (b.upper_km == null || label < b.upper_km),
                      );
                      if (idx >= 0) setPinnedBandIdx(idx);
                    }
                  }
                }}
              >
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
                  stroke="#574238"
                  tick={{ fill: '#574238', fontSize: 12 }}
                  // FIX (O2): previously rendered "150km km" because both
                  // `unit` and tickFormatter added "km".  Render each unit
                  // once — drop the `unit` prop and let the formatter own it.
                  tickFormatter={(v: number) => `${Math.round(v)} km`}
                  label={{
                    value: t('overview.priceByDistance', { defaultValue: 'Distance from Nairobi (km)' }),
                    position: 'insideBottom',
                    offset: -12,
                    fill: '#574238',
                    fontSize: 12,
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="price_per_acre"
                  name="Price per acre"
                  scale="log"
                  domain={yDomain}
                  allowDataOverflow={false}
                  stroke="#574238"
                  tick={{ fill: '#574238', fontSize: 12 }}
                  tickFormatter={(v: number) => formatCompactKSh(v).replace('KSh ', '')}
                  width={56}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3', stroke: 'rgba(27,21,18,0.2)' }}
                  content={<ChartTooltip />}
                />
                {view === 'bands' && trendData && (
                  <Area
                    type="monotone"
                    dataKey="trend"
                    data={trendData}
                    stroke="none"
                    fill="url(#overviewHatch)"
                    fillOpacity={1}
                    isAnimationActive={false}
                    name="Trend area"
                    baseValue={yDomain[0]}
                  />
                )}
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
                {view === 'listings' && (
                  <Scatter
                    data={points}
                    fill={PRIMARY_CONTAINER}
                    fillOpacity={0.7}
                    stroke={PRIMARY_CONTAINER}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pinned corridor tooltip card — from by_distance_band */}
        {pinnedBand && pinnedBand.n > 0 && (
          <div
            className="mt-3 p-3 rounded-DEFAULT bg-surface-container-lowest border border-surface-container flex flex-col gap-1 shadow-sm"
            aria-live="polite"
          >
            <div className="flex items-center justify-between">
              <span className="font-caption-sm text-caption-sm text-secondary uppercase font-semibold">
                {pinnedBand.label}
              </span>
              <span
                className="inline-block w-2 h-2 rounded-full bg-primary-container"
                aria-hidden="true"
              />
            </div>
            <div className="font-title-card text-title-card text-on-surface">
              {t('overview.medianKsh', {
                value:
                  pinnedBand.median_price_per_acre_ksh != null
                    ? formatCompactMoney(pinnedBand.median_price_per_acre_ksh)
                    : '—',
              })}
            </div>
            {pinnedBand.q1_price_per_acre_ksh != null &&
              pinnedBand.q3_price_per_acre_ksh != null && (
                <div className="flex items-center justify-between text-caption-sm font-caption-sm text-on-surface-variant pt-1 mt-1 border-t border-surface-container">
                  <span>
                    {t('overview.rangeQ1Q3', {
                      q1: formatCompactMoney(pinnedBand.q1_price_per_acre_ksh),
                      q3: formatCompactMoney(pinnedBand.q3_price_per_acre_ksh),
                    })}
                  </span>
                  <span className="text-secondary font-medium">
                    {t('overview.nListings', { n: pinnedBand.n })}
                  </span>
                </div>
              )}
          </div>
        )}
      </div>
    </ValuationCard>
  );
}
