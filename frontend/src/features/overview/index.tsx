/**
 * Overview — the dashboard / landing screen for Kenya Land Valuation.
 *
 * Layout (from 01_overview/code.html):
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │ Overview          Ensemble Valuation Engine        [filters]    │
 *   │                                                       [Estimate] │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │  KPI 1   KPI 2   KPI 3   KPI 4   KPI 5                            │
 *   ├──────────────────────────────────┬───────────────────────────────┤
 *   │  Price by distance from Nairobi  │  Deal signals                 │
 *   │  (ScatterChart, log Y) — 8 cols  │  (stacked Bar) — 4 cols       │
 *   ├──────────────────────────────────┴───────────────────────────────┤
 *   │  Listings by county (HoneycombBadge tier viz) — 12 cols          │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Filter behaviour: the County and Property-type dropdowns feed the
 * `useListingsScored()` query (county + prop_type params), so the
 * scatter and deal-signals cards re-fetch and re-render together.
 * The KPI row and the county hex viz read the unfiltered
 * `useCountyRowCounts` / `useCountySummary` / `useModelMetrics` /
 * `useMeta` hooks (national aggregates) and are not affected by the
 * filter.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { PillButton } from '@/components/PillButton';
import { PillDropdown } from '@/components/PillDropdown';
import {
  useCountyRowCounts,
  useCountySummary,
  useListingsScored,
  useMeta,
  useModelMetrics,
} from '@/lib/api/hooks';
import type { ListingsScoredFilters } from '@/lib/api/types';

import { KpiRow } from './KpiRow';
import { PriceDistanceChart } from './PriceDistanceChart';
import { DealSignalsCard } from './DealSignalsCard';
import { CountyHexViz } from './CountyHexViz';
import { ALL_VALUE, PROP_TYPE_OPTIONS } from './overview-helpers';

/** Page-size for the scored-listings fetch — large enough to give the
 *  scatter chart a meaningful cloud of points without pulling the full
 *  table (the backend default page_size is 50, which would be too sparse
 *  for a scatter). */
const LISTINGS_PAGE_SIZE = 200;

export default function Overview() {
  const navigate = useNavigate();

  // ---- Filter state (lifted here so both chart cards share one fetch) ----
  const [county, setCounty] = useState<string>(ALL_VALUE);
  const [propType, setPropType] = useState<string>(ALL_VALUE);

  // ---- National-aggregate hooks (unfiltered) ----
  const rowCountsQ = useCountyRowCounts();
  const summaryQ = useCountySummary();
  const metricsQ = useModelMetrics();
  const metaQ = useMeta();

  // ---- Filtered scored-listings hook (drives both chart cards) ----
  const listingsFilters: ListingsScoredFilters = useMemo(
    () => ({
      page: 1,
      page_size: LISTINGS_PAGE_SIZE,
      county: county === ALL_VALUE ? undefined : county,
      prop_type: propType === ALL_VALUE ? undefined : propType,
    }),
    [county, propType],
  );
  const listingsQ = useListingsScored(listingsFilters);

  // ---- County dropdown options (built from row_counts so the picker
  //      only ever lists counties that actually have data) ----
  const countyOptions = useMemo(() => {
    const base = [
      { value: ALL_VALUE, label: 'All counties' },
      ...(rowCountsQ.data?.counties ?? [])
        .filter((c) => c.n_listings > 0)
        .sort((a, b) => a.county.localeCompare(b.county))
        .map((c) => ({ value: c.county, label: c.county })),
    ];
    return base;
  }, [rowCountsQ.data]);

  // ---- Filter label shown in the chart subtitles ----
  const filterLabel = useMemo(() => {
    const countyPart = county === ALL_VALUE ? 'All counties' : county;
    const propPart =
      propType === ALL_VALUE
        ? 'all types'
        : PROP_TYPE_OPTIONS.find((o) => o.value === propType)?.label ?? propType;
    return `${countyPart} · ${propPart}`;
  }, [county, propType]);

  const kpiLoading =
    rowCountsQ.isLoading || summaryQ.isLoading || metricsQ.isLoading || metaQ.isLoading;

  return (
    <div className="flex flex-col gap-space-xl p-margin max-w-[1400px] mx-auto">
      {/* ---- Top bar: title + subtitle, filters, CTA ---- */}
      <header className="flex flex-col gap-space-md pt-2">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-space-md">
          <div>
            <h1 className="font-outfit text-headline-page-mobile md:text-headline-page text-on-surface">
              Overview
            </h1>
            <p className="mt-2 text-body-regular text-on-surface-variant">
              Ensemble Valuation Engine — national land-price dashboard for Kenya
            </p>
          </div>
          <PillButton
            leadingIcon="calculate"
            onClick={() => navigate('/predictor')}
            aria-label="Estimate a price for a parcel"
          >
            Estimate a price
          </PillButton>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <PillDropdown
            label="Filter County"
            leadingIcon="location_on"
            options={countyOptions}
            value={county}
            onChange={setCounty}
          />
          <PillDropdown
            label="Filter Property type"
            leadingIcon="category"
            options={PROP_TYPE_OPTIONS}
            value={propType}
            onChange={setPropType}
          />
        </div>
      </header>

      {/* ---- KPI row (5 stats) ---- */}
      <KpiRow
        rowCounts={rowCountsQ.data}
        summary={summaryQ.data}
        metrics={metricsQ.data}
        meta={metaQ.data}
        isLoading={kpiLoading}
      />

      {/* ---- Charts grid: price-by-distance (8) + deal signals (4) ---- */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <PriceDistanceChart query={listingsQ} filterLabel={filterLabel} />
        <DealSignalsCard query={listingsQ} filterLabel={filterLabel} />
      </section>

      {/* ---- Listings by county honeycomb (full width) ---- */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <CountyHexViz
          rowCounts={rowCountsQ.data}
          isLoading={rowCountsQ.isLoading}
          isError={rowCountsQ.isError}
          onRetry={() => rowCountsQ.refetch()}
        />
      </section>
    </div>
  );
}
