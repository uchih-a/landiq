/**
 * Pure helpers for the Predictor screen (P2b real-data wiring round).
 *
 * Removed in P2b (now backend-owned by /predict/options):
 *   - `PARCEL_FEATURE_KEYS` — the response's `parcel_features` list owns
 *     this.  The frontend iterates the response.
 *   - `PARCEL_FEATURE_LABELS` — labels stay in i18n, keyed by the
 *     backend's key names (`predictor.feature.borehole` etc.).
 *   - `PROP_TYPE_OPTIONS` — the response's `property_types` list owns
 *     this.
 *   - `TITLE_DOC_KEY` — the title-document input is removed entirely
 *     from the unsupported state (it was frontend-only, never wired to
 *     the backend, and collected data that was discarded).
 *
 * Kept:
 *   - `TriState` / `triStateToChecklist` / `initialChecklist` — the
 *     form-side Yes/No/Not-Sure state and its conversion to the
 *     backend's `ChecklistValue`.  `initialChecklist` now takes the
 *     key list as an argument (so it doesn't re-type the keys).
 *   - `deriveResultState` — the reliable / limited / unsupported
 *     switch, driven entirely by the response's coverage block.
 *   - `validateSizeAcres` — pure validation helper that takes the
 *     bounds from the options response.
 */

import type { ChecklistValue } from '@/lib/api/types';

/** The form's three-state value for each checklist item. */
export type TriState = 'yes' | 'no' | 'unsure';

/** Map the form's TriState to the backend's ChecklistValue. */
export function triStateToChecklist(v: TriState): ChecklistValue {
  if (v === 'yes') return true;
  if (v === 'no') return false;
  return 'not_sure';
}

/**
 * Build the initial checklist state with every item set to "Not Sure".
 * Takes the key list as an argument (from the options response) so the
 * helper doesn't re-type the keys.
 */
export function initialChecklist(keys: string[]): Record<string, TriState> {
  return Object.fromEntries(keys.map((k) => [k, 'unsure' as TriState]));
}

/**
 * Decide which result state to render based on the response's coverage block.
 *
 *  - `reliable`   : is_low_support === false
 *  - `limited`    : is_low_support === true AND nearby_listings > 0
 *                   (some listings near the point — estimate is usable but
 *                   has a wide interval, e.g. "Only 4 listings nearby")
 *  - `unsupported`: is_low_support === true AND nearby_listings === 0
 *                   (no listings within the search radius — can't produce a
 *                   meaningful estimate, e.g. "none within 30 km")
 *
 * Driven ENTIRELY by the response's coverage block — no typed thresholds.
 */
export type ResultState = 'reliable' | 'limited' | 'unsupported';

export function deriveResultState(coverage: {
  is_low_support: boolean;
  county_listings: number;
  nearby_listings: number;
}): ResultState {
  if (!coverage.is_low_support) return 'reliable';
  if (coverage.nearby_listings > 0) return 'limited';
  return 'unsupported';
}

/**
 * Validation result for the parcel-size input.  The bounds come from
 * the options response (`size_acres.min` / `size_acres.max`); the
 * helper is pure so it can be unit-tested without HTTP.
 */
export type SizeValidation =
  | { ok: true; value: number }
  | { ok: false; reason: 'empty' | 'not-a-number' | 'nonpositive' | 'below-min' | 'above-max'; min?: number; max?: number };

/**
 * Validate the size input string against the bounds from /predict/options.
 *
 *  - empty string               → { ok: false, reason: 'empty' }
 *  - non-numeric                → { ok: false, reason: 'not-a-number' }
 *  - <= 0                       → { ok: false, reason: 'nonpositive' }
 *  - < min (the 1st percentile) → { ok: false, reason: 'below-min', min }
 *  - > max (the 99th percentile)→ { ok: false, reason: 'above-max', max }
 *  - otherwise                  → { ok: true, value }
 *
 * The min/max bounds are passed in (not imported) so the helper has no
 * hidden constants.
 */
export function validateSizeAcres(
  raw: string,
  bounds: { min: number; max: number },
): SizeValidation {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, reason: 'empty' };
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return { ok: false, reason: 'not-a-number' };
  if (n <= 0) return { ok: false, reason: 'nonpositive' };
  if (n < bounds.min) return { ok: false, reason: 'below-min', min: bounds.min };
  if (n > bounds.max) return { ok: false, reason: 'above-max', max: bounds.max };
  return { ok: true, value: n };
}
