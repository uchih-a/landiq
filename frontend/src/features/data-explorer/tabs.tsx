/**
 * Data Explorer tab panels — Table (A2), Prices (B1), Relationships (B2),
 * Locations (B3).  Each panel follows the repo convention: loading /
 * error+retry / empty states; a failed query never blanks the page.  Money
 * goes through the shared currency-aware formatter.  The min-count
 * threshold and sample size come from the response (canonical constants),
 * never typed in the UI.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Layer, Source } from 'react-map-gl/maplibre';

import { EmptyState, LoadingSkeleton, ValuationCard } from '@/components';
import { MapLibreMap } from '@/components/MapLibreMap';
import {
  useCountyBoundaries,
  useCountySummary,
  useListingsScored,
  usePriceByGroup,
  useRelationships,
} from '@/lib/api/hooks';
import type {
  ListingsScoredRow,
  ListingsSortKey,
  PriceByGroupResponse,
  RelationshipsResponse,
} from '@/lib/api/types';
import { formatCompactMoney, useCurrency } from '@/lib/currency/format';
import { useFormatNumber } from '@/lib/i18n/useLocale';
import { countyNameFromFeature, NO_DATA_BAND } from '@/features/market-insights/helpers';
import {
  CHART_COLOR_RAMP_DEEP,
  CHART_COLOR_RAMP_LIGHT,
  CHART_COLOR_RAMP_MID,
  CHART_COLOR_RAMP_PALE,
} from '@/lib/ui/chart-tokens';

/** 5-step choropleth ramp (pale -> deep) + the no-data hatch colour. */
const RAMP = [
  '#ffdbca',
  CHART_COLOR_RAMP_PALE,
  CHART_COLOR_RAMP_LIGHT,
  CHART_COLOR_RAMP_MID,
  CHART_COLOR_RAMP_DEEP,
];
const NO_DATA_HEX = NO_DATA_BAND.hexColor;

// ======================================================================
// A2 — Table tab: server-paginated, sortable table of CLEANED modelling rows
// ======================================================================

type SortKey = ListingsSortKey;
type SortOrder = 'asc' | 'desc';

const TABLE_PAGE_SIZE = 25;

