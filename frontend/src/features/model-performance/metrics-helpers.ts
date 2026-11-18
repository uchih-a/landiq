/**
 * Pure helpers for the Model Performance screen (P5b real-data round).
 *
 * Removed in P5b:
 *  - `pickEnsembleRow`'s substring + highest-weight fallbacks — the
 *    backend now returns `ensemble_model` (the production run's ensemble
 *    row, identified server-side); the frontend resolves the row by that
 *    value ONLY and shows "not available" when it's absent.
 *  - `formatCompactKSh` — replaced by the shared currency-aware
 *    `formatCompactMoney` (the KSh/USD toggle now applies).
 *  - `isTabNetRow` (substring on model name) — the backend's model_info
 *    carries per-model family (tree / neural / ensemble / baseline).
 *
 * Added in P5b:
 *  - `pickEnsembleRow(metrics)` — exact match on
 *    `metrics.ensemble_model` within the production run.
 *  - `logErrorToPct` — convert a log-scale error to an approximate
 *    typical miss percentage via exp(x)-1 (documented formula).
 *  - `coverageEntriesFor(metrics)` — the interval-coverage entries
 *    (level + actual) derived from the response, keyed by the
 *    backend-provided interval_levels (never typed 0.5/0.8/0.9).
 */
import type { MetricsResponse, MetricsTableRow } from '@/lib/api/types';

/**
 * Resolve the ensemble row by the backend-provided `ensemble_model`
 * ONLY (within the production run).  Returns undefined when the response
 * doesn't identify an ensemble row — the caller shows "not available"
 * (never a single model's numbers mislabelled as the ensemble).
 */
export function pickEnsembleRow(
  metrics: MetricsResponse | undefined,
): MetricsTableRow | undefined {
  if (!metrics) return undefined;
  const name = metrics.ensemble_model;
  if (!name) return undefined;
  const productionRun = metrics.metrics_json?.production_run;
  return metrics.table.rows.find(
    (r) => r.model === name && (productionRun == null || r.run === productionRun),
  );
}

/**
 * Convert a LOG-scale error (RMSE/MAE on log KSh-per-acre) to an
 * approximate typical miss percentage.
 *
 * Formula (documented per the P5b brief): for a log error `x`, the
 * multiplicative factor is exp(x), so the approximate typical miss is
 * (exp(x) - 1) * 100 percent.  Example: x = 0.4 -> exp(0.4) - 1 ≈ 0.4914
 * -> "roughly a 49% typical miss".  The word "approximately" is used
 * because the conversion maps a median absolute LOG error to a
 * multiplicative percentage, which is exact for a single error but only
 * indicative as a typical-miss summary.
 */
export function logErrorToPct(x: number): number {
  return (Math.exp(x) - 1) * 100;
}

/**
 * The interval-coverage entries for the "Do ranges hold?" card, derived
 * from the response (never typed levels).  The actual coverage values
 * come from the ensemble row's interval_coverage_{level*100} columns;
 * the LEVELS come from metrics.interval_levels (backend-derived from
 * the artifact).  Returns [] when either source is absent.
 */
export interface CoverageEntry {
  level: number;
  targetPct: number;
  actual: number | null;
}

export function coverageEntriesFor(
  metrics: MetricsResponse | undefined,
): CoverageEntry[] {
  if (!metrics) return [];
  const levels = metrics.interval_levels;
  if (!levels || levels.length === 0) return [];
  const row = pickEnsembleRow(metrics);
  if (!row) return [];
  const out: CoverageEntry[] = [];
  for (const level of levels) {
    const pct = Math.round(level * 100);
    const field =
      (row as unknown as Record<string, unknown>)[`interval_coverage_${pct}`];
    out.push({
      level,
      targetPct: pct,
      actual: typeof field === 'number' && Number.isFinite(field) ? field : null,
    });
  }
  return out;
}

/**
 * The model's DISPLAY name from the backend's model_info (falling back
 * to the raw row name when the backend doesn't carry a mapping — the
 * raw name is itself data, not a fabricated label).
 */
export function modelDisplayName(
  metrics: MetricsResponse | undefined,
  model: string,
): string {
  return metrics?.model_info?.[model]?.display_name ?? model;
}

/**
 * The model's FAMILY from the backend's model_info (tree / neural /
 * ensemble / baseline), used for the TabNet-style grey styling instead
 * of substring matching on the name.
 */
export function modelFamily(
  metrics: MetricsResponse | undefined,
  model: string,
): string {
  return metrics?.model_info?.[model]?.family ?? 'tree';
}
