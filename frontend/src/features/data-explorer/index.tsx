/**
 * Data Explorer — data-quality tab (09_data_explorer_quality).
 *
 * NOTE ON PROVENANCE (fidelity round): this file was authored against a
 * source tree where the first P7 build was NOT present (data-explorer/
 * was still the F0 placeholder), so this is the first build shaped
 * directly by the web + m12 designs plus this update-to-design pass.
 *
 * Sections in design order:
 *   1. Header + five-pill tab group (only "Data quality" designed; other
 *      four tabs render a "Coming soon" panel). Tab lives in `?tab=`.
 *   2. Four stat tiles (Observed corpus / Modeling yield / County
 *      coverage / Sanitization).
 *   3. Missing values by feature (from /model/feature-evaluation).
 *   4. Price per acre distribution (from /data/price-distribution — the
 *      read-only backend endpoint this round added).
 *   5. Listings per county (from /counties/row_counts) with the ≥10
 *      threshold divider + hatched below-threshold bars.
 *   6. "Where the data comes from" — frame with "Not available yet"
 *      (provenance shares are not recorded anywhere the backend loads).
 *   7. Listings & Medians by County table (summary + row_counts merged).
 *   8. Mobile: sample-record cards replace the wide table below md.
 *   9. Footer disclaimer with real version/date from /meta.
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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

import {
  TABS,
  compactKSh,
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

const PAGE_SIZE = 10; // county table rows per page


function PriceTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload: { label: string; count: number } }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-DEFAULT bg-surface-container-lowest border border-black/[0.06] shadow-level-2 px-3 py-2">
      <div className="text-caption-sm text-secondary">{p.label}</div>
      <div className="text-body-medium text-on-surface">{p.count} listings</div>
    </div>
  );
}

export default function DataExplorer() {
  const [searchParams, setSearchParams] = useSearchParams();
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

  const threshold = metaQ.data?.coverage?.min_county_n ?? 10;
  const countyRows = useMemo(
    () => mergeCountyRows(summaryQ.data, rowCountsQ.data, threshold),
    [summaryQ.data, rowCountsQ.data, threshold],
  );

  const [tablePage, setTablePage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(countyRows.length / PAGE_SIZE));
  const pageRows = countyRows.slice((tablePage - 1) * PAGE_SIZE, tablePage * PAGE_SIZE);
  const nModelReady = countyRows.filter((r) => r.modelReady).length;

  const missingRows = useMemo(
    () => rowsForMissing(featureEvalQ.data?.rows, explainQ.data?.feature_labels as never),
    [featureEvalQ.data, explainQ.data],
  );
  const nUsable = rowCountsQ.data?.total_listings ?? priceDistQ.data?.n_usable;

  if (tab !== 'quality') {
    return (
      <div className="flex flex-col gap-space-xl p-margin max-w-[1400px] mx-auto">
        <DataExplorerHeader tab={tab} onTab={setTab} />
        <EmptyState
          icon="construction"
          title={`${TABS.find((t) => t.id === tab)?.label ?? tab} tab`}
          message="This tab isn't designed yet. The Data quality tab has the full data-hygiene view."
        />
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
          rowCountsQ.data
            ? rowCountsQ.data.counties.filter((c) => c.n_listings >= threshold).length
            : null
        }
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
          a.href = url;
          a.download = 'listings-and-medians-by-county.csv';
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
          Statistical estimate, not an official valuation. Map data © OpenStreetMap contributors.
        </p>
        <p className="text-caption-sm text-secondary opacity-70 leading-relaxed mt-0.5">
          {metaQ.data?.model_version ?? 'Model version unavailable'} — dataset snapshot{' '}
          {metaQ.data?.data_date ?? 'unavailable'}
        </p>
      </footer>
    </div>
  );
}

// ----------------------------------------------------------------------
// 1. Header + tabs
// ----------------------------------------------------------------------

function DataExplorerHeader({
  tab,
  onTab,
}: {
  tab: DataExplorerTab;
  onTab: (t: DataExplorerTab) => void;
}) {
  return (
    <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-space-md pt-2">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary-container" />
          <span className="font-label-uppercase text-label-uppercase text-secondary tracking-widest uppercase">
            Corpus Diagnostics &amp; Data Hygiene
          </span>
        </div>
        <h1 className="font-headline-page text-headline-page-mobile md:text-headline-page text-on-surface tracking-tight font-light">
          Data Explorer
        </h1>
        <p className="font-body-regular text-body-regular text-secondary">
          Look at the listings data behind the estimates.
        </p>
      </div>
      {/* Five-pill tab group — horizontally scrollable on mobile per m12. */}
      <div className="w-full lg:w-auto overflow-x-auto -mx-margin-mobile px-margin-mobile lg:mx-0 lg:px-0 py-1">
        <div className="flex items-center bg-surface-container-high/70 p-1 rounded-full shadow-xs min-w-max">
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onTab(t.id)}
                aria-pressed={active}
                className={`h-9 lg:h-auto px-4 py-1.5 rounded-full font-body-medium text-[12px] whitespace-nowrap transition-all ${
                  active
                    ? 'bg-inverse-surface text-inverse-on-surface shadow-sm'
                    : 'text-secondary hover:text-on-surface'
                }`}
              >
                {t.label}
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
  isLoading: boolean;
}

