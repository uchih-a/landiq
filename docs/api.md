# API Reference

Base URL: `/api/v1`

## GET /health

Liveness + readiness probe.

**Response 200:**
```json
{
  "status": "ok",
  "artifacts_loaded": true,
  "version": "0.1.0"
}
```

When artifacts are missing:
```json
{
  "status": "degraded",
  "artifacts_loaded": false,
  "version": "0.1.0"
}
```

## GET /meta

Returns model version, data date, and coverage thresholds from artifact files.

**P8b additions:** `fx` (the KSh↔USD conversion block), `flag_definition`
(the data-quality-flag percentile window), and `methodology` (the
plain-language pipeline copy) — all documented below.

**Response 200 (artifacts loaded, no FX configured):**
```json
{
  "model_version": "Run A (9 base features)",
  "data_date": "2025-01-15 10:00:00",
  "coverage": {
    "min_county_n": 10,
    "min_nearby_n": 5,
    "radius_km": 50
  },
  "ensemble_weights": {
    "model_order": ["xgb", "catboost", "tabnet"],
    "weights": [0.45, 0.35, 0.20]
  },
  "fx": null,
  "flag_definition": { "lower_pct": 1, "upper_pct": 99 },
  "methodology": {
    "sources_note": "Asking prices from public real estate listings ...",
    "cleaning_steps": ["...", "..."],
    "feature_groups": ["Distance to Nairobi", "..."]
  }
}
```

**Response 200 (degraded mode — no artifacts):**
```json
{
  "model_version": null,
  "data_date": null,
  "coverage": null,
  "ensemble_weights": null,
  "fx": null,
  "flag_definition": { "lower_pct": 1, "upper_pct": 99 },
  "methodology": { "...": "..." }
}
```

**`fx` — the KSh↔USD conversion block (P8b).**  There is NO default rate
in code: `fx` is `null` until the operator sets the `FX_KSH_PER_USD` env
var.  When set, the block carries `ksh_per_usd` (1 USD = N KSh),
`as_of` (free-form date the operator set the rate, from `FX_AS_OF`,
null when unset), and `source` (who maintains the rate, from
`FX_SOURCE`, null when unset).  The rate is read at startup (restart
required after a change) and is manually maintained — a live FX feed is
a separate, not-built architecture decision.  When `fx` is null the
frontend disables its USD toggle with an honest "not available" note and
renders KSh — it never guesses a rate.

**`flag_definition` — the flagged-listing rule (P7b/P8b).**  Listings
whose per-acre price falls outside the `lower_pct`–`upper_pct` percentile
window of the development target carry `data_quality_flag = true` in
`listings_scored.parquet` and are excluded from model training.  The
window comes from the canonical constants
(`app/schemas/canonical.py: FLAG_LOWER_PCT / FLAG_UPPER_PCT`) — the one
backend definition the whole stack reads; the UI interpolates it into
"1st–99th percentile window" copy instead of typing it.  Always served
(a code constant, not artifact-derived).

