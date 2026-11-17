/**
 * TypeScript response types for the Kenya Land Valuation API (B0/B2/B3/B4/B5).
 *
 * These are derived verbatim from the backend's Pydantic schemas in
 * `backend/app/schemas/*.py` — every field name and nullability matches the
 * OpenAPI the backend serves at /api/v1. Keep this file in sync with the
 * backend schemas; the OpenAPI snapshot at
 * `download/kenya-land-valuation/docs/openapi.snapshot.json` is the
 * authoritative cross-check.
 *
 * Conventions:
 * - `T | null` mirrors Pydantic's `T | None` (nullable in the JSON).
 * - `Record<string, unknown>` is used where the backend hands back a
 *   free-form dict (manifest blocks, diagnostics, ensemble_shap_coverage)
 *   rather than inventing a half-correct shape.
 */

// ---- Health & Meta (B0) ----

export interface HealthResponse {
  status: 'ok' | 'degraded';
  artifacts_loaded: boolean;
  version: string;
}

export interface CoverageThresholds {
  min_county_n: number;
  min_nearby_n: number;
  radius_km: number;
}

export interface MetaResponse {
  model_version: string | null;
  data_date: string | null;
  coverage: CoverageThresholds | null;
  ensemble_weights: Record<string, unknown> | null;
}

// ---- Predict (B2) ----

/**
 * Infrastructure checklist value per parcel feature.
 * Backend accepts `true`/`false` (present/absent) or the literal
 * string `"not_sure"`. `null` is treated identically to `"not_sure"`.
 */
export type ChecklistValue = boolean | 'not_sure' | null;

export interface PredictRequest {
  lat: number;
  lon: number;
  size_acres: number;
  prop_type: string;
  parcel_features: Record<string, ChecklistValue>;
  confidence_level?: number;
}

export interface CoverageWarning {
  is_low_support: boolean;
  county_listings: number;
  nearby_listings: number;
  radius_km: number;
  min_county_n: number;
  min_nearby_n: number;
  reason: string;
}

export interface DriverContribution {
  feature: string;
  label: string;
  shap_value: number;
  effect_pct: number;
  direction: 'price-increasing' | 'price-decreasing' | 'neutral';
}

export interface EnsembleShapCoverage {
  tree_share_explained_by_shap: number;
  tabnet_share_not_covered: number;
  explained_members: string[];
  unexplained_members: string[];
  combined_base_value: number;
  typical_price_per_acre_ksh: number;
  latency_ms: number;
}

export interface LiveExplanation {
  drivers: DriverContribution[];
  coverage: EnsembleShapCoverage;
}

export interface ComparableListing {
  listing_no: string | null;
  title: string | null;
  location: string | null;
  county: string | null;
  size_acres: number;
  listed_price_per_acre_ksh: number;
  predicted_price_per_acre_ksh: number;
  verdict: string;
  distance_km: number;
}

export interface PredictNamedPOI {
  name: string;
  category: string;
  distance_km: number;
  is_fallback?: boolean;
}

export interface PredictResponse {
  price_per_acre_ksh: number;
  price_per_acre_low_ksh: number;
  price_per_acre_high_ksh: number;
  total_price_ksh: number;
  total_price_low_ksh: number;
  total_price_high_ksh: number;
  confidence_level: number;
  county: string | null;
  coverage: CoverageWarning;
  ensemble_members: Record<string, number>;
  diagnostics: Record<string, unknown>;
  explanation: LiveExplanation | null;
  comparables: ComparableListing[];
  named_pois: PredictNamedPOI[];
}

// ---- Counties (B5) ----

export interface CountySummaryRow {
  county: string;
  n_listings: number;
  median_price_per_acre_ksh: number;
  q1_price_per_acre_ksh: number;
  q3_price_per_acre_ksh: number;
  mean_log_price_per_acre: number;
  water_body_distance_share: number;
  n_below_min_county_n: boolean;
}

export interface CountySummaryResponse {
  counties: CountySummaryRow[];
  n_counties: number;
  min_county_n: number;
}

export interface CountyRowCount {
  county: string;
  n_listings: number;
}

export interface CountyRowCountsResponse {
  counties: CountyRowCount[];
  total_listings: number;
  n_counties: number;
}

