/**
 * Data Explorer — data-quality tab (09_data_explorer_quality).
 *
 * P7b (correctness + data-driven values; visuals unchanged):
 *  - The min-county listing threshold comes from /meta's coverage block
 *    ONLY. When it is null there is no `?? 10` fallback: threshold UI,
 *    the "Model Ready / Not enough data" statuses, and the ready/not-ready
 *    split all disappear and "threshold not available" is shown instead.
 *  - Tab labels render from i18n; the four undesigned tabs render an
 *    honest translated placeholder that names the endpoint each would
 *    need. They look non-interactive (disabled pills) but stay reachable
 *    by URL (?tab=...). The tab group is a proper tablist (roving
 *    tabindex + arrow keys + aria-selected).
 *  - The sanitization tile explains the flag from the response's
 *    `flag_definition` (percentile window) — never a typed "1st–99th".
 *  - Colour ramp + hatch colours come from the shared chart tokens; the
 *    ramp cut-offs are named presentation constants.
 *  - Percentile markers use the response values only; the bar-width
 *    clamps below are VISUAL MINIMUMS (commented) so a tiny bar stays
 *    visible without ever misrepresenting its count (the count is
 *    always printed as text).
 *  - Money goes through the shared currency-aware formatter (USD toggle
 *    honoured; honest KSh display while no rate is configured); counts
 *    format with the active locale (en-KE / sw-KE), never a typed one.
 *  - Every card has loading / error+retry / empty states; a failure in
 *    one query never blanks the page.
 */
import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { EmptyState, LoadingSkeleton, ValuationCard } from '@/components';
import {
  useCountyRowCounts,
  useCountySummary,
  useExplainability,
  useFeatureEvaluation,
  useListingsScored,
  useMeta,
  usePriceDistribution,
} from '@/lib/api/hooks';
import type { PriceBin } from '@/lib/api/types';
import { formatCompactMoney, useCurrency } from '@/lib/currency/format';
import { useFormatNumber } from '@/lib/i18n/useLocale';
import { ordinal } from '@/lib/ordinal';
import {
  CHART_COLOR_OUTLINE,
  CHART_COLOR_RAMP_DEEP,
  CHART_COLOR_RAMP_LIGHT,
  CHART_COLOR_RAMP_MID,
  CHART_COLOR_RAMP_PALE,
  PRICE_RAMP_CUTOFFS,
} from '@/lib/ui/chart-tokens';

import {
  TABS,
  csvFromCountyRows,
  mergeCountyRows,
  normaliseTab,
  rowsForMissing,
  type DataExplorerTab,
} from './helpers';
import {
  CountyTableCard,
  ListingsPerCountyCard,
  ProvenanceCard,
  SampleRecordsCard,
} from './sections';
import { LocationsTab, PricesTab, RelationshipsTab, TableTab } from './tabs';

/** County table rows per page — display density, not a data fact. */
const PAGE_SIZE = 10;

