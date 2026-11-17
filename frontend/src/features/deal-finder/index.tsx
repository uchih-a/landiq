/**
 * Deal Finder — the F6 screen.
 *
 * P4 fidelity pass: added corpus summary card (3-segment proportion bar
 * with real verdict counts via parallel API calls), header eyebrow label,
 * export button showing real filtered count, methodology note + footer
 * disclaimer.
 *
 * Layout (per 06_deal_finder/code.html):
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │ eyebrow: Market Arbitrage & Opportunity                          │
 *   │ Deal Finder                        [Saved Filters (n)] [Export N]│
 *   │ subtitle                            Deals                        │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │ Corpus summary: 3-segment bar + Under/Fair/Over tiles            │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │ Filters bar (County/Type/Verdict/Size/Amenity/Hide errors/Reset)│
 *   ├───────────────────────────────────────────────┬──────────────────┤
 *   │  Available Deals table (7 cols)               │  Detail panel    │
 *   │  with Notice column + selected row dot        │  (5 cols)        │
 *   ├───────────────────────────────────────────────┴──────────────────┤
 *   │  Pagination: Showing X-Y of N deals                              │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │  Methodology note + footer disclaimer                             │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Filter state feeds `useListingsScored()`. Three parallel
 * `useListingsScored` calls (one per verdict, page_size=1) fetch the
 * total_rows for each verdict bucket so the corpus summary card shows
 * REAL whole-corpus counts, not just the current page.
 *
 * CSV export walks every page server-side (page_size=200) up to a
 * 2000-row hard cap — see `csv-export.ts`'s `exportAllListingsCsv`.
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { PillButton } from '@/components';
import { apiClient } from '@/lib/api/client';
import { useCountyRowCounts, useListingsScored } from '@/lib/api/hooks';
import type {
  AmenityRadiusKm,
  ListingsScoredFilters,
  ListingsScoredRow,
  NearAmenityFilter,
  VerdictFilter,
} from '@/lib/api/types';

import { CorpusSummary } from './CorpusSummary';
import { DealMap } from './DealMap';
import { FiltersBar } from './FiltersBar';
import { ListingDetailPanel } from './ListingDetailPanel';
import { ResultsTable } from './ResultsTable';
import { exportAllListingsCsv } from './csv-export';

const ALL_VALUE = 'all';

export default function DealFinder() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  // G3 fix: read the county pre-filter from URL query params on initial
  // load (set by Market Insights' "See listings in Deal Finder" button).
  const initialCounty = useMemo(() => {
    const param = searchParams.get('county');
    return param ?? ALL_VALUE;
  }, [searchParams]);

  const [county, setCounty] = useState<string>(initialCounty);
  const [propType, setPropType] = useState<string>(ALL_VALUE);
  const [verdict, setVerdict] = useState<VerdictFilter | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedListing, setSelectedListing] = useState<ListingsScoredRow | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  // P4: new filter state for amenity + data quality
  const [nearAmenity, setNearAmenity] = useState<NearAmenityFilter | null>(null);
  const [amenityRadius, setAmenityRadius] = useState<AmenityRadiusKm>(3);
  const [hideDataErrors, setHideDataErrors] = useState(false);

  const rowCountsQ = useCountyRowCounts();

  const countyOptions = useMemo(
    () => [
      { value: ALL_VALUE, label: t('common.allCounties') },
      ...(rowCountsQ.data?.counties ?? [])
        .filter((c) => c.n_listings > 0)
        .sort((a, b) => a.county.localeCompare(b.county))
        .map((c) => ({ value: c.county, label: c.county })),
    ],
    [rowCountsQ.data, t],
  );

  // Base filters shared by the main query and the 3 verdict-count queries.
  const baseFilters = useMemo(
    () => ({
      page: 1,
      page_size: 1, // We only need total_rows, not actual rows
      county: county === ALL_VALUE ? undefined : county,
      prop_type: propType === ALL_VALUE ? undefined : propType,
      data_quality_flag: hideDataErrors ? true : undefined,
      near_amenity: nearAmenity ?? undefined,
      radius_km: nearAmenity ? amenityRadius : undefined,
    }),
    [county, propType, hideDataErrors, nearAmenity, amenityRadius],
  );

  // P4: 3 parallel queries to get real verdict counts for the corpus summary.
  const underpricedQ = useListingsScored({ ...baseFilters, verdict: 'underpriced' });
  const fairQ = useListingsScored({ ...baseFilters, verdict: 'fair' });
  const overpricedQ = useListingsScored({ ...baseFilters, verdict: 'overpriced' });

  const verdictCounts = useMemo(() => {
    const u = underpricedQ.data?.pagination.total_rows ?? 0;
    const f = fairQ.data?.pagination.total_rows ?? 0;
    const o = overpricedQ.data?.pagination.total_rows ?? 0;
    return { underpriced: u, fair: f, overpriced: o, total: u + f + o };
  }, [underpricedQ.data, fairQ.data, overpricedQ.data]);

  const filters: ListingsScoredFilters = useMemo(
    () => ({
      ...baseFilters,
      page,
      page_size: pageSize,
      verdict: verdict ?? undefined,
      sort: 'listed_over_predicted',
    }),
    [baseFilters, page, pageSize, verdict],
  );

  const listingsQ = useListingsScored(filters);

  const sortedRows = useMemo(() => {
    const rows = listingsQ.data?.listings ?? [];
    const copy = [...rows];
    copy.sort((a, b) =>
      sortAsc
        ? a.listed_over_predicted - b.listed_over_predicted
        : b.listed_over_predicted - a.listed_over_predicted,
    );
    return copy;
  }, [listingsQ.data, sortAsc]);

  function resetPage() {
    setPage(1);
  }

  function handleRowClick(row: ListingsScoredRow) {
    setSelectedListing((prev) =>
      prev?.listing_no === row.listing_no && prev.listing_no != null ? null : row,
    );
  }

  function handleResetFilters() {
    setCounty(ALL_VALUE);
    setPropType(ALL_VALUE);
    setVerdict(null);
    setNearAmenity(null);
    setAmenityRadius(3);
    setHideDataErrors(false);
    resetPage();
  }

  async function handleExport() {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const { capped, totalExported, totalAvailable } = await exportAllListingsCsv(
        filters,
        apiClient,
      );
      if (capped) {
        window.alert(
          `Export capped at ${totalExported} rows (${totalAvailable.toLocaleString(
            'en-KE',
          )} total match the current filters).`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed.';
      window.alert(message);
    } finally {
      setIsExporting(false);
    }
  }

  const pagination = listingsQ.data?.pagination;
  const currentPage = pagination?.page ?? page;
  const totalPages = Math.max(1, pagination?.total_pages ?? 1);
  const totalRows = pagination?.total_rows ?? 0;
  const exportCount = verdictCounts.total;

  return (
    <div className="flex flex-col gap-space-xl p-margin max-w-[1400px] mx-auto">
      {/* ---- Header ---- */}
      <header className="flex flex-col gap-space-md pt-2">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-space-md">
          <div>
            {/* P4: eyebrow label per design */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary">
                <span className="material-symbols-outlined text-[16px]">local_offer</span>
              </span>
              <span className="font-label-uppercase text-label-uppercase text-primary uppercase tracking-widest font-semibold">
                Market Arbitrage &amp; Opportunity
              </span>
            </div>
            <h1 className="font-outfit text-headline-page-mobile md:text-headline-page text-on-surface tracking-tight font-light">
              {t('deals.title')}
            </h1>
            <p className="mt-1 text-body-regular text-secondary">
              See whether each asking price looks low, fair or high compared with the model estimate.
            </p>
          </div>
          {/* P4: right-hand actions per design */}
          <div className="flex items-center gap-3">
            <PillButton
              variant="secondary"
              leadingIcon="tune"
              onClick={() => {/* Saved filters — not yet implemented */}}
              className="text-xs"
            >
              Saved Filters
            </PillButton>
            <PillButton
              variant="secondary"
              leadingIcon={isExporting ? 'progress_activity' : 'file_download'}
              onClick={handleExport}
              disabled={isExporting}
              className="text-xs"
            >
              {isExporting ? 'Exporting...' : `Export ${exportCount.toLocaleString('en-KE')} Deals`}
            </PillButton>
          </div>
        </div>
      </header>

      {/* ---- Corpus summary card ---- */}
      <CorpusSummary
        counts={verdictCounts}
        county={county}
      />

      {/* ---- Filters ---- */}
      <FiltersBar
        countyOptions={countyOptions}
        county={county}
        onCountyChange={(v) => { setCounty(v); resetPage(); }}
        propType={propType}
        onPropTypeChange={(v) => { setPropType(v); resetPage(); }}
        verdict={verdict}
        onVerdictChange={(v) => { setVerdict(v); resetPage(); }}
        pageSize={pageSize}
        onPageSizeChange={(n) => { setPageSize(n); resetPage(); }}
        sortAsc={sortAsc}
        onSortToggle={() => setSortAsc((v) => !v)}
        nearAmenity={nearAmenity}
        onNearAmenityChange={(v) => { setNearAmenity(v); resetPage(); }}
        amenityRadius={amenityRadius}
        onAmenityRadiusChange={(r) => { setAmenityRadius(r); resetPage(); }}
        hideDataErrors={hideDataErrors}
        onHideDataErrorsChange={(v) => { setHideDataErrors(v); resetPage(); }}
        onResetFilters={handleResetFilters}
        onExport={handleExport}
        isExporting={isExporting}
      />

      {/* ---- Table + detail panel grid ---- */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-md items-start">
        <div className="xl:col-span-7 flex flex-col gap-space-md">
          <ResultsTable
            isLoading={listingsQ.isLoading}
            isError={listingsQ.isError}
            error={listingsQ.error}
            rows={sortedRows}
            selectedListingNo={selectedListing?.listing_no ?? null}
            onRowClick={handleRowClick}
            onRetry={() => listingsQ.refetch()}
            sortAsc={sortAsc}
            onSortToggle={() => setSortAsc((v) => !v)}
            totalRows={totalRows}
            county={county}
            currentPage={currentPage}
            pageSize={pageSize}
          />
        </div>
        <div className="xl:col-span-5 flex flex-col gap-space-md">
          {selectedListing &&
            selectedListing.latitude != null &&
            selectedListing.longitude != null && (
              <DealMap selected={selectedListing} rows={sortedRows} />
            )}
          {selectedListing && (
            <ListingDetailPanel
              listing={selectedListing}
              onClose={() => setSelectedListing(null)}
            />
          )}
        </div>
      </div>

      {/* ---- Pagination ---- */}
      <Pagination
        page={currentPage}
        totalPages={totalPages}
        totalRows={totalRows}
        pageSize={pageSize}
        verdict={verdict}
        onPageChange={setPage}
      />

      {/* ---- Methodology note + footer ---- */}
      <footer className="text-center px-space-xs pt-space-xl pb-4">
        <p className="text-caption-sm text-secondary opacity-80 leading-relaxed">
          Statistical estimates, not official valuations. Verdicts use the model's 80% conformal
          interval: listings below the lower bound are "underpriced", above the upper bound are
          "overpriced", within the range are "fair".
        </p>
        <p className="text-caption-sm text-secondary opacity-70 leading-relaxed mt-0.5">
          Map data © OpenStreetMap contributors. Ensemble model v1.
        </p>
      </footer>
    </div>
  );
}

