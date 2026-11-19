/**
 * PriceBySizeBand — line chart over `by_size_band` with national series
 * (solid orange) + county series (dashed near-black, only when a county
 * filter is applied).
 *
 * O2 build round: brand-new card.  Matches the design's Price-by-size-band
 * card.  Design-vs-data decisions:
 *
 *  - The design's "+4%" chip is OMITTED — the percentage's reference
 *    (vs. what baseline?) cannot be derived from the data.  See
 *    known-gaps.md #97.
 *  - Without a county selected, only the national series is drawn.  The
 *    design's "Nairobi Metro" label is not fabricated.  See #98.
 *  - The headline value is the median at the 1-acre band (the design's
 *    "1 Ac" vertex — the band whose lower edge is 1.0).  Documented in
 *    the card caption.
 *  - Low-support bands (n < min_county_n) drawn hollow with a tooltip.
 *  - Footer "Bulk discount ~X%" = `bulk_discount_pct`.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { ValuationCard } from '@/components/ValuationCard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import type { OverviewSizeBand, OverviewSummaryResponse } from '@/lib/api/types';
import { formatCompactMoney } from '@/lib/currency/format';

import { ALL_VALUE } from './overview-helpers';

interface PriceBySizeBandProps {
  overview: OverviewSummaryResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  county: string;
}

const NATIONAL_STROKE = '#e8742a';
const COUNTY_STROKE = '#1f1b16';
const LOW_SUPPORT_STROKE = '#dec1b3';

interface SeriesPoint {
  label: string;
  /** National-series median (always present). */
  national: number | null;
  /** County-series median (only when a county filter is applied). */
  county?: number | null;
  /** Whether the national band is low-support (drawn hollow). */
  nationalLowSupport: boolean;
  /** Whether the county band is low-support. */
  countyLowSupport?: boolean;
}

function buildSeries(
  bands: OverviewSizeBand[],
  comparison: OverviewSizeBand[] | null,
): SeriesPoint[] {
  return bands.map((b, i) => {
    const cmp = comparison?.[i];
    return {
      label: b.label,
      national: b.median_price_per_acre_ksh,
      county: cmp?.median_price_per_acre_ksh ?? null,
      nationalLowSupport: b.low_support,
      countyLowSupport: cmp?.low_support,
    };
  });
}

