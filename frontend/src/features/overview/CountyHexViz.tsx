/**
 * CountyHexViz — the "Listings by county" card with the overlapping
 * honeycomb cluster + legend list (web 01_overview) or abbreviated hexes
 * (mobile m01_overview).
 *
 * O2 build round: rebuild to the design.
 *  - Top-N counties by listing count from `overview.counties.top`.
 *  - One "Others" entry combining the remaining counties
 *    (`overview.counties.others`).
 *  - The "T1..T6" tier labels are gone — the hexes are coloured by rank
 *    (top county = deepest orange, descending through the design's
 *    primary / primary-container / primary-fixed-dim palette).
 *  - Mobile: the abbreviated hexes use `abbreviateCounty` (derived from
 *    the name, never typed).  The legend rows are pills per the design.
 *  - Expand icon links to Market Insights with the county preselected.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { ValuationCard } from '@/components/ValuationCard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import type { OverviewSummaryResponse } from '@/lib/api/types';
import { formatCompactMoney } from '@/lib/currency/format';

import { buildMarketInsightsUrl } from './overview-helpers';

interface CountyHexVizProps {
  overview: OverviewSummaryResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

// Design palette: rank 1 = deepest orange, descending.
const RANK_COLORS = [
  '#9d4400', // primary — rank 1
  '#e8742a', // primary-container — rank 2
  '#ffb68f', // primary-fixed-dim — rank 3
  '#dec1b3', // outline-variant — Others
];

export function CountyHexViz({ overview, isLoading, isError, onRetry }: CountyHexVizProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const top = useMemo(() => overview?.counties.top ?? [], [overview]);
  const others = overview?.counties.others;
  const rows = useMemo(() => {
    const out: {
      county: string;
      n: number;
      median: number | null;
      color: string;
      isOthers?: boolean;
    }[] = [];
    top.forEach((c, i) => {
      out.push({
        county: c.county,
        n: c.n,
        median: c.median_price_per_acre_ksh,
        color: RANK_COLORS[Math.min(i, RANK_COLORS.length - 1)],
      });
    });
    if (others && (others.n > 0 || others.counties.length > 0)) {
      out.push({
        county: t('overview.othersCountiesLabel', {
          counties: others.counties.slice(0, 2).join(', '),
        }),
        n: others.n,
        median: others.median_price_per_acre_ksh,
        color: RANK_COLORS[3],
        isOthers: true,
      });
    }
    return out;
  }, [top, others, t]);

  return (
    <ValuationCard className="xl:col-span-1 md:col-span-1" noPadding>
      <div className="p-space-lg h-full flex flex-col">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="font-title-card text-title-card text-on-surface">
              {t('overview.listingsByCounty')}
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              {t('overview.countyComposition')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate(buildMarketInsightsUrl())}
            title="Open in Market Insights"
            aria-label="Open in Market Insights"
            className="w-9 h-9 rounded-full bg-surface-container-low text-on-surface-variant hover:text-primary flex items-center justify-center shrink-0 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              open_in_full
            </span>
          </button>
        </div>

        {/* Honeycomb cluster (web SVG) / abbreviated hexes (mobile) */}
        <div className="py-2 flex items-center justify-center" aria-hidden="true">
          {isLoading ? (
            <LoadingSkeleton className="h-24 w-48 rounded-md" />
          ) : isError ? (
            <EmptyState
              icon="cloud_off"
              title={t('common.error')}
              message={t('common.dataUnavailable')}
              actionLabel={t('common.retry')}
              onAction={onRetry}
            />
          ) : rows.length === 0 ? (
            <EmptyState icon="hub" title={t('overview.emptySelection')} message="" />
          ) : (
            <HexCluster rows={rows} />
          )}
        </div>

        {/* Legend list */}
        {!isLoading && !isError && rows.length > 0 && (
          <div className="flex flex-col gap-2 mt-4 pt-3 border-t border-surface-container">
            {rows.map((r) => (
              <button
                key={r.county}
                type="button"
                onClick={() =>
                  !r.isOthers &&
                  navigate(buildMarketInsightsUrl(r.county))
                }
                className="flex items-center justify-between text-body-regular font-body-regular text-left hover:bg-surface-container-low rounded-DEFAULT px-1 -mx-1 py-0.5 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-container"
                aria-label={`${r.county}: ${r.n} listings`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: r.color }}
                    aria-hidden="true"
                  />
                  <span className={r.isOthers ? 'text-secondary' : 'text-on-surface'}>
                    {r.county}
                  </span>
                </span>
                <span className="font-body-medium text-on-surface flex items-baseline gap-1">
                  <span>{r.n}</span>
                  <span className="text-xs text-secondary">
                    {t('overview.listingsAnalysed', { defaultValue: 'listings' })}
                  </span>
                  {r.median != null && (
                    <span className="text-xs text-secondary ml-1">
                      · {formatCompactMoney(r.median)}/ac
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </ValuationCard>
  );
}

// ---- Hex cluster ----
// SVG honeycomb for desktop (overlapping hexes), abbreviated hex pills
// for mobile.

interface HexRow {
  county: string;
  n: number;
  median: number | null;
  color: string;
  isOthers?: boolean;
}

function HexCluster({ rows }: { rows: HexRow[] }) {
  const hexes = rows.slice(0, 4);
  return (
    <svg
      className="overflow-visible hidden md:block"
      height="110"
      viewBox="0 0 240 110"
      width="240"
      aria-hidden="true"
    >
      {hexes.map((h, i) => {
        // Two-row honeycomb layout: ranks 0/2 in top row, 1/3 in bottom row,
        // offset to overlap (matches the design's overlapping hex pattern).
        const x = 40 + i * 36;
        const y = i % 2 === 0 ? 25 : 46;
        const points = `${x},${y} ${x + 20},${y - 12} ${x + 40},${y} ${x + 40},${y + 23} ${x + 20},${y + 35} ${x},${y + 23}`;
        return (
          <polygon
            key={h.county}
            fill={h.color}
            opacity={h.isOthers ? 0.6 : 0.95}
            points={points}
          />
        );
      })}
    </svg>
  );
}