export function TableTab() {
  const { t } = useTranslation();
  const formatNumber = useFormatNumber();
  const { currency } = useCurrency();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortKey>('listed_price_per_acre_ksh');
  const [order, setOrder] = useState<SortOrder>('desc');

  const q = useListingsScored({ page, page_size: TABLE_PAGE_SIZE, sort, order });

  function toggleSort(key: SortKey) {
    if (sort === key) {
      setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(key);
      setOrder('desc');
    }
  }

  if (q.isLoading) {
    return (
      <ValuationCard noPadding>
        <div className="p-space-lg">
          <LoadingSkeleton className="h-8 w-full rounded mb-2" />
          <LoadingSkeleton className="h-64 w-full rounded" />
        </div>
      </ValuationCard>
    );
  }
  if (q.isError) {
    return (
      <EmptyState
        icon="cloud_off"
        title={t('common.dataUnavailable')}
        message={t('de.price.errorMessage')}
        actionLabel={t('common.retry')}
        onAction={() => q.refetch()}
      />
    );
  }

  const rows: ListingsScoredRow[] = q.data?.listings ?? [];
  const total = q.data?.pagination?.total_rows ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / TABLE_PAGE_SIZE));

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <h2 className="font-headline-section text-headline-section text-on-surface">
          {t('de.rows.title')}
        </h2>
        <p className="font-body-regular text-body-regular text-secondary mt-1 mb-space-md">
          {t('de.rows.subtitle')}
        </p>

        {rows.length === 0 ? (
          <EmptyState icon="table_rows" title={t('de.rows.empty')} message="" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-body-medium">
                <thead>
                  <tr className="text-left text-secondary border-b border-black/10">
                    <th className="py-2 pr-3 font-label-uppercase text-label-uppercase">{t('de.rows.col.title')}</th>
                    <th className="py-2 px-3 font-label-uppercase text-label-uppercase">{t('de.rows.col.county')}</th>
                    <th className="py-2 px-3 font-label-uppercase text-label-uppercase">{t('de.rows.col.propType')}</th>
                    <SortHeader label={t('de.rows.col.size')} active={sort === 'size_acres'} order={order} onClick={() => toggleSort('size_acres')} />
                    <th className="py-2 px-3 font-label-uppercase text-label-uppercase">{t('de.rows.col.askingTotal')}</th>
                    <SortHeader label={t('de.rows.col.listedPerAcre')} active={sort === 'listed_price_per_acre_ksh'} order={order} onClick={() => toggleSort('listed_price_per_acre_ksh')} />
                    <SortHeader label={t('de.rows.col.modelPerAcre')} active={sort === 'predicted_price_per_acre_ksh'} order={order} onClick={() => toggleSort('predicted_price_per_acre_ksh')} />
                    <th className="py-2 px-3 font-label-uppercase text-label-uppercase">{t('de.rows.col.verdict')}</th>
                    <th className="py-2 px-3 font-label-uppercase text-label-uppercase">{t('de.rows.col.scoredBy')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.listing_no ?? undefined} className="border-b border-black/5">
                      <td className="py-2 pr-3 max-w-[18rem] truncate text-on-surface">{r.title ?? '—'}</td>
                      <td className="py-2 px-3 text-on-surface-variant">{r.county ?? '—'}</td>
                      <td className="py-2 px-3 text-on-surface-variant">{r.prop_type ?? '—'}</td>
                      <td className="py-2 px-3 text-on-surface-variant">{formatNumber(r.size_acres)}</td>
                      <td className="py-2 px-3 text-on-surface-variant">{r.price_ksh != null ? formatCompactMoney(r.price_ksh, currency) : '—'}</td>
                      <td className="py-2 px-3 text-on-surface">{formatCompactMoney(r.listed_price_per_acre_ksh, currency)}</td>
                      <td className="py-2 px-3 text-on-surface-variant">{formatCompactMoney(r.predicted_price_per_acre_ksh, currency)}</td>
                      <td className="py-2 px-3">
                        {/* Suspect rows show a Suspect data chip, NOT a verdict. */}
                        {r.is_suspect ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-error/15 text-error font-caption-sm text-caption-sm font-medium">
                            {t('de.rows.suspectChip')}
                          </span>
                        ) : (
                          <VerdictChip verdict={r.verdict} />
                        )}
                      </td>
                      <td className="py-2 px-3 text-secondary font-caption-sm">{r.scored_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination + export */}
            <div className="flex items-center justify-between mt-space-md flex-wrap gap-2">
              <span className="font-caption-sm text-secondary">
                {t('de.rows.pageOf', { page, total: totalPages })}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 rounded-full bg-surface-container-high text-on-surface text-body-medium disabled:opacity-40"
                >
                  {t('de.rows.prev')}
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 rounded-full bg-surface-container-high text-on-surface text-body-medium disabled:opacity-40"
                >
                  {t('de.rows.next')}
                </button>
                {/* Export reuses the /listings/scored/export.csv endpoint (P4b). */}
                <a
                  href={`${import.meta.env.VITE_API_BASE_URL ?? '/api/v1'}/listings/scored/export.csv`}
                  className="ml-2 px-3 py-1.5 rounded-full bg-primary-container/15 text-primary-container text-body-medium font-medium"
                >
                  {t('de.rows.export')}
                </a>
              </div>
            </div>
          </>
        )}
      </div>
    </ValuationCard>
  );
}

function SortHeader({
  label,
  active,
  order,
  onClick,
}: {
  label: string;
  active: boolean;
  order: SortOrder;
  onClick: () => void;
}) {
  return (
    <th className="py-2 px-3 font-label-uppercase text-label-uppercase">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 hover:text-on-surface"
        aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        {label}
        {active && (
          <span className="material-symbols-outlined text-[14px]">
            {order === 'asc' ? 'arrow_upward' : 'arrow_downward'}
          </span>
        )}
      </button>
    </th>
  );
}

