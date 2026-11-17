/**
 * Pure helpers for the Market Insights screen — kept in a non-component
 * module so the react-refresh `only-export-components` rule doesn't fire
 * on the constants and functions.
 *
 * Contents:
 *  - `bandForMedian` — the original multi-hue band function (green/blue/
 *    amber/orange/red). Kept for backwards compatibility but NOT used by
 *    the Market Insights choropleth or ranked list — see `bandForMedianOrange`
 *    below for the design-correct orange scale.
 *  - `bandForMedianOrange` — G3 fix: the Market Insights design
 *    (05_market_insights/code.html) uses a SINGLE-HUE orange scale for both
 *    the choropleth and the ranked list bars, NOT the multi-hue green/blue/
 *    amber/red scheme that `bandForMedian` returns. The orange scale:
 *      < 1.5M   → #ffdbca (pale, primary-fixed)
 *      1.5-3M   → #ffb68f (light, primary-fixed-dim)
 *      3-6M     → #e8742a (mid, primary-container)
 *      6-12M    → #b34c05 (dark)
 *      > 12M    → #6b2c00 (darkest)
 *    This matches the design's legend exactly.
 *  - `computeLogTrend` — simple ordinary-least-squares regression of
 *    log(price) on distance-from-Nairobi, returning a 20-point sampled
 *    trend line ready to drop onto a Recharts log-scale scatter.
 *  - `countyNameFromFeature` — defensively pull a county name out of a
 *    GeoJSON feature's `properties` block.
 *  - `ALL_VALUE` — sentinel for the (placeholder) property-type filter.
 */

export interface PriceBand {
  label: string;
  bgClass: string;
  textClass: string;
  dotClass: string;
  /** Raw hex colour for the band — used by the MapLibre choropleth's
   * data-driven `fill-color` expression (the Tailwind classes above
   * can't be plugged into a MapLibre paint property). */
  hexColor: string;
}

const NO_DATA_BAND: PriceBand = {
  label: 'No data',
  bgClass: 'bg-surface-container-highest',
  textClass: 'text-on-surface-variant',
  dotClass: 'bg-surface-container-highest',
  hexColor: '#eae1d9',
};

/**
 * Map a county median (KSh per acre) to one of the spec's five colour
 * bands. Null / non-finite values fall through to the gray "no data"
 * band, which is also what shows for counties present in the GeoJSON but
 * absent from the summary.
 */
export function bandForMedian(median: number | null | undefined): PriceBand {
  if (median == null || !Number.isFinite(median)) return NO_DATA_BAND;
  if (median < 1_500_000) {
    return {
      label: '< KSh 1.5M',
      bgClass: 'bg-market-opportunity',
      textClass: 'text-on-primary',
      dotClass: 'bg-market-opportunity',
      hexColor: '#2F9E5F',
    };
  }
  if (median < 3_000_000) {
    // The blue band is the one explicitly-requested exception to the
    // "no indigo/blue" global rule.
    return {
      label: 'KSh 1.5M – 3M',
      bgClass: 'bg-blue-500',
      textClass: 'text-white',
      dotClass: 'bg-blue-500',
      hexColor: '#3B82F6',
    };
  }
  if (median < 6_000_000) {
    return {
      label: 'KSh 3M – 6M',
      bgClass: 'bg-market-caution',
      textClass: 'text-on-primary',
      dotClass: 'bg-market-caution',
      hexColor: '#E3A008',
    };
  }
  if (median < 12_000_000) {
    return {
      label: 'KSh 6M – 12M',
      bgClass: 'bg-primary-container',
      textClass: 'text-on-primary',
      dotClass: 'bg-primary-container',
      hexColor: '#E8742A',
    };
  }
  return {
    label: '> KSh 12M',
    bgClass: 'bg-market-overvalued',
    textClass: 'text-on-primary',
    dotClass: 'bg-market-overvalued',
    hexColor: '#D6455D',
  };
}

// ---- Orange-scale band function (G3 fix — matches the Market Insights design) ----

const NO_DATA_BAND_ORANGE: PriceBand = {
  label: 'No data',
  bgClass: 'bg-surface-container-highest',
  textClass: 'text-on-surface-variant',
  dotClass: 'bg-surface-container-highest',
  hexColor: '#eae1d9',
};

