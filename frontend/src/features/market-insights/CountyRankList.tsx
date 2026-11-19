/**
 * CountyRankList — the "Highest and lowest" panel (P3b real-data round).
 *
 * Shows the top N and bottom N counties by median, where N is a
 * DISPLAY-DENSITY constant defined once below (a display setting, not a
 * data fact).  When eligible counties are fewer than 2*N, the list
 * splits them so no county appears in both lists.  The caption is built
 * by interpolation from the number of counties actually shown.
 *
 * Bar colours come from the response's data-driven band index (the typed
 * thresholds are gone).  All strings via i18n; the visible count via the
 * locale helper.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { EmptyState, LoadingSkeleton, ValuationCard } from '@/components';
import type { ApiQueryResult } from '@/lib/api/hooks';
import type {
  CountySummaryResponse,
  CountySummaryRow,
  PriceBandEdge,
} from '@/lib/api/types';
import { formatMoneyPerAcre } from '@/lib/currency/format';

import { bandForIndex, bandIndexForMedian } from './helpers';
import { useLocale } from '@/lib/i18n/useLocale';

/** Display density: how many counties each ranked list shows.  This is
 * a DISPLAY setting (how many rows fit the card), not a data fact —
 * the brief allows named UI constants with a comment. */
const RANK_DISPLAY_N = 10;

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
  // isn't held by a county with three listings (null = unknown
  // threshold -> excluded too, per the honest-unavailable rule).
  const { ranked, maxMedian, bands } = useMemo(() => {
    const rows = data?.counties ?? [];
    const eligible = rows.filter(
      (r) => r.n_below_min_county_n === false && r.median_price_per_acre_ksh != null,
    );
    const sorted = [...eligible].sort(
      (a, b) => (b.median_price_per_acre_ksh ?? 0) - (a.median_price_per_acre_ksh ?? 0),
    );
    const max = sorted.length > 0 ? (sorted[0].median_price_per_acre_ksh ?? 1) : 1;
    return {
      ranked: sorted,
      maxMedian: Math.max(1, max),
      bands: (data?.price_bands ?? []) as PriceBandEdge[],
    };
  }, [data]);

  // Top N / bottom N with the no-overlap split: when eligible counties
  // are fewer than 2*N, split them so no county appears in both lists.
  const { displayed, shownCount } = useMemo(() => {
    if (ranked.length <= RANK_DISPLAY_N * 2) {
      // Fewer than 2*N: split at the midpoint (top half / bottom half).
      const half = Math.ceil(ranked.length / 2);
      return {
        displayed: mode === 'top' ? ranked.slice(0, half) : ranked.slice(half),
        shownCount: half,
      };
    }
    return {
      displayed:
        mode === 'top' ? ranked.slice(0, RANK_DISPLAY_N) : [...ranked].reverse().slice(0, RANK_DISPLAY_N),
      shownCount: RANK_DISPLAY_N,
    };
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
        message={t('market.rankLoadFailed')}
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
          <span className="material-symbols-outlined text-secondary text-[20px]" aria-hidden="true">
            sort
          </span>
        </div>
        <p className="font-body-regular text-body-regular text-secondary mb-space-md">
          {t('market.rankCaption', { n: shownCount })}
        </p>

        {/* Top / Bottom toggle (per design — not side-by-side columns). */}
        <div
          className="flex items-center p-1 bg-surface-container-high rounded-full mb-space-md"
          role="tablist"
          aria-label={t('market.highestLowest')}
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'top'}
            onClick={() => setMode('top')}
            className={`flex-1 py-1.5 rounded-full text-xs font-medium text-center transition-all ${
              mode === 'top'
                ? 'bg-[#1F1511] text-white shadow-sm'
                : 'text-secondary hover:text-on-surface'
            }`}
          >
            {t('market.topN', { n: RANK_DISPLAY_N })}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'bottom'}
            onClick={() => setMode('bottom')}
            className={`flex-1 py-1.5 rounded-full text-xs font-medium text-center transition-colors ${
              mode === 'bottom'
                ? 'bg-[#1F1511] text-white shadow-sm'
                : 'text-secondary hover:text-on-surface'
            }`}
          >
            {t('market.bottomN', { n: RANK_DISPLAY_N })}
          </button>
        </div>

        {displayed.length === 0 ? (
          <p className="text-caption-sm text-secondary py-4">
            {t('market.noEligibleCounties')}
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {displayed.map((row, i) => (
              <RankRow
                key={row.county}
                rank={i + 1}
                row={row}
                maxMedian={maxMedian}
                bands={bands}
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
  bands: PriceBandEdge[];
  isSelected: boolean;
  onSelect: () => void;
}

function RankRow({ rank, row, maxMedian, bands, isSelected, onSelect }: RankRowProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  // Band index resolved from the response's data-driven edges.
  const bandIdx = bandIndexForMedian(row.median_price_per_acre_ksh, bands);
  const band = bandForIndex(bandIdx);

  // Whisker/IQR bar proportions, computed from the same summary row the
  // deep-dive panel shows.  Null values (no usable rows) render an
  // honest empty track.
  const median = row.median_price_per_acre_ksh;
  const q1 = row.q1_price_per_acre_ksh;
  const q3 = row.q3_price_per_acre_ksh;
  const medianPct = median != null ? Math.min(100, (median / maxMedian) * 100) : 0;
  const q1Pct = q1 != null ? Math.min(100, (q1 / maxMedian) * 100) : 0;
  const q3Pct = q3 != null ? Math.min(100, (q3 / maxMedian) * 100) : 0;
  const iqrLeft = Math.min(q1Pct, q3Pct);
  const iqrWidth = Math.max(0, q3Pct - q1Pct);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={`w-full p-2.5 rounded-xl flex flex-col gap-1.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-container ${
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
            aria-hidden="true"
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
              {t('market.selected')}
            </span>
          )}
          <span className="text-[11px] text-secondary font-normal whitespace-nowrap">
            {t('market.nListings', { n: row.n_listings.toLocaleString(locale) })}
          </span>
        </div>
        <span
          className={`font-semibold whitespace-nowrap tabular-nums ${
            isSelected ? 'text-primary font-bold' : 'text-on-surface'
          }`}
        >
          {median != null ? formatMoneyPerAcre(median) : '—'}
        </span>
      </div>

      {/* Row 2: whisker/IQR bar — coloured by the data-driven band. */}
      <div
        className="relative w-full h-3 bg-surface-container-high rounded-full overflow-hidden"
        role="presentation"
      >
        <div
          className={`absolute left-0 top-0 bottom-0 ${band.bgClass} rounded-full transition-all duration-300`}
          style={{ width: `${medianPct}%` }}
        />
        <div
          className="absolute top-0 bottom-0 border-x-2 border-on-surface/40 bg-white/20 transition-all duration-300"
          style={{ left: `${iqrLeft}%`, width: `${iqrWidth}%` }}
        />
      </div>
    </button>
  );
}