function StatTiles({ nUsable, nFlagged, nCountiesReady, isLoading }: StatTilesProps) {
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
            Observed Corpus
          </span>
          <span className="material-symbols-outlined text-[20px] text-secondary">inventory_2</span>
        </div>
        <div>
          <div className="font-display-kpi text-display-kpi text-on-surface leading-none mb-1 opacity-40">—</div>
          <div className="font-body-medium text-body-medium text-on-surface">listings collected</div>
          <div className="font-caption-sm text-caption-sm text-secondary mt-0.5">
            Not available yet — raw pre-cleaning count is not exposed by the API
          </div>
        </div>
      </div>

      {/* Modeling yield — usable count is real; the yield % needs the raw
          collected count, so it stays an honest dash. */}
      <div className="rounded-lg bg-surface-container-lowest p-space-md shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <span className="font-label-uppercase text-label-uppercase text-primary tracking-wider uppercase">
            Modeling Yield
          </span>
          <span className="material-symbols-outlined text-[20px] text-primary-container">check_circle</span>
        </div>
        <div>
          <div className="font-display-kpi text-display-kpi text-primary-container leading-none mb-1">
            {nUsable != null ? nUsable.toLocaleString('en-KE') : '—'}
          </div>
          <div className="font-body-medium text-body-medium text-on-surface">usable (price and size valid)</div>
          <div className="font-caption-sm text-caption-sm text-secondary mt-0.5">
            Yield rate needs the raw collected count — not available yet
          </div>
        </div>
      </div>

      {/* County coverage */}
      <div className="rounded-lg bg-surface-container-lowest p-space-md shadow-sm flex flex-col justify-between">
        {/* flex-wrap so the threshold badge drops under the label on narrow
            2-col mobile tiles instead of overflowing the tile edge. */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <span className="font-label-uppercase text-label-uppercase text-secondary uppercase tracking-wider">
            County Coverage
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant font-caption-sm text-caption-sm font-medium">
            ≥ 10 listings threshold
          </span>
        </div>
        <div>
          <div className="font-display-kpi text-display-kpi text-on-surface leading-none mb-1">
            {nCountiesReady != null ? nCountiesReady : '—'}
          </div>
          <div className="font-body-medium text-body-medium text-on-surface">counties with enough data</div>
          <div className="font-caption-sm text-caption-sm text-secondary mt-0.5">Meets modeling quorum</div>
        </div>
      </div>

      {/* Sanitization — red accent; count is the real flagged count. */}
      <div className="rounded-lg bg-surface-container-lowest p-space-md shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <span className="font-label-uppercase text-label-uppercase text-error uppercase tracking-wider">
            Sanitization
          </span>
          <span className="material-symbols-outlined text-[20px] text-primary-container">flag</span>
        </div>
        <div>
          <div className="font-display-kpi text-display-kpi text-on-surface leading-none mb-1">
            {nFlagged != null ? nFlagged.toLocaleString('en-KE') : '—'}
          </div>
          <div className="font-body-medium text-body-medium text-on-surface">flagged as possible errors</div>
          <div className="font-caption-sm text-caption-sm text-secondary mt-0.5">Excluded from model training</div>
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
  nUsable: number | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const worst = rows[0];
  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-headline-section text-headline-section text-on-surface font-medium">
            Missing values by feature
          </h2>
          <span className="font-label-metric text-label-metric text-secondary">
            {nUsable != null ? `N = ${nUsable.toLocaleString('en-KE')} usable` : ''}
          </span>
        </div>
        <p className="font-body-regular text-body-regular text-secondary mb-space-md">
          Completeness across the usable listings in the model training set
        </p>

        {isLoading ? (
          <LoadingSkeleton className="h-64 w-full rounded-md" />
        ) : isError ? (
          <EmptyState
            icon="cloud_off"
            title="Couldn't load feature evaluation"
            message="The feature-evaluation feed is unavailable."
            actionLabel="Retry"
            onAction={onRetry}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="rule"
            title="No feature evaluation data"
            message="Feature completeness is not available right now."
          />
        ) : (
          <div className="flex flex-col gap-space-sm">
            {rows.map((r) => (
              <div key={r.feature} className="flex flex-col gap-1">
                <div className="flex justify-between items-center font-body-medium text-body-medium">
                  <span className={`truncate ${r.severe ? 'text-on-surface font-medium' : 'text-on-surface font-medium'}`}>
                    {r.feature}
                  </span>
                  {r.missingPct <= 0 ? (
                    <span className="text-tertiary font-semibold flex items-center gap-1 whitespace-nowrap">
                      <span className="material-symbols-outlined text-[14px]">check</span> 0% missing
                    </span>
                  ) : (
                    <span
                      className={`whitespace-nowrap ${
                        r.severe ? 'text-primary-container font-semibold' : 'text-secondary font-medium'
                      }`}
                    >
                      {r.missingPct.toFixed(0)}% missing
                    </span>
                  )}
                </div>
                {r.missingPct <= 0 ? (
                  <div className="h-2 w-full bg-tertiary/20 rounded-full overflow-hidden">
                    <div className="h-full w-full bg-tertiary rounded-full" />
                  </div>
                ) : r.severe ? (
                  /* Worst feature: full orange bar. */
                  <div className="h-4 w-full bg-surface-container rounded-full overflow-hidden p-0.5">
                    <div
                      className="h-full rounded-full bg-primary-container"
                      style={{ width: `${Math.min(100, r.missingPct)}%` }}
                    />
                  </div>
                ) : (
                  /* Muted rows: hatched proportion (P1 hatch approach, as a
                     CSS repeating-linear-gradient). */
                  <div className="h-3 w-full bg-surface-container rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(2, Math.min(100, r.missingPct))}%`,
                        backgroundImage:
                          'repeating-linear-gradient(45deg, #e8742a 0, #e8742a 2.5px, transparent 2.5px, transparent 8px)',
                      }}
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
                  {worst.missingPct.toFixed(0)}% missing — {worst.feature} is excluded from the primary
                  ensemble models
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
  return Math.max(0, Math.min(100, ((Math.log10(value) - lo) / (hi - lo)) * 100));
}

function PriceDistributionCard({
  query,
  nUsable,
}: {
  query: ReturnType<typeof usePriceDistribution>;
  nUsable: number | undefined;
}) {
  const { data, isLoading, isError, refetch } = query;
  const bins: PriceBin[] = data?.bins ?? [];
  const maxCount = Math.max(1, ...bins.map((b) => b.count));

  // Bin colour ramps from pale (#dec1b3) through #ffb68f / #e8742a to
  // #9d4400 as the bin approaches the modal height — per the design.
  function barFill(count: number): string {
    const rel = count / maxCount;
    if (rel <= 0.05) return '#dec1b3';
    if (rel <= 0.2) return '#ffb68f';
    if (rel <= 0.45) return '#e8742a';
    return '#9d4400';
  }

  const chartData = bins.map((b) => ({
    label: `${compactKSh(b.lower_ksh)} – ${compactKSh(b.upper_ksh)}`,
    count: b.count,
    fill: barFill(b.count),
  }));

  const p = data?.percentiles;

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-headline-section text-headline-section text-on-surface font-medium">
            Price per acre distribution
          </h2>
          <span className="font-label-metric text-label-metric text-secondary">Log10 Scale</span>
        </div>
        <p className="font-body-regular text-body-regular text-secondary mb-4">
          Log-scale histogram of asking prices across all{' '}
          {nUsable != null ? nUsable.toLocaleString('en-KE') : '—'} usable listings
        </p>

        {isLoading ? (
          <LoadingSkeleton className="h-56 w-full rounded-md" />
        ) : isError ? (
          <EmptyState
            icon="cloud_off"
            title="Couldn't load price distribution"
            message="The price-distribution feed is unavailable."
            actionLabel="Retry"
            onAction={() => refetch()}
          />
        ) : bins.length === 0 ? (
          <EmptyState
            icon="bar_chart"
            title="No usable prices"
            message="There are no usable per-acre prices to chart."
          />
        ) : (
          <>
            <div className="relative w-full h-56 mt-2">
              {bins.length > 1 && p && (
                <>
                  {/* p1 / p99 dashed reference lines (design) — positioned on
                      the same log10 axis as the median pill. */}
                  {[p.p1, p.p99].map((v) => (
                    <div
                      key={v}
                      className="absolute top-0 bottom-0 w-px pointer-events-none"
                      style={{
                        left: `${logPos(v, bins)}%`,
                        borderLeft: '1.5px dashed #8a7266',
                      }}
                    />
                  ))}
                </>
              )}
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 24, right: 4, bottom: 0, left: 4 }}>
                  <XAxis dataKey="label" hide />
                  <YAxis hide />
                  <Tooltip content={<PriceTooltip />} cursor={{ fill: 'rgba(27,21,18,0.04)' }} />
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
                  <span className="font-label-metric text-[12px] font-medium">Median {compactKSh(p.p50)}</span>
                </div>
              )}
            </div>
            {/* Percentile chips: p1/p50/p99 on web (p10/p50/p90 on mobile). */}
            {p && (
              <>
                <div className="hidden md:grid grid-cols-3 gap-2 py-1">
                  <PctTile label="p1 (1% low)" value={compactKSh(p.p1)} />
                  <PctTile label="Median (p50)" value={compactKSh(p.p50)} highlight />
                  <PctTile label="p99 (99% high)" value={compactKSh(p.p99)} />
                </div>
                <div className="grid md:hidden grid-cols-3 gap-2 py-1">
                  <PctTile label="p10 Lowest" value={compactKSh(p.p10)} />
                  <PctTile label="Median p50" value={compactKSh(p.p50)} highlight />
                  <PctTile label="p90 Highest" value={compactKSh(p.p90)} />
                </div>
              </>
            )}
            {/* Axis ticks on the log scale. */}
            {bins.length > 1 && (
              <div className="flex justify-between items-center text-secondary font-label-metric text-[12px] pt-2 px-1">
                <span>{compactKSh(bins[0].lower_ksh)}</span>
                <span>{compactKSh(bins[Math.floor(bins.length / 2)].lower_ksh)}</span>
                <span>{compactKSh(bins[bins.length - 1].upper_ksh)}</span>
              </div>
            )}
          </>
        )}

        {/* Explanatory note — only the generic sentence; the design's
            "middle 80% between KSh X and Y" numbers would need real p10/p90
            values inserted, which we do when percentiles exist. */}
        {p && (
          <div className="mt-4 p-3 rounded bg-surface-container-low flex items-start gap-2">
            <span className="material-symbols-outlined text-primary-container text-[18px] shrink-0 mt-0.5">analytics</span>
            <p className="font-caption-sm text-caption-sm text-on-surface-variant">
              The middle 80% of properties reside between {compactKSh(p.p10)} and {compactKSh(p.p90)}{' '}
              per acre. Applying a logarithmic transformation yields near-normal symmetry, stabilizing
              subsequent predictive estimators.
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
