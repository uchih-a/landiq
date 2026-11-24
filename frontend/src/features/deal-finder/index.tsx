/**
 * Deal Finder — the F6 screen (P4b real-data round).
 *
 * Changes:
 *  - SORT IS SERVER-SIDE: the Best/Worst toggle sends `sort` + `order`
 *    to /listings/scored and the CLIENT-side re-sort is deleted (page 2
 *    is now the next-best set; desc is the exact reverse of asc).
 *  - URL state: ?county=&type=&verdict=&flagged=&amenity=&radius=&sort=&order=&page=&size=
 *    read on mount (invalid values ignored) and written on change.
 *  - Filters render from `useListingsOptions()` (canonical types, exact
 *    counties, data-derived verdict rules, amenity/radius lists with
 *    availability gating, page sizes, sort keys).
 *  - Export uses the streaming /listings/scored/export.csv endpoint
 *    (blob download; in-page notice on truncation headers — no
 *    window.alert, no client page-walking, no typed cap).
 *  - DealMap draws REAL nearby listings from
 *    /listings/{listingNo}/nearby.
 *  - Changing a filter clamps page > total_pages to 1 and clears the
 *    selected row when it's no longer in the result set.
 *  - All strings via i18n; numbers via the locale helper; money via the
 *    currency-aware formatters.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { PillButton } from '@/components';
import { buildListingsExportUrl, useListingsOptions, useListingsScored } from '@/lib/api/hooks';
import type { ListingsScoredFilters, ListingsScoredRow } from '@/lib/api/types';

import { CorpusSummary } from './CorpusSummary';
import { DealMap } from './DealMap';
import { FiltersBar } from './FiltersBar';
import { ListingDetailPanel } from './ListingDetailPanel';
import { ResultsTable } from './ResultsTable';
import { useLocale } from '@/lib/i18n/useLocale';

const ALL_VALUE = 'all';

export default function DealFinder() {
  const { t } = useTranslation();
  const locale = useLocale();
  const [searchParams, setSearchParams] = useSearchParams();

  // ---- Options: every list + limit the filters render. ----
  const optionsQ = useListingsOptions();
  const options = optionsQ.data;
  const optionsFailed = optionsQ.isError && !options;

  // ---- Read the URL state on mount (invalid values ignored, no crash). ----
  const [county, setCounty] = useState(() => {
    const v = searchParams.get('county');
    return v && v.trim() !== '' ? v : ALL_VALUE;
  });  
  const [propType, setPropType] = useState(() => {
    const v = searchParams.get('type');
    return v && v.trim() !== '' ? v : ALL_VALUE;
  });  
  const [verdict, setVerdict] = useState<string | null>(() => {
    const v = searchParams.get('verdict');
    return v === 'underpriced' || v === 'fair' || v === 'overpriced' ? v : null;
  });  
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(() => searchParams.get('flagged') === 'true');
  // Part B: the "Hide possible data errors" toggle now also hides suspect
  // rows (listed_over_predicted outside [0.05, 20.0] or non-finite size).
  // The default Deal Finder view HIDES them so implausible listings never
  // surface as deals on first load.
  const [hideDataErrors, setHideDataErrors] = useState(true);
  const [nearAmenity, setNearAmenity] = useState<string | null>(() => {
    const v = searchParams.get('amenity');
    return v === 'school' || v === 'hospital' || v === 'tarmac_road' ? v : null;
  });  
  const [amenityRadius, setAmenityRadius] = useState<number>(() => {
    const v = Number(searchParams.get('radius'));
    return Number.isFinite(v) && v > 0 ? v : 3;
  });  
  const [sortKey, setSortKey] = useState<string>(() => {
    const v = searchParams.get('sort');
    return v && v.trim() !== '' ? v : 'listed_over_predicted';
  });  
  const [sortAsc, setSortAsc] = useState(() => searchParams.get('order') !== 'desc');
  const [page, setPage] = useState(() => {
    const v = Number(searchParams.get('page'));
    return Number.isFinite(v) && v >= 1 ? Math.floor(v) : 1;
  });  
  const [pageSize, setPageSize] = useState(() => {
    const v = Number(searchParams.get('size'));
    return Number.isFinite(v) && v >= 1 ? Math.floor(v) : 20;
  });  
  const [selectedListing, setSelectedListing] = useState<ListingsScoredRow | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // ---- Default page size from the options when loaded (first time only). ----
  const [pageSizeSeeded, setPageSizeSeeded] = useState(pageSize !== 20);
  useEffect(() => {
    if (options && !pageSizeSeeded && options.default_page_size !== pageSize) {
      setPageSize(options.default_page_size);
      setPageSizeSeeded(true);
    }
  }, [options, pageSizeSeeded, pageSize]);

  // ---- Sync URL state (replace). ----
  const syncUrl = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams);
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === '' || v === ALL_VALUE) params.delete(k);
        else params.set(k, v);
      }
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  // ---- Base filters shared by the verdict-count queries + the table. ----
  const baseFilters = useMemo(
    () => ({
      page: 1,
      page_size: 1, // Only total_rows is needed for the counts.
      county: county === ALL_VALUE ? undefined : county,
      prop_type: propType === ALL_VALUE ? undefined : propType,
      data_quality_flag: showFlaggedOnly ? true : hideDataErrors ? false : undefined,
      // Part B: the hide-data-errors toggle also hides suspect rows.
      is_suspect: hideDataErrors ? false : undefined,
      near_amenity: (nearAmenity as 'school' | 'hospital' | 'tarmac_road' | undefined) ?? undefined,
      radius_km: nearAmenity ? (amenityRadius as 1 | 3 | 5) : undefined,
      sort: sortKey as ListingsScoredFilters['sort'],
      order: (sortAsc ? 'asc' : 'desc') as 'asc' | 'desc',
    }),
    [county, propType, showFlaggedOnly, hideDataErrors, nearAmenity, amenityRadius, sortKey, sortAsc],
  );

  // ---- 3 parallel verdict-count queries for the corpus summary. ----
  const underpricedQ = useListingsScored({ ...baseFilters, verdict: 'underpriced' });
  const fairQ = useListingsScored({ ...baseFilters, verdict: 'fair' });
  const overpricedQ = useListingsScored({ ...baseFilters, verdict: 'overpriced' });

  const verdictCounts = useMemo(() => {
    const u = underpricedQ.data?.pagination.total_rows ?? 0;
    const f = fairQ.data?.pagination.total_rows ?? 0;
    const o = overpricedQ.data?.pagination.total_rows ?? 0;
    return { underpriced: u, fair: f, overpriced: o, total: u + f + o };
  }, [underpricedQ.data, fairQ.data, overpricedQ.data]);

  // ---- The table query: SERVER-side sort + order (no client re-sort). ----
  const filters: ListingsScoredFilters = useMemo(
    () => ({
      ...baseFilters,
      page,
      page_size: pageSize,
      verdict: (verdict ?? undefined) as ListingsScoredFilters['verdict'],
    }),
    [baseFilters, page, pageSize, verdict],
  );
  const listingsQ = useListingsScored(filters);

  // ---- Clamp page when it exceeds total_pages after a filter change,
  //      and clear the selected row when it's no longer in the result. ----
  const totalRows = listingsQ.data?.pagination.total_rows ?? 0;
  const totalPages = Math.max(1, listingsQ.data?.pagination.total_pages ?? 1);
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);
  useEffect(() => {
    const rows = listingsQ.data?.listings ?? [];
    if (
      selectedListing?.listing_no != null &&
      !rows.some((r) => r.listing_no === selectedListing.listing_no)
    ) {
      setSelectedListing(null);
    }
  }, [listingsQ.data, selectedListing?.listing_no]);  

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
    setShowFlaggedOnly(false);
    setHideDataErrors(true); // Part B: default view hides suspect + flagged rows
    setSortKey('listed_over_predicted');
    setSortAsc(true);
    resetPage();
    syncUrl({
      county: null,
      type: null,
      verdict: null,
      amenity: null,
      radius: null,
      sort: null,
      order: null,
      page: null,
    });
  }

  // ---- Streaming export: blob download from the endpoint, truncation
  //      notice from the X-Export-* headers (no window.alert). ----
  async function handleExport() {
    if (isExporting) return;
    setIsExporting(true);
    setExportNotice(null);
    try {
      const url = buildListingsExportUrl(filters);
      const resp = await fetch(`/api/v1${url}`);
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        throw new Error(body?.error?.message ?? `Export failed (${resp.status}).`);
      }
      const truncated = resp.headers.get('X-Export-Truncated') === 'true';
      const total = resp.headers.get('X-Export-Total');
      const blob = await resp.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = url.includes('?')
        ? `listings-${new URLSearchParams(url.split('?')[1]).toString().slice(0, 40)}.csv`
        : 'listings.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      if (truncated && total) {
        setExportNotice(t('deals.exportTruncated', { n: total }));
      }
    } catch (err) {
      setExportNotice(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setIsExporting(false);
    }
  }

  const pagination = listingsQ.data?.pagination;
  const currentPage = pagination?.page ?? page;

  return (
    <div className="flex flex-col gap-space-xl p-margin max-w-[1400px] mx-auto">
      {/* ---- Header ---- */}
      <header className="flex flex-col gap-space-md pt-2">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-space-md">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary">
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                  local_offer
                </span>
              </span>
              <span className="font-label-uppercase text-label-uppercase text-primary uppercase tracking-widest font-semibold">
                {t('deals.eyebrow')}
              </span>
            </div>
            <h1 className="font-outfit text-headline-page-mobile md:text-headline-page text-on-surface tracking-tight font-light">
              {t('deals.title')}
            </h1>
            <p className="mt-1 text-body-regular text-secondary">{t('deals.subtitle')}</p>
          </div>
          <div className="flex items-center gap-3">
            <PillButton
              variant="secondary"
              leadingIcon={isExporting ? 'progress_activity' : 'file_download'}
              onClick={handleExport}
              disabled={isExporting}
              className="text-xs"
            >
              {isExporting
                ? t('deals.exporting')
                : t('deals.exportN', { n: verdictCounts.total.toLocaleString(locale) })}
            </PillButton>
          </div>
        </div>
        {exportNotice && (
          <p className="text-caption-sm text-market-caution" role="status">
            {exportNotice}
          </p>
        )}
      </header>

      {/* ---- Corpus summary card ---- */}
      <CorpusSummary counts={verdictCounts} county={county} />

      {/* ---- Filters ---- */}
      <FiltersBar
        options={options}
        optionsFailed={optionsFailed}
        onRetryOptions={() => optionsQ.refetch()}
        county={county}
        onCountyChange={(v) => {
          setCounty(v);
          resetPage();
          syncUrl({ county: v === ALL_VALUE ? null : v, page: null });
        }}
        propType={propType}
        onPropTypeChange={(v) => {
          setPropType(v);
          resetPage();
          syncUrl({ type: v === ALL_VALUE ? null : v, page: null });
        }}
        verdict={verdict}
        onVerdictChange={(v) => {
          setVerdict(v);
          resetPage();
          syncUrl({ verdict: v, page: null });
        }}
        pageSize={pageSize}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPageSizeSeeded(true);
          resetPage();
          syncUrl({ size: String(n), page: null });
        }}
        sortKey={sortKey}
        onSortKeyChange={(v) => {
          setSortKey(v);
          resetPage();
          syncUrl({ sort: v, page: null });
        }}
        sortAsc={sortAsc}
        onSortToggle={() => {
          setSortAsc((v) => !v);
          resetPage();
          syncUrl({ order: sortAsc ? 'desc' : 'asc', page: null });
        }}
        nearAmenity={nearAmenity}
        onNearAmenityChange={(v) => {
          setNearAmenity(v);
          resetPage();
          syncUrl({ amenity: v, radius: v ? String(amenityRadius) : null, page: null });
        }}
        amenityRadius={amenityRadius}
        onAmenityRadiusChange={(r) => {
          setAmenityRadius(r);
          resetPage();
          syncUrl({ radius: String(r), page: null });
        }}
        hideDataErrors={showFlaggedOnly ? true : hideDataErrors}
        onHideDataErrorsChange={(v) => {
          setShowFlaggedOnly(false);
          setHideDataErrors(v);
          resetPage();
          syncUrl({ flagged: null, page: null });
        }}
        onResetFilters={handleResetFilters}
      />

      {/* ---- Table + detail panel grid ---- */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-md items-start">
        <div className="xl:col-span-7 flex flex-col gap-space-md">
          <ResultsTable
            isLoading={listingsQ.isLoading}
            isError={listingsQ.isError}
            error={listingsQ.error}
            rows={listingsQ.data?.listings ?? []}
            selectedListingNo={selectedListing?.listing_no ?? null}
            onRowClick={handleRowClick}
            onRetry={() => listingsQ.refetch()}
            sortKey={sortKey}
            sortAsc={sortAsc}
            onSortToggle={() => {
              setSortAsc((v) => !v);
              resetPage();
              syncUrl({ order: sortAsc ? 'desc' : 'asc', page: null });
            }}
            totalRows={totalRows}
            county={county}
            currentPage={currentPage}
            pageSize={pageSize}
            onPageChange={(p) => {
              setPage(p);
              syncUrl({ page: String(p) });
            }}
          />
        </div>
        <div className="xl:col-span-5 flex flex-col gap-space-md">
          {selectedListing && (
            <>
              <DealMap selected={selectedListing} />
              <ListingDetailPanel
                listing={selectedListing}
                onClose={() => setSelectedListing(null)}
              />
            </>
          )}
        </div>
      </div>

      {/* ---- Footer ---- */}
      <footer className="text-center px-space-xs pt-space-xl pb-4">
        <p className="text-caption-sm text-secondary opacity-80 leading-relaxed">
          {t('deals.methodologyFooter')}
        </p>
        <p className="text-caption-sm text-secondary opacity-70 leading-relaxed mt-0.5">
          {t('deals.osmFooter')}
        </p>
      </footer>
    </div>
  );
}