**`methodology` — the pipeline copy (P8b).**  One backend place for the
data-sources note, the verifiable cleaning steps, and the production
feature groups, rendered by the About page.  Every claim is verifiable
in the repo (see the canonical module's comment); claims the repo
cannot verify (duplicate-listing removal, coordinate-mismatch checks)
are deliberately absent.

## Error format

Every error response uses the same body shape:

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested resource was not found",
    "details": {},
    "request_id": "abc-123-def"
  }
}
```

| HTTP status | Code | When |
|---|---|---|
| 404 | `HTTP_404` | Unknown route |
| 422 | `VALIDATION_ERROR` | Request body/query validation failed |
| 500 | `INTERNAL_ERROR` | Unhandled exception |
| 503 | `ARTIFACT_NOT_LOADED` | Prediction requested while artifacts are missing |
| 503 | `MODEL_NOT_LOADED` | `/api/v1/predict` requested while the ensemble is not loaded |
| 503 | `DATA_UNAVAILABLE` | Read-only data endpoint requested while its source export file is missing |

## Headers

| Header | Direction | Description |
|---|---|---|
| `x-request-id` | Response | UUID4 (or echoed from request) for tracing |

## Read-only data endpoints

These endpoints serve Notebook 3 Phase 9's static export files.  Each loads
its source file once at startup via `AppExportsRegistry`; when the file is
missing the endpoint returns 503 `DATA_UNAVAILABLE` (not 500).

### GET /counties/summary — Market Insights

Source: `app_exports/county_summary.csv` (Cell 9.5) when unfiltered, or
the filtered `listings_scored.parquet` frame when `prop_type` is set.
Returns one row per county: listing count, median / Q1 / Q3 price per
acre, mean log price, water-body share (null on the frame path), and
the small-n flag (`n_below_min_county_n`; null when the threshold is
unavailable).

**P3b additions:** an optional `prop_type` query param (EXACT
case-insensitive canonical match; unknown -> 422 with `allowed`);
`property_types` (canonical list with counts, for the dropdown);
`price_bands` — the colour-band edges as DATA (quintiles of the
medians of the min_county_n-eligible counties, recomputed when the
filter changes so the legend always matches the map) with
`bands_reason` when they can't be computed; `min_county_n` from the
manifest config, **null + `data_quality: "min_county_n_missing"` when
the config lacks it** (no typed 10 fallback); and
`n_counties_with_data` / `n_counties_total`.

### GET /counties/{county}/distance-profile — Market Insights (P3b)

Whole-county distance profile for the scatter: `n`, `distance_range_km`,
`price_range`, a server-side OLS `trend` {slope, intercept, r2, n} on
log(price) vs distance-to-Nairobi, and `sample` — a deterministic
(fixed seed) UNBIASED random sample of up to `limit` points (default
400, max 1000) with `{distance_km, price_per_acre_ksh, verdict,
listing_no, prop_type}`, plus `n_total` so the UI can say "showing 400
of N".  Never a page of a sorted list.  Optional `prop_type` (same
validation).  Unknown county -> 422 with `allowed`.  A county below
`min_county_n` sets `low_support: true` and omits the trend (null) so
the UI shows a "limited data" note.

### GET /model/metrics — Model Performance

Sources: `app_exports/metrics_table.csv` + `metrics.json` (Cell 9.3).
Returns the table (one row per run x model with CV RMSE mean/se, test
metrics with bootstrap 95% CIs, county-grouped CV, ensemble weight; the
production run's `weighted_ensemble` row also carries the trimmed-test
result and interval coverage at 50/80/90%) plus the nested JSON.

**P5b additions (all nullable, additive):** `ensemble_model` (the
production run's ensemble row identified server-side — the frontend
resolves the row by this value only, no substring fallbacks);
`production_run_label`; `interval_levels` (derived from the artifact's
`interval_coverage_weighted_ensemble[*].level` entries, else the
populated coverage columns); `default_interval_level`;
`interval_method` (a documented backend constant describing the
implementation); `n_test` / `n_dev` (row counts of the loaded
prediction parquets); `model_info` (per-model `display_name` +
`family` from the backend's documented registry mapping).

### GET /model/feature-evaluation — Model Performance

Source: `app_exports/feature_evaluation.csv` (Cell 3.8's `ranked_table`,
written by Cell 9.3).  Phase 3 ranked feature table: availability,
missing %, mutual info, permutation importance, mean |SHAP|, selection
votes, in-selected-set.

### GET /model/explainability — Explainability

Sources: `app_exports/shap_global.csv` + `feature_importance.csv` +
`feature_labels.json` + `manifest.json` (Cell 9.4), plus the loaded model
registry + explanation service.  Global mean-|SHAP| for the tree models,
native + permutation importances for all three models, and plain-English
feature labels.  Per-listing SHAP is out of scope here — B2's predict
endpoint returns the live per-prediction driver breakdown (see the B2
final report's SHAP-in-scope decision).

**P6b additions** (all additive / nullable):

- `models` — the ensemble member list: `{key, display_name, family,
  ensemble_weight, has_shap}`.  Members come from the loaded registry
  (the real kept members with their renormalised weights) when it is up;
  otherwise from the distinct models in `shap_global.csv` (weights then
  null — the backend never invents weights).  Ordered by ensemble weight
  descending; `display_name` / `family` come from the canonical
  `MODEL_INFO` mapping.  `has_shap` is true for members with rows in
  `shap_global.csv`.
- `default_model` — the highest-weight SHAP-covered member (the bars
  card's default selection); first SHAP-covered member in file order when
  no weights are available; null when no member has SHAP rows.
- `ensemble_shap_coverage` — a documented block (no longer a verbatim
  manifest dict): `tree_share_explained_by_shap` and
  `tabnet_share_not_covered` as FRACTIONS in [0, 1], plus
  `explained_members` / `unexplained_members` and a `source` flag.
  - `source: "recomputed"` — computed from the actually-loaded
    (post-pruning, renormalised) ensemble via the ONE shared function
    (`landval.modelling.coverage.shap_coverage_from_weights`), so the
    Explainability donut, the registry's own report and every /predict
    response's live coverage block agree by construction.  Member lists
    are the real kept members.
  - `source: "manifest"` — the notebook-time values, normalised to
    fractions (values above 1 treated as percentages; a value that still
    cannot be a fraction is null).  Member lists are null — the manifest
    does not record them and the backend never invents names.
  - `source: null` — neither path produced shares.
- `typical_price_per_acre_ksh` / `combined_base_value` — the load-time
  baseline: `exp(sum of w_m * base_m)` over the kept tree members (the
  same value every /predict response reports, because TreeExplainer's
  expected value is constant per model).  Null when the registry /
  explanation service is unavailable.

### GET /listings/scored — Deal Finder

Source: `app_exports/listings_scored.parquet` (Cell 9.6).  Paginated +
filtered listing rows with SERVER-SIDE sorting.  Query parameters:

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | int | 1 | Page number (1-indexed) |
| `page_size` | int | 50 | Rows per page (max 200; the allowed options + default + max are served by `/listings/options`) |
| `county` | str | — | **P4b: EXACT case-insensitive match** against a county in the data (was a substring match); unknown -> 422 with `allowed` |
| `prop_type` | str | — | **P4b: EXACT case-insensitive match** against the canonical types (Land / Farm / Commercial; was a substring match); unknown -> 422 with `allowed` |
| `verdict` | str | — | One of `underpriced` / `fair` / `overpriced` |
| `scored_by` | str | — | One of `oof` (development) / `test` |
| `data_quality_flag` | bool | — | `true` = only flagged rows; `false` = only clean |
| `near_amenity` / `radius_km` | str / int | — | Amenity filter (see below); the canonical lists + availability flag are served by `/listings/options` |
| `sort` | str | `listed_over_predicted` | One of the keys served by `/listings/options` |
| `order` | str | per-key | **P4b:** `asc` / `desc`.  Defaults preserve each key's historical default (asc for the ratio + price keys, desc for `size_acres`).  Sort is stable with a `listing_no` tiebreaker, so pages are globally consistent: page N+1 asc starts where page N asc ended; desc is the exact reverse of asc. |

**P4b filter-semantics change:** `county` and `prop_type` moved from
substring to exact case-insensitive matching (unknown values 422 with
`allowed`).  This is a documented breaking change for any caller relying
on substring behaviour.

### GET /listings/options — Deal Finder (P4b)

Source: the loaded frame + the services.  Every option list + limit the
filters bar renders: canonical property types with counts (+
`unmapped_prop_type_rows`), exact county names with counts, verdict
definitions with data-derived rules (basis = the conformal-interval
comparison, match_rate, empirical ratio cut-offs — thresholds observed
in the frame, never typed), amenity + radius lists with
`amenity_filter_available` (false when the POI/roads data is missing),
page sizes + default + max, sort keys with default direction, and the
export row cap (`null` = uncapped; set via `LISTINGS_EXPORT_MAX_ROWS`).

### GET /listings/{listing_no}/nearby — Deal Finder (P4b)

Real nearest listings by haversine (the shared geo reference
conventions) to the given listing, excluding itself, with
`{listing_no, latitude, longitude, verdict, listed_price_per_acre_ksh,
distance_km}`.  `radius_km` / `limit` validated (defaults 50 km / 50,
max limit 200).  Unknown listing -> 404; a listing with missing
coordinates -> an empty list with `reason: "no_coordinates"`.

### GET /listings/scored/export.csv — Deal Finder (P4b)

Streaming CSV of every row matching the current filters (same
filter/sort semantics as `/listings/scored`).  Header row; UTF-8 with
BOM for Excel; money columns are raw KSh numbers so Excel can sum
them.  `Content-Disposition` filename built from the filters.  A row
cap ONLY when configured via `LISTINGS_EXPORT_MAX_ROWS` (default:
none); when capped, the response carries `X-Export-Truncated: true`
and `X-Export-Total` headers rather than silently cutting.

> **Warning — biased-sample footgun.**  `/listings/scored` defaults to
> `sort=listed_over_predicted` (ascending — most-underpriced-first).  Page
> 1 of any query is therefore a biased sample, and any client that
> computes corpus statistics (verdict counts, medians, scatter samples)
> from page 1 produces wrong numbers.  Use
> [`GET /overview/summary`](#get-overviewsummary--overview) for every
> corpus-wide statistic the UI shows — that endpoint computes over the
> whole usable frame in memory.

### GET /overview/summary — Overview

Source: `app_exports/listings_scored.parquet` (Cell 9.6).  One read-only
response that gives the Overview page every number it shows — totals,
verdicts, by-property-type / by-size-band / by-distance-band breakdowns,
log-linear trend, deterministic scatter sample, and top-N counties +
Others.  Computed over the WHOLE usable corpus (the frame is already in
memory) so the frontend stops deriving statistics from page 1 of
`/listings/scored` (which is biased — see above).

The endpoint also returns the canonical lists the UI never re-types:
`property_types_canonical` (`["Land", "Farm", "Commercial"]`),
`size_band_edges_acres` (8 edges, 7 bands; the final edge is `null`
because JSON can't serialise `+inf`), `size_band_labels`,
`distance_band_edges_km`, `distance_band_labels`.

Query parameters:

| Param | Type | Default | Description |
|---|---|---|---|
| `county` | str | — | Case-insensitive EXACT match against a county in the data.  Unknown -> 422 with an `allowed` list.  **Note: this is exact match, NOT the substring match `/listings/scored` uses.** |
| `prop_type` | str | — | Case-insensitive EXACT match against one of `Land` / `Farm` / `Commercial`.  Unknown -> 422 with `allowed`.  **Exact match, not substring.** |
| `top_n_counties` | int | 3 | How many named counties before the `Others` row (range 1..10). |
| `scatter_limit` | int | 400 | Cap on the scatter sample size (range 1..1000).  The sample is deterministic (fixed seed) and unbiased — a frame sorted by verdict still yields a representative mix. |

Filters apply to every block EXCEPT `national`, which is always
unfiltered so the UI can show coverage and context regardless of the
applied filter.  `by_property_type` is filtered by `county` only (so all
three bars always show even when a `prop_type` filter is applied).
`by_size_band.comparison` (the national series) is only present when a
county filter is applied — without a county there is no comparison group.

Rows whose `prop_type` is not in the canonical list are NOT silently
dropped or relabelled — they are counted under `unmapped_prop_type_rows`
and logged as a warning so the operator can decide to map, exclude, or
fix upstream.

### GET /model/error-by-support — Model Performance

Source: `backend_exports/error_by_support.csv` (Cell 9.9).  **P5b
additions:** each row carries `band_order` (the ascending ordinal
within its support_measure group, so the UI never parses band strings
like `<10 (below COVERAGE_MIN_COUNTY_N)` or `50+`), and the response
carries `support_measures` (the distinct groups with i18n label keys).
The band label itself is served VERBATIM from the notebook's export —
any embedded threshold is the notebook's own export text.

### GET /data/price-distribution — Data Explorer

Source: `app_exports/listings_scored.parquet`.  Log-scale histogram bins
(24 bins over the 0.5-99.5 percentile range of usable per-acre asking
prices) plus the percentile set p1/p10/p50/p90/p99 and the corpus
counters (`n_usable`, `n_flagged`) the Data Explorer stat tiles need.

**P7b addition:** `flag_definition` — the flagged-listing percentile
window (the same canonical constants /meta serves), so the Data
Explorer's "Sanitization" tile can explain what "flagged as possible
errors" means without typing "1st–99th".

### GET /predict/options — Predictor

Source: `app_exports/listings_scored.parquet` + the canonical constants
in `app/schemas/canonical.py`.  One read-only response that gives the
Predictor form every list + bound + default it needs:

- `property_types` — the canonical list `["Land", "Farm", "Commercial"]`
  with a per-type row count from the loaded frame.
- `property_types_canonical` — the names-only list (convenience).
- `unmapped_prop_type_rows` — count of rows whose `prop_type` is not in
  the canonical list (never silently dropped or relabelled; logged as a
  warning).
- `size_acres` — `{min, max, median}` computed from the frame's
  `size_acres` column.  Min/max use the 1st/99th percentile to avoid a
  single extreme outlier stretching the input's supported range.
- `default_confidence_level` + `allowed_confidence_levels` — from the
  canonical constants (the model's pre-calibrated levels: 0.50 / 0.80 /
  0.90).  The request still accepts any value in (0, 1); the list is
  informational.
- `parcel_features` — the ten infrastructure checklist keys in order
  (same names as `scoring_params.json:infra_items` and B1's
  `InfrastructureCalculator`).  The frontend iterates this list rather
  than keeping its own copy; labels stay in i18n, keyed by these keys.

Degraded mode: 503 `DATA_UNAVAILABLE` when `listings_scored.parquet` is
not loaded.  The frontend shows an error state with retry and disables
submit — it does NOT fall back to a built-in list.

### POST /predict — Price Predictor

Source: the loaded model ensemble + B1's feature pipeline.  Accepts a
`PredictRequest` body and returns the median KSh-per-acre price for a
Kenyan land parcel, the multiplicative confidence range at the requested
level, a low-support warning when the point's county or 50 km
neighbourhood has too few modelling-set listings to trust the estimate,
the live driver breakdown, and the nearest comparable listings.

**prop_type validation (P2b):** the request validates `prop_type`
against the canonical list `["Land", "Farm", "Commercial"]`
(case-insensitive, normalised to canonical casing).  Unknown values
return 422 with the `allowed` list in details.  The model's preprocessor
groups unseen categorical values into "Other" at transform time, so
this validation does NOT change inference for the canonical three — it
only stops the client from sending values the model treats as "Other"
anyway.

## Interactive docs

- Swagger UI: `/docs`
- ReDoc: `/redoc`