function VerdictChip({ verdict }: { verdict: string }) {
  const { t } = useTranslation();
  const map: Record<string, { cls: string; key: string }> = {
    underpriced: { cls: 'bg-tertiary/20 text-tertiary', key: 'common.underpriced' },
    fair: { cls: 'bg-surface-container-high text-on-surface-variant', key: 'common.fair' },
    overpriced: { cls: 'bg-error/15 text-error', key: 'common.overpriced' },
  };
  const v = map[verdict] ?? map.fair;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-caption-sm text-caption-sm font-medium ${v.cls}`}>
      {t(v.key)}
    </span>
  );
}

// ======================================================================
// B1 — Prices tab: group selector + horizontal p10-median-p90 range bars
// ======================================================================

type GroupDim = 'prop_type' | 'size_band';

export function PricesTab() {
  const { t } = useTranslation();
  const { currency } = useCurrency();
  const [group, setGroup] = useState<GroupDim>('prop_type');
  const [includeSuspect, setIncludeSuspect] = useState(false);
  const q = usePriceByGroup(group, includeSuspect);

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <h2 className="font-headline-section text-headline-section text-on-surface">
          {t('de.prices.title')}
        </h2>
        <p className="font-body-regular text-body-regular text-secondary mt-1 mb-space-md">
          {t('de.prices.subtitle')}
        </p>

        {/* Group selector + suspect toggle */}
        <div className="flex items-center gap-3 mb-space-md flex-wrap">
          <div role="group" aria-label={t('de.prices.title')} className="flex gap-1 bg-surface-container-high/70 p-1 rounded-full">
            <GroupPill active={group === 'prop_type'} onClick={() => setGroup('prop_type')} label={t('de.prices.groupPropType')} />
            <GroupPill active={group === 'size_band'} onClick={() => setGroup('size_band')} label={t('de.prices.groupSizeBand')} />
          </div>
          <label className="inline-flex items-center gap-1.5 font-body-medium text-body-medium text-on-surface-variant cursor-pointer">
            <input
              type="checkbox"
              checked={includeSuspect}
              onChange={(e) => setIncludeSuspect(e.target.checked)}
              className="accent-primary"
            />
            {t('de.prices.includeSuspect')}
          </label>
        </div>

        {q.isLoading ? (
          <LoadingSkeleton className="h-64 w-full rounded" />
        ) : q.isError ? (
          <EmptyState
            icon="cloud_off"
            title={t('common.dataUnavailable')}
            message={t('de.price.errorMessage')}
            actionLabel={t('common.retry')}
            onAction={() => q.refetch()}
          />
        ) : (q.data?.bands ?? []).length === 0 ? (
          <EmptyState icon="bar_chart" title={t('de.price.emptyTitle')} message={t('de.price.emptyMessage')} />
        ) : (q.data && <PriceBars data={q.data} currency={currency} />)}
      </div>
    </ValuationCard>
  );
}

function GroupPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-body-medium transition-all ${
        active ? 'bg-inverse-surface text-inverse-on-surface shadow-sm' : 'text-secondary hover:text-on-surface'
      }`}
    >
      {label}
    </button>
  );
}

