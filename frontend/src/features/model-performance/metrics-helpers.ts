/**
 * Pure helpers for the Model Performance screen — kept in a non-component
 * module so the react-refresh `only-export-components` rule doesn't fire
 * on the functions.
 *
 * Contents:
 *  - `pickEnsembleRow` — pull the `weighted_ensemble` row out of the
 *    metrics table (the backend emits one row per (run, model) and the
 *    ensemble row is keyed by `model === 'weighted_ensemble'`). Falls
 *    back to a substring match on "ensemble", then to the highest-weight
 *    row, in case the naming convention ever drifts.
 *  - `formatCompactKSh` — "KSh 250K" / "KSh 3.4M" shortener for KPI
 *    numerals. The full-form `formatMoney` from `@/lib/currency/format`
 *    returns "KES 1,250,000" which is too wide for a display-kpi cell.
 */
import type { MetricsResponse, MetricsTableRow } from '@/lib/api/types';

export function pickEnsembleRow(
  metrics: MetricsResponse | undefined,
): MetricsTableRow | undefined {
  if (!metrics) return undefined;
  const rows = metrics.table.rows;
  return (
    rows.find((r) => r.model === 'weighted_ensemble') ??
    rows.find((r) => r.model.toLowerCase().includes('ensemble')) ??
    [...rows].sort(
      (a, b) => (b.ensemble_weight ?? 0) - (a.ensemble_weight ?? 0),
    )[0]
  );
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

/** True when the model name mentions TabNet (case-insensitive). */
export function isTabNetRow(model: string): boolean {
  return model.toLowerCase().includes('tabnet');
}