export interface CountyListingScatterRow {
  listing_no: string | null;
  title: string | null;
  latitude: number | null;
  longitude: number | null;
  listed_price_per_acre_ksh: number;
  dist_to_nairobi_km: number | null;
  size_acres: number;
  verdict: string;
  data_quality_flag: boolean;
}

export interface PaginationMeta {
  page: number;
  page_size: number;
  total_rows: number;
  total_pages: number;
  filters: Record<string, unknown>;
}

export interface CountyListingsResponse {
  county: string;
  pagination: PaginationMeta;
  listings: CountyListingScatterRow[];
}

// ---- Listings (B3) ----

export interface ListingsScoredRow {
  listing_url: string | null;
  listing_no: string | null;
  title: string | null;
  location: string | null;
  county: string | null;
  prop_type: string | null;
  latitude: number | null;
  longitude: number | null;
  price_ksh: number | null;
  size_acres: number;
  listed_price_per_acre_ksh: number;
  predicted_price_per_acre_ksh: number;
  low_price_per_acre_ksh: number;
  high_price_per_acre_ksh: number;
  listed_over_predicted: number;
  scored_by: string;
  verdict: string;
  data_quality_flag: boolean;
}

export interface ListingsScoredResponse {
  pagination: PaginationMeta;
  listings: ListingsScoredRow[];
}

// ---- Model (B3) ----

export interface MetricsTableRow {
  run: string;
  model: string;
  cv_rmse_mean: number;
  cv_rmse_se: number;
  test_R2: number;
  test_RMSE: number;
  test_MAE: number;
  test_MedAPE_pct: number;
  test_MAE_KSh_per_acre: number;
  ci95_R2_lo: number;
  ci95_R2_hi: number;
  ci95_RMSE_lo: number;
  ci95_RMSE_hi: number;
  ci95_MAE_lo: number;
  ci95_MAE_hi: number;
  county_group_cv_rmse: number | null;
  ensemble_weight: number | null;
  trimmed_test_rmse?: number | null;
  trimmed_test_rows?: number | null;
  interval_coverage_50?: number | null;
  interval_width_ratio_50?: number | null;
  interval_coverage_80?: number | null;
  interval_width_ratio_80?: number | null;
  interval_coverage_90?: number | null;
  interval_width_ratio_90?: number | null;
}

export interface MetricsTableResponse {
  rows: MetricsTableRow[];
  n_runs: number;
  n_models_per_run: number;
}

export interface MetricsResponse {
  table: MetricsTableResponse;
  metrics_json: Record<string, unknown>;
}

export interface FeatureEvaluationRow {
  feature: string;
  group: string;
  available: string;
  'missing_%': number;
  mutual_info: number | null;
  perm_delta_rmse: number;
  mean_abs_shap: number | null;
  selection_votes: number;
  in_selected_set: boolean;
}

export interface FeatureEvaluationResponse {
  rows: FeatureEvaluationRow[];
  n_features: number;
}

export interface ShapGlobalRow {
  model: string;
  feature: string;
  mean_abs_shap: number;
}

export interface FeatureImportanceRow {
  model: string;
  feature: string;
  importance: number;
  method: string;
}

export interface FeatureLabel {
  label: string;
  unit: string;
  description: string;
  source: string;
  in_production_set: boolean;
  available_at_prediction_time: string | boolean | null;
}

export interface ExplainabilityResponse {
  production_run: string;
  shap_global: ShapGlobalRow[];
  feature_importance: FeatureImportanceRow[];
  feature_labels: Record<string, FeatureLabel>;
  ensemble_shap_coverage: Record<string, unknown>;
}

// ---- Model predictions + error-by-support (P5 wiring — known-gaps #49) ----
// Backend schemas: backend/app/schemas/predictions.py
// Field names verified verbatim from the Pydantic models.

/** One row from oof_predictions or test_predictions parquet (Cell 9.2).
 *  All pred_* fields are LOG-SCALE (natural log of KSh per acre). */
export interface PredictionRow {
  listing_url: string | null;
  listing_no: string | null;
  title: string | null;
  location: string | null;
  county: string | null;
  prop_type: string | null;
  latitude: number | null;
  longitude: number | null;
  price_ksh: number | null;
  y_true: number;           // log price per acre (the target)
  pred_xgb: number;          // XGBoost log-scale prediction
  pred_catboost: number;     // CatBoost log-scale prediction
  pred_tabnet: number;       // TabNet log-scale prediction
  pred_simple_average: number;
  pred_weighted_ensemble: number;
  fold: number;              // -1 for test rows
  split: 'dev' | 'test';
}

