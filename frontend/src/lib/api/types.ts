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

/** P8b: KSh↔USD FX block served by /meta.  No default rate: the block is
 *  null until the operator sets FX_KSH_PER_USD (frontend disables USD). */
export interface FxBlock {
  /** 1 USD = N KSh (operator-configured; no code default). */
  ksh_per_usd: number;
  /** Free-form date the operator set the rate; null when unset. */
  as_of: string | null;
  /** Who maintains the rate — "fixed" vs live; null when unset. */
  source: string | null;
}

/** The flagged-listing rule (P7b/P8b): prices outside the lower–upper
 *  percentile window carry data_quality_flag = true.  Served on /meta
 *  and /data/price-distribution so the UI never re-types "1st–99th". */
export interface FlagDefinition {
  lower_pct: number;
  upper_pct: number;
}

/** P8b: plain-language methodology block (sources note, verifiable
 *  cleaning steps, feature groups) — the About page renders from it. */
export interface MethodologyBlock {
  sources_note: string | null;
  cleaning_steps: string[] | null;
  feature_groups: string[] | null;
}

export interface MetaResponse {
  model_version: string | null;
  data_date: string | null;
  coverage: CoverageThresholds | null;
  ensemble_weights: Record<string, unknown> | null;
  /** P8b: KSh↔USD rate from backend settings.  Null when the operator
   *  hasn't configured one — the USD toggle is then disabled (honest
   *  "not available"), never a typed fallback. */
  fx: FxBlock | null;
  /** P7b/P8b: the flagged-listing percentile window (canonical constant). */
  flag_definition: FlagDefinition | null;
  /** P8b: methodology copy (sources note / cleaning steps / feature groups). */
  methodology: MethodologyBlock | null;
}

// ---- Predict (B2) ----

/**
 * Infrastructure checklist value per parcel feature.
 * Backend accepts `true`/`false` (present/absent) or the literal
 * string `"not_sure"`. `null` is treated identically to `"not_sure"`.
 */
export type ChecklistValue = boolean | 'not_sure' | null;

// ---- Predict options (P2b) ----
// Mirror of backend/app/schemas/predict_options.py — every field name +
// nullability matches the Pydantic schema verbatim.  Keep in sync.

export interface PredictPropertyTypeOption {
  name: string;
  n: number;
}

export interface PredictSizeAcresBounds {
  min: number;
  max: number;
  median: number;
}

export interface PredictOptionsResponse {
  property_types: PredictPropertyTypeOption[];
  unmapped_prop_type_rows: number;
  size_acres: PredictSizeAcresBounds;
  default_confidence_level: number;
  allowed_confidence_levels: number[];
  parcel_features: string[];
  property_types_canonical: string[];
}

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
  /** Null when the county has no usable rows under the current filter. */
  median_price_per_acre_ksh: number | null;
  q1_price_per_acre_ksh: number | null;
  q3_price_per_acre_ksh: number | null;
  mean_log_price_per_acre: number | null;
  /** Null on the frame path (the notebook column isn't filterable). */
  water_body_distance_share: number | null;
  /** Null when the min_county_n threshold itself is unavailable. */
  n_below_min_county_n: boolean | null;
  /** Part B3: suspect-listing count for this county (null when the scored
   * frame is unavailable).  Powers the Locations tab's "share suspect"
   * choropleth metric. */
  n_suspect?: number | null;
  /** Part B3: n_suspect / n_listings (null when n_listings is 0 or the
   * scored frame is unavailable). */
  share_suspect?: number | null;
}

/** P3b: canonical property type + corpus row count (dropdown data). */
export interface CountyPropertyTypeCount {
  name: string;
  n: number;
}

/** P3b: one data-driven colour-band edge (quintiles of county medians). */
export interface PriceBandEdge {
  index: number;
  lower: number;
  /** Null = the open top band (>= lower). */
  upper: number | null;
}

export interface CountySummaryResponse {
  counties: CountySummaryRow[];
  n_counties: number;
  /** Null + data_quality="min_county_n_missing" when the config lacks it. */
  min_county_n: number | null;
  prop_type: string | null;
  property_types: CountyPropertyTypeCount[];
  price_bands: PriceBandEdge[];
  bands_reason: string | null;
  data_quality: string | null;
  n_counties_with_data: number | null;
  n_counties_total: number | null;
  unmapped_prop_type_rows: number | null;
}