function PriceBars({ data, currency }: { data: PriceByGroupResponse; currency: 'KSH' | 'USD' }) {
  const { t } = useTranslation();
  // Global p10/p90 across sufficient groups → the bar axis is shared so
  // groups are visually comparable.  Insufficient groups render a flat
  // "not enough data" bar instead of a fabricated range.
  const sufficient = (data.bands ?? []).filter((b) => !b.insufficient && b.p10_listed_per_acre_ksh != null && b.p90_listed_per_acre_ksh != null);
  const lo = sufficient.length ? Math.min(...sufficient.map((b) => b.p10_listed_per_acre_ksh as number)) : 0;
  const hi = sufficient.length ? Math.max(...sufficient.map((b) => b.p90_listed_per_acre_ksh as number)) : 1;
  const span = Math.max(1, hi - lo);

  return (
    <div className="flex flex-col gap-space-sm">
      {(data.bands ?? []).map((b) => {
        const label = groupLabel(b.group, t);
        if (b.insufficient) {
          return (
            <div key={b.group} className="flex flex-col gap-1">
              <div className="flex justify-between font-body-medium text-body-medium">
                <span className="text-on-surface">{label}</span>
                <span className="text-secondary">{t('de.prices.nListings', { n: b.n })}</span>
              </div>
              <div className="h-3 w-full bg-surface-container rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: '100%',
                    backgroundImage: `repeating-linear-gradient(45deg, ${NO_DATA_HEX} 0, ${NO_DATA_HEX} 2.5px, transparent 2.5px, transparent 8px)`,
                  }}
                  aria-hidden="true"
                />
              </div>
              <span className="font-caption-sm text-caption-sm text-secondary">
                {t('de.prices.insufficient', { n: b.n, min: data.min_group_n })}
              </span>
            </div>
          );
        }
        const p10 = b.p10_listed_per_acre_ksh as number;
        const p90 = b.p90_listed_per_acre_ksh as number;
        const med = b.median_listed_per_acre_ksh as number;
        const leftPct = ((p10 - lo) / span) * 100;
        const widthPct = ((p90 - p10) / span) * 100;
        const medPct = ((med - p10) / Math.max(1e-9, p90 - p10)) * 100;
        return (
          <div key={b.group} className="flex flex-col gap-1">
            <div className="flex justify-between font-body-medium text-body-medium">
              <span className="text-on-surface">{label}</span>
              <span className="text-secondary">{t('de.prices.nListings', { n: b.n })}</span>
            </div>
            <div className="relative h-4 w-full bg-surface-container rounded-full overflow-hidden">
              {/* p10–p90 range bar (visual minimum 2% so a tight range stays visible). */}
              <div
                className="absolute h-full rounded-full bg-primary-container/60"
                style={{ left: `${Math.max(0, leftPct)}%`, width: `${Math.max(2, widthPct)}%` }}
                aria-hidden="true"
              />
              {/* Median tick (clamped inside the bar). */}
              <div
                className="absolute h-full w-0.5 bg-[#1F1511]"
                style={{ left: `calc(${Math.max(0, leftPct)}% + ${Math.max(0, Math.min(100, medPct))}% * ${Math.max(2, widthPct)}% / 100)` }}
                aria-hidden="true"
              />
            </div>
            <div className="flex justify-between font-caption-sm text-caption-sm text-secondary">
              <span>{t('de.prices.rangeBar', { p10: formatCompactMoney(p10, currency), p90: formatCompactMoney(p90, currency) })}</span>
              <span>{t('de.prices.median')}: {formatCompactMoney(med, currency)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Resolve a group label: size-band keys come from i18n; prop_type values
 *  are rendered verbatim (canonical names are already human-readable). */
function groupLabel(group: string, t: (k: string) => string): string {
  if (group.startsWith('de.sizeBand.')) return t(group);
  return group;
}

// ======================================================================
// B2 — Relationships tab: log-log scatter + decile-median line
// ======================================================================

type RelMetric = 'median' | 'count' | 'shareSuspect';

export function RelationshipsTab() {
  const { t } = useTranslation();
  const formatNumber = useFormatNumber();
  const { currency } = useCurrency();
  const q = useRelationships();
  const [hideSuspect, setHideSuspect] = useState(false);

  if (q.isLoading) {
    return (
      <ValuationCard noPadding>
        <div className="p-space-lg"><LoadingSkeleton className="h-80 w-full rounded" /></div>
      </ValuationCard>
    );
  }
  if (q.isError) {
    return (
      <EmptyState
        icon="cloud_off"
        title={t('common.dataUnavailable')}
        message={t('de.price.errorMessage')}
        actionLabel={t('common.retry')}
        onAction={() => q.refetch()}
      />
    );
  }
  const data: RelationshipsResponse | undefined = q.data;
  if (!data || data.n_usable === 0) {
    return <EmptyState icon="scatter_plot" title={t('de.rel.empty')} message="" />;
  }

  const points = (data.sample ?? []).filter((p) => !hideSuspect || !p.is_suspect);
  // Log-log scatter: recharts needs numeric x/y.
  const scatterData = points.map((p) => ({
    x: Math.log10(Math.max(1e-6, p.size_acres)),
    y: Math.log10(Math.max(1, p.listed_price_per_acre_ksh)),
    isSuspect: p.is_suspect,
  }));
  const decileLine = (data.deciles ?? [])
    .filter((d) => d.median_listed_per_acre_ksh != null && d.median_size_acres != null)
    .map((d) => ({
      x: Math.log10(Math.max(1e-6, d.median_size_acres as number)),
      y: Math.log10(Math.max(1, d.median_listed_per_acre_ksh as number)),
    }));

  const rho = data.spearman_rho != null ? data.spearman_rho.toFixed(3) : '—';

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg">
        <h2 className="font-headline-section text-headline-section text-on-surface">
          {t('de.rel.title')}
        </h2>
        <p className="font-body-regular text-body-regular text-secondary mt-1 mb-space-md">
          {t('de.rel.subtitle')}
        </p>

        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <span className="font-label-metric text-label-metric text-on-surface">
            {t('de.rel.rho', { rho, n: formatNumber(data.n_usable) })}
          </span>
          <label className="inline-flex items-center gap-1.5 font-body-medium text-body-medium text-on-surface-variant cursor-pointer">
            <input
              type="checkbox"
              checked={hideSuspect}
              onChange={(e) => setHideSuspect(e.target.checked)}
              className="accent-primary"
            />
            {t('de.rel.hideSuspect')}
          </label>
        </div>

        <div className="w-full h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
              <XAxis
                type="number"
                dataKey="x"
                name={t('de.rel.axisSize')}
                tick={{ fontSize: 11, fill: '#6A5B56' }}
                tickFormatter={(v) => `10^${v.toFixed(1)}`}
                label={{ value: t('de.rel.axisSize'), position: 'insideBottom', offset: -10, fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name={t('de.rel.axisPrice')}
                tick={{ fontSize: 11, fill: '#6A5B56' }}
                tickFormatter={(v) => formatCompactMoney(Math.pow(10, v), currency)}
              />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                formatter={((value: number) => [formatCompactMoney(Math.pow(10, value), currency), t('de.rel.axisPrice')]) as never}
                labelFormatter={((label: number) => `${t('de.rel.axisSize')}: 10^${Number(label).toFixed(2)}`) as never}
              />
              {/* Decile-median line first (under the scatter). */}
              <Line
                type="monotone"
                data={decileLine}
                dataKey="y"
                stroke="#1F1511"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name={t('de.rel.decileLine')}
              />
              {/* Scatter overlay as a Line with dots only. */}
              <Scatter
                data={scatterData}
                dataKey="y"
                fill="#E8742A"
                fillOpacity={0.5}
                isAnimationActive={false}
                name={t('de.rel.title')}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <p className="font-caption-sm text-caption-sm text-secondary mt-2">
          {t('de.rel.caption', { sample: formatNumber(data.sample_n), n: formatNumber(data.n_usable) })}
        </p>
      </div>
    </ValuationCard>
  );
}

// ======================================================================
// B3 — Locations tab: MapLibre choropleth + metric selector
// ======================================================================

const KENYA_CENTER = { lng: 37.9, lat: 0.5, zoom: 5.5 };
const COUNTY_FILL_LAYER_ID = 'de-locations-fill';

export function LocationsTab() {
  const { t } = useTranslation();
  const formatNumber = useFormatNumber();
  const { currency } = useCurrency();
  const [metric, setMetric] = useState<RelMetric>('median');

  const summaryQ = useCountySummary();
  const boundariesQ = useCountyBoundaries();
  const isLoading = summaryQ.isLoading || boundariesQ.isLoading;
  const failed = summaryQ.isError || boundariesQ.isError;

  // county (lowercased) -> summary row
  const rowByCounty = useMemo(() => {
    const m = new Map<string, { n: number; median: number | null; share: number | null; sufficient: boolean }>();
    const minN = summaryQ.data?.min_county_n ?? 5;
    for (const r of summaryQ.data?.counties ?? []) {
      m.set(r.county.toLowerCase(), {
        n: r.n_listings,
        median: r.median_price_per_acre_ksh,
        share: r.share_suspect ?? null,
        sufficient: r.n_listings >= minN,
      });
    }
    return m;
  }, [summaryQ.data]);

  // Colour ramp: a continuous interpolate over the eligible counties'
  // metric values.  Counties below min_county_n render hatched (excluded
  // from the ramp); counties absent from the summary render the no-data
  // grey.  The ramp uses the shared chart-token hex colours.
  const { fillColorExpr, legendMin, legendMax } = useMemo(() => {
    const eligible = [...rowByCounty.values()].filter((r) => r.sufficient);
    const values = eligible
      .map((r) => (metric === 'median' ? r.median : metric === 'count' ? r.n : r.share))
      .filter((v): v is number => v != null && v > 0);
    const lo = values.length ? Math.min(...values) : 0;
    const hi = values.length ? Math.max(...values) : 1;
    const expr: unknown[] = ['match', ['get', 'county']];
    for (const f of boundariesQ.data?.features ?? []) {
      const name = countyNameFromFeature(f.properties);
      if (!name) continue;
      const r = rowByCounty.get(name.toLowerCase());
      if (!r || !r.sufficient) {
        expr.push(name, NO_DATA_HEX); // hatched via the line layer below
        continue;
      }
      const v = metric === 'median' ? r.median : metric === 'count' ? r.n : r.share;
      if (v == null || v <= 0) {
        expr.push(name, NO_DATA_HEX);
        continue;
      }
      // Normalise to 0..1 across [lo, hi] then pick a ramp colour.
      const t = hi > lo ? (v - lo) / (hi - lo) : 0.5;
      expr.push(name, rampColor(t));
    }
    expr.push(NO_DATA_HEX);
    return { fillColorExpr: expr, legendMin: lo, legendMax: hi };
  }, [rowByCounty, boundariesQ.data, metric]);

  if (isLoading) {
    return (
      <ValuationCard noPadding>
        <div className="p-space-lg"><LoadingSkeleton className="h-96 w-full rounded" /></div>
      </ValuationCard>
    );
  }
  if (failed) {
    return (
      <EmptyState
        icon="cloud_off"
        title={t('common.dataUnavailable')}
        message={t('market.mapLoadFailed')}
        actionLabel={t('common.retry')}
        onAction={() => { summaryQ.refetch(); boundariesQ.refetch(); }}
      />
    );
  }
  if ((boundariesQ.data?.features ?? []).length === 0) {
    return <EmptyState icon="map" title={t('de.loc.noBoundaries')} message={t('de.loc.empty')} />;
  }

  return (
    <ValuationCard noPadding>
      <div className="p-space-lg pb-3">
        <h2 className="font-headline-section text-headline-section text-on-surface">
          {t('de.loc.title')}
        </h2>
        <p className="font-body-regular text-body-regular text-secondary mt-1 mb-space-md">
          {t('de.loc.subtitle')}
        </p>
        {/* Metric selector */}
        <div role="group" aria-label={t('de.loc.title')} className="flex gap-1 bg-surface-container-high/70 p-1 rounded-full w-fit mb-space-md">
          <GroupPill active={metric === 'median'} onClick={() => setMetric('median')} label={t('de.loc.metricMedian')} />
          <GroupPill active={metric === 'count'} onClick={() => setMetric('count')} label={t('de.loc.metricCount')} />
          <GroupPill active={metric === 'shareSuspect'} onClick={() => setMetric('shareSuspect')} label={t('de.loc.metricShareSuspect')} />
        </div>
      </div>
      <div className="px-space-lg pb-space-lg">
        <MapLibreMap
          initialLongitude={KENYA_CENTER.lng}
          initialLatitude={KENYA_CENTER.lat}
          initialZoom={KENYA_CENTER.zoom}
          height="h-96"
          interactiveLayerIds={[COUNTY_FILL_LAYER_ID]}
        >
          <Source id="de-locations-counties" type="geojson" data={boundariesQ.data as unknown as GeoJSON.GeoJSON}>
            <Layer
              id={COUNTY_FILL_LAYER_ID}
              type="fill"
              paint={{
                'fill-color': fillColorExpr as unknown as string,
                'fill-opacity': 0.75,
              }}
            />
            <Layer
              id="de-locations-line"
              type="line"
              paint={{ 'line-color': '#574238', 'line-width': 0.5, 'line-opacity': 0.5 }}
            />
          </Source>
        </MapLibreMap>
        <p className="font-caption-sm text-caption-sm text-secondary mt-2">
          {metric === 'median'
            ? `${formatCompactMoney(legendMin, currency)} – ${formatCompactMoney(legendMax, currency)}`
            : `${formatNumber(legendMin)} – ${formatNumber(legendMax)}`}
        </p>
        <p className="sr-only">
          {t('market.mapSummary', {
            n: summaryQ.data?.n_counties_with_data ?? 0,
            total: summaryQ.data?.n_counties_total ?? 0,
          })}
        </p>
      </div>
    </ValuationCard>
  );
}

/** 5-step ramp over t in [0,1] using the shared chart tokens. */
function rampColor(t: number): string {
  const stops = RAMP;
  const idx = Math.min(stops.length - 1, Math.max(0, Math.floor(t * stops.length)));
  return stops[idx];
}
