/**
 * Pure helpers for the Market Insights screen (P3b real-data round).
 *
 * Removed in P3b (now backend-owned by /counties/summary):
 *   - `bandForMedian` / `bandForMedianOrange` + the typed PRICE_BANDS
 *     thresholds (1.5M / 3M / 6M / 12M) and their labels — the band
 *     edges now come from the response's `price_bands` (quintiles of the
 *     county medians), and the frontend only maps a band INDEX to a
 *     colour token.
 *   - `PROP_TYPE_OPTIONS` (incl. Residential / Industrial / Plot) — the
 *     options render from `summary.property_types`.
 *   - `computeLogTrend` — the trend is computed server-side by
 *     /counties/{county}/distance-profile.
 *
 * Kept:
 *   - `bandForMedianIndex` — maps a band INDEX (0..N-1) to the single
 *     colour-token map (the design's five-step orange scale + the gray
 *     no-data band).  Colours are UI constants, defined once here.
 *   - `countyNameFromFeature` — now reads ONLY the documented
 *     `properties.county` key (the backend's boundaries payload carries
 *     it — see app/services/county_boundaries.py, which reads the same
 *     key).  The six-key guessing is gone.
 *   - `ALL_VALUE` — the "no filter" sentinel.
 */

export interface PriceBandStyle {
  bgClass: string;
  textClass: string;
  dotClass: string;
  /** Raw hex for MapLibre's data-driven fill-color expression (SVG/paint
   * properties take raw colours, not Tailwind classes). */
  hexColor: string;
}

/**
 * The single colour-token map, indexed by band index (0 = lowest price
 * band … 4 = highest).  Mirrors the design's five-step orange scale
 * (05_market_insights legend: #ffdbca / #ffb68f / #e8742a / #b34c05 /
 * #6b2c00) + the gray "no data" band.  UI constants — defined ONCE.
 */
export const BAND_STYLES: PriceBandStyle[] = [
  { bgClass: 'bg-primary-fixed', textClass: 'text-on-primary-fixed-variant', dotClass: 'bg-primary-fixed', hexColor: '#ffdbca' },
  { bgClass: 'bg-primary-fixed-dim', textClass: 'text-on-primary-fixed-variant', dotClass: 'bg-primary-fixed-dim', hexColor: '#ffb68f' },
  { bgClass: 'bg-primary-container', textClass: 'text-on-primary', dotClass: 'bg-primary-container', hexColor: '#e8742a' },
  { bgClass: 'bg-[#b34c05]', textClass: 'text-white', dotClass: 'bg-[#b34c05]', hexColor: '#b34c05' },
  { bgClass: 'bg-[#6b2c00]', textClass: 'text-white', dotClass: 'bg-[#6b2c00]', hexColor: '#6b2c00' },
];

export const NO_DATA_BAND: PriceBandStyle = {
  bgClass: 'bg-surface-container-highest',
  textClass: 'text-on-surface-variant',
  dotClass: 'bg-surface-container-highest',
  hexColor: '#eae1d9',
};

/**
 * Map a band INDEX to its colour style.  Null / out-of-range falls to
 * the gray no-data band (also what shows for counties present in the
 * GeoJSON but absent from the summary).
 */
export function bandForIndex(index: number | null | undefined): PriceBandStyle {
  if (index == null || !Number.isInteger(index) || index < 0 || index >= BAND_STYLES.length) {
    return NO_DATA_BAND;
  }
  return BAND_STYLES[index];
}

/**
 * Resolve which band INDEX a county median falls into, given the
 * response's data-driven band edges.  Pure — the edges are passed in
 * (never typed).  Returns null when no bands are available (the
 * response's bands_reason explains why).
 */
export function bandIndexForMedian(
  median: number | null | undefined,
  bands: { index: number; lower: number; upper: number | null }[],
): number | null {
  if (median == null || !Number.isFinite(median) || bands.length === 0) return null;
  for (const b of bands) {
    const inLower = median >= b.lower;
    const inUpper = b.upper == null ? true : median < b.upper;
    if (inLower && inUpper) return b.index;
  }
  // Above the top band's upper edge (open band handles it, but guard).
  const last = bands[bands.length - 1];
  if (median >= last.lower) return last.index;
  return null;
}

/**
 * Pull the county name out of a GeoJSON feature's `properties` block.
 * P3b (problem J): the backend's boundaries payload documents and
 * carries a `county` property (app/services/county_boundaries.py reads
 * the same key), so we read ONLY that key — the six-key guessing is
 * gone.  Returns null when the feature lacks it (the caller falls back
 * to no-data styling, never a crash).
 */
export function countyNameFromFeature(
  props: Record<string, unknown> | undefined,
): string | null {
  if (!props || typeof props !== 'object') return null;
  const v = props['county'];
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  return null;
}

/** Sentinel value for "no property-type filter applied". */
export const ALL_VALUE = 'all';
