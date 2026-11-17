/**
 * Market Insights — the F5 screen.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │ Market Insights            [Filter Property type]  [Deal Finder] │
 *   ├──────────────────────────────────────┬──────────────────────────┤
 *   │  MapLibre choropleth (8 cols)        │  County deep-dive (4)    │
 *   ├──────────────────────────────────────┴──────────────────────────┤
 *   │  Highest / lowest ranked counties (toggle + whisker/IQR bars)   │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │  Price vs distance scatter + trend line (full width)             │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Data:
 *  - `useCountySummary()`    → ranked list + deep-dive panel stats
 *  - `useCountyBoundaries()` → GeoJSON rendered as a MapLibre choropleth
 *    (F10 replaced the original F5 div-grid with real MapLibre tiles +
 *    GeoJSON fill layers — see CountyPriceGrid.tsx)
 *  - `useCountyListings(c, 1, 200)` → scatter plot for the picked county
 *
 * Selection state is lifted here so the map, rank list, deep-dive
 * panel, and scatter plot all react to one click.
 *
 * G3 fix: the "See listings in Deal Finder" button now passes the
 * selected county via URL query param (`?county=Nairobi`) so Deal Finder
 * pre-filters by it on arrival.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { EmptyState, PillButton, PillDropdown, ValuationCard } from '@/components';
import { useCountyBoundaries, useCountySummary } from '@/lib/api/hooks';
import type { CountySummaryRow } from '@/lib/api/types';
import { formatMoney } from '@/lib/currency/format';

import { CountyPriceGrid } from './CountyPriceGrid';
import { CountyRankList } from './CountyRankList';
import { PriceDistanceScatter } from './PriceDistanceScatter';
import { PROP_TYPE_OPTIONS } from './helpers';

export default function MarketInsights() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const summaryQ = useCountySummary();
  const boundariesQ = useCountyBoundaries();

  const [selectedCounty, setSelectedCounty] = useState<string | null>(null);
  // Property-type filter — placeholder, does not yet drive a query. The
  // state is captured so a future caller can wire it to the listings
  // fetch without touching the JSX. The backend's /counties/summary
  // endpoint does not currently support prop_type filtering.
  const [, setPropType] = useState<string>('all');

  const selectedRow: CountySummaryRow | null = selectedCounty
    ? (summaryQ.data?.counties.find(
        (c) => c.county.toLowerCase() === selectedCounty.toLowerCase(),
      ) ?? null)
    : null;

  // G3 fix: pass the selected county to Deal Finder via URL query param
  // so Deal Finder pre-filters by it on arrival.
  function handleSeeInDealFinder() {
    const params = new URLSearchParams();
    if (selectedCounty) params.set('county', selectedCounty);
    navigate(`/deal-finder?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-space-xl p-margin max-w-[1400px] mx-auto">
      {/* ---- Header ---- */}
      <header className="flex flex-col gap-space-md pt-2">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-space-md">
          <div>
            <h1 className="font-outfit text-headline-page-mobile md:text-headline-page text-on-surface">
              {t('market.title')}
            </h1>
            <p className="mt-2 text-body-regular text-on-surface-variant">
              County-level price bands, ranked medians, and the price-vs-distance shape of each market.
            </p>
          </div>
          <PillButton
            leadingIcon="local_offer"
            onClick={handleSeeInDealFinder}
            aria-label="See listings in Deal Finder"
          >
            {t('market.seeInDealFinder')}
          </PillButton>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <PillDropdown
            label="Filter Property type"
            leadingIcon="category"
            options={PROP_TYPE_OPTIONS}
            value="all"
            onChange={setPropType}
          />
        </div>
      </header>

      {/* ---- MapLibre choropleth + deep-dive panel ---- */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8">
          <CountyPriceGrid
            summaryQ={summaryQ}
            boundariesQ={boundariesQ}
            selectedCounty={selectedCounty}
            onSelectCounty={setSelectedCounty}
          />
        </div>
        <div className="lg:col-span-4">
          {selectedRow ? (
            <DeepDive row={selectedRow} />
          ) : (
            <EmptyState
              icon="location_searching"
              title={t('market.countyDeepDive')}
              message="Click a county tile above or a name in the ranked list to see its median, IQR, and listing count."
            />
          )}
        </div>
      </section>

      {/* ---- Ranked list (full width) ---- */}
      <CountyRankList
        summaryQ={summaryQ}
        selectedCounty={selectedCounty}
        onSelectCounty={setSelectedCounty}
      />

      {/* ---- Price vs distance scatter (full width) ---- */}
      <PriceDistanceScatter county={selectedCounty} />
    </div>
  );
}

/**
 * DeepDive — the right-hand panel that appears once a county is selected.
 * Renders the median, IQR (Q1–Q3), and listing count straight from the
 * summary row, plus a "small sample" badge when the row is flagged
 * `n_below_min_county_n`.
 */
function DeepDive({ row }: { row: CountySummaryRow }) {
  return (
    <ValuationCard>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-headline-section text-headline-section text-on-surface">
          {row.county}
        </h3>
        {row.n_below_min_county_n && (
          <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-secondary text-caption-sm font-caption-sm">
            Small sample
          </span>
        )}
      </div>
      <div className="flex flex-col gap-4">
        <div>
          <div className="text-label-uppercase font-label-uppercase text-secondary mb-1">
            Median price per acre
          </div>
          <div className="font-outfit text-display-kpi-mobile text-on-surface font-light tracking-tight">
            {formatMoney(row.median_price_per_acre_ksh)}
          </div>
        </div>
        <div>
          <div className="text-label-uppercase font-label-uppercase text-secondary mb-1">
            Interquartile range
          </div>
          <div className="text-body-medium font-body-medium text-on-surface">
            {formatMoney(row.q1_price_per_acre_ksh)} –{' '}
            {formatMoney(row.q3_price_per_acre_ksh)}
          </div>
        </div>
        <div>
          <div className="text-label-uppercase font-label-uppercase text-secondary mb-1">
            Listings analysed
          </div>
          <div className="text-body-medium font-body-medium text-on-surface">
            {row.n_listings.toLocaleString('en-KE')}
          </div>
        </div>
      </div>
    </ValuationCard>
  );
}