// ---- County distance profile (P3b) ----

export interface DistanceProfileTrend {
  slope: number | null;
  intercept: number | null;
  r2: number | null;
  n: number;
}

export interface DistanceProfilePoint {
  listing_no: string | null;
  distance_km: number | null;
  price_per_acre_ksh: number;
  verdict: string | null;
  prop_type: string | null;
}

export interface CountyDistanceProfileResponse {
  county: string;
  prop_type: string | null;
  n: number;
  low_support: boolean;
  min_county_n: number | null;
  distance_range_km: [number, number] | null;
  price_range: [number, number] | null;
  trend: DistanceProfileTrend | null;
  sample: DistanceProfilePoint[];
  n_total: number;
  n_returned: number;
  sample_limit: number;
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
  /** Part B: suspect-listing gate (true when listed_over_predicted is
   * outside [0.05, 20.0] or size is non-finite). Suspects are excluded
   * from deal verdicts and the corpus counts. */
  is_suspect?: boolean;
  /** One of 'listed_far_below_model' | 'listed_far_above_model' |
   * 'non_finite_size' | null. */
  suspect_reason?: string | null;
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
  /** P5b: the production run's ensemble row's model name (null when absent —
   *  the UI shows "not available", no fallbacks). */
  ensemble_model: string | null;
  /** P5b: production run name + created date, for the card subtitle. */
  production_run_label: string | null;
  /** P5b: nominal interval coverage levels present in the data. */
  interval_levels: number[] | null;
  default_interval_level: number | null;
  /** P5b: documented interval method (null when unknown). */
  interval_method: string | null;
  /** P5b: row counts of the loaded prediction parquets. */
  n_test: number | null;
  n_dev: number | null;
  /** P5b: per-model display_name + family (backend registry mapping). */
  model_info: Record<string, { display_name: string; family: string }>;
}

