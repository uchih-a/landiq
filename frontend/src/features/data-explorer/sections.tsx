/**
 * Data Explorer lower sections — Listings per county, Where the data
 * comes from, Listings & Medians by County table, and the mobile
 * Listing sample records card. Kept in a sibling module so index.tsx
 * stays readable; all components are page-private.
 *
 * P7b: every string renders from i18n; the threshold is `number | null`
 * (null hides the threshold divider + ready/not-ready statuses and shows
 * "threshold not available"); money uses the shared currency-aware
 * formatter; bars carry sr-only text alternatives (county, count, status)
 * so colour is never the only encoding.
 */
import { useTranslation } from 'react-i18next';

import { EmptyState, LoadingSkeleton, ValuationCard } from '@/components';
import { formatCompactMoney, useCurrency } from '@/lib/currency/format';
import { useFormatNumber } from '@/lib/i18n/useLocale';
import {
  CHART_COLOR_OUTLINE,
  CHART_COLOR_RAMP_PALE,
} from '@/lib/ui/chart-tokens';

import type { CountyRow } from './helpers';

/** P1 hatch approach: muted diagonal hatch as a CSS gradient (tokens). */
const MUTED_HATCH =
  `repeating-linear-gradient(45deg, ${CHART_COLOR_RAMP_PALE} 0, ${CHART_COLOR_RAMP_PALE} 2px, transparent 2px, transparent 8px)`;

/** How many above-threshold bars the county chart renders — display
 *  density, not a data fact (the count is also printed as text). */
const TOP_N_COUNTY_BARS = 14;

/** Rows-per-page mirror of index.tsx's PAGE_SIZE (display density). */
const PAGE_ROWS = 10;

// ----------------------------------------------------------------------
// 5. Listings per county
// ----------------------------------------------------------------------

export function ListingsPerCountyCard({
  rows,
  threshold,
  isLoading,
  isError,
  onRetry,
}: {
  rows: CountyRow[];
  threshold: number | null;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const formatNumber = useFormatNumber();
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
        title={t('de.counties.errorTitle')}
        message={t('de.counties.errorMessage')}
        actionLabel={t('common.retry')}
        onAction={onRetry}
      />
    );
  }

  const sorted = [...rows].sort((a, b) => b.nListings - a.nListings);
  // Null threshold: NO ready/not-ready split (an honest unknown), one
  // plain list by count.
  const above = threshold == null ? sorted : sorted.filter((r) => r.modelReady === true);
  const below = threshold == null ? [] : sorted.filter((r) => r.modelReady !== true);
  const maxN = Math.max(1, ...sorted.map((r) => r.nListings));
  // VISUAL MINIMUM ONLY (P7b-E): the divider needs a visible line even
  // when the threshold is tiny relative to the tallest bar; the label
  // prints the real number, so the clamp cannot misrepresent it.
  const thresholdPct = Math.max(2, threshold == null ? 0 : (threshold / maxN) * 100);

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
          <h2 className="font-headline-section text-headline-section text-on-surface font-medium">
            {t('de.counties.title')}
          </h2>
          <span className="font-label-metric text-label-metric text-secondary">
            {t('de.counties.tracked', { n: formatNumber(rows.length) })}
          </span>
        </div>
        <p className="font-body-regular text-body-regular text-secondary mb-space-md">
          {threshold != null
            ? t('de.counties.subtitle', { threshold: formatNumber(threshold) })
            : t('de.counties.subtitleUnavailable')}
        </p>

        <div className="relative w-full">
          {/* Threshold divider line + label — hidden entirely when the
              threshold is null (no invented divider position). */}
          {threshold != null && (
            <div
              className="absolute top-0 bottom-6 w-px border-l-2 border-dashed border-primary-container/40 z-10 pointer-events-none"
              style={{ left: `calc(25% + ${thresholdPct * 0.5}% * 2)` }}
            >
              <div className="absolute -top-5 -left-14 bg-surface-container-high text-on-surface font-caption-sm text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap">
                {t('de.counties.thresholdLabel', { threshold: formatNumber(threshold) })}
              </div>
            </div>
          )}

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
                <span className="col-span-1 text-on-surface font-semibold">{formatNumber(r.nListings)}</span>
              </div>
            ))}

            {/* Below-threshold counties: muted + hatched, listed under the
                threshold divider (m12 layout). */}
            {below.length > 0 && threshold != null && (
              <div className="flex items-center gap-2 pt-2 pb-1">
                <span className="font-caption-sm text-caption-sm text-secondary whitespace-nowrap">
                  {t('de.counties.belowLabel', { threshold: formatNumber(threshold) })}
                </span>
                <div
                  className="h-0.5 w-6"
                  style={{
                    backgroundImage: `repeating-linear-gradient(to right, ${CHART_COLOR_OUTLINE} 0, ${CHART_COLOR_OUTLINE} 6px, transparent 6px, transparent 10px)`,
                  }}
                />
              </div>
            )}
            {below.map((r) => (
              <div key={r.county} className="grid grid-cols-12 items-center gap-2 opacity-60">
                <span className="col-span-3 text-right truncate text-secondary">{r.county}</span>
                <div className="col-span-8 h-4 bg-surface-container-low rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      // VISUAL MINIMUM WIDTH ONLY (P7b-E): a county with
                      // just a listing or two must still show a sliver of
                      // bar; its exact count is printed as text right of
                      // the bar, so the clamp cannot make it look bigger
                      // than it is.
                      width: `${Math.max(1.5, (r.nListings / maxN) * 100)}%`,
                      backgroundImage: MUTED_HATCH,
                    }}
                  />
                </div>
                <span className="col-span-1 text-secondary">{formatNumber(r.nListings)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Hidden text alternative for the bar chart (P7b-L): every
            rendered county with its count and status as plain text. */}
        <p className="sr-only">
          {t('de.counties.a11ySummary', {
            list: above
              .slice(0, TOP_N_COUNTY_BARS)
              .map((r) => `${r.county}: ${formatNumber(r.nListings)}`)
              .join('; '),
          })}
        </p>

        <div className="pt-3 text-secondary font-caption-sm text-caption-sm flex items-center justify-between flex-wrap gap-2">
          {threshold != null ? (
            <span>{t('de.counties.note', { threshold: formatNumber(threshold) })}</span>
          ) : (
            <span>{t('de.counties.subtitleUnavailable')}</span>
          )}
          <span>{t('de.counties.showing', { n: Math.min(TOP_N_COUNTY_BARS, above.length) })}</span>
        </div>
      </div>
    </ValuationCard>
  );
}

