/**
 * Pure helpers for the Explainability screen — kept in a non-component
 * module so the react-refresh `only-export-components` rule doesn't fire.
 *
 * P6b rewrite:
 *  - `DriverSummary` — minimal shape of a top SHAP driver (feature key +
 *    human label + mean |SHAP| value).
 *  - `selectTopDrivers` — pick the top drivers for ONE model's SHAP rows
 *    (the model comes from the response's `models` list — never a
 *    hard-coded member key).
 *  - `formatDriverNames` / `synthesisKey` — the pieces the i18n
 *    synthesis sentence interpolates (the WORDING itself lives in
 *    i18n, en + sw, plural-safe for 1 / 2 / 3+ drivers).
 *
 * The old `buildSynthesis` (English-only, and WRONG — it called mean
 * |SHAP| a "share of price variation") is deleted; wording now comes
 * from the i18n keys `explain.synthesis.one/two/many` + the unit
 * sentence `explain.synthesis.unit`.
 */
import type { FeatureLabel, ShapGlobalRow } from '@/lib/api/types';

export interface DriverSummary {
  feature: string;
  label: string;
  mean_abs_shap: number;
}

/**
 * Display density: how many drivers feed the plain-synthesis sentence.
 * UI choice, NOT a data fact — the caption interpolates the number
 * actually shown, and the sentence stays honest for any count.
 */
export const SYNTHESIS_TOP_N = 5;

/**
 * Select the top drivers for one model from the SHAP rows.
 *
 * `modelKey` is the selected member's key (from the response's
 * `models` list / `default_model`); when it is null the caller has no
 * model to chart and gets an empty list (the bars card then shows its
 * honest empty state rather than defaulting to some hard-coded member).
 */
export function selectTopDrivers(
  rows: ShapGlobalRow[] | undefined,
  labels: Record<string, FeatureLabel> | undefined,
  modelKey: string | null,
  limit: number = SYNTHESIS_TOP_N,
): DriverSummary[] {
  if (!rows || modelKey === null) return [];
  return [...rows]
    .filter((r) => r.model === modelKey)
    .sort((a, b) => b.mean_abs_shap - a.mean_abs_shap)
    .slice(0, limit)
    .map((r) => ({
      feature: r.feature,
      label: labels?.[r.feature]?.label ?? r.feature,
      mean_abs_shap: r.mean_abs_shap,
    }));
}

/**
 * Join driver labels into one natural list ("A and B", "A, B and C")
 * using the i18n conjunction word — plural-safe without locale-typed
 * list-formatting.
 */
export function formatDriverNames(names: string[], andWord: string): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} ${andWord} ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} ${andWord} ${names[names.length - 1]}`;
}

/** Which i18n synthesis template applies: 1 / 2 / 3+ drivers. */
export function synthesisKey(count: number): 'one' | 'two' | 'many' {
  if (count <= 0) return 'many'; // callers guard against 0; safe default
  if (count === 1) return 'one';
  if (count === 2) return 'two';
  return 'many';
}

/**
 * Coerce the coverage block (typed shape after P6b, or an older raw
 * dict payload) into the documented fields — numbers passed through
 * as-is, everything else null.  The frontend NEVER renormalises:
 * shares arrive as fractions from the backend or not at all.
 */
export interface ParsedCoverage {
  treeShare: number | null;
  tabnetShare: number | null;
  explainedMembers: string[] | null;
  unexplainedMembers: string[] | null;
  source: 'recomputed' | 'manifest' | null;
}

export function parseCoverage(raw: unknown): ParsedCoverage {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const toNum = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  const toList = (v: unknown): string[] | null =>
    Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null;
  const source =
    obj.source === 'recomputed' || obj.source === 'manifest' ? obj.source : null;
  return {
    treeShare: toNum(obj.tree_share_explained_by_shap),
    tabnetShare: toNum(obj.tabnet_share_not_covered),
    explainedMembers: toList(obj.explained_members),
    unexplainedMembers: toList(obj.unexplained_members),
    source,
  };
}