export function PriceBySizeBand({
  overview,
  isLoading,
  isError,
  onRetry,
  county,
}: PriceBySizeBandProps) {
  const { t } = useTranslation();

  const bands = useMemo(() => overview?.by_size_band.bands ?? [], [overview]);
  const comparison = overview?.by_size_band.comparison ?? null;
  const bulkDiscountPct = overview?.by_size_band.bulk_discount_pct ?? null;
  const hasCounty = county !== ALL_VALUE;

  const series = useMemo(
    () => buildSeries(bands, comparison),
    [bands, comparison],
  );

  // Headline = median at the 1-acre band (the band whose lower edge is 1.0).
  const oneAcreBand = bands.find((b) => b.lower_acres === 1.0);
  const headlineMedian = oneAcreBand?.median_price_per_acre_ksh ?? null;

  // Y domain from the union of national + county medians.
  const yDomain = useMemo<[number, number]>(() => {
    const vals: number[] = [];
    for (const b of bands) {
      if (b.median_price_per_acre_ksh != null) vals.push(b.median_price_per_acre_ksh);
    }
    if (comparison) {
      for (const b of comparison) {
        if (b.median_price_per_acre_ksh != null) vals.push(b.median_price_per_acre_ksh);
      }
    }
    if (vals.length === 0) return [100_000, 10_000_000];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return [Math.max(1, Math.floor(min / 10) * 10), Math.ceil(max / 10) * 10];
  }, [bands, comparison]);

  return (
    <ValuationCard className="xl:col-span-1 md:col-span-2" noPadding>
      <div className="p-space-lg h-full flex flex-col">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-outfit text-headline-page font-light text-on-surface">
                {headlineMedian != null ? formatCompactMoney(headlineMedian) : '—'}
              </span>
            </div>
            <h2 className="font-title-card text-title-card text-on-surface mt-1">
              {t('overview.priceBySizeBand')}
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              {t('overview.perAcreScaling')}
            </p>
          </div>
          <button
            type="button"
            title={t('overview.priceBySizeBand')}
            aria-label={t('overview.priceBySizeBand')}
            className="w-9 h-9 rounded-full bg-surface-container-low text-on-surface-variant hover:text-primary flex items-center justify-center shrink-0 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              show_chart
            </span>
          </button>
        </div>

        <div className="py-2 flex-1">
          {isLoading ? (
            <LoadingSkeleton className="h-36 w-full rounded-md" />
          ) : isError ? (
            <EmptyState
              icon="cloud_off"
              title={t('common.error')}
              message={t('common.dataUnavailable')}
              actionLabel={t('common.retry')}
              onAction={onRetry}
            />
          ) : bands.length === 0 ? (
            <EmptyState icon="show_chart" title={t('overview.emptySelection')} message="" />
          ) : (
            <ResponsiveContainer width="100%" height={144}>
              <LineChart
                data={series}
                margin={{ top: 4, right: 12, bottom: 24, left: -8 }}
              >
                <CartesianGrid
                  strokeDasharray="2 2"
                  stroke="#eae1d9"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  stroke="#574238"
                  tick={{ fill: '#574238', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  // Show every label on wide screens; on mobile the 7
                  // band labels overlap ("1/8-1/4 ac" is too long),
                  // so preserveStartEnd + auto-interval drops intermediate
                  // ones while keeping the first + last visible.
                  interval="preserveStartEnd"
                  // Custom formatter: shorten "1/8-1/4 ac" → "1/8-1/4"
                  // (drop the " ac" suffix — the card title already says
                  // "size band").  The full label still appears in the
                  // tooltip.
                  tickFormatter={(v: string) => String(v).replace(' ac', '').replace('<', '<')}
                />
                <YAxis
                  type="number"
                  scale="log"
                  domain={yDomain}
                  allowDataOverflow={false}
                  stroke="#574238"
                  tick={{ fill: '#574238', fontSize: 10 }}
                  tickFormatter={(v: number) => formatCompactMoney(v).replace('KSh ', '')}
                  width={48}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3', stroke: 'rgba(27,21,18,0.2)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const p = payload[0].payload as SeriesPoint;
                    return (
                      <div className="rounded-DEFAULT bg-surface-container-lowest border border-black/[0.06] shadow-level-2 px-3 py-2">
                        <div className="text-caption-sm font-caption-sm text-secondary uppercase tracking-wider">
                          {p.label}
                        </div>
                        <div className="text-body-medium font-body-medium text-on-surface">
                          {t('overview.medianKsh', {
                            value:
                              p.national != null ? formatCompactMoney(p.national) : '—',
                          })}
                        </div>
                        {p.nationalLowSupport && (
                          <div className="text-caption-sm text-secondary italic">
                            {t('overview.lowSupportBand', { n: 10 })}
                          </div>
                        )}
                        {hasCounty && p.county != null && (
                          <div className="text-caption-sm text-on-surface-variant mt-1">
                            {county}: {formatCompactMoney(p.county)}
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                {/* National series — solid orange; hollow markers on low-support bands */}
                <Line
                  type="monotone"
                  dataKey="national"
                  stroke={NATIONAL_STROKE}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  dot={(props) => {
                    const { cx, cy, payload, index } = props as {
                      cx?: number;
                      cy?: number;
                      payload?: SeriesPoint;
                      index?: number;
                    };
                    if (cx == null || cy == null) return <g key={index} />;
                    const low = payload?.nationalLowSupport;
                    return (
                      <circle
                        key={`nat-${index}`}
                        cx={cx}
                        cy={cy}
                        r={3.5}
                        fill={low ? '#fff' : NATIONAL_STROKE}
                        stroke={low ? LOW_SUPPORT_STROKE : NATIONAL_STROKE}
                        strokeWidth={2}
                      />
                    );
                  }}
                  isAnimationActive={false}
                  name={t('overview.nationalModel')}
                  connectNulls
                />
                {/* County series — dashed near-black, only when a county is selected */}
                {hasCounty && (
                  <Line
                    type="monotone"
                    dataKey="county"
                    stroke={COUNTY_STROKE}
                    strokeWidth={1.75}
                    strokeDasharray="4 3"
                    strokeLinecap="round"
                    dot={false}
                    isAnimationActive={false}
                    name={t('overview.benchmarkCounty', { county })}
                    connectNulls
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Legend + bulk-discount footer */}
        {!isLoading && !isError && (
          <div className="mt-4 pt-3 border-t border-surface-container flex items-center justify-between font-caption-sm text-caption-sm">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-on-surface">
                <span className="w-3 h-0.5 inline-block" style={{ backgroundColor: NATIONAL_STROKE }} />
                {t('overview.nationalModel')}
              </span>
              {hasCounty && (
                <span className="flex items-center gap-1.5 text-secondary">
                  <span
                    className="w-3 h-0.5 border-t border-dashed inline-block"
                    style={{ borderColor: COUNTY_STROKE }}
                  />
                  {t('overview.benchmarkCounty', { county })}
                </span>
              )}
            </div>
            {bulkDiscountPct != null && (
              <span className="text-secondary font-medium">
                {t('overview.bulkDiscount', { pct: bulkDiscountPct.toFixed(0) })}
              </span>
            )}
          </div>
        )}
      </div>
    </ValuationCard>
  );
}
