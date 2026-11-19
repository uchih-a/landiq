/**
 * Overview — the dashboard / landing screen for Kenya Land Valuation.
 *
 * O2 build round: every number on the page comes from
 * `useOverviewSummary(filters)` (the new /overview/summary endpoint),
 * with a few national-level fields coming from /meta, /model/metrics,
 * and /health.  Client-side verdict-counting / median-of-sample /
 * OLS-trend code has been removed — the endpoint owns those.
 *
 * Layout (web — 01_overview/code.html):
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │ Overview · Ensemble Valuation Engine    [County] [Type] [Estimate]│
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │  KPI 1   KPI 2   KPI 3   KPI 4   KPI 5                            │
 *   ├──────────────────────────────────┬───────────────────────────────┤
 *   │  Price by distance (8 cols)      │  Deal signals (4 cols)        │
 *   ├──────────────┬───────────────────┴───────────────┬───────────────┤
 *   │  Listings by │  Price by property type           │  Price by     │
 *   │  county (4)  │  (4 cols)                         │  size band (4)│
 *   └──────────────┴───────────────────────────────────┴───────────────┘
 *   │  Disclaimer footer                                               │
 *
 * Mobile layout (m01_overview):
 *   - Hero KPI card (national median) + 2x2 compact tiles grid
 *   - "Filters (n)" button + removable chips
 *   - Stacked cards (price-by-distance, deal signals, listings-by-county,
 *     price-by-property-type, price-by-size-band)
 *   - "Live Feed" badge next to the mobile title (green pulse when
 *     /health is `ok`, amber when degraded)
 *   - Disclaimer footer
 */
import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { PillButton } from '@/components/PillButton';
import { PillDropdown } from '@/components/PillDropdown';
import {
  useOverviewSummary,
  useCountyRowCounts,
  useHealth,
  useMeta,
  useModelMetrics,
} from '@/lib/api/hooks';

import { CountyHexViz } from './CountyHexViz';
import { DealSignalsCard } from './DealSignalsCard';
import { KpiRow } from './KpiRow';
import { PriceByPropertyType } from './PriceByPropertyType';
import { PriceBySizeBand } from './PriceBySizeBand';
import { PriceDistanceChart } from './PriceDistanceChart';
import {
  ALL_VALUE,
  buildOverviewQueryFilters,
  overviewFiltersToParams,
} from './overview-helpers';
import { getStoredDefaultCounty } from '@/lib/county-preference';
import { FiltersSheet } from './FiltersSheet';

