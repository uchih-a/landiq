/**
 * CountyRankList — the "Highest and lowest" panel.
 *
 * Per 05_market_insights/code.html, this is a TOGGLE between Top 10 / Bottom 10
 * (not side-by-side columns), where each ranked row shows:
 *   - Rank number + county name + listing count + median price
 *   - A whisker/IQR bar: a horizontal track with a colored fill proportional
 *     to the county's median (relative to the max median in the displayed set)
 *     and an IQR overlay showing the Q1–Q3 range position within that track.
 *
 * The IQR overlay's position and width are computed from the county's
 * `q1_price_per_acre_ksh` and `q3_price_per_acre_ksh` relative to the
 * displayed set's max median — so the visual is internally consistent
 * with the deep-dive panel's IQR numbers (both read from the same
 * `CountySummaryRow` fields).
 *
 * Counties flagged `n_below_min_county_n` (small sample) are excluded from
 * the ranking so a county with three listings doesn't surface as "cheapest".
 *
 * Clicking a row selects that county (lifted state) — same handler as the
 * choropleth grid, so the deep-dive panel + scatter plot react in lockstep.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { EmptyState, LoadingSkeleton, ValuationCard } from '@/components';
import type { ApiQueryResult } from '@/lib/api/hooks';
import type {
  CountySummaryResponse,
  CountySummaryRow,
} from '@/lib/api/types';
import { formatMoneyPerAcre } from '@/lib/currency/format';

import { bandForMedianOrange } from './helpers';

interface Props {
  summaryQ: ApiQueryResult<CountySummaryResponse>;
  selectedCounty: string | null;
  onSelectCounty: (county: string) => void;
}

type RankMode = 'top' | 'bottom';

export function CountyRankList({
  summaryQ,
  selectedCounty,
  onSelectCounty,
}: Props) {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = summaryQ;
  const [mode, setMode] = useState<RankMode>('top');

  // Drop small-sample counties before ranking so the "cheapest" slot
  // isn't held by a county with three listings.
  const { ranked, maxMedian } = useMemo(() => {
    const rows = data?.counties ?? [];
    const eligible = rows.filter((r) => !r.n_below_min_county_n);
    const sorted = [...eligible].sort(
      (a, b) => b.median_price_per_acre_ksh - a.median_price_per_acre_ksh,
    );
    const max = sorted.length > 0 ? sorted[0].median_price_per_acre_ksh : 1;
    return { ranked: sorted, maxMedian: Math.max(1, max) };
  }, [data]);

  // Slice top or bottom 10 based on the toggle.
  const displayed = useMemo(() => {
    if (mode === 'top') return ranked.slice(0, 10);
    return [...ranked].reverse().slice(0, 10);
  }, [ranked, mode]);

  if (isLoading) {
    return (
      <ValuationCard noPadding>
        <div className="p-space-lg">
          <LoadingSkeleton className="h-72 w-full rounded-md" />
        </div>
      </ValuationCard>
    );
  }
  if (isError) {
    return (
      <EmptyState
        icon="cloud_off"
        title={t('common.dataUnavailable')}
        message="The county summary feed is unavailable right now."
        actionLabel={t('common.retry')}
        onAction={() => refetch()}
      />
    );
  }

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-headline-section text-headline-section text-on-surface">
            {t('market.highestLowest')}
          </h2>
          <span className="material-symbols-outlined text-secondary text-[20px]">sort</span>
        </div>
        <p className="font-body-regular text-body-regular text-secondary mb-space-md">
          Counties ranked by median asking price per acre
        </p>

        {/* Top 10 / Bottom 10 toggle (per design — not side-by-side columns) */}
        <div className="flex items-center p-1 bg-surface-container-high rounded-full mb-space-md">
          <button
            type="button"
            onClick={() => setMode('top')}
            className={`flex-1 py-1.5 rounded-full text-xs font-medium text-center transition-all ${
              mode === 'top'
                ? 'bg-[#1F1511] text-white shadow-sm'
                : 'text-secondary hover:text-on-surface'
            }`}
          >
            Top 10 counties
          </button>
          <button
            type="button"
            onClick={() => setMode('bottom')}
            className={`flex-1 py-1.5 rounded-full text-xs font-medium text-center transition-colors ${
              mode === 'bottom'
                ? 'bg-[#1F1511] text-white shadow-sm'
                : 'text-secondary hover:text-on-surface'
            }`}
          >
            Bottom 10 counties
          </button>
        </div>

        {displayed.length === 0 ? (
          <p className="text-caption-sm text-secondary py-4">
            No counties meet the minimum sample size.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {displayed.map((row, i) => (
              <RankRow
                key={row.county}
                rank={i + 1}
                row={row}
                maxMedian={maxMedian}
                isSelected={
                  selectedCounty != null &&
                  row.county.toLowerCase() === selectedCounty.toLowerCase()
                }
                onSelect={() => onSelectCounty(row.county)}
              />
            ))}
          </div>
        )}
      </div>
    </ValuationCard>
  );
}

