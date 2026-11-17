/**
 * Pure helpers and constants for the Predictor screen.
 *
 * Kept in a non-component module so the react-refresh `only-export-components`
 * rule doesn't fire on the constants/types/functions (mirrors Overview's
 * `overview-helpers.ts` pattern).
 *
 * Contents:
 *  - `PARCEL_FEATURE_KEYS` / `PARCEL_FEATURE_LABELS` — the ten infrastructure
 *    checklist items. Names match `scoring_params.json:infra_items` and B1's
 *    `InfrastructureCalculator` exactly (see backend
 *    `app/schemas/predict.py:PARCEL_CHECKLIST_FIELDS`).
 *  - `PROP_TYPE_OPTIONS` — common Kenyan listing property types.
 *  - `TriState` / `triStateToChecklist` / `initialChecklist` — the form-side
 *    Yes/No/Not-Sure state and its conversion to the backend's
 *    `ChecklistValue = boolean | 'not_sure' | null`.
 *  - `TITLE_DOC_KEY` — sentinel for the frontend-only title-docs field.
 *
 * NOTE: Title Documentation is a frontend-only field not yet wired to the
 * backend. The PredictRequest schema only accepts lat, lon, size_acres,
 * prop_type, parcel_features, confidence_level — there is no slot for it.
 */

import type { ChecklistValue } from '@/lib/api/types';

/** The form's three-state value for each checklist item. */
export type TriState = 'yes' | 'no' | 'unsure';

/** The ten infrastructure checklist items — same names as the backend. */
export const PARCEL_FEATURE_KEYS = [
  'borehole',
  'piped_water',
  'river_water',
  'water_tank',
  'grid_electric',
  'solar_electric',
  'full_fence',
  'partial_fence',
  'structures',
  'internal_road',
] as const;

export type ParcelFeatureKey = (typeof PARCEL_FEATURE_KEYS)[number];

/** Human-readable labels for each parcel feature. */
export const PARCEL_FEATURE_LABELS: Record<ParcelFeatureKey, string> = {
  borehole: 'Borehole',
  piped_water: 'Piped water',
  river_water: 'River / stream water',
  water_tank: 'Water tank',
  grid_electric: 'Grid electricity',
  solar_electric: 'Solar electricity',
  full_fence: 'Full perimeter fence',
  partial_fence: 'Partial fence',
  structures: 'Structures on site',
  internal_road: 'Internal access road',
};

/** Common Kenyan listing property types offered as pills on Step 2. */
export const PROP_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'Land', label: 'Land' },
  { value: 'Farm', label: 'Farm' },
  { value: 'Residential', label: 'Residential' },
  { value: 'Commercial', label: 'Commercial' },
  { value: 'Industrial', label: 'Industrial' },
  { value: 'Plot', label: 'Plot' },
];

/**
 * Sentinel key for the Title Documentation field. Frontend-only — never
 * included in the PredictRequest body (the schema rejects unknown keys via
 * `_check_keys` validator in `app/schemas/predict.py`).
 */
export const TITLE_DOC_KEY = 'title_documentation';

/** Map the form's TriState to the backend's ChecklistValue. */
export function triStateToChecklist(v: TriState): ChecklistValue {
  if (v === 'yes') return true;
  if (v === 'no') return false;
  return 'not_sure';
}

/** Build the initial checklist state with every item set to "Not Sure". */
export function initialChecklist(): Record<ParcelFeatureKey, TriState> {
  return Object.fromEntries(
    PARCEL_FEATURE_KEYS.map((k) => [k, 'unsure' as TriState]),
  ) as Record<ParcelFeatureKey, TriState>;
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
 * G2 fix: the previous logic checked `county_listings === 0` for unsupported,
 * but the design's 04_unsupported state has county_listings = 2 (below the
 * min_county_n threshold of 10, but not zero). The correct trigger is
 * nearby_listings === 0 — when there are ZERO listings near the point, the
 * estimate is meaningless. When there are SOME nearby listings (even if
 * below min_nearby_n), the estimate is "limited" but usable.
 */
export type ResultState = 'reliable' | 'limited' | 'unsupported';

export function deriveResultState(coverage: {
  is_low_support: boolean;
  county_listings: number;
  nearby_listings: number;
}): ResultState {
  if (!coverage.is_low_support) return 'reliable';
  // If there are SOME nearby listings, the estimate is usable (limited).
  // If nearby_listings is 0, we can't produce a meaningful estimate.
  if (coverage.nearby_listings > 0) return 'limited';
  return 'unsupported';
}
