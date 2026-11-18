/**
 * Pure helpers for the Data Explorer screen — kept in a non-component
 * module so the react-refresh `only-export-components` rule doesn't fire
 * on the constants/types/functions.
 *
 * P7b changes:
 *  - `TABS` carries i18n label keys (never typed labels); only the ids
 *    are structural. The four undesigned tabs render an honest
 *    "not designed yet" panel that names the endpoint each would need.
 *  - `rowsForMissing` no longer applies a typed severity threshold
 *    (SEVERE_MISSING_PCT=50 removed — no configured "too much missing"
 *    notion exists on the backend; the styling was a data threshold).
 *    Sorting + the `excluded` marker still come straight from the
 *    response (`missing_%`, `in_selected_set`).
 *  - `mergeCountyRows` takes a `number | null` threshold — null (the
 *    honest "threshold not available" state) leaves `modelReady` null
 *    and skips the ready/not-ready split instead of guessing.
 *  - `csvFromCountyRows` — BOM for Excel, quoted+escaped county names,
 *    locale-independent plain numbers.
 *
 * Contents:
 *  - `TABS` / `DataExplorerTab` — the five-pill tab group.
 *  - `normaliseTab` — parse a `?tab=` URL param into a valid tab id.
 *  - `rowsForMissing` / `MissingRow` — shape feature-evaluation rows.
 *  - `mergeCountyRows` / `CountyRow` — join county_summary with row_counts.
 *  - `csvFromCountyRows` — client-side CSV for the "Download CSV" button.
 */
import type {
  CountyRowCountsResponse,
  CountySummaryResponse,
  FeatureEvaluationRow,
} from '@/lib/api/types';

// ---- Tabs ----

/** Tab ids are structural; labels render from i18n via `labelKey`. */
export const TABS = [
  { id: 'quality', labelKey: 'de.tab.quality', designed: true },
  { id: 'prices', labelKey: 'de.tab.prices', designed: false },
  { id: 'locations', labelKey: 'de.tab.locations', designed: false },
  { id: 'relationships', labelKey: 'de.tab.relationships', designed: false },
  { id: 'table', labelKey: 'de.tab.table', designed: false },
] as const;

export type DataExplorerTab = (typeof TABS)[number]['id'];

const TAB_IDS = new Set<string>(TABS.map((t) => t.id));

/** Parse a `?tab=` URL param; returns 'quality' for anything invalid. */
export function normaliseTab(value: string | null | undefined): DataExplorerTab {
  return value && TAB_IDS.has(value) ? (value as DataExplorerTab) : 'quality';
}

// ---- Missing values by feature ----

export interface MissingRow {
  feature: string;
  missingPct: number;
  /** True when the feature was NOT selected into the modelling set. */
  excluded: boolean;
}

/**
 * Shape feature-evaluation rows for the missing-values card: sorted by
 * missing_pct descending. `labels` maps feature keys to human-readable
 * labels (from the explainability payload's feature_labels).
 *
 * P7b-B: no severity threshold — the previous SEVERE_MISSING_PCT=50 was
 * a typed data threshold with no backend notion behind it, so every row
 * renders with the same plain style. The percentage is `missing_pct`
 * unmodified (0 decimal display); `excluded` comes from
 * `in_selected_set`.
 */
export function rowsForMissing(
  featureRows: FeatureEvaluationRow[] | undefined,
  labels?: Record<string, { label: string }>,
): MissingRow[] {
  if (!featureRows) return [];
  return [...featureRows]
    // Skip the target itself — the design's rows are input features, and
    // "Asking price: 0% missing" as a predictor of itself is noise.
    .filter((r) => r.group !== 'target' && r.feature !== 'listed_price_per_acre_ksh')
    .map((r) => {
      const pct = Number.isFinite(r['missing_%']) ? r['missing_%'] : 0;
      return {
        feature: labels?.[r.feature]?.label ?? r.feature,
        missingPct: pct,
        excluded: !r.in_selected_set,
      };
    })
    .sort((a, b) => b.missingPct - a.missingPct);
}

// ---- County table rows ----

export interface CountyRow {
  county: string;
  nListings: number;
  median: number | null;
  q1: number | null;
  q3: number | null;
  /**
   * True when the county meets the modelling listing-count threshold;
   * NULL when the threshold is unavailable (no guessing — the UI then
   * hides Model Ready / Not enough data and shows "threshold not
   * available").
   */
  modelReady: boolean | null;
}

/**
 * Join county_summary (medians + IQR) with row_counts (listing counts) on
 * county name. `threshold` is the real min-county listing count from
 * /meta's coverage block; null when the backend cannot serve it.
 */
export function mergeCountyRows(
  summary: CountySummaryResponse | undefined,
  rowCounts: CountyRowCountsResponse | undefined,
  threshold: number | null,
): CountyRow[] {
  const medians = new Map<string, CountySummaryResponse['counties'][number]>();
  for (const s of summary?.counties ?? []) medians.set(s.county, s);
  const rows: CountyRow[] = [];
  for (const rc of rowCounts?.counties ?? []) {
    const s = medians.get(rc.county);
    rows.push({
      county: rc.county,
      nListings: rc.n_listings,
      median: s?.median_price_per_acre_ksh ?? null,
      q1: s?.q1_price_per_acre_ksh ?? null,
      q3: s?.q3_price_per_acre_ksh ?? null,
      modelReady: threshold == null ? null : rc.n_listings >= threshold,
    });
  }
  // With a threshold: model-ready counties first (by count desc), then
  // below-threshold by name. Without one: a single count-descending list
  // (no ready/not-ready split is honest when the threshold is unknown).
  return rows.sort((a, b) => {
    if (a.modelReady !== b.modelReady && a.modelReady !== null && b.modelReady !== null) {
      return a.modelReady ? -1 : 1;
    }
    if (a.modelReady === true && b.modelReady === true) return b.nListings - a.nListings;
    if (a.modelReady === null && b.modelReady === null) return b.nListings - a.nListings;
    return a.county.localeCompare(b.county);
  });
}

/**
 * Build the CSV text for the county table from its real rows (P7b-J).
 *
 * - BOM prefix so Excel sniffs UTF-8 (county names with accents).
 * - County names are quoted with doubled inner quotes (RFC 4180 escape).
 * - Numeric cells are plain `String(n)` — locale-independent (never
 *   `toLocaleString`, which would emit thousands separators that differ
 *   per user locale and break re-imports).
 * - Empty cell when a value is null / the threshold is unknown — an
 *   honest blank rather than a plausible value.
 */
export function csvFromCountyRows(rows: CountyRow[]): string {
  const header = 'county,n_listings,median_per_acre_ksh,q1_per_acre_ksh,q3_per_acre_ksh,model_ready';
  const lines = rows.map((r) =>
    [
      `"${r.county.replace(/"/g, '""')}"`,
      String(r.nListings),
      r.median != null ? String(r.median) : '',
      r.q1 != null ? String(r.q1) : '',
      r.q3 != null ? String(r.q3) : '',
      r.modelReady == null ? '' : String(r.modelReady),
    ].join(','),
  );
  // \uFEFF = the UTF-8 BOM Excel needs to detect the encoding.
  return `\uFEFF${[header, ...lines].join('\n')}`;
}