interface RankRowProps {
  rank: number;
  row: CountySummaryRow;
  maxMedian: number;
  isSelected: boolean;
  onSelect: () => void;
}

function RankRow({ rank, row, maxMedian, isSelected, onSelect }: RankRowProps) {
  const band = bandForMedianOrange(row.median_price_per_acre_ksh);

  // Whisker/IQR bar proportions, computed from the same CountySummaryRow
  // fields the deep-dive panel shows. All values are relative to maxMedian
  // so the bar fills proportionally across the ranked set.
  const medianPct = Math.min(100, (row.median_price_per_acre_ksh / maxMedian) * 100);
  const q1Pct = Math.min(100, (row.q1_price_per_acre_ksh / maxMedian) * 100);
  const q3Pct = Math.min(100, (row.q3_price_per_acre_ksh / maxMedian) * 100);
  const iqrLeft = Math.min(q1Pct, q3Pct);
  const iqrWidth = Math.max(0, q3Pct - q1Pct);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={`w-full p-2.5 rounded-xl flex flex-col gap-1.5 text-left transition-colors ${
        isSelected
          ? 'bg-primary-fixed/30 shadow-xs'
          : 'bg-surface-container-low/60 hover:bg-surface-container-low'
      }`}
    >
      {/* Row 1: rank + county + listing count + median price */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-5 font-semibold text-right ${
              isSelected ? 'text-primary font-bold' : 'text-secondary'
            }`}
          >
            {rank}
          </span>
          <span
            className={`font-medium truncate ${
              isSelected ? 'text-primary font-semibold' : 'text-on-surface'
            }`}
          >
            {row.county}
          </span>
          {isSelected && (
            <span className="px-1.5 py-0.2 bg-primary text-white rounded text-[10px] font-medium">
              Selected
            </span>
          )}
          <span className="text-[11px] text-secondary font-normal whitespace-nowrap">
            {row.n_listings} listings
          </span>
        </div>
        <span
          className={`font-semibold whitespace-nowrap tabular-nums ${
            isSelected ? 'text-primary font-bold' : 'text-on-surface'
          }`}
        >
          {formatMoneyPerAcre(row.median_price_per_acre_ksh)}
        </span>
      </div>

      {/* Row 2: whisker/IQR bar — colored fill for median + IQR overlay for Q1–Q3 */}
      <div className="relative w-full h-3 bg-surface-container-high rounded-full overflow-hidden">
        {/* Median fill — colored by the county's price band (orange scale) */}
        <div
          className={`absolute left-0 top-0 bottom-0 ${band.bgClass} rounded-full transition-all duration-300`}
          style={{ width: `${medianPct}%` }}
        />
        {/* IQR overlay — shows the Q1–Q3 range position within the track */}
        <div
          className="absolute top-0 bottom-0 border-x-2 border-on-surface/40 bg-white/20 transition-all duration-300"
          style={{ left: `${iqrLeft}%`, width: `${iqrWidth}%` }}
        />
      </div>
    </button>
  );
}
