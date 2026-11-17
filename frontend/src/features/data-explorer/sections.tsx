/**
 * Data Explorer lower sections — Listings per county, Where the data
 * comes from, Listings & Medians by County table, and the mobile
 * Listing sample records card. Kept in a sibling module so index.tsx
 * stays readable; all components are page-private.
 */
import type { ReactNode } from 'react';

import { EmptyState, LoadingSkeleton, ValuationCard } from '@/components';

import { compactKSh, shortNum, type CountyRow } from './helpers';

/** P1 hatch approach: muted diagonal hatch as a CSS gradient. */
const MUTED_HATCH =
  'repeating-linear-gradient(45deg, #dec1b3 0, #dec1b3 2px, transparent 2px, transparent 8px)';

// ----------------------------------------------------------------------
// 5. Listings per county
// ----------------------------------------------------------------------

const TOP_N_COUNTY_BARS = 14;

export function ListingsPerCountyCard({
  rows,
  threshold,
  isLoading,
  isError,
  onRetry,
}: {
  rows: CountyRow[];
  threshold: number;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  if (isLoading) {
    return (
      <ValuationCard noPadding>
        <div className="p-space-lg">
          <LoadingSkeleton className="h-72 w-full rounded-md" />
        </div>
      </ValuationCard>
    );
  }
  if (isError) {
    return (
      <EmptyState
        icon="cloud_off"
        title="Couldn't load county counts"
        message="The county row-counts feed is unavailable."
        actionLabel="Retry"
        onAction={onRetry}
      />
    );
  }

  const sorted = [...rows].sort((a, b) => b.nListings - a.nListings);
  const above = sorted.filter((r) => r.modelReady);
  const below = sorted.filter((r) => !r.modelReady);
  const maxN = Math.max(1, ...sorted.map((r) => r.nListings));
  // The threshold divider sits at the threshold share of the max bar.
  const thresholdPct = Math.max(2, (threshold / maxN) * 100);

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
          <h2 className="font-headline-section text-headline-section text-on-surface font-medium">
            Listings per county
          </h2>
          <span className="font-label-metric text-label-metric text-secondary">
            {rows.length} Counties Tracked
          </span>
        </div>
        <p className="font-body-regular text-body-regular text-secondary mb-space-md">
          Sample count across counties. Valid modeling requires ≥ {threshold} listings.
        </p>

        <div className="relative w-full">
          {/* Threshold divider line + label. */}
          <div
            className="absolute top-0 bottom-6 w-px border-l-2 border-dashed border-primary-container/40 z-10 pointer-events-none"
            style={{ left: `calc(25% + ${thresholdPct * 0.5}% * 2)` }}
          >
            <div className="absolute -top-5 -left-14 bg-surface-container-high text-on-surface font-caption-sm text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap">
              Threshold: ≥ {threshold} listings
            </div>
          </div>

          <div className="flex flex-col gap-2 font-label-metric text-[12px] pb-6">
            {above.slice(0, TOP_N_COUNTY_BARS).map((r) => (
              <div key={r.county} className="grid grid-cols-12 items-center gap-2">
                <span className="col-span-3 text-right truncate text-on-surface font-medium">{r.county}</span>
                <div className="col-span-8 h-4 bg-surface-container-low rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-container rounded-full"
                    style={{ width: `${(r.nListings / maxN) * 100}%` }}
                  />
                </div>
                <span className="col-span-1 text-on-surface font-semibold">{r.nListings}</span>
              </div>
            ))}

            {/* Below-threshold counties: muted + hatched, listed under the
                threshold divider (m12 layout). */}
            {below.length > 0 && (
              <div className="flex items-center gap-2 pt-2 pb-1">
                <span className="font-caption-sm text-caption-sm text-secondary whitespace-nowrap">
                  Minimum threshold ({threshold} listings)
                </span>
                <div className="h-0.5 w-6" style={{ backgroundImage: MUTED_HATCH.replace('45deg', 'to right').replace('#dec1b3 0, #dec1b3 2px', '#8a7266 0, #8a7266 6px').replace('transparent 2px, transparent 8px', 'transparent 6px, transparent 10px') }} />
              </div>
            )}
            {below.map((r) => (
              <div key={r.county} className="grid grid-cols-12 items-center gap-2 opacity-60">
                <span className="col-span-3 text-right truncate text-secondary">{r.county}</span>
                <div className="col-span-8 h-4 bg-surface-container-low rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(1.5, (r.nListings / maxN) * 100)}%`, backgroundImage: MUTED_HATCH }}
                  />
                </div>
                <span className="col-span-1 text-secondary">{r.nListings}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-3 text-secondary font-caption-sm text-caption-sm flex items-center justify-between flex-wrap gap-2">
          <span>*Counties with &lt; {threshold} listings displayed with muted diagonal pattern</span>
          <span>Showing top {Math.min(TOP_N_COUNTY_BARS, above.length)} displayed</span>
        </div>
      </div>
    </ValuationCard>
  );
}

// ----------------------------------------------------------------------
// 6. Where the data comes from — frame + honest unavailable state
// ----------------------------------------------------------------------

export function ProvenanceCard() {
  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-headline-section text-headline-section text-on-surface font-medium">
            Where the data comes from
          </h2>
          <span className="material-symbols-outlined text-secondary text-[20px]">share_location</span>
        </div>
        <p className="font-body-regular text-body-regular text-secondary mb-space-md">
          Corpus provenance, spatial resolution, and extraction methods
        </p>

        {(
          [
            {
              n: '1',
              title: 'Location accuracy',
              sub: 'Spatial resolution',
              designShares: ['Exact coordinates (68%)', 'Sub-county centroid (24%)', 'County fallback (8%)'],
            },
            {
              n: '2',
              title: 'How size was found',
              sub: 'Parsing logic',
              designShares: ['Direct acre field (72%)', 'Converted ha/sqm (21%)', 'Regex parsed (7%)'],
            },
            {
              n: '3',
              title: 'Asking price structure',
              sub: 'Normalization basis',
              designShares: ['Total asking price (84%)', 'Stated rate / acre (16%)'],
            },
          ] as const
        ).map((row) => (
          <div key={row.n} className="flex flex-col gap-2 mb-space-md last:mb-0">
            <div className="flex justify-between items-center">
              <span className="font-body-medium text-body-medium text-on-surface font-medium">
                {row.n}. {row.title}
              </span>
              <span className="font-caption-sm text-caption-sm text-secondary">{row.sub}</span>
            </div>
            {/* The design's stacked share bars are shown muted + hatched to
                signal "shape exists, numbers unavailable". */}
            <div className="h-5 w-full flex rounded-full overflow-hidden p-0.5 bg-surface-container-low opacity-50">
              <div className="h-full rounded-l-full" style={{ width: '60%', backgroundImage: MUTED_HATCH }} />
              <div className="h-full" style={{ width: '28%', backgroundImage: MUTED_HATCH }} />
              <div className="h-full rounded-r-full" style={{ width: '12%', backgroundImage: MUTED_HATCH }} />
            </div>
            <div className="font-caption-sm text-caption-sm text-secondary">
              Not available yet — the extraction provenance shares are not recorded in the exported
              dataset (the design's {row.designShares.length}-way split cannot be computed).
            </div>
          </div>
        ))}

        {/* Pipeline strip: no version number exists for the extraction
            pipeline; "View Spec" links to the About page's methodology. */}
        <div className="mt-6 p-space-sm rounded-lg bg-surface-container-low flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">verified</span>
            <span className="font-caption-sm text-caption-sm text-on-surface">
              Data extraction automated pipeline active
            </span>
          </div>
          <a
            href="/about"
            className="font-caption-sm text-caption-sm font-semibold text-primary cursor-pointer hover:underline"
          >
            View Spec
          </a>
        </div>
      </div>
    </ValuationCard>
  );
}

// ----------------------------------------------------------------------
// 7. Listings & Medians by County table
// ----------------------------------------------------------------------

export function CountyTableCard({
  rows,
  totalPages,
  tablePage,
  onPage,
  totalRows,
  nModelReady,
  threshold,
  isLoading,
  isError,
  onRetry,
  onDownload,
}: {
  rows: CountyRow[];
  totalPages: number;
  tablePage: number;
  onPage: (p: number) => void;
  totalRows: number;
  nModelReady: number;
  threshold: number;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onDownload: () => void;
}) {
  if (isLoading) {
    return (
      <ValuationCard noPadding>
        <div className="p-space-lg">
          <LoadingSkeleton className="h-64 w-full rounded-md" />
        </div>
      </ValuationCard>
    );
  }
  if (isError) {
    return (
      <EmptyState
        icon="cloud_off"
        title="Couldn't load county figures"
        message="The county summary feed is unavailable."
        actionLabel="Retry"
        onAction={onRetry}
      />
    );
  }
  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="font-headline-section text-headline-section text-on-surface font-medium">
              Listings &amp; Medians by County
            </h2>
            <p className="font-body-regular text-body-regular text-secondary">
              Benchmark figures across counties. Counties below {threshold} listings are masked from model
              inference.
            </p>
          </div>
          <button
            type="button"
            onClick={onDownload}
            className="self-start sm:self-auto rounded-full px-4 py-2 bg-surface-container hover:bg-surface-container-high text-on-surface font-body-medium text-[12px] flex items-center gap-1.5 transition-all shadow-xs"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            Download CSV
          </button>
        </div>

        <div className="overflow-x-auto -mx-space-lg px-space-lg mt-2 hidden md:block">
          <table className="w-full text-left font-body-regular text-body-regular">
            <thead>
              <tr className="bg-surface-container-low/60 text-secondary font-label-uppercase text-[12px] uppercase tracking-wider">
                <th className="py-3 px-4 rounded-l-full font-medium">County</th>
                <th className="py-3 px-4 font-medium">Listings Count</th>
                <th className="py-3 px-4 font-medium">Median per acre</th>
                <th className="py-3 px-4 font-medium">Middle half (IQR)</th>
                <th className="py-3 px-4 rounded-r-full font-medium">Status / Modeling Eligibility</th>
              </tr>
            </thead>
            <tbody className="text-[14px]">
              {rows.map((r) => (
                <tr
                  key={r.county}
                  className={`hover:bg-surface-container-low/40 transition-colors ${r.modelReady ? '' : 'opacity-70'}`}
                >
                  <td className="py-3 px-4 font-body-medium text-on-surface font-medium flex items-center gap-2">
                    {r.modelReady && <span className="w-1.5 h-1.5 rounded-full bg-primary-container" />}
                    <span className={r.modelReady ? 'text-on-surface' : 'text-secondary'}>{r.county}</span>
                  </td>
                  <td className={`py-3 px-4 font-semibold ${r.modelReady ? 'text-on-surface' : 'text-secondary'}`}>
                    {r.nListings}
                  </td>
                  <td className={`py-3 px-4 ${r.modelReady ? 'text-on-surface' : 'text-secondary'}`}>
                    {r.median != null ? compactKSh(r.median) : '—'}
                  </td>
                  <td className="py-3 px-4 text-secondary">
                    {r.q1 != null && r.q3 != null
                      ? `${shortNum(r.q1)} – ${shortNum(r.q3)}`
                      : '—'}
                  </td>
                  <td className="py-3 px-4">
                    {r.modelReady ? (
                      <span className="inline-flex items-center gap-1.5 bg-tertiary/10 text-tertiary text-[12px] px-3 py-0.5 rounded-full font-body-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
                        Model Ready
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 bg-surface-container-high text-secondary text-[12px] px-3 py-0.5 rounded-full font-body-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                        Not enough data
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile (below md): summary rows instead of the wide table. */}
        <div className="flex flex-col gap-2 md:hidden mt-2">
          {rows.map((r) => (
            <div key={r.county} className={`flex justify-between items-center p-3 rounded-lg bg-surface-container-low ${r.modelReady ? '' : 'opacity-70'}`}>
              <div className="flex flex-col">
                <span className={`font-body-medium text-body-medium ${r.modelReady ? 'text-on-surface' : 'text-secondary'}`}>
                  {r.county}
                </span>
                <span className="font-caption-sm text-caption-sm text-secondary">
                  {r.nListings} listings{r.median != null ? ` · median ${compactKSh(r.median)}` : ''}
                </span>
              </div>
              {r.modelReady ? (
                <span className="inline-flex items-center gap-1.5 bg-tertiary/10 text-tertiary text-[12px] px-3 py-0.5 rounded-full font-body-medium">
                  Model Ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 bg-surface-container-high text-secondary text-[12px] px-3 py-0.5 rounded-full font-body-medium">
                  Not enough data
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Pagination footer. */}
        <div className="flex flex-col sm:flex-row items-center justify-between pt-2 text-secondary font-caption-sm text-caption-sm gap-2">
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <span>
              Showing {rows.length > 0 ? (tablePage - 1) * rows.length + 1 : 0}–{(tablePage - 1) * rows.length + rows.length} of {totalRows} counties
            </span>
            <span>•</span>
            <span className="font-medium text-on-surface">
              {nModelReady} counties meet the ≥{threshold} listings threshold
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous page"
              disabled={tablePage <= 1}
              onClick={() => onPage(tablePage - 1)}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-surface-container hover:bg-surface-container-high text-on-surface transition-all disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[16px]">chevron_left</span>
            </button>
            <span className="px-2 font-medium text-on-surface">
              Page {tablePage} of {totalPages}
            </span>
            <button
              type="button"
              aria-label="Next page"
              disabled={tablePage >= totalPages}
              onClick={() => onPage(tablePage + 1)}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-surface-container hover:bg-surface-container-high text-on-surface transition-all disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </ValuationCard>
  );
}

// ----------------------------------------------------------------------
// 8. Mobile sample records (m12 "Listing sample records")
// ----------------------------------------------------------------------

export function SampleRecordsCard({
  rows,
  isLoading,
  isError,
  onRetry,
}: {
  rows: Array<{
    title: string | null;
    location: string | null;
    county: string | null;
    prop_type: string | null;
    size_acres: number;
    listed_price_per_acre_ksh: number;
    data_quality_flag: boolean;
  }>;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  return (
    <ValuationCard noPadding>
      <div className="p-space-lg flex flex-col space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-title-card text-title-card text-on-surface font-medium">
              Listing sample records
            </span>
            <span className="font-label-metric text-label-metric text-on-surface-variant">
              Validated tabular inputs
            </span>
          </div>
          <span className="font-caption-sm text-caption-sm text-secondary">
            First {rows.length || '—'} of the scored feed
          </span>
        </div>

        {isLoading ? (
          <LoadingSkeleton className="h-48 w-full rounded-md" />
        ) : isError ? (
          <EmptyState
            icon="cloud_off"
            title="Couldn't load sample records"
            message="The scored listings feed is unavailable."
            actionLabel="Retry"
            onAction={onRetry}
          />
        ) : rows.length === 0 ? (
          <p className="text-caption-sm text-secondary py-2">No sample records available.</p>
        ) : (
          <div className="space-y-3 pt-1">
            {rows.map((r, i) => {
              const name = r.title || r.location || r.county || `Listing ${i + 1}`;
              const sub = [`${r.size_acres} ac`, r.prop_type].filter(Boolean).join(' • ');
              return (
                <div
                  key={i}
                  className="p-3.5 rounded-lg bg-surface-container-low flex flex-col space-y-2.5 hover:bg-surface-container transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-body-medium text-body-medium text-on-surface font-semibold block">
                        {name}
                      </span>
                      <span className="font-label-metric text-label-metric text-on-surface-variant">{sub}</span>
                    </div>
                    {r.data_quality_flag ? (
                      <span className="px-2.5 py-1 rounded-full bg-primary-fixed text-on-primary-fixed font-label-metric text-label-metric font-medium flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">flag</span> Flagged
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-label-metric text-label-metric font-medium flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">verified</span> Verified clean
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="font-label-metric text-label-metric text-on-surface-variant">
                      Asking price
                    </span>
                    <span className="font-body-medium text-body-medium text-primary font-bold">
                      {compactKSh(r.listed_price_per_acre_ksh)} / ac
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ValuationCard>
  );
}

/** Small helper so sections can be conditionally wrapped without noise. */
export function Section({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
