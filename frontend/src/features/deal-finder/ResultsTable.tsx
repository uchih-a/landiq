/**
 * ResultsTable — the Deal Finder scored-listings table.
 *
 * P4 fidelity pass: column set updated to match 06_deal_finder/code.html:
 *  - Listing & Location (with leading orange dot on selected row)
 *  - Size (acres)
 *  - Asking / ac (with Total price subtitle)
 *  - Model estimate (with 80% range subtitle)
 *  - Verdict (chip with percentage: "-28% Under", "+4% Fair", "+15% Over")
 *  - Notice (warning icon for data_quality_flag, em-dash otherwise)
 *
 * Selected row uses `bg-primary-fixed/20` with a leading orange dot
 * (`bg-primary-container ring-4 ring-primary-fixed/40`) per the design.
 *
 * The verdict percentage is computed as:
 *   pct = round((listed - predicted) / predicted × 100)
 *   Underpriced: shows "-28% Under" (pct is negative)
 *   Fair: shows "+4% Fair" (pct is near zero)
 *   Overpriced: shows "+15% Over" (pct is positive)
 *
 * Loading / error / empty states render per the F1 pattern.
 */
import { useTranslation } from 'react-i18next';

import {
  EmptyState,
  LoadingSkeleton,
  ValuationCard,
} from '@/components';
import { getErrorState } from '@/lib/api/hooks';
import type { ListingsScoredRow } from '@/lib/api/types';
import { formatCompactMoney } from '@/lib/currency/format';

interface Props {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  rows: ListingsScoredRow[];
  selectedListingNo: string | null;
  onRowClick: (row: ListingsScoredRow) => void;
  onRetry: () => void;
  sortAsc: boolean;
  onSortToggle: () => void;
  totalRows: number;
  county: string;
  currentPage: number;
  pageSize: number;
}

function verdictPct(row: ListingsScoredRow): number {
  if (row.predicted_price_per_acre_ksh <= 0) return 0;
  return Math.round(
    ((row.listed_price_per_acre_ksh - row.predicted_price_per_acre_ksh) /
      row.predicted_price_per_acre_ksh) *
      100,
  );
}

function verdictChipClass(verdict: string): string {
  const v = (verdict ?? '').toLowerCase();
  if (v === 'underpriced') return 'bg-[#E8F5E9] text-[#2D6A4F]';
  if (v === 'overpriced') return 'bg-[#FBEBE8] text-[#C84B31]';
  return 'bg-surface-container text-[#5C5752]';
}

function verdictDotColor(verdict: string): string {
  const v = (verdict ?? '').toLowerCase();
  if (v === 'underpriced') return '#2D6A4F';
  if (v === 'overpriced') return '#C84B31';
  return '#5C5752';
}

function verdictLabel(verdict: string): string {
  const v = (verdict ?? '').toLowerCase();
  if (v === 'underpriced') return 'Under';
  if (v === 'overpriced') return 'Over';
  return 'Fair';
}

