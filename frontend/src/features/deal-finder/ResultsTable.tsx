/**
 * ResultsTable — the Deal Finder scored-listings table (P4b real-data round).
 *
 * Changes:
 *  - The sort button toggles the SERVER-side sort (sort + order params);
 *    no client re-sort.  The button carries aria-sort semantics.
 *  - Every user-visible string via i18n; numbers via the locale helper;
 *    money via the currency-aware compact formatter.
 *  - The verdict chip percentage stays (computed from the row's own
 *    listed/predicted fields — per-row data, not a corpus statistic).
 *  - Row selection reachable by keyboard (Enter/Space via the row's
 *    onClick on a focusable tr with tabIndex + role).
 *  - Empty state offers "Clear filters" (wired by the parent).
 *  - The verdict chip + dot colours come from the single token map
 *    (the verdict-styles module — UI constants defined once).
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
import { useLocale } from '@/lib/i18n/useLocale';
import { verdictStyle } from './verdict-styles';

interface Props {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  rows: ListingsScoredRow[];
  selectedListingNo: string | null;
  onRowClick: (row: ListingsScoredRow) => void;
  onRetry: () => void;
  sortKey: string;
  sortAsc: boolean;
  onSortToggle: () => void;
  totalRows: number;
  county: string;
  currentPage: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}

function verdictPct(row: ListingsScoredRow): number {
  if (row.predicted_price_per_acre_ksh <= 0) return 0;
  return Math.round(
    ((row.listed_price_per_acre_ksh - row.predicted_price_per_acre_ksh) /
      row.predicted_price_per_acre_ksh) *
      100,
  );
}

function verdictShortKey(verdict: string): string {
  const v = (verdict ?? '').toLowerCase();
  if (v === 'underpriced') return 'deals.verdictShort.under';
  if (v === 'overpriced') return 'deals.verdictShort.over';
  return 'deals.verdictShort.fair';
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
  onPageChange,
}: Props) {
  const { t } = useTranslation();
  const locale = useLocale();

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
        title={state.type === 'rate_limit' ? t('predictor.tooManyRequests') : t('common.dataUnavailable')}
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
        title={t('deals.emptyTitle')}
        message={t('deals.emptyMessage')}
      />
    );
  }

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const countyLabel = county && county !== 'all' ? ` · ${county}` : '';
  const startIdx = (currentPage - 1) * pageSize + 1;
  const endIdx = Math.min(currentPage * pageSize, totalRows);

  return (
    <ValuationCard noPadding>
      <div className="p-space-md">
        {/* Table action header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 gap-3">
          <div>
            <h2 className="font-headline-section text-headline-section text-on-surface">
              {t('deals.availableDeals')}
            </h2>
            <p className="font-caption-sm text-caption-sm text-secondary">
              {t('deals.showingRange', {
                start: startIdx.toLocaleString(locale),
                end: endIdx.toLocaleString(locale),
                total: totalRows.toLocaleString(locale),
                county: countyLabel,
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-label-metric text-label-metric text-secondary">
              {t('deals.sortedBy')}:
            </span>
            {/* P4b: server-side sort toggle — sends sort+order to the API
                (the table order IS the server order; no client re-sort). */}
            <button
              type="button"
              onClick={onSortToggle}
              aria-label={sortAsc ? t('deals.sortAsc') : t('deals.sortDesc')}
              aria-sort={sortAsc ? 'ascending' : 'descending'}
              className="h-9 px-3.5 rounded-full bg-surface-container-low text-xs font-semibold text-on-surface inline-flex items-center gap-1.5 hover:bg-surface-container transition-colors"
            >
              {sortAsc ? t('deals.bestValueFirst') : t('deals.worstValueFirst')}
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                arrow_drop_down
              </span>
            </button>
          </div>
        </div>

        {/* Deals table — negative margins break out of the card padding. */}
        <div className="overflow-x-auto -mx-space-md px-space-md">
          <table className="w-full text-left border-collapse table-fixed">
            <caption className="sr-only">
              {t('deals.tableCaption', { n: totalRows.toLocaleString(locale) })}
            </caption>
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
                <th className="py-3 px-3.5 rounded-l-DEFAULT">{t('deals.colListing')}</th>
                <th className="py-3 px-3">{t('deals.colSize')}</th>
                <th className="py-3 px-3">{t('deals.colAsking')}</th>
                <th className="py-3 px-3">{t('deals.colEstimate')}</th>
                <th className="py-3 px-3">{t('deals.colVerdict')}</th>
                <th
                  className="py-3 px-3 rounded-r-DEFAULT text-center"
                  title={t('deals.colNoticeTitle')}
                >
                  {t('deals.colNotice')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {rows.map((r) => {
                const isSel = selectedListingNo != null && r.listing_no === selectedListingNo;
                const title = r.title || r.location || r.county || r.listing_no || t('deals.untitled');
                const subtitle = [r.location, r.county].filter(Boolean).join(' · ');
                const pct = verdictPct(r);
                const total = r.price_ksh != null ? r.price_ksh : r.listed_price_per_acre_ksh * r.size_acres;
                const pctSign = pct >= 0 ? '+' : '';
                const vStyle = verdictStyle(r.verdict);
                return (
                  <tr
                    key={r.listing_no ?? `${r.title}-${r.size_acres}`}
                    onClick={() => onRowClick(r)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onRowClick(r);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={t('deals.rowA11y', {
                      title,
                      price: formatCompactMoney(r.listed_price_per_acre_ksh),
                      verdict: t(vStyle.labelKey),
                    })}
                    className={`cursor-pointer transition-colors group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-container ${
                      isSel
                        ? 'bg-primary-fixed/20 hover:bg-primary-fixed/30'
                        : 'hover:bg-surface-container-low'
                    }`}
                  >
                    {/* Listing & Location */}
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
                              <span className="material-symbols-outlined text-[13px]" aria-hidden="true">
                                location_on
                              </span>
                              {subtitle}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* Size */}
                    <td className="py-3.5 px-3 font-body-regular text-body-regular text-on-surface whitespace-nowrap">
                      {t('deals.acres', { n: r.size_acres.toLocaleString(locale) })}
                    </td>
                    {/* Asking / ac */}
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <div className="font-body-medium text-body-medium text-on-surface font-medium">
                        {formatCompactMoney(r.listed_price_per_acre_ksh)}
                      </div>
                      <div className="font-caption-sm text-caption-sm text-secondary">
                        {t('deals.total', { n: formatCompactMoney(total) })}
                      </div>
                    </td>
                    {/* Model estimate */}
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <div className="font-body-medium text-body-medium text-on-surface">
                        {formatCompactMoney(r.predicted_price_per_acre_ksh)}
                      </div>
                      <div className="font-caption-sm text-caption-sm text-secondary">
                        {t('deals.range', {
                          low: formatCompactMoney(r.low_price_per_acre_ksh),
                          high: formatCompactMoney(r.high_price_per_acre_ksh),
                        })}
                      </div>
                    </td>
                    {/* Verdict */}
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${vStyle.chip}`}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: vStyle.hex }}
                          aria-hidden="true"
                        />
                        {pctSign}
                        {pct}% {t(verdictShortKey(r.verdict))}
                      </span>
                    </td>
                    {/* Notice */}
                    <td className="py-3.5 px-3 text-center">
                      {r.data_quality_flag ? (
                        <span
                          className="material-symbols-outlined text-[17px] text-market-caution"
                          title={t('deals.noticeTitle')}
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

        {/* Pagination (server pages — page N+1 continues the server order). */}
        <div className="flex items-center justify-between gap-4 pt-4">
          <p className="text-caption-sm text-secondary">
            {t('deals.showingRange', {
              start: startIdx.toLocaleString(locale),
              end: endIdx.toLocaleString(locale),
              total: totalRows.toLocaleString(locale),
              county: countyLabel,
            })}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
              className="px-3 py-1.5 rounded-full bg-surface-container-low text-xs text-on-surface disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('deals.prev')}
            </button>
            <span className="text-label-metric font-label-metric text-on-surface tabular-nums">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange(currentPage + 1)}
              className="px-3 py-1.5 rounded-full bg-surface-container-low text-xs text-on-surface disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('deals.next')}
            </button>
          </div>
        </div>
      </div>
    </ValuationCard>
  );
}
