/**
 * Pure helpers for the Data Explorer screen — kept in a non-component
 * module so the react-refresh `only-export-components` rule doesn't fire
 * on the constants/types/functions.
 *
 * Contents:
 *  - `TABS` / `DataExplorerTab` — the five-pill tab group. Only
 *    "Data quality" has a design; the other four render a "Coming soon"
 *    panel.
 *  - `normaliseTab` — parse a `?tab=` URL param into a valid tab id.
 *  - `rowForMissing` / `MissingRow` — shape a feature-evaluation row into
 *    the "Missing values by feature" render model.
 *  - `mergeCountyRows` / `CountyRow` — join county_summary (median / IQR)
 *    with row_counts (n_listings) into the table's row model, computing
 *    the Model Ready / Not enough data status from the real threshold.
 *  - `csvFromCountyRows` — client-side CSV for the "Download CSV" button
 *    (built from the same real rows the table shows).
 *  - `compactKSh` — "KSh 3.4M" shortener for the mobile sample cards.
 */
import type {
  CountyRowCountsResponse,
  CountySummaryResponse,
  FeatureEvaluationRow,
} from '@/lib/api/types';

// ---- Tabs ----

export const TABS = [
  { id: 'quality', label: 'Data quality' },
  { id: 'prices', label: 'Prices' },
  { id: 'locations', label: 'Locations' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'table', label: 'Table' },
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
  /** True when missingness is high enough to warrant the orange accent. */
  severe: boolean;
}

/** Threshold at which a feature row renders with the orange accent. */
const SEVERE_MISSING_PCT = 50;

/**
 * Shape feature-evaluation rows for the missing-values card: sorted by
 * missing_pct descending. `labels` maps feature keys to human-readable
 * labels (from the explainability payload's feature_labels).
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
        severe: pct >= SEVERE_MISSING_PCT,
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
  /** True when the county meets the modelling listing-count threshold. */
  modelReady: boolean;
}

/**
 * Join county_summary (medians + IQR) with row_counts (listing counts) on
 * county name. `threshold` is the real min-county listing count from
 * /meta's coverage block (default 10 mirrors the backend default).
 */
export function mergeCountyRows(
  summary: CountySummaryResponse | undefined,
  rowCounts: CountyRowCountsResponse | undefined,
  threshold: number,
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
      modelReady: rc.n_listings >= threshold,
    });
  }
  // Model-ready counties first (by count desc), then below-threshold by name.
  return rows.sort((a, b) => {
    if (a.modelReady !== b.modelReady) return a.modelReady ? -1 : 1;
    if (a.modelReady && b.modelReady) return b.nListings - a.nListings;
    return a.county.localeCompare(b.county);
  });
}

/** Build the CSV text for the county table from its real rows. */
export function csvFromCountyRows(rows: CountyRow[]): string {
  const header = 'county,n_listings,median_per_acre_ksh,q1_per_acre_ksh,q3_per_acre_ksh,model_ready';
  const lines = rows.map((r) =>
    [
      `"${r.county.replace(/"/g, '""')}"`,
      r.nListings,
      r.median ?? '',
      r.q1 ?? '',
      r.q3 ?? '',
      r.modelReady,
    ].join(','),
  );
  return [header, ...lines].join('\n');
}

// ---- Compact money ----

/** "KSh 3.4M" / "KSh 250K" shortener for tight mobile cards. */
export function compactKSh(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1_000_000_000) return `KSh ${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `KSh ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `KSh ${Math.round(value / 1_000)}K`;
  return `KSh ${Math.round(value)}`;
}

/** "8.5M" / "250K" — compactKSh without the KSh prefix, for IQR ranges. */
export function shortNum(value: number): string {
  return compactKSh(value).replace(/^KSh\s*/, '');
}