/** Which data powers the histogram tooltip + sr-only summary labels. */
function PriceTooltip({ active, payload, nLabel }: {
  active?: boolean;
  payload?: Array<{ payload: { label: string; count: number } }>;
  nLabel: (n: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-DEFAULT bg-surface-container-lowest border border-black/[0.06] shadow-level-2 px-3 py-2">
      <div className="text-caption-sm text-secondary">{p.label}</div>
      <div className="text-body-medium text-on-surface">{nLabel(p.count)}</div>
    </div>
  );
}

export default function DataExplorer() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const formatNumber = useFormatNumber();
  const tab = normaliseTab(searchParams.get('tab'));

  function setTab(next: DataExplorerTab) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === 'quality') params.delete('tab');
        else params.set('tab', next);
        return params;
      },
      { replace: true },
    );
  }

  const summaryQ = useCountySummary();
  const rowCountsQ = useCountyRowCounts();
  const featureEvalQ = useFeatureEvaluation();
  const explainQ = useExplainability();
  const priceDistQ = usePriceDistribution();
  const metaQ = useMeta();

  // Mobile sample records: first page of the scored listings feed.
  const listingsQ = useListingsScored({ page: 1, page_size: 6 });

  // P7b-A: the real threshold ONLY — no `?? 10` fallback. Null means the
  // backend cannot serve the coverage rules right now; every threshold
  // UI then honestly reports "threshold not available".
  const threshold = metaQ.data?.coverage?.min_county_n ?? null;
  const countyRows = useMemo(
    () => mergeCountyRows(summaryQ.data, rowCountsQ.data, threshold),
    [summaryQ.data, rowCountsQ.data, threshold],
  );

  const [tablePage, setTablePage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(countyRows.length / PAGE_SIZE));
  const pageRows = countyRows.slice((tablePage - 1) * PAGE_SIZE, tablePage * PAGE_SIZE);
  const nModelReady =
    threshold == null ? null : countyRows.filter((r) => r.modelReady === true).length;

  const missingRows = useMemo(
    () => rowsForMissing(featureEvalQ.data?.rows, explainQ.data?.feature_labels as never),
    [featureEvalQ.data, explainQ.data],
  );
  const nUsable = rowCountsQ.data?.total_listings ?? priceDistQ.data?.n_usable ?? null;

  // The flag rule from the response (price-distribution preferred, /meta
  // fallback — both serve the same canonical window).
  const flagDefinition = priceDistQ.data?.flag_definition ?? metaQ.data?.flag_definition ?? null;

  if (tab !== 'quality') {
    // A2 + B4: every non-quality tab now has a real design.
    return (
      <div className="flex flex-col gap-space-xl p-margin max-w-[1400px] mx-auto">
        <DataExplorerHeader tab={tab} onTab={setTab} />
        {tab === 'table' && <TableTab />}
        {tab === 'prices' && <PricesTab />}
        {tab === 'relationships' && <RelationshipsTab />}
        {tab === 'locations' && <LocationsTab />}
        <footer className="text-center px-space-xs pt-space-xl pb-4">
          <p className="font-caption-sm text-secondary opacity-80 leading-relaxed">
            {t('de.footer.disclaimer')}
          </p>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-space-xl p-margin max-w-[1400px] mx-auto">
      <DataExplorerHeader tab={tab} onTab={setTab} />

      {/* ---- 2. Stat tiles ---- */}
      <StatTiles
        nUsable={priceDistQ.data?.n_usable ?? rowCountsQ.data?.total_listings ?? null}
        nFlagged={priceDistQ.data?.n_flagged ?? null}
        nCountiesReady={
          rowCountsQ.data && threshold != null
            ? rowCountsQ.data.counties.filter((c) => c.n_listings >= threshold).length
            : null
        }
        nCountiesTotal={summaryQ.data?.n_counties_total ?? null}
        threshold={threshold}
        flagDefinition={flagDefinition}
        formatNumber={formatNumber}
        isLoading={priceDistQ.isLoading || rowCountsQ.isLoading || metaQ.isLoading}
      />

      {/* ---- 3 + 4: missing values / price distribution ---- */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
        <MissingValuesCard
          rows={missingRows}
          nUsable={nUsable}
          isLoading={featureEvalQ.isLoading || explainQ.isLoading}
          isError={featureEvalQ.isError}
          onRetry={() => featureEvalQ.refetch()}
        />
        <PriceDistributionCard
          query={priceDistQ}
          nUsable={nUsable}
        />
      </section>

      {/* ---- 5 + 6. Listings per county (7 cols) + Where the data comes
           from (5 cols) — side by side per the design's 12-col grid. ---- */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-gutter items-start">
        <div className="lg:col-span-7">
          <ListingsPerCountyCard
            rows={countyRows}
            threshold={threshold}
            isLoading={rowCountsQ.isLoading || metaQ.isLoading}
            isError={rowCountsQ.isError}
            onRetry={() => rowCountsQ.refetch()}
          />
        </div>
        <div className="lg:col-span-5">
          <ProvenanceCard />
        </div>
      </section>

      {/* ---- 7. County table (md+) / sample records (below md) ---- */}
      <CountyTableCard
        rows={pageRows}
        totalPages={totalPages}
        tablePage={tablePage}
        onPage={setTablePage}
        totalRows={countyRows.length}
        nModelReady={nModelReady}
        threshold={threshold}
        isLoading={summaryQ.isLoading || rowCountsQ.isLoading}
        isError={summaryQ.isError || rowCountsQ.isError}
        onRetry={() => {
          summaryQ.refetch();
          rowCountsQ.refetch();
        }}
        onDownload={() => {
          const csv = csvFromCountyRows(countyRows);
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          // P7b-J: the filename carries the dataset date from /meta when
          // present — never a typed date literal.
          const datePart = metaQ.data?.data_date
            ? `-${metaQ.data.data_date.replace(/[^A-Za-z0-9_-]+/g, '-')}`
            : '';
          a.href = url;
          a.download = `listings-and-medians-by-county${datePart}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        }}
      />
      <div className="md:hidden">
        <SampleRecordsCard
          rows={listingsQ.data?.listings ?? []}
          isLoading={listingsQ.isLoading}
          isError={listingsQ.isError}
          onRetry={() => listingsQ.refetch()}
        />
      </div>

      {/* ---- 9. Footer ---- */}
      <footer className="text-center px-space-xs pt-space-xl pb-4">
        <p className="text-caption-sm text-secondary opacity-80 leading-relaxed">
          {t('de.footer.disclaimer')}
        </p>
        <p className="text-caption-sm text-secondary opacity-70 leading-relaxed mt-0.5">
          {metaQ.data?.model_version || metaQ.data?.data_date
            ? t('de.footer.meta', {
                version: metaQ.data?.model_version ?? t('de.footer.versionUnavailable'),
                date: metaQ.data?.data_date ?? t('de.footer.dateUnavailable'),
              })
            : `${t('de.footer.versionUnavailable')} — dataset snapshot ${t('de.footer.dateUnavailable')}`}
        </p>
      </footer>
    </div>
  );
}

// ----------------------------------------------------------------------
// 1. Header + tabs (a proper tablist)
// ----------------------------------------------------------------------

function DataExplorerHeader({
  tab,
  onTab,
}: {
  tab: DataExplorerTab;
  onTab: (t: DataExplorerTab) => void;
}) {
  const { t } = useTranslation();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Roving tabindex + arrow-key navigation across the ENABLED tabs (the
  // four undesigned tabs are disabled pills — see below). With a single
  // enabled tab this is a no-op, but the wiring is here so the tablist
  // stays correct the moment those tabs get designs.
  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    const enabled = TABS.filter((tt) => tt.designed);
    if (enabled.length < 2) return;
    const idx = tabRefs.current.findIndex((el) => el === e.currentTarget);
    if (idx === -1) return;
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % enabled.length;
    if (e.key === 'ArrowLeft') next = (idx - 1 + enabled.length) % enabled.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = enabled.length - 1;
    if (next >= 0) {
      e.preventDefault();
      tabRefs.current[next]?.focus();
    }
  }

  return (
    <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-space-md pt-2">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary-container" />
          <span className="font-label-uppercase text-label-uppercase text-secondary tracking-widest uppercase">
            {t('de.eyebrow')}
          </span>
        </div>
        <h1 className="font-headline-page text-headline-page-mobile md:text-headline-page text-on-surface tracking-tight font-light">
          {t('de.title')}
        </h1>
        <p className="font-body-regular text-body-regular text-secondary">
          {t('de.subtitle')}
        </p>
      </div>
      {/* Five-pill tab group — horizontally scrollable on mobile per m12.
          A proper tablist: role=tab + aria-selected + roving tabindex +
          arrow keys on the enabled tabs. The four undesigned tabs are
          DISABLED pills (non-interactive-looking — P7b-C) that stay
          reachable via ?tab= in the URL; their tooltip carries the
          honest "why". */}
      <div className="w-full lg:w-auto overflow-x-auto -mx-margin-mobile px-margin-mobile lg:mx-0 lg:px-0 py-1">
        <div
          role="tablist"
          aria-label={t('de.tabsA11y')}
          className="flex items-center bg-surface-container-high/70 p-1 rounded-full shadow-xs min-w-max"
        >
          {TABS.map((tt, i) => {
            const active = tt.id === tab;
            const soonKey = `de.tabSoon.${tt.id}` as const;
            if (!tt.designed) {
              return (
                <button
                  key={tt.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-disabled="true"
                  disabled
                  title={t(soonKey)}
                  tabIndex={-1}
                  className={`h-9 lg:h-auto px-4 py-1.5 rounded-full font-body-medium text-[12px] whitespace-nowrap cursor-not-allowed ${
                    active
                      ? 'bg-surface-container-high text-secondary'
                      : 'text-secondary/50'
                  }`}
                >
                  {t(tt.labelKey)}
                </button>
              );
            }
            return (
              <button
                key={tt.id}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                onKeyDown={onKeyDown}
                onClick={() => onTab(tt.id)}
                className={`h-9 lg:h-auto px-4 py-1.5 rounded-full font-body-medium text-[12px] whitespace-nowrap transition-all ${
                  active
                    ? 'bg-inverse-surface text-inverse-on-surface shadow-sm'
                    : 'text-secondary hover:text-on-surface'
                }`}
              >
                {t(tt.labelKey)}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}

// ----------------------------------------------------------------------
// 2. Stat tiles
// ----------------------------------------------------------------------

interface StatTilesProps {
  nUsable: number | null;
  nFlagged: number | null;
  nCountiesReady: number | null;
  /** Total counties from the boundaries/summary response (never typed). */
  nCountiesTotal: number | null;
  threshold: number | null;
  flagDefinition: { lower_pct: number; upper_pct: number } | null;
  formatNumber: (n: number) => string;
  isLoading: boolean;
}

function StatTiles({
  nUsable,
  nFlagged,
  nCountiesReady,
  nCountiesTotal,
  threshold,
  flagDefinition,
  formatNumber,
  isLoading,
}: StatTilesProps) {
  const { t } = useTranslation();
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-gutter">
        {Array.from({ length: 4 }).map((_, i) => (
          <ValuationCard key={i} noPadding>
            <div className="p-space-md flex flex-col gap-2">
              <LoadingSkeleton className="h-3 w-24" />
              <LoadingSkeleton className="h-10 w-20" />
              <LoadingSkeleton className="h-3 w-28" />
            </div>
          </ValuationCard>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-gutter">
      {/* Observed corpus — raw pre-cleaning count does not exist anywhere the
          backend loads; honest unavailable state instead of a fabricated one. */}
      <div className="rounded-lg bg-surface-container-lowest p-space-md shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <span className="font-label-uppercase text-label-uppercase text-secondary uppercase tracking-wider">
            {t('de.tile.corpus.label')}
          </span>
          <span className="material-symbols-outlined text-[20px] text-secondary">inventory_2</span>
        </div>
        <div>
          <div className="font-display-kpi text-display-kpi text-on-surface leading-none mb-1 opacity-40">—</div>
          <div className="font-body-medium text-body-medium text-on-surface">
            {t('de.tile.corpus.value')}
          </div>
          <div className="font-caption-sm text-caption-sm text-secondary mt-0.5">
            {t('de.tile.corpus.unavailable')}
          </div>
        </div>
      </div>

      {/* Modeling yield — usable count is real; the yield % needs the raw
          collected count, so it stays an honest dash. */}
      <div className="rounded-lg bg-surface-container-lowest p-space-md shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <span className="font-label-uppercase text-label-uppercase text-primary tracking-wider uppercase">
            {t('de.tile.yield.label')}
          </span>
          <span className="material-symbols-outlined text-[20px] text-primary-container">check_circle</span>
        </div>
        <div>
          <div className="font-display-kpi text-display-kpi text-primary-container leading-none mb-1">
            {nUsable != null ? formatNumber(nUsable) : '—'}
          </div>
          <div className="font-body-medium text-body-medium text-on-surface">
            {t('de.tile.yield.value')}
          </div>
          <div className="font-caption-sm text-caption-sm text-secondary mt-0.5">
            {t('de.tile.yield.unavailable')}
          </div>
        </div>
      </div>

      {/* County coverage — threshold badge + "of N" follow the response;
          null threshold hides the quorum claim entirely. */}
      <div className="rounded-lg bg-surface-container-lowest p-space-md shadow-sm flex flex-col justify-between">
        {/* flex-wrap so the threshold badge drops under the label on narrow
            2-col mobile tiles instead of overflowing the tile edge. */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <span className="font-label-uppercase text-label-uppercase text-secondary uppercase tracking-wider">
            {t('de.tile.coverage.label')}
          </span>
          {threshold != null && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant font-caption-sm text-caption-sm font-medium">
              {t('de.tile.coverage.badge', { threshold })}
            </span>
          )}
        </div>
        <div>
          <div className="font-display-kpi text-display-kpi text-on-surface leading-none mb-1">
            {nCountiesReady != null ? nCountiesReady : '—'}
            {nCountiesReady != null && nCountiesTotal != null && (
              <span className="font-label-metric text-label-metric text-secondary ml-1.5">
                {t('de.tile.coverage.ofTotal', { total: formatNumber(nCountiesTotal) })}
              </span>
            )}
          </div>
          <div className="font-body-medium text-body-medium text-on-surface">
            {t('de.tile.coverage.value')}
          </div>
          <div className="font-caption-sm text-caption-sm text-secondary mt-0.5">
            {threshold != null ? t('de.tile.coverage.caption') : t('de.tile.coverage.thresholdUnavailable')}
          </div>
        </div>
      </div>

      {/* Sanitization — red accent; count is the real flagged count, and
          the caption explains the flag from flag_definition. */}
      <div className="rounded-lg bg-surface-container-lowest p-space-md shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <span className="font-label-uppercase text-label-uppercase text-error uppercase tracking-wider">
            {t('de.tile.sanitization.label')}
          </span>
          <span className="material-symbols-outlined text-[20px] text-primary-container">flag</span>
        </div>
        <div>
          <div className="font-display-kpi text-display-kpi text-on-surface leading-none mb-1">
            {nFlagged != null ? formatNumber(nFlagged) : '—'}
          </div>
          <div className="font-body-medium text-body-medium text-on-surface">
            {t('de.tile.sanitization.value')}
          </div>
          <div className="font-caption-sm text-caption-sm text-secondary mt-0.5">
            {flagDefinition != null
              ? t('de.tile.sanitization.flagRule', {
                  lower: ordinal(flagDefinition.lower_pct),
                  upper: ordinal(flagDefinition.upper_pct),
                })
              : t('de.tile.sanitization.caption')}
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// 3. Missing values by feature
// ----------------------------------------------------------------------

function MissingValuesCard({
  rows,
  nUsable,
  isLoading,
  isError,
  onRetry,
}: {
  rows: ReturnType<typeof rowsForMissing>;
  nUsable: number | null;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const formatNumber = useFormatNumber();
  const worst = rows[0];
  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-headline-section text-headline-section text-on-surface font-medium">
            {t('de.missing.title')}
          </h2>
          <span className="font-label-metric text-label-metric text-secondary">
            {nUsable != null ? t('de.missing.nUsable', { n: formatNumber(nUsable) }) : ''}
          </span>
        </div>
        <p className="font-body-regular text-body-regular text-secondary mb-space-md">
          {t('de.missing.subtitle')}
        </p>

        {isLoading ? (
          <LoadingSkeleton className="h-64 w-full rounded-md" />
        ) : isError ? (
          <EmptyState
            icon="cloud_off"
            title={t('de.missing.errorTitle')}
            message={t('de.missing.errorMessage')}
            actionLabel={t('common.retry')}
            onAction={onRetry}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="rule"
            title={t('de.missing.emptyTitle')}
            message={t('de.missing.emptyMessage')}
          />
        ) : (
          <div className="flex flex-col gap-space-sm">
            {/* P7b-B: one plain style for every row — the old orange
                "severe" accent was driven by a typed 50% threshold with no
                backend notion behind it, so it was removed. Percentages
                are `missing_pct` unmodified; `excluded` comes from
                in_selected_set. */}
            {rows.map((r) => (
              <div key={r.feature} className="flex flex-col gap-1">
                <div className="flex justify-between items-center font-body-medium text-body-medium">
                  <span className="truncate text-on-surface font-medium">{r.feature}</span>
                  {r.missingPct <= 0 ? (
                    <span className="text-tertiary font-semibold flex items-center gap-1 whitespace-nowrap">
                      <span className="material-symbols-outlined text-[14px]">check</span>{' '}
                      {t('de.missing.zero')}
                    </span>
                  ) : (
                    <span className="whitespace-nowrap text-secondary font-medium">
                      {t('de.missing.pct', { pct: r.missingPct.toFixed(0) })}
                    </span>
                  )}
                </div>
                {r.missingPct <= 0 ? (
                  <div className="h-2 w-full bg-tertiary/20 rounded-full overflow-hidden">
                    <div className="h-full w-full bg-tertiary rounded-full" />
                  </div>
                ) : (
                  <div className="h-3 w-full bg-surface-container rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        // VISUAL MINIMUM WIDTH ONLY (P7b-E): a nonzero
                        // missingness must stay visible as a sliver; the
                        // percentage is printed as text, so the clamp can
                        // never misrepresent the value.
                        width: `${Math.max(2, Math.min(100, r.missingPct))}%`,
                        backgroundImage: `repeating-linear-gradient(45deg, ${CHART_COLOR_RAMP_MID} 0, ${CHART_COLOR_RAMP_MID} 2.5px, transparent 2.5px, transparent 8px)`,
                      }}
                      aria-hidden="true"
                    />
                  </div>
                )}
              </div>
            ))}

            {/* Callout generated from data: only when a feature is actually
                excluded. The design's hand-written water-body sentence is
                omitted (reported). */}
            {worst && worst.excluded && (
              <div className="flex items-center gap-1.5 mt-2 text-secondary">
                <span className="material-symbols-outlined text-[14px] text-primary-container">info</span>
                <span className="font-caption-sm text-caption-sm">
                  {t('de.missing.excluded', {
                    pct: worst.missingPct.toFixed(0),
                    feature: worst.feature,
                  })}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </ValuationCard>
  );
}

// ----------------------------------------------------------------------
// 4. Price per acre distribution
// ----------------------------------------------------------------------

/** Map a KSh value to its 0-100% position on the bin log10 axis. */
function logPos(value: number, bins: PriceBin[]): number {
  if (bins.length === 0) return 0;
  const lo = Math.log10(bins[0].lower_ksh);
  const hi = Math.log10(bins[bins.length - 1].upper_ksh);
  if (hi <= lo) return 50;
  // Clamp keeps the marker inside the plot area when a percentile sits
  // outside the clipped bin range — a visual bound only; the printed
  // value is exact.
  return Math.max(0, Math.min(100, ((Math.log10(value) - lo) / (hi - lo)) * 100));
}

function PriceDistributionCard({
  query,
  nUsable,
}: {
  query: ReturnType<typeof usePriceDistribution>;
  nUsable: number | null;
}) {
  const { t } = useTranslation();
  const formatNumber = useFormatNumber();
  const { currency } = useCurrency();
  const { data, isLoading, isError, refetch } = query;
  const bins: PriceBin[] = data?.bins ?? [];
  const maxCount = Math.max(1, ...bins.map((b) => b.count));

  // Bin colour ramp (P7b-D): the cut-offs are the named presentation
  // constants from chart-tokens (display choice, not a data fact); the
  // colours are the single-sourced design tokens.
  function barFill(count: number): string {
    const rel = count / maxCount;
    if (rel <= PRICE_RAMP_CUTOFFS.pale) return CHART_COLOR_RAMP_PALE;
    if (rel <= PRICE_RAMP_CUTOFFS.light) return CHART_COLOR_RAMP_LIGHT;
    if (rel <= PRICE_RAMP_CUTOFFS.mid) return CHART_COLOR_RAMP_MID;
    return CHART_COLOR_RAMP_DEEP;
  }

  const chartData = bins.map((b) => ({
    label: `${formatCompactMoney(b.lower_ksh, currency)} – ${formatCompactMoney(b.upper_ksh, currency)}`,
    count: b.count,
    fill: barFill(b.count),
  }));

  const p = data?.percentiles;

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-headline-section text-headline-section text-on-surface font-medium">
            {t('de.price.title')}
          </h2>
          <span className="font-label-metric text-label-metric text-secondary">{t('de.price.scale')}</span>
        </div>
        <p className="font-body-regular text-body-regular text-secondary mb-4">
          {t('de.price.subtitle', { n: nUsable != null ? formatNumber(nUsable) : '—' })}
        </p>

        {isLoading ? (
          <LoadingSkeleton className="h-56 w-full rounded-md" />
        ) : isError ? (
          <EmptyState
            icon="cloud_off"
            title={t('de.price.errorTitle')}
            message={t('de.price.errorMessage')}
            actionLabel={t('common.retry')}
            onAction={() => refetch()}
          />
        ) : bins.length === 0 ? (
          <EmptyState
            icon="bar_chart"
            title={t('de.price.emptyTitle')}
            message={t('de.price.emptyMessage')}
          />
        ) : (
          <>
            <div className="relative w-full h-56 mt-2">
              {bins.length > 1 && p && (
                <>
                  {/* p1 / p99 dashed reference lines (design) — positioned on
                      the same log10 axis as the median pill, from the response
                      values only (never fixed positions). */}
                  {[p.p1, p.p99].map((v) => (
                    <div
                      key={v}
                      className="absolute top-0 bottom-0 w-px pointer-events-none"
                      style={{
                        left: `${logPos(v, bins)}%`,
                        borderLeft: `1.5px dashed ${CHART_COLOR_OUTLINE}`,
                      }}
                    />
                  ))}
                </>
              )}
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 24, right: 4, bottom: 0, left: 4 }}>
                  <XAxis dataKey="label" hide />
                  <YAxis hide />
                  <Tooltip
                    content={<PriceTooltip nLabel={(n) => t('de.price.tooltipListings', { count: formatNumber(n) })} />}
                    cursor={{ fill: 'rgba(27,21,18,0.04)' }}
                  />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {/* Median marker — real median from the endpoint. */}
              {p && (
                <div
                  className="absolute -top-1 -translate-x-1/2 bg-inverse-surface text-inverse-on-surface px-3 py-1 rounded-full shadow-md flex items-center gap-1.5 whitespace-nowrap"
                  style={{ left: `${logPos(p.p50, bins)}%` }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-container" />
                  <span className="font-label-metric text-[12px] font-medium">
                    {t('de.price.median', { value: formatCompactMoney(p.p50, currency) })}
                  </span>
                </div>
              )}
              {/* Hidden text alternative for the histogram (P7b-L): n,
                  median, and the middle 80% as text. */}
              <p className="sr-only">
                {p &&
                  t('de.price.a11ySummary', {
                    n: formatNumber(nUsable ?? 0),
                    median: formatCompactMoney(p.p50, currency),
                    p10: formatCompactMoney(p.p10, currency),
                    p90: formatCompactMoney(p.p90, currency),
                  })}
              </p>
            </div>
            {/* Percentile chips: p1/p50/p99 on web (p10/p50/p90 on mobile). */}
            {p && (
              <>
                <div className="hidden md:grid grid-cols-3 gap-2 py-1">
                  <PctTile label={t('de.price.p1')} value={formatCompactMoney(p.p1, currency)} />
                  <PctTile label={t('de.price.p50')} value={formatCompactMoney(p.p50, currency)} highlight />
                  <PctTile label={t('de.price.p99')} value={formatCompactMoney(p.p99, currency)} />
                </div>
                <div className="grid md:hidden grid-cols-3 gap-2 py-1">
                  <PctTile label={t('de.price.p10')} value={formatCompactMoney(p.p10, currency)} />
                  <PctTile label={t('de.price.p50')} value={formatCompactMoney(p.p50, currency)} highlight />
                  <PctTile label={t('de.price.p90')} value={formatCompactMoney(p.p90, currency)} />
                </div>
              </>
            )}
            {/* Axis ticks on the log scale. */}
            {bins.length > 1 && (
              <div className="flex justify-between items-center text-secondary font-label-metric text-[12px] pt-2 px-1">
                <span>{formatCompactMoney(bins[0].lower_ksh, currency)}</span>
                <span>{formatCompactMoney(bins[Math.floor(bins.length / 2)].lower_ksh, currency)}</span>
                <span>{formatCompactMoney(bins[bins.length - 1].upper_ksh, currency)}</span>
              </div>
            )}
          </>
        )}

        {/* Explanatory note — the middle-80% numbers interpolate the real
            p10/p90 response values. */}
        {p && (
          <div className="mt-4 p-3 rounded bg-surface-container-low flex items-start gap-2">
            <span className="material-symbols-outlined text-primary-container text-[18px] shrink-0 mt-0.5">analytics</span>
            <p className="font-caption-sm text-caption-sm text-on-surface-variant">
              {t('de.price.middle80', {
                low: formatCompactMoney(p.p10, currency),
                high: formatCompactMoney(p.p90, currency),
              })}
            </p>
          </div>
        )}
      </div>
    </ValuationCard>
  );
}

function PctTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`p-2 rounded-lg flex flex-col ${highlight ? 'bg-primary-fixed' : 'bg-surface-container'}`}>
      <span className="font-label-uppercase text-label-uppercase text-on-surface-variant text-[11px]">{label}</span>
      <span className="font-body-medium text-body-medium text-on-surface font-semibold mt-0.5">{value}</span>
    </div>
  );
}