/** GET /api/v1/model/predictions response — both OOF + test sets. */
export interface ModelPredictionsResponse {
  oof: PredictionRow[];
  test: PredictionRow[];
  oof_count: number;
  test_count: number;
  sampled: boolean;
  sample_size: number | null;
}

/** One row from error_by_support.csv (Cell 9.9). */
export interface ErrorBySupportRow {
  support_measure: 'county_listings' | 'nearby_within_50km';
  band: string;
  n_listings: number;
  oof_rmse: number;  // log scale
  oof_mae: number;   // log scale
}

/** GET /api/v1/model/error-by-support response. */
export interface ErrorBySupportResponse {
  rows: ErrorBySupportRow[];
  n_rows: number;
}

// ---- Data Explorer: price distribution (P-fidelity round) ----
// Backend schema: backend/app/schemas/data_explorer.py — field names verbatim.

/** One log-spaced histogram bin of per-acre asking prices. */
export interface PriceBin {
  lower_ksh: number;
  upper_ksh: number;
  count: number;
}

/** Percentile set of usable per-acre asking prices (KSh). */
export interface PricePercentiles {
  p1: number;
  p10: number;
  p50: number;
  p90: number;
  p99: number;
}

/** GET /api/v1/data/price-distribution response. */
export interface PriceDistributionResponse {
  n_bins: number;
  bins: PriceBin[];
  percentiles: PricePercentiles;
  /** Usable listings (rows with a finite positive per-acre price). */
  n_usable: number;
  /** Listings whose data_quality_flag is true (excluded from training). */
  n_flagged: number;
}

// ---- Places (B4) ----

export interface PlaceSearchResult {
  name: string;
  place_type: string | null;
  county: string | null;
  subtitle: string;
  latitude: number;
  longitude: number;
  population: number | null;
}

export interface PlaceSearchResponse {
  query: string;
  results: PlaceSearchResult[];
  total: number;
}

export interface NamedPOIResult {
  name: string;
  category: string;
  amenity: string | null;
  shop: string | null;
  highway: string | null;
  latitude: number;
  longitude: number;
  distance_km: number;
  is_fallback?: boolean;
}

export interface NearbyPOIsResponse {
  lat: number;
  lon: number;
  radius_km: number;
  category: string | null;
  pois: NamedPOIResult[];
  total: number;
}

// ---- GeoJSON (B5 county boundaries) ----

/**
 * Minimal GeoJSON FeatureCollection typing for the /counties/boundaries
 * endpoint — the backend returns the raw cached GeoJSON dict (no Pydantic
 * model). We type only the envelope; the geometry + properties are kept
 * as `unknown` to avoid pinning a wrong shape that drifts from the
 * simplification pipeline.
 */
export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry: {
      type: string;
      coordinates: unknown;
    } | null;
  }>;
}

// ---- Standard error body (B0) ----

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
    request_id: string;
  };
}

// ---- Deal Finder filter shape (B3 query params) ----

/**
 * Strongly-typed mirror of the query params accepted by
 * GET /listings/scored. The hook serializes only the set (non-null)
 * fields into the request URL so omitted filters behave identically
 * across callers.
 */
export type ListingsSortKey =
  | 'listed_over_predicted'
  | 'listed_price_per_acre_ksh'
  | 'predicted_price_per_acre_ksh'
  | 'size_acres';

export type VerdictFilter = 'underpriced' | 'fair' | 'overpriced';
export type ScoredByFilter = 'oof' | 'test';
export type NearAmenityFilter = 'school' | 'hospital' | 'tarmac_road';
export type AmenityRadiusKm = 1 | 3 | 5;

export interface ListingsScoredFilters {
  page?: number;
  page_size?: number;
  county?: string;
  prop_type?: string;
  verdict?: VerdictFilter;
  scored_by?: ScoredByFilter;
  data_quality_flag?: boolean;
  near_amenity?: NearAmenityFilter;
  radius_km?: AmenityRadiusKm;
  sort?: ListingsSortKey;
}

// ---- Nearby POI category (B4) ----

export type NearbyPOICategory =
  | 'hospital'
  | 'school'
  | 'market'
  | 'bank'
  | 'police'
  | 'bus_stop'
  | 'fuel';
