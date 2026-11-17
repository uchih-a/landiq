/**
 * Pure helpers for the Overview screen — kept in a non-component module so
 * the react-refresh `only-export-components` rule doesn't fire on the
 * utility functions and constants.
 *
 * Contents:
 *  - `NAIROBI_LAT` / `NAIROBI_LON` — the reference origin for the
 *    "Price by distance from Nairobi" scatter.
 *  - `haversineKm` — great-circle distance in km (client-side approximation
 *    of the backend's `dist_to_nairobi_km` column, used because the
 *    `/listings/scored` endpoint exposes raw lat/lon but not the distance).
 *  - `medianOfMedians` — median of an array of numbers (used to derive a
 *    single national median from the per-county medians).
 *  - `formatCompactKSh` — "KSh 3.4M" / "KSh 250K" shortener for KPI numerals
 *    (the long-form `formatKSh` from `@/lib/currency/format` returns
 *    "KES 1,250,000" which is too wide for a display-kpi cell).
 *  - `formatDateShort` — friendly "12 Nov 2025" rendering of the ISO
 *    `data_date` string from `/meta`.
 *  - `PROP_TYPE_OPTIONS` / `ALL_VALUE` — the property-type dropdown options.
 *    The backend's `prop_type` query is a case-insensitive substring match,
 *    so these are common Kenyan listing labels; selecting "all" clears the
 *    filter (caller converts to `undefined`).
 *  - `computeVerdictCounts` — tally of scored listings by verdict bucket.
 */

import type { ListingsScoredRow } from '@/lib/api/types';

export const NAIROBI_LAT = -1.2921;
export const NAIROBI_LON = 36.8219;

/** Sentinel value used by both dropdowns to mean "no filter applied". */
export const ALL_VALUE = 'all';

/**
 * Great-circle distance between two lat/lon points, in kilometres.
 * Uses the haversine formula with Earth radius = 6371 km.
 */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Median of a numeric array (returns `null` for empty input). */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Compact Kenyan-shilling formatter for KPI numerals.
 * - < 1_000_000        -> "KSh 250K"
 * - < 1_000_000_000    -> "KSh 3.4M"
 * - >= 1_000_000_000   -> "KSh 1.2B"
 */
export function formatCompactKSh(value: number): string {
  if (!Number.isFinite(value)) return '—';
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

/** Friendly "12 Nov 2025" rendering of an ISO date string (or `null`/empty). */
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

/** Common Kenyan listing property types offered by the filter dropdown. */
export const PROP_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: ALL_VALUE, label: 'All property types' },
  { value: 'Land', label: 'Land' },
  { value: 'Farm', label: 'Farm' },
  { value: 'Commercial', label: 'Commercial' },
  { value: 'Residential', label: 'Residential' },
  { value: 'Industrial', label: 'Industrial' },
  { value: 'Plot', label: 'Plot' },
];

export type VerdictTally = {
  underpriced: number;
  fair: number;
  overpriced: number;
  other: number;
  total: number;
};

/**
 * Count scored listings by verdict bucket. Listings whose verdict is null,
 * empty, or doesn't match one of the three canonical buckets fall into
 * `other` and are excluded from the stacked-bar segments (the chart only
 * renders the three canonical buckets).
 */
export function computeVerdictCounts(listings: ListingsScoredRow[]): VerdictTally {
  const tally: VerdictTally = {
    underpriced: 0,
    fair: 0,
    overpriced: 0,
    other: 0,
    total: listings.length,
  };
  for (const row of listings) {
    const v = (row.verdict ?? '').toLowerCase();
    if (v === 'underpriced') tally.underpriced += 1;
    else if (v === 'fair') tally.fair += 1;
    else if (v === 'overpriced') tally.overpriced += 1;
    else tally.other += 1;
  }
  return tally;
}

/**
 * Build a scatter-row dataset for the "Price by distance from Nairobi"
 * chart. Filters out listings without a usable lat/lon or price, then
 * computes `dist_to_nairobi_km` client-side via the haversine formula.
 *
 * Data source: `useListingsScored()` (B3) — the backend has no dedicated
 * distance-scatter endpoint, so we derive the distance from the listing's
 * `latitude` / `longitude` against the Nairobi reference point.
 */
export interface ScatterPoint {
  listing_no: string | null;
  county: string | null;
  distance_km: number;
  price_per_acre: number;
}

export function buildDistanceScatter(
  listings: ListingsScoredRow[],
): ScatterPoint[] {
  const points: ScatterPoint[] = [];
  for (const row of listings) {
    const lat = row.latitude;
    const lon = row.longitude;
    const price = row.listed_price_per_acre_ksh;
    if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (!Number.isFinite(price) || price <= 0) continue;
    points.push({
      listing_no: row.listing_no,
      county: row.county,
      distance_km: haversineKm(NAIROBI_LAT, NAIROBI_LON, lat, lon),
      price_per_acre: price,
    });
  }
  return points;
}
