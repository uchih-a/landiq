/**
 * Market Insights — the F5 screen (P3b real-data round).
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │ Market Insights            [Filter Property type]  [Deal Finder] │
 *   ├──────────────────────────────────────┬──────────────────────────┤
 *   │  MapLibre choropleth (8 cols)        │  County deep-dive (4)    │
 *   ├──────────────────────────────────────┴──────────────────────────┤
 *   │  Highest / lowest ranked counties (toggle + whisker/IQR bars)   │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │  Price vs distance scatter + server trend (full width)           │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Data (P3b):
 *  - `useCountySummary(propType)` → medians/IQR/counts + data-driven
 *    price bands + property-type options, all filtered by prop_type.
 *  - `useCountyBoundaries()` → GeoJSON choropleth (unchanged).
 *  - `useCountyDistanceProfile(county, propType)` → the scatter's
 *    whole-county sample + SERVER-side trend (replaces the old
 *    page-1-of-200 client-side sample, which was a biased page of a
 *    sorted list).
 *
 * Selection (county) + filter (prop type) live in the URL (?county=&type=):
 * read on mount, written on change (replace for county clicks), unknown
 * values ignored without crashing — so Overview's ?county= deep-link
 * works and the state survives reload.
 */
import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { EmptyState, PillButton, PillDropdown, ValuationCard } from '@/components';
import { useCountyBoundaries, useCountySummary } from '@/lib/api/hooks';
import type { CountySummaryRow } from '@/lib/api/types';
import { formatMoney } from '@/lib/currency/format';

import { CountyPriceGrid } from './CountyPriceGrid';
import { CountyRankList } from './CountyRankList';
import { PriceDistanceScatter } from './PriceDistanceScatter';
import { ALL_VALUE } from './helpers';
import { useLocale } from '@/lib/i18n/useLocale';