// ----------------------------------------------------------------------
// 6. Where the data comes from — frame + honest unavailable state
// ----------------------------------------------------------------------

export function ProvenanceCard() {
  const { t } = useTranslation();
  const rows = [
    { n: 1, title: t('de.provenance.row1'), sub: t('de.provenance.row1sub'), ways: 3 },
    { n: 2, title: t('de.provenance.row2'), sub: t('de.provenance.row2sub'), ways: 3 },
    { n: 3, title: t('de.provenance.row3'), sub: t('de.provenance.row3sub'), ways: 2 },
  ] as const;
  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-headline-section text-headline-section text-on-surface font-medium">
            {t('de.provenance.title')}
          </h2>
          <span className="material-symbols-outlined text-secondary text-[20px]">share_location</span>
        </div>
        <p className="font-body-regular text-body-regular text-secondary mb-space-md">
          {t('de.provenance.subtitle')}
        </p>

        {rows.map((row) => (
          <div key={row.n} className="flex flex-col gap-2 mb-space-md last:mb-0">
            <div className="flex justify-between items-center">
              <span className="font-body-medium text-body-medium text-on-surface font-medium">
                {row.n}. {row.title}
              </span>
              <span className="font-caption-sm text-caption-sm text-secondary">{row.sub}</span>
            </div>
            {/* The design's stacked share bars are shown muted + hatched to
                signal "shape exists, numbers unavailable". */}
            <div className="h-5 w-full flex rounded-full overflow-hidden p-0.5 bg-surface-container-low opacity-50" aria-hidden="true">
              <div className="h-full rounded-l-full" style={{ width: '60%', backgroundImage: MUTED_HATCH }} />
              <div className="h-full" style={{ width: '28%', backgroundImage: MUTED_HATCH }} />
              <div className="h-full rounded-r-full" style={{ width: '12%', backgroundImage: MUTED_HATCH }} />
            </div>
            <div className="font-caption-sm text-caption-sm text-secondary">
              {t('de.provenance.unavailable', { n: row.ways })}
            </div>
          </div>
        ))}

        {/* Pipeline strip: no version number exists for the extraction
            pipeline; "View Spec" links to the About page's methodology. */}
        <div className="mt-6 p-space-sm rounded-lg bg-surface-container-low flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">verified</span>
            <span className="font-caption-sm text-caption-sm text-on-surface">
              {t('de.provenance.pipeline')}
            </span>
          </div>
          <a
            href="/about"
            className="font-caption-sm text-caption-sm font-semibold text-primary cursor-pointer hover:underline"
          >
            {t('de.provenance.viewSpec')}
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
  nModelReady: number | null;
  threshold: number | null;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onDownload: () => void;
}) {
  const { t } = useTranslation();
  const formatNumber = useFormatNumber();
  const { currency } = useCurrency();
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
        title={t('de.table.errorTitle')}
        message={t('de.table.errorMessage')}
        actionLabel={t('common.retry')}
        onAction={onRetry}
      />
    );
  }
  const from = rows.length > 0 ? (tablePage - 1) * PAGE_ROWS + 1 : 0;
  const to = (tablePage - 1) * PAGE_ROWS + rows.length;
  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="font-headline-section text-headline-section text-on-surface font-medium">
              {t('de.table.title')}
            </h2>
            <p className="font-body-regular text-body-regular text-secondary">
              {threshold != null
                ? t('de.table.subtitle', { threshold: formatNumber(threshold) })
                : t('de.table.subtitleUnavailable')}
            </p>
          </div>
          <button
            type="button"
            onClick={onDownload}
            className="self-start sm:self-auto rounded-full px-4 py-2 bg-surface-container hover:bg-surface-container-high text-on-surface font-body-medium text-[12px] flex items-center gap-1.5 transition-all shadow-xs"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            {t('de.table.download')}
          </button>
        </div>

        <div className="overflow-x-auto -mx-space-lg px-space-lg mt-2 hidden md:block">
          <table className="w-full text-left font-body-regular text-body-regular">
            <thead>
              <tr className="bg-surface-container-low/60 text-secondary font-label-uppercase text-[12px] uppercase tracking-wider">
                <th className="py-3 px-4 rounded-l-full font-medium">{t('de.table.col.county')}</th>
                <th className="py-3 px-4 font-medium">{t('de.table.col.listings')}</th>
                <th className="py-3 px-4 font-medium">{t('de.table.col.median')}</th>
                <th className="py-3 px-4 font-medium">{t('de.table.col.iqr')}</th>
                <th className="py-3 px-4 rounded-r-full font-medium">{t('de.table.col.status')}</th>
              </tr>
            </thead>
            <tbody className="text-[14px]">
              {rows.map((r) => (
                <tr
                  key={r.county}
                  className={`hover:bg-surface-container-low/40 transition-colors ${r.modelReady !== false ? '' : 'opacity-70'}`}
                >
                  <td className="py-3 px-4 font-body-medium text-on-surface font-medium flex items-center gap-2">
                    {r.modelReady === true && <span className="w-1.5 h-1.5 rounded-full bg-primary-container" />}
                    <span className={r.modelReady === false ? 'text-secondary' : 'text-on-surface'}>{r.county}</span>
                  </td>
                  <td className={`py-3 px-4 font-semibold ${r.modelReady === false ? 'text-secondary' : 'text-on-surface'}`}>
                    {formatNumber(r.nListings)}
                  </td>
                  <td className={`py-3 px-4 ${r.modelReady === false ? 'text-secondary' : 'text-on-surface'}`}>
                    {r.median != null ? formatCompactMoney(r.median, currency) : '—'}
                  </td>
                  <td className="py-3 px-4 text-secondary">
                    {r.q1 != null && r.q3 != null
                      ? `${formatCompactMoney(r.q1, currency).replace(/^(KSh|\$)\s*/, '')} – ${formatCompactMoney(r.q3, currency).replace(/^(KSh|\$)\s*/, '')}`
                      : '—'}
                  </td>
                  <td className="py-3 px-4">
                    {r.modelReady === true ? (
                      <span className="inline-flex items-center gap-1.5 bg-tertiary/10 text-tertiary text-[12px] px-3 py-0.5 rounded-full font-body-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
                        {t('de.table.status.ready')}
                      </span>
                    ) : r.modelReady === false ? (
                      <span className="inline-flex items-center gap-1.5 bg-surface-container-high text-secondary text-[12px] px-3 py-0.5 rounded-full font-body-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                        {t('de.table.status.notEnough')}
                      </span>
                    ) : (
                      // Null threshold: honest "threshold not available"
                      // instead of a guessed status (P7b-A).
                      <span className="text-secondary font-caption-sm text-caption-sm" title={t('de.table.status.unavailable')}>
                        —
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
            <div
              key={r.county}
              className={`flex justify-between items-center p-3 rounded-lg bg-surface-container-low ${r.modelReady !== false ? '' : 'opacity-70'}`}
            >
              <div className="flex flex-col">
                <span className={`font-body-medium text-body-medium ${r.modelReady === false ? 'text-secondary' : 'text-on-surface'}`}>
                  {r.county}
                </span>
                <span className="font-caption-sm text-caption-sm text-secondary">
                  {t('de.samples.listings', { n: formatNumber(r.nListings) })}
                  {r.median != null ? ` · ${t('de.price.median', { value: formatCompactMoney(r.median, currency) })}` : ''}
                </span>
              </div>
              {r.modelReady === true ? (
                <span className="inline-flex items-center gap-1.5 bg-tertiary/10 text-tertiary text-[12px] px-3 py-0.5 rounded-full font-body-medium">
                  {t('de.table.status.ready')}
                </span>
              ) : r.modelReady === false ? (
                <span className="inline-flex items-center gap-1.5 bg-surface-container-high text-secondary text-[12px] px-3 py-0.5 rounded-full font-body-medium">
                  {t('de.table.status.notEnough')}
                </span>
              ) : (
                <span className="text-secondary font-caption-sm text-caption-sm">—</span>
              )}
            </div>
          ))}
        </div>

        {/* Pagination footer. */}
        <div className="flex flex-col sm:flex-row items-center justify-between pt-2 text-secondary font-caption-sm text-caption-sm gap-2">
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <span>{t('de.table.showing', { from: formatNumber(from), to: formatNumber(to), total: formatNumber(totalRows) })}</span>
            <span>•</span>
            <span className="font-medium text-on-surface">
              {nModelReady != null && threshold != null
                ? t('de.table.meets', { n: formatNumber(nModelReady), threshold: formatNumber(threshold) })
                : t('de.table.meetsUnavailable')}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={t('de.table.prevPage')}
              disabled={tablePage <= 1}
              onClick={() => onPage(tablePage - 1)}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-surface-container hover:bg-surface-container-high text-on-surface transition-all disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[16px]">chevron_left</span>
            </button>
            <span className="px-2 font-medium text-on-surface">
              {t('de.table.page', { page: tablePage, total: totalPages })}
            </span>
            <button
              type="button"
              aria-label={t('de.table.nextPage')}
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
  const { t } = useTranslation();
  const { currency } = useCurrency();
  return (
    <ValuationCard noPadding>
      <div className="p-space-lg flex flex-col space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-title-card text-title-card text-on-surface font-medium">
              {t('de.samples.title')}
            </span>
            <span className="font-label-metric text-label-metric text-on-surface-variant">
              {t('de.samples.subtitle')}
            </span>
          </div>
          <span className="font-caption-sm text-caption-sm text-secondary">
            {rows.length > 0 ? t('de.samples.count', { n: rows.length }) : t('de.samples.countUnavailable')}
          </span>
        </div>

        {isLoading ? (
          <LoadingSkeleton className="h-48 w-full rounded-md" />
        ) : isError ? (
          <EmptyState
            icon="cloud_off"
            title={t('de.samples.errorTitle')}
            message={t('de.samples.errorMessage')}
            actionLabel={t('common.retry')}
            onAction={onRetry}
          />
        ) : rows.length === 0 ? (
          <p className="text-caption-sm text-secondary py-2">{t('de.samples.empty')}</p>
        ) : (
          <div className="space-y-3 pt-1">
            {rows.map((r, i) => {
              const name = r.title || r.location || r.county || t('de.samples.fallbackName', { n: i + 1 });
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
                        <span className="material-symbols-outlined text-[13px]">flag</span>{' '}
                        {t('de.samples.flagged')}
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-label-metric text-label-metric font-medium flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">verified</span>{' '}
                        {t('de.samples.clean')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="font-label-metric text-label-metric text-on-surface-variant">
                      {t('de.samples.asking')}
                    </span>
                    <span className="font-body-medium text-body-medium text-primary font-bold">
                      {t('de.samples.perAcre', { value: formatCompactMoney(r.listed_price_per_acre_ksh, currency) })}
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
export function Section({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