interface PaginationProps {
  page: number;
  totalPages: number;
  totalRows: number;
  pageSize: number;
  verdict: VerdictFilter | null;
  onPageChange: (p: number) => void;
}

function Pagination({ page, totalPages, totalRows, pageSize, verdict, onPageChange }: PaginationProps) {
  const canPrev = page > 1;
  const canNext = page < totalPages;
  const startIdx = totalRows > 0 ? (page - 1) * pageSize + 1 : 0;
  const endIdx = Math.min(page * pageSize, totalRows);
  const verdictLabel = verdict ? ` ${verdict} deals` : ' deals';

  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-caption-sm text-secondary">
        Showing {startIdx}-{endIdx} of {totalRows.toLocaleString('en-KE')}{verdictLabel}
      </p>
      <div className="flex items-center gap-2">
        <PillButton
          variant="secondary"
          leadingIcon="arrow_back"
          disabled={!canPrev}
          onClick={() => onPageChange(page - 1)}
        >
          Prev
        </PillButton>
        <span className="text-label-metric font-label-metric text-on-surface tabular-nums">
          {page} / {totalPages}
        </span>
        <PillButton
          variant="secondary"
          trailingIcon="arrow_forward"
          disabled={!canNext}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </PillButton>
      </div>
    </div>
  );
}