export function ResultsTable({
  isLoading,
  isError,
  error,
  rows,
  selectedListingNo,
  onRowClick,
  onRetry,
  sortAsc,
  onSortToggle,
  totalRows,
  county,
  currentPage,
  pageSize,
}: Props) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <ValuationCard noPadding>
        <div className="p-space-md">
          <LoadingSkeleton className="h-64 w-full rounded-md" />
        </div>
      </ValuationCard>
    );
  }
  if (isError) {
    const state = getErrorState(error);
    return (
      <EmptyState
        icon={state.type === 'rate_limit' ? 'hourglass_top' : 'cloud_off'}
        title={state.type === 'rate_limit' ? 'Too many requests' : t('common.dataUnavailable')}
        message={state.message}
        actionLabel={t('common.retry')}
        onAction={onRetry}
      />
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="search_off"
        title="No matches"
        message="No scored listings match the current filters. Try widening the county or verdict filter."
      />
    );
  }

  const countyLabel = county && county !== 'all' ? ` • ${county} corridor focus` : '';
  const startIdx = (currentPage - 1) * pageSize + 1;
  const endIdx = Math.min(currentPage * pageSize, totalRows);

  return (
    <ValuationCard noPadding>
      <div className="p-space-md">
        {/* Table action header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 gap-3">
          <div>
            <h2 className="font-headline-section text-headline-section text-on-surface">
              Available Deals
            </h2>
            <p className="font-caption-sm text-caption-sm text-secondary">
              Showing {startIdx}-{endIdx} of {totalRows.toLocaleString('en-KE')} listings{countyLabel}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-label-metric text-label-metric text-secondary">Sorted by:</span>
            <button
              type="button"
              onClick={onSortToggle}
              className="h-9 px-3.5 rounded-full bg-surface-container-low text-xs font-semibold text-on-surface inline-flex items-center gap-1.5 hover:bg-surface-container transition-colors"
            >
              {sortAsc ? 'Best Value first' : 'Worst Value first'}
              <span className="material-symbols-outlined text-[16px]">arrow_drop_down</span>
            </button>
          </div>
        </div>

        {/* Deals table — uses negative margins to break out of the card's
            p-space-md padding so the table gets the full card width.
            (Per design: `overflow-x-auto -mx-space-md px-space-md`) */}
        <div className="overflow-x-auto -mx-space-md px-space-md">
          <table className="w-full text-left border-collapse table-fixed">
            <colgroup>
              <col className="w-auto" />
              <col className="w-[70px]" />
              <col className="w-[110px]" />
              <col className="w-[130px]" />
              <col className="w-[120px]" />
              <col className="w-[60px]" />
            </colgroup>
            <thead>
              <tr className="bg-surface-container-low/60 text-secondary font-label-uppercase text-label-uppercase">
                <th className="py-3 px-3.5 rounded-l-DEFAULT">Listing &amp; Location</th>
                <th className="py-3 px-3">Size</th>
                <th className="py-3 px-3">Asking / ac</th>
                <th className="py-3 px-3">Model estimate</th>
                <th className="py-3 px-3">Verdict</th>
                <th className="py-3 px-3 rounded-r-DEFAULT text-center" title="Quality / Anomaly flag">Notice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {rows.map((r) => {
                const isSel = selectedListingNo != null && r.listing_no === selectedListingNo;
                const title = r.title || r.location || r.county || r.listing_no || 'Untitled listing';
                const subtitle = [r.location, r.county].filter(Boolean).join(' · ');
                const pct = verdictPct(r);
                const total = r.price_ksh != null ? r.price_ksh : r.listed_price_per_acre_ksh * r.size_acres;
                const pctSign = pct >= 0 ? '+' : '';
                return (
                  <tr
                    key={r.listing_no ?? `${r.title}-${r.size_acres}`}
                    onClick={() => onRowClick(r)}
                    className={`cursor-pointer transition-colors group ${
                      isSel
                        ? 'bg-primary-fixed/20 hover:bg-primary-fixed/30'
                        : 'hover:bg-surface-container-low'
                    }`}
                  >
                    {/* Listing & Location — with leading orange dot on selected row */}
                    <td className="py-3.5 px-3.5">
                      <div className="flex items-start gap-2.5">
                        {isSel && (
                          <span className="w-2 h-2 rounded-full bg-primary-container mt-1.5 shrink-0 ring-4 ring-primary-fixed/40" />
                        )}
                        {!isSel && <span className="w-2 shrink-0" />}
                        <div className="min-w-0">
                          <div className={`font-body-medium text-body-medium truncate group-hover:text-primary transition-colors ${
                            isSel ? 'text-on-surface font-semibold' : 'text-on-surface font-medium'
                          }`}>
                            {title}
                          </div>
                          {subtitle && (
                            <div className="font-caption-sm text-caption-sm text-secondary flex items-center gap-1">
                              <span className="material-symbols-outlined text-[13px]">location_on</span>
                              {subtitle}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* Size */}
                    <td className="py-3.5 px-3 font-body-regular text-body-regular text-on-surface whitespace-nowrap">
                      {r.size_acres.toLocaleString('en-KE')} ac
                    </td>
                    {/* Asking / ac — with Total price subtitle */}
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <div className="font-body-medium text-body-medium text-on-surface font-medium">
                        {formatCompactMoney(r.listed_price_per_acre_ksh)}
                      </div>
                      <div className="font-caption-sm text-caption-sm text-secondary">
                        Total {formatCompactMoney(total)}
                      </div>
                    </td>
                    {/* Model estimate — with 80% range subtitle */}
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <div className="font-body-medium text-body-medium text-on-surface">
                        {formatCompactMoney(r.predicted_price_per_acre_ksh)}
                      </div>
                      <div className="font-caption-sm text-caption-sm text-secondary">
                        80%: {formatCompactMoney(r.low_price_per_acre_ksh)} - {formatCompactMoney(r.high_price_per_acre_ksh)}
                      </div>
                    </td>
                    {/* Verdict — chip with percentage */}
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${verdictChipClass(r.verdict)}`}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: verdictDotColor(r.verdict) }}
                        />
                        {pctSign}{pct}% {verdictLabel(r.verdict)}
                      </span>
                    </td>
                    {/* Notice — warning icon for data_quality_flag */}
                    <td className="py-3.5 px-3 text-center">
                      {r.data_quality_flag ? (
                        <span
                          className="material-symbols-outlined text-[17px] text-[#E3A008]"
                          title="Asking price significantly departs from adjacent listings; inspect details"
                        >
                          warning
                        </span>
                      ) : (
                        <span className="text-xs text-secondary/40 font-mono">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </ValuationCard>
  );
}
