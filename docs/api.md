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

**Response 200 (artifacts loaded):**
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
  }
}
```

**Response 200 (degraded mode — no artifacts):**
```json
{
  "model_version": null,
  "data_date": null,
  "coverage": null,
  "ensemble_weights": null
}
```

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

Source: `app_exports/county_summary.csv` (Cell 9.5).  Returns one row per
county: listing count, median / Q1 / Q3 price per acre, mean log price,
water-body share, and the small-n flag (`n_below_min_county_n`).

### GET /model/metrics — Model Performance

Sources: `app_exports/metrics_table.csv` + `metrics.json` (Cell 9.3).
Returns the table (one row per run x model with CV RMSE mean/se, test
metrics with bootstrap 95% CIs, county-grouped CV, ensemble weight; the
production run's `weighted_ensemble` row also carries the trimmed-test
result and interval coverage at 50/80/90%) plus the nested JSON.

### GET /model/feature-evaluation — Model Performance

Source: `app_exports/feature_evaluation.csv` (Cell 3.8's `ranked_table`,
written by Cell 9.3).  Phase 3 ranked feature table: availability,
missing %, mutual info, permutation importance, mean |SHAP|, selection
votes, in-selected-set.

### GET /model/explainability — Explainability

Sources: `app_exports/shap_global.csv` + `feature_importance.csv` +
`feature_labels.json` + `manifest.json:ensemble_shap_coverage` (Cell 9.4).
Global mean-|SHAP| for both tree models, native + permutation importances
for all three models, plain-English feature labels, and the
ensemble-SHAP-coverage note (tree share explained; TabNet share not
covered).  Per-listing SHAP is out of scope here — B2's predict endpoint
returns a per-prediction diagnostics block but does not compute live SHAP
(see the B2 final report's SHAP-in-scope decision).

### GET /listings/scored — Deal Finder

Source: `app_exports/listings_scored.parquet` (Cell 9.6).  Paginated +
filtered listing rows.  Query parameters:

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | int | 1 | Page number (1-indexed) |
| `page_size` | int | 50 | Rows per page (max 200) |
| `county` | str | — | Case-insensitive substring filter |
| `prop_type` | str | — | Case-insensitive substring filter |
| `verdict` | str | — | One of `underpriced` / `fair` / `overpriced` |
| `scored_by` | str | — | One of `oof` (development) / `test` |
| `data_quality_flag` | bool | — | `true` = only flagged rows; `false` = only clean |
| `sort` | str | `listed_over_predicted` | One of `listed_over_predicted` / `listed_price_per_acre_ksh` / `predicted_price_per_acre_ksh` / `size_acres` |

## Interactive docs

- Swagger UI: `/docs`
- ReDoc: `/redoc`