export default function Overview() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // ---- Filter state — initialised from the URL, falling back to the
  //      Settings-persisted default county when the URL has none. ----
  const initialFilters = useMemo(() => {
    const fromUrl = buildOverviewQueryFilters(searchParams);
    // If the URL has no county, try the Settings default.
    if (!fromUrl.county) {
      const def = getStoredDefaultCounty();
      if (def) fromUrl.county = def;
    }
    return fromUrl;
  }, [searchParams]);

  const [county, setCounty] = useState<string>(initialFilters.county ?? ALL_VALUE);
  const [propType, setPropType] = useState<string>(initialFilters.prop_type ?? ALL_VALUE);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // ---- Sync filter state back to the URL whenever it changes ----
  const syncUrl = useCallback(
    (next: { county: string; propType: string }) => {
      const params = overviewFiltersToParams({
        county: next.county,
        prop_type: next.propType,
      });
      // Preserve any other params we don't own.
      const incoming = new URLSearchParams(searchParams);
      // Remove our keys from incoming so we don't double-set.
      incoming.delete('county');
      incoming.delete('type');
      // Merge: incoming first, then ours.
      const merged = new URLSearchParams();
      for (const [k, v] of incoming.entries()) merged.set(k, v);
      for (const [k, v] of params.entries()) merged.set(k, v);
      setSearchParams(merged, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const onCountyChange = useCallback(
    (next: string) => {
      setCounty(next);
      syncUrl({ county: next, propType });
    },
    [propType, syncUrl],
  );
  const onPropTypeChange = useCallback(
    (next: string) => {
      setPropType(next);
      syncUrl({ county, propType: next });
    },
    [county, syncUrl],
  );

  // ---- The single backend hook that owns every corpus-wide stat ----
  const overviewQ = useOverviewSummary({
    county: county === ALL_VALUE ? undefined : county,
    prop_type: propType === ALL_VALUE ? undefined : propType,
  });

  // ---- National hooks for the few fields the overview response doesn't
  //      duplicate (the model version + data date from /meta, the
  //      MedAPE + interval coverage from /model/metrics, and the live
  //      health status for the mobile "Live Feed" badge). ----
  const metaQ = useMeta();
  const metricsQ = useModelMetrics();

  // ---- County dropdown options — from the response's filters.property_types
  //      for the prop_type selector (so it always reflects the backend's
  //      canonical list with per-type row counts), and from
  //      useCountyRowCounts for the county selector (so the picker only
  //      lists counties with data). ----
  const rowCountsQ = useCountyRowCounts();
  const healthQ = useHealth();

  const countyOptions = useMemo(() => {
    return [
      { value: ALL_VALUE, label: t('common.allCounties') },
      ...(rowCountsQ.data?.counties ?? [])
        .filter((c) => c.n_listings > 0)
        .sort((a, b) => a.county.localeCompare(b.county))
        .map((c) => ({ value: c.county, label: c.county })),
    ];
  }, [rowCountsQ.data, t]);

  const propTypeOptions = useMemo(() => {
    const canonical = overviewQ.data?.property_types_canonical ?? ['Land', 'Farm', 'Commercial'];
    const perType = overviewQ.data?.filters.property_types ?? [];
    return [
      { value: ALL_VALUE, label: t('overview.allPropertyTypes') },
      ...canonical.map((name) => {
        const count = perType.find((p) => p.name === name)?.n ?? 0;
        return { value: name, label: `${name} (${count})` };
      }),
    ];
  }, [overviewQ.data, t]);

  const activeFilterCount = (county !== ALL_VALUE ? 1 : 0) + (propType !== ALL_VALUE ? 1 : 0);

  return (
    <div className="flex flex-col gap-space-xl p-margin max-w-[1400px] mx-auto">
      {/* ---- Top bar: title + subtitle, filters, CTA (desktop) ---- */}
      <header className="flex flex-col gap-space-md pt-2">
        <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-space-md">
          <div className="flex items-baseline gap-3">
            <h1 className="font-outfit text-headline-page-mobile md:text-headline-page text-on-surface tracking-tight">
              {t('overview.title')}
            </h1>
            <span className="hidden md:inline-block text-xs uppercase tracking-widest text-secondary font-medium">
              {t('overview.ensembleValuationEngine')}
            </span>
            {/* Mobile Live Feed badge — shown only while /health reports ok */}
            <span
              className={`md:hidden inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                healthQ.data?.status === 'ok'
                  ? 'bg-tertiary-container/20 text-tertiary'
                  : 'bg-surface-container-highest text-secondary'
              }`}
              aria-live="polite"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  healthQ.data?.status === 'ok'
                    ? 'bg-tertiary animate-pulse'
                    : 'bg-secondary'
                }`}
              />
              {t('overview.liveFeed')}
            </span>
          </div>
          <PillButton
            leadingIcon="calculate"
            onClick={() => navigate('/predictor')}
            aria-label={t('overview.estimatePrice')}
          >
            {t('overview.estimatePrice')}
          </PillButton>
        </div>

        {/* Desktop filters row */}
        <div className="hidden md:flex flex-wrap items-center gap-3">
          <PillDropdown
            label={t('overview.filterCounty')}
            leadingIcon="location_on"
            options={countyOptions}
            value={county}
            onChange={onCountyChange}
          />
          <PillDropdown
            label={t('overview.filterPropertyType')}
            leadingIcon="category"
            options={propTypeOptions}
            value={propType}
            onChange={onPropTypeChange}
          />
        </div>

        {/* Mobile filters button */}
        <div className="md:hidden flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(true)}
            className="min-h-[44px] px-4 rounded-full bg-surface-container-lowest text-on-surface flex items-center gap-2 shadow-sm active:scale-95 transition-transform"
            aria-haspopup="dialog"
            aria-expanded={mobileFiltersOpen}
          >
            <span className="material-symbols-outlined text-[18px] text-primary">tune</span>
            <span className="font-label-metric text-[13px]">{t('overview.filtersButton')}</span>
            {activeFilterCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-surface-container text-secondary text-[12px] flex items-center justify-center font-medium">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Mobile removable chips */}
        {activeFilterCount > 0 && (
          <div className="md:hidden flex flex-wrap gap-2">
            {county !== ALL_VALUE && (
              <button
                type="button"
                onClick={() => onCountyChange(ALL_VALUE)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-low text-on-surface text-xs font-medium"
              >
                {t('common.county')}: {county}
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}
            {propType !== ALL_VALUE && (
              <button
                type="button"
                onClick={() => onPropTypeChange(ALL_VALUE)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-low text-on-surface text-xs font-medium"
              >
                {propType}
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}
          </div>
        )}

        {/* Unmapped prop-type warning */}
        {overviewQ.data && overviewQ.data.unmapped_prop_type_rows > 0 && (
          <p
            className="text-xs text-secondary italic"
            role="status"
          >
            {t('overview.unmappedPropTypeWarning', {
              n: overviewQ.data.unmapped_prop_type_rows,
            })}
          </p>
        )}
      </header>

      {/* ---- KPI row (desktop 5 tiles; mobile hero + 2x2 grid) ---- */}
      <KpiRow
        overview={overviewQ.data}
        meta={metaQ.data}
        metrics={metricsQ.data}
        isLoading={overviewQ.isLoading || metaQ.isLoading || metricsQ.isLoading}
      />

      {/* ---- Charts grid: price-by-distance (8) + deal signals (4) ---- */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <PriceDistanceChart
          overview={overviewQ.data}
          isLoading={overviewQ.isLoading}
          isError={overviewQ.isError}
          onRetry={() => overviewQ.refetch()}
          county={county}
          propType={propType}
        />
        <DealSignalsCard
          overview={overviewQ.data}
          isLoading={overviewQ.isLoading}
          isError={overviewQ.isError}
          onRetry={() => overviewQ.refetch()}
          county={county}
          propType={propType}
        />
      </section>

      {/* ---- Three equal analytical cards ---- */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <CountyHexViz
          overview={overviewQ.data}
          isLoading={overviewQ.isLoading}
          isError={overviewQ.isError}
          onRetry={() => overviewQ.refetch()}
        />
        <PriceByPropertyType
          overview={overviewQ.data}
          isLoading={overviewQ.isLoading}
          isError={overviewQ.isError}
          onRetry={() => overviewQ.refetch()}
        />
        <PriceBySizeBand
          overview={overviewQ.data}
          isLoading={overviewQ.isLoading}
          isError={overviewQ.isError}
          onRetry={() => overviewQ.refetch()}
          county={county}
        />
      </section>

      {/* ---- Disclaimer footer ---- */}
      <footer
        className="text-xs text-secondary font-body-regular py-4 border-t border-surface-container"
        role="contentinfo"
      >
        {t('overview.disclaimer', {
          model: overviewQ.data?.generated_from ?? '—',
        })}
      </footer>

      {/* ---- Mobile filters bottom sheet ---- */}
      {mobileFiltersOpen && (
        <FiltersSheet
          countyOptions={countyOptions}
          propTypeOptions={propTypeOptions}
          county={county}
          propType={propType}
          onCountyChange={(v) => {
            onCountyChange(v);
          }}
          onPropTypeChange={(v) => {
            onPropTypeChange(v);
          }}
          onClose={() => setMobileFiltersOpen(false)}
        />
      )}
    </div>
  );
}