/**
 * G3 fix: the Market Insights design (05_market_insights/code.html) uses a
 * SINGLE-HUE orange scale for the choropleth and ranked list bars, NOT the
 * multi-hue green/blue/amber/red scheme that `bandForMedian` returns.
 *
 * The design's legend:
 *   < 1.5M   → #ffdbca (pale orange / primary-fixed)
 *   1.5-3M   → #ffb68f (light orange / primary-fixed-dim)
 *   3-6M     → #e8742a (mid orange / primary-container)
 *   6-12M    → #b34c05 (dark orange)
 *   > 12M    → #6b2c00 (darkest orange/brown)
 *
 * Both the choropleth (CountyPriceGrid) and the ranked list bars
 * (CountyRankList) use this function so their colors are consistent
 * with each other and with the design's legend.
 */
export function bandForMedianOrange(median: number | null | undefined): PriceBand {
  if (median == null || !Number.isFinite(median)) return NO_DATA_BAND_ORANGE;
  if (median < 1_500_000) {
    return {
      label: '< KSh 1.5M',
      bgClass: 'bg-primary-fixed',
      textClass: 'text-on-primary-fixed-variant',
      dotClass: 'bg-primary-fixed',
      hexColor: '#ffdbca',
    };
  }
  if (median < 3_000_000) {
    return {
      label: 'KSh 1.5M – 3M',
      bgClass: 'bg-primary-fixed-dim',
      textClass: 'text-on-primary-fixed-variant',
      dotClass: 'bg-primary-fixed-dim',
      hexColor: '#ffb68f',
    };
  }
  if (median < 6_000_000) {
    return {
      label: 'KSh 3M – 6M',
      bgClass: 'bg-primary-container',
      textClass: 'text-on-primary',
      dotClass: 'bg-primary-container',
      hexColor: '#e8742a',
    };
  }
  if (median < 12_000_000) {
    return {
      label: 'KSh 6M – 12M',
      bgClass: 'bg-[#b34c05]',
      textClass: 'text-white',
      dotClass: 'bg-[#b34c05]',
      hexColor: '#b34c05',
    };
  }
  return {
    label: '> KSh 12M',
    bgClass: 'bg-[#6b2c00]',
    textClass: 'text-white',
    dotClass: 'bg-[#6b2c00]',
    hexColor: '#6b2c00',
  };
}

export interface TrendPoint {
  distance_km: number;
  trend: number;
}

export interface LogTrend {
  slope: number;
  intercept: number;
  points: TrendPoint[];
}

/**
 * Ordinary-least-squares regression of `log(price_per_acre)` on
 * `distance_km`. Returns null when there's not enough usable data or the
 * distance variance is zero (in which case the slope is undefined).
 *
 * The returned `points` array is a 20-sample line across the x-domain
 * (already exp()'d back to KSh) so the caller can drop it straight onto a
 * Recharts log-scale scatter as a `<Line dataKey="trend">` series.
 */
export function computeLogTrend(
  points: Array<{ distance_km: number; price_per_acre: number }>,
): LogTrend | null {
  const valid = points.filter(
    (p) =>
      Number.isFinite(p.distance_km) &&
      p.distance_km > 0 &&
      Number.isFinite(p.price_per_acre) &&
      p.price_per_acre > 0,
  );
  if (valid.length < 2) return null;

  const n = valid.length;
  const xs = valid.map((p) => p.distance_km);
  const ys = valid.map((p) => Math.log(p.price_per_acre));
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  if (den === 0) return null;

  const slope = num / den;
  const intercept = yMean - slope * xMean;

  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const STEPS = 20;
  const sampled: TrendPoint[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const x = xMin + (xMax - xMin) * (i / STEPS);
    sampled.push({ distance_km: x, trend: Math.exp(slope * x + intercept) });
  }
  return { slope, intercept, points: sampled };
}

/** Sentinel value used by the (placeholder) property-type dropdown. */
export const ALL_VALUE = 'all';

/** Property-type options for the placeholder filter dropdown. */
export const PROP_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: ALL_VALUE, label: 'All property types' },
  { value: 'Land', label: 'Land' },
  { value: 'Farm', label: 'Farm' },
  { value: 'Residential', label: 'Residential' },
  { value: 'Commercial', label: 'Commercial' },
  { value: 'Industrial', label: 'Industrial' },
  { value: 'Plot', label: 'Plot' },
];

/**
 * Pull a human-readable county name out of a GeoJSON feature's
 * `properties`. The backend's simplified boundary dump doesn't document
 * the property key, so we try the common Kenyan / OSM / GeoJSON
 * candidates in order.
 */
export function countyNameFromFeature(
  props: Record<string, unknown> | undefined,
): string | null {
  if (!props || typeof props !== 'object') return null;
  const candidates = ['county', 'COUNTY', 'name', 'NAME', 'NAME_1', 'NAME_2'];
  for (const k of candidates) {
    const v = props[k];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return null;
}