/** P5b: one support-measure group with its i18n label key. */
export interface SupportMeasureOption {
  value: string;
  label_key: string;
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

/** One ensemble member on the /model/explainability payload (P6b).
 *  Backend schema: backend/app/schemas/app_exports.py ExplainabilityModel. */
export interface ExplainabilityModel {
  key: string;
  display_name: string;
  family: string | null;
  ensemble_weight: number | null;
  has_shap: boolean;
}

/** The /model/explainability coverage block (P6b) — fractions in [0,1]
 *  with a source flag.  Shares come from the backend normalised; the
 *  frontend renders what it gets and never renormalises. */
export interface ExplainabilityCoverage {
  tree_share_explained_by_shap: number | null;
  tabnet_share_not_covered: number | null;
  explained_members: string[] | null;
  unexplained_members: string[] | null;
  source: 'recomputed' | 'manifest' | null;
  note?: string | null;
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
  /** P6b: the manifest block is now a documented shape (fractions +
   *  source). Older payloads served a raw dict; the fields below are
   *  optional so those still type-check. */
  ensemble_shap_coverage: ExplainabilityCoverage | Record<string, unknown>;
  /** P6b additions (optional — older payloads lack them). */
  models?: ExplainabilityModel[];
  default_model?: string | null;
  typical_price_per_acre_ksh?: number | null;
  combined_base_value?: number | null;
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
  /** P5b: ascending ordinal within the support_measure group. */
  band_order: number;
}

/** GET /api/v1/model/error-by-support response. */
export interface ErrorBySupportResponse {
  rows: ErrorBySupportRow[];
  n_rows: number;
  /** P5b: the distinct groups with i18n label keys. */
  support_measures: SupportMeasureOption[];
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
  /** P7b: the flag rule (percentile window) so the UI never re-types
   *  "1st–99th". */
  flag_definition: FlagDefinition | null;
}

// ---- Part B1: GET /api/v1/data/price-by-group ----

/** One group's price-per-acre summary (prop_type value or size-band label key). */
export interface PriceByGroupRow {
  /** Canonical prop_type ("Land"/"Farm"/"Commercial") or a raw unmapped
   * value, OR a size-band i18n key (``de.sizeBand.*``). */
  group: string;
  n: number;
  /** True when n < MIN_GROUP_N — stats are null. */
  insufficient: boolean;
  median_listed_per_acre_ksh: number | null;
  p10_listed_per_acre_ksh: number | null;
  p90_listed_per_acre_ksh: number | null;
  median_predicted_per_acre_ksh: number | null;
}

/** GET /api/v1/data/price-by-group response. */
export interface PriceByGroupResponse {
  group: 'prop_type' | 'size_band';
  include_suspect: boolean;
  n_usable: number;
  /** MIN_GROUP_N from canonical.py (echoed so the UI never re-types it). */
  min_group_n: number;
  bands: PriceByGroupRow[];
}

// ---- Part B2: GET /api/v1/data/relationships ----

/** Median listed price/acre for one log-size decile of the usable frame. */
export interface RelationshipsDecilePoint {
  decile: number;
  n: number;
  median_listed_per_acre_ksh: number | null;
  median_size_acres: number | null;
}

/** One row of the deterministic uniform sample. */
export interface RelationshipsSamplePoint {
  listing_no: string | null;
  size_acres: number;
  listed_price_per_acre_ksh: number;
  is_suspect: boolean;
  data_quality_flag: boolean;
}

/** GET /api/v1/data/relationships response. */
export interface RelationshipsResponse {
  n_usable: number;
  n_total: number;
  /** Spearman rho over the FULL usable frame (null when <2 usable rows). */
  spearman_rho: number | null;
  deciles: RelationshipsDecilePoint[];
  sample: RelationshipsSamplePoint[];
  sample_n: number;
  sample_seed: number;
  min_group_n: number;
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
  /** Part B suspect-listing gate: true = only suspect rows, false = only
   * non-suspect rows, undefined = both. */
  is_suspect?: boolean;
  near_amenity?: NearAmenityFilter;
  radius_km?: AmenityRadiusKm;
  sort?: ListingsSortKey;
  /** P4b: server-side sort direction ('asc' | 'desc'). */
  order?: 'asc' | 'desc';
}

// ---- Deal Finder options + nearby (P4b) ----
// Mirror of backend/app/schemas/listings_options.py — keep in sync.

export interface ListingsPropertyTypeOption {
  name: string;
  n: number;
}

export interface ListingsCountyOption {
  name: string;
  n: number;
}

export interface VerdictRule {
  basis: string | null;
  match_rate: number | null;
  under_ratio_max: number | null;
  over_ratio_min: number | null;
  interval_low_ref: string | null;
  interval_high_ref: string | null;
}

export interface VerdictOption {
  value: string;
  label_key: string;
  rule: VerdictRule;
}

export interface AmenityOption {
  value: string;
  label_key: string;
}

export interface SortKeyOption {
  value: string;
  label_key: string;
  default_order: 'asc' | 'desc';
}

export interface ListingsOptionsResponse {
  property_types: ListingsPropertyTypeOption[];
  unmapped_prop_type_rows: number;
  counties: ListingsCountyOption[];
  verdicts: VerdictOption[];
  amenities: AmenityOption[];
  radii_km: number[];
  amenity_filter_available: boolean;
  page_sizes: number[];
  default_page_size: number;
  max_page_size: number;
  sort_keys: SortKeyOption[];
  export_max_rows: number | null;
}

export interface NearbyListing {
  listing_no: string | null;
  latitude: number | null;
  longitude: number | null;
  verdict: string;
  listed_price_per_acre_ksh: number;
  distance_km: number;
}

export interface NearbyListingsResponse {
  listing_no: string;
  radius_km: number;
  reason: string | null;
  nearby: NearbyListing[];
  n_returned: number;
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

// ---- Overview summary (O1) ----
// Mirror of backend/app/schemas/overview.py — every field name + nullability
// matches the Pydantic schema verbatim.  Keep in sync.

export interface OverviewPropertyTypeCount {
  name: string;
  n: number;
}

export interface OverviewFiltersBlock {
  county: string | null;
  prop_type: string | null;
  property_types: OverviewPropertyTypeCount[];
}

export interface OverviewTotalsBlock {
  n_listings: number;
  n_flagged: number;
  median_price_per_acre_ksh: number | null;
  q1_price_per_acre_ksh: number | null;
  q3_price_per_acre_ksh: number | null;
  n_counties_with_data: number;
  n_counties_meeting_threshold: number;
}

export interface OverviewVerdictsBlock {
  underpriced: number;
  fair: number;
  overpriced: number;
  n_unknown: number;
  underpriced_share: number | null;
  fair_share: number | null;
  overpriced_share: number | null;
  n_listings: number;
  /** Part B: suspect count, reported separately and excluded from the
   * underpriced/fair/overpriced counts above. */
  n_suspect?: number;
}

export interface OverviewPropertyTypeStat {
  name: string;
  n: number;
  median_price_per_acre_ksh: number | null;
  q1_price_per_acre_ksh: number | null;
  q3_price_per_acre_ksh: number | null;
}

export interface OverviewByPropertyTypeBlock {
  types: OverviewPropertyTypeStat[];
  leader: string | null;
  leader_premium_pct: number | null;
}

export interface OverviewSizeBand {
  label: string;
  lower_acres: number;
  /** Null for the final open-ended band ('20+ ac'). */
  upper_acres: number | null;
  n: number;
  median_price_per_acre_ksh: number | null;
  low_support: boolean;
}

export interface OverviewBySizeBandBlock {
  bands: OverviewSizeBand[];
  /** National series, only present when a county filter is applied. */
  comparison: OverviewSizeBand[] | null;
  bulk_discount_pct: number | null;
}

export interface OverviewDistanceBand {
  label: string;
  lower_km: number;
  /** Null for the final open-ended band ('400+ km'). */
  upper_km: number | null;
  n: number;
  median_price_per_acre_ksh: number | null;
  q1_price_per_acre_ksh: number | null;
  q3_price_per_acre_ksh: number | null;
  low_support: boolean;
}

export interface OverviewByDistanceBandBlock {
  bands: OverviewDistanceBand[];
}

export interface OverviewTrendBlock {
  slope: number | null;
  intercept: number | null;
  r2: number | null;
  n: number;
}

export interface OverviewScatterPoint {
  listing_no: string | null;
  county: string | null;
  distance_km: number | null;
  price_per_acre_ksh: number;
  verdict: string | null;
}

export interface OverviewScatterSampleBlock {
  points: OverviewScatterPoint[];
  n_total: number;
  n_returned: number;
  sample_limit: number;
}

export interface OverviewCountyStat {
  county: string;
  n: number;
  median_price_per_acre_ksh: number | null;
}

export interface OverviewOthersBlock {
  counties: string[];
  n: number;
  median_price_per_acre_ksh: number | null;
}

export interface OverviewCountiesBlock {
  top: OverviewCountyStat[];
  others: OverviewOthersBlock;
  top_n: number;
}

export interface OverviewSummaryResponse {
  filters: OverviewFiltersBlock;
  property_types_canonical: string[];
  /** Canonical size-band edges; the final edge is `null` (open tail). */
  size_band_edges_acres: (number | null)[];
  size_band_labels: string[];
  /** Canonical distance-band edges; the final edge is `null` (open tail). */
  distance_band_edges_km: (number | null)[];
  distance_band_labels: string[];
  unmapped_prop_type_rows: number;
  totals: OverviewTotalsBlock;
  national: OverviewTotalsBlock;
  n_counties_total: number;
  verdicts: OverviewVerdictsBlock;
  by_property_type: OverviewByPropertyTypeBlock;
  by_size_band: OverviewBySizeBandBlock;
  by_distance_band: OverviewByDistanceBandBlock;
  trend: OverviewTrendBlock;
  scatter_sample: OverviewScatterSampleBlock;
  counties: OverviewCountiesBlock;
  generated_from: string | null;
}

/** Query params for GET /api/v1/overview/summary. */
export interface OverviewSummaryFilters {
  county?: string;
  prop_type?: string;
  top_n_counties?: number;
  scatter_limit?: number;
}
