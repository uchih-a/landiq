/**
 * Pure helpers for the Overview screen (O2 build round).
 *
 * Removed in O2 (now backend-owned by /overview/summary):
 *   - `NAIROBI_LAT` / `NAIROBI_LON` constants — the endpoint computes
 *     distances server-side via the shared `compute_distances_to_nairobi`
 *     helper, so the frontend no longer needs a client-side reference
 *     point.
 *   - `haversineKm` — same reason.
 *   - `computeVerdictCounts` — the response's `verdicts` block owns this.
 *   - `buildDistanceScatter` — replaced by the response's `scatter_sample`.
 *   - `PROP_TYPE_OPTIONS` — replaced by the response's
 *     `property_types_canonical` + the per-type counts under
 *     `filters.property_types`.
 *
 * Added in O2:
 *   - `ALL_VALUE` (kept) — the sentinel for "no filter applied".
 *   - `formatCompactKSh` (kept, used in chart tooltips that bypass the
 *     currency-aware formatter for axis labels).
 *   - `formatDateShort` (kept, formats the data_date from /meta).
 *   - `abbreviateCounty` — derives "NBO" / "KBU" / "KAJ" from the
 *     county name for the mobile honeycomb badges (never typed).
 *   - `buildOverviewQueryFilters` — builds the `OverviewSummaryFilters`
 *     object from URL search params.
 *   - `buildDealFinderUrl` — builds a Deal Finder URL with the verdict /
 *     county / prop_type / flagged filters for the cross-page links.
 *   - `buildMarketInsightsUrl` — builds a Market Insights URL with
 *     `?county=` preselected.
 *   - `formatLiveDateTime` — formats the browser clock as
 *     "Thursday, 24 Oct · 14:32 EAT" using Intl (no hard-coded timezone).
 *   - `exportScatterCsv` — builds a CSV of the plotted scatter sample.
 */

import type { OverviewSummaryFilters } from '@/lib/api/types';

/** Sentinel value used by both dropdowns to mean "no filter applied". */
export const ALL_VALUE = 'all';

/** Compact Kenyan-shilling formatter for chart axis labels + tooltips
 *  (the currency-aware `formatCompactMoney` in `@/lib/currency/format`
 *  is for KPI/table cells where the KSh/USD toggle should apply).
 *  Used only in places where the KSh prefix is fixed by the chart's
 *  axis convention. */
export function formatCompactKSh(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value >= 1_000_000_000) {
    return `KSh ${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `KSh ${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `KSh ${Math.round(value / 1_000)}K`;
  }
  return `KSh ${Math.round(value)}`;
}

/** Friendly "12 Nov 2025" rendering of an ISO date string (or null/empty). */
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Derive a 3-letter abbreviation from a county name — used by the mobile
 * honeycomb badges (m01_overview).  Computed from the name, never typed.
 *
 * Nairobi -> "NBO", Kiambu -> "KBU", Kajiado -> "KAJ", Murang'a -> "MUR",
 * Uasin Gishu -> "UAS" (first three letters, uppercased).
 */