export default function MarketInsights() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // ---- URL state: ?county=&type= — read on mount (invalid values
  //      ignored, never crash), written on change (replace for county). ----
  const initialCounty = useMemo(() => {
    const v = searchParams.get('county');
    return v && v.trim() !== '' ? v : null;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const initialType = useMemo(() => {
    const v = searchParams.get('type');
    return v && v.trim() !== '' ? v : ALL_VALUE;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [selectedCounty, setSelectedCounty] = useState<string | null>(initialCounty);
  const [propType, setPropType] = useState<string>(initialType);

  const summaryQ = useCountySummary(propType === ALL_VALUE ? undefined : propType);
  const boundariesQ = useCountyBoundaries();

  // ---- URL writer: preserves the other param, replaces history. ----
  const syncUrl = useCallback(
    (next: { county?: string | null; type?: string }) => {
      const params = new URLSearchParams(searchParams);
      if (next.county !== undefined) {
        if (next.county) params.set('county', next.county);
        else params.delete('county');
      }
      if (next.type !== undefined) {
        if (next.type && next.type !== ALL_VALUE) params.set('type', next.type);
        else params.delete('type');
      }
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const onCountySelect = useCallback(
    (county: string) => {
      setSelectedCounty(county);
      syncUrl({ county });
    },
    [syncUrl],
  );

  const onPropTypeChange = useCallback(
    (v: string) => {
      setPropType(v);
      syncUrl({ type: v });
    },
    [syncUrl],
  );

  const selectedRow: CountySummaryRow | null = selectedCounty
    ? (summaryQ.data?.counties.find(
        (c) => c.county.toLowerCase() === selectedCounty.toLowerCase(),
      ) ?? null)
    : null;

  // ---- Property-type options from the response (data-driven; three
  //      canonical types).  If the options are unavailable (summary
  //      still loading / error), the dropdown shows a retry state and
  //      no fallback list. ----
  const propTypeOptions = useMemo(() => {
    const base = [{ value: ALL_VALUE, label: t('market.allPropertyTypes') }];
    const types = summaryQ.data?.property_types ?? [];
    if (types.length === 0 && (summaryQ.isError || summaryQ.isLoading)) {
      // Unavailable — the dropdown renders with just the "all" entry and
      // the card-level error/retry handles surfacing it.
      return base;
    }
    return [
      ...base,
      ...types.map((pt) => ({ value: pt.name, label: `${pt.name} (${pt.n})` })),
    ];
  }, [summaryQ.data, summaryQ.isLoading, summaryQ.isError, t]);

  // P3b: "See listings in Deal Finder" passes county + prop_type.
  function handleSeeInDealFinder() {
    const params = new URLSearchParams();
    if (selectedCounty) params.set('county', selectedCounty);
    if (propType !== ALL_VALUE) params.set('type', propType);
    const qs = params.toString();
    navigate(qs ? `/deal-finder?${qs}` : '/deal-finder');
  }

  // Honest empty state: the filter yields no counties.
  const noCounties =
    !summaryQ.isLoading &&
    !summaryQ.isError &&
    (summaryQ.data?.counties.length ?? 0) === 0;

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
              {t('market.subtitle')}
            </p>
          </div>
          <PillButton
            leadingIcon="local_offer"
            onClick={handleSeeInDealFinder}
            aria-label={t('market.seeInDealFinder')}
          >
            {t('market.seeInDealFinder')}
          </PillButton>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {summaryQ.isError ? (
            <button
              type="button"
              onClick={() => summaryQ.refetch()}
              className="text-caption-sm text-market-overvalued underline underline-offset-2"
            >
              {t('market.optionsLoadFailed')} — {t('common.retry')}
            </button>
          ) : (
            <PillDropdown
              label={t('market.filterPropertyType')}
              leadingIcon="category"
              options={propTypeOptions}
              value={propType}
              onChange={onPropTypeChange}
            />
          )}
          {summaryQ.data && summaryQ.data.unmapped_prop_type_rows != null && summaryQ.data.unmapped_prop_type_rows > 0 && (
            <span className="text-caption-sm text-secondary italic">
              {t('market.unmappedPropTypes', { n: summaryQ.data.unmapped_prop_type_rows })}
            </span>
          )}
          {summaryQ.data?.data_quality === 'min_county_n_missing' && (
            <span className="text-caption-sm text-secondary italic">
              {t('market.minCountyNMissing')}
            </span>
          )}
        </div>
      </header>

      {noCounties ? (
        <EmptyState
          icon="filter_alt_off"
          title={t('market.emptyFilter')}
          message={t('market.emptyFilterMessage')}
          actionLabel={t('market.clearFilter')}
          onAction={() => onPropTypeChange(ALL_VALUE)}
        />
      ) : (
        <>
          {/* ---- MapLibre choropleth + deep-dive panel ---- */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8">
              <CountyPriceGrid
                summaryQ={summaryQ}
                boundariesQ={boundariesQ}
                selectedCounty={selectedCounty}
                onSelectCounty={onCountySelect}
              />
            </div>
            <div className="lg:col-span-4">
              {selectedRow ? (
                <DeepDive row={selectedRow} />
              ) : (
                <EmptyState
                  icon="location_searching"
                  title={t('market.countyDeepDive')}
                  message={t('market.deepDiveHint')}
                />
              )}
            </div>
          </section>

          {/* ---- Ranked list (full width) ---- */}
          <CountyRankList
            summaryQ={summaryQ}
            selectedCounty={selectedCounty}
            onSelectCounty={onCountySelect}
          />

          {/* ---- Price vs distance scatter (full width) ---- */}
          <PriceDistanceScatter county={selectedCounty} propType={propType} />
        </>
      )}
    </div>
  );
}

/**
 * DeepDive — the right-hand panel that appears once a county is selected.
 * P3b: every value from the summary row for the CURRENT filter; the
 * "small sample" badge from n_below_min_county_n; numbers via the
 * locale-aware helper; all strings via i18n.
 */
function DeepDive({ row }: { row: CountySummaryRow }) {
  const { t } = useTranslation();
  const locale = useLocale();
  return (
    <ValuationCard>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-headline-section text-headline-section text-on-surface">
          {row.county}
        </h3>
        {row.n_below_min_county_n && (
          <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-secondary text-caption-sm font-caption-sm">
            {t('market.smallSample')}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-4">
        <div>
          <div className="text-label-uppercase font-label-uppercase text-secondary mb-1">
            {t('market.medianPerAcre')}
          </div>
          <div className="font-outfit text-display-kpi-mobile text-on-surface font-light tracking-tight">
            {row.median_price_per_acre_ksh != null ? formatMoney(row.median_price_per_acre_ksh) : '—'}
          </div>
        </div>
        <div>
          <div className="text-label-uppercase font-label-uppercase text-secondary mb-1">
            {t('market.interquartileRange')}
          </div>
          <div className="text-body-medium font-body-medium text-on-surface">
            {row.q1_price_per_acre_ksh != null && row.q3_price_per_acre_ksh != null
              ? `${formatMoney(row.q1_price_per_acre_ksh)} – ${formatMoney(row.q3_price_per_acre_ksh)}`
              : '—'}
          </div>
        </div>
        <div>
          <div className="text-label-uppercase font-label-uppercase text-secondary mb-1">
            {t('market.listingsAnalysed')}
          </div>
          <div className="text-body-medium font-body-medium text-on-surface">
            {row.n_listings.toLocaleString(locale)}
          </div>
        </div>
      </div>
    </ValuationCard>
  );
}