export function abbreviateCounty(name: string): string {
  if (!name) return '—';
  // Strip apostrophes / spaces, take the first three letters.
  const cleaned = name.replace(/['\s]/g, '');
  return cleaned.slice(0, 3).toUpperCase();
}

/**
 * Build the `OverviewSummaryFilters` object from URLSearchParams.  Used
 * by the Overview page to initialise its filter state from the URL.
 *
 * - `county` and `prop_type` are read as plain strings (the backend
 *   validates them; the frontend trusts the URL until the API responds).
 * - `top_n_counties` and `scatter_limit` are optional ints.
 */
export function buildOverviewQueryFilters(
  params: URLSearchParams,
  defaults?: Partial<OverviewSummaryFilters>,
): OverviewSummaryFilters {
  const filters: OverviewSummaryFilters = {};
  const county = params.get('county');
  if (county) filters.county = county;
  const propType = params.get('type');
  if (propType) filters.prop_type = propType;
  const topN = params.get('top_n');
  if (topN) {
    const n = Number.parseInt(topN, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 10) filters.top_n_counties = n;
  }
  const scatterLimit = params.get('scatter_limit');
  if (scatterLimit) {
    const n = Number.parseInt(scatterLimit, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 1000) filters.scatter_limit = n;
  }
  return { ...defaults, ...filters };
}

/**
 * Serialise the Overview filters back to URLSearchParams (the inverse of
 * `buildOverviewQueryFilters`).  Omitted/ALL_VALUE filters are not
 * written so the URL stays clean.
 */
export function overviewFiltersToParams(
  filters: OverviewSummaryFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.county && filters.county !== ALL_VALUE) {
    params.set('county', filters.county);
  }
  if (filters.prop_type && filters.prop_type !== ALL_VALUE) {
    params.set('type', filters.prop_type);
  }
  if (filters.top_n_counties != null) {
    params.set('top_n', String(filters.top_n_counties));
  }
  if (filters.scatter_limit != null) {
    params.set('scatter_limit', String(filters.scatter_limit));
  }
  return params;
}

/**
 * Build a Deal Finder URL with optional verdict / county / prop_type /
 * flagged filters.  Used by the Overview page's verdict tiles + the
 * anomaly-flag link.
 */
export function buildDealFinderUrl(opts: {
  county?: string | null;
  verdict?: 'underpriced' | 'fair' | 'overpriced' | null;
  propType?: string | null;
  flagged?: boolean | null;
}): string {
  const params = new URLSearchParams();
  if (opts.county && opts.county !== ALL_VALUE) params.set('county', opts.county);
  if (opts.verdict) params.set('verdict', opts.verdict);
  if (opts.propType && opts.propType !== ALL_VALUE) params.set('prop_type', opts.propType);
  if (opts.flagged) params.set('flagged', 'true');
  const qs = params.toString();
  return qs ? `/deal-finder?${qs}` : '/deal-finder';
}

/** Build a Market Insights URL with the county preselected. */
export function buildMarketInsightsUrl(county?: string | null): string {
  if (!county || county === ALL_VALUE) return '/market-insights';
  return `/market-insights?county=${encodeURIComponent(county)}`;
}

/**
 * Format the browser clock as "Thursday, 24 Oct" + "14:32 EAT" — the
 * timezone abbreviation comes from `Intl.DateTimeFormat` (the user's
 * own timezone, not a hard-coded "EAT").  Returns a two-line object so
 * the header layout can stack them.
 */
export function formatLiveDateTime(now: Date = new Date()): { dateLine: string; timeLine: string } {
  const dateLine = now.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
  const timeLine = now.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  return { dateLine, timeLine };
}

/**
 * Pluralise "N listing(s)" based on the count.  Kept here so the i18n
 * pluralisation rules can be applied consistently.
 */
export function pluraliseListings(n: number, singular: string, plural: string): string {
  return n === 1 ? `${n} ${singular}` : `${n} ${plural}`;
}

/**
 * Build a CSV string from the overview scatter sample for the download
 * button.  Active filters are reflected in the filename so the user
 * can tell which selection a CSV came from.
 */
export function exportScatterCsv(
  points: { listing_no: string | null; county: string | null; distance_km: number | null; price_per_acre_ksh: number; verdict: string | null }[],
  filters: { county?: string | null; propType?: string | null },
): { csv: string; filename: string } {
  const header = 'listing_no,county,distance_km,price_per_acre_ksh,verdict\n';
  const rows = points
    .map((p) => {
      const cells = [
        p.listing_no ?? '',
        p.county ?? '',
        p.distance_km != null ? p.distance_km.toFixed(2) : '',
        String(Math.round(p.price_per_acre_ksh)),
        p.verdict ?? '',
      ];
      // RFC 4180: quote cells containing commas or quotes.
      return cells.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',');
    })
    .join('\n');
  const csv = header + rows + '\n';
  const parts = ['overview-scatter'];
  if (filters.county && filters.county !== ALL_VALUE) {
    parts.push(filters.county.toLowerCase().replace(/\s+/g, '-'));
  }
  if (filters.propType && filters.propType !== ALL_VALUE) {
    parts.push(filters.propType.toLowerCase());
  }
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${parts.join('-')}-${date}.csv`;
  return { csv, filename };
}
