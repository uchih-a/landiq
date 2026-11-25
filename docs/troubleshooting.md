# Troubleshooting

Owner: [NAME]
Last verified: 2026-11-24

Two-line summary: every error this app emits on purpose, what causes it,
and the fix — ordered by where you see it (boot, endpoint, UI). All error
strings below are quoted from the code, so you can grep for them.

For: anyone running the backend or frontend locally or in deployment.

## At boot / health

### `/health` returns `{"status": "degraded", "artifacts_loaded": false}`

- **Cause.** The `ArtifactRegistry` did not find the 8 required model
  files (`xgb_model.json`, `catboost_model.cbm`, `tabnet_model.zip`,
  `ensemble_weights.json`, `feature_list.json`, `preprocessing.json`,
  `metadata.json`, `coverage_rules.json`) under `ARTIFACTS_DIR`.
- **Fix.** Run Notebooks 1–3 and copy the output into `./artifacts/`
  ([retrain runbook](retrain-runbook.md)); or accept degraded mode — the
  app still serves the listing/overview endpoints from
  `app_exports/listings_scored.parquet` (see [RUN.md](../RUN.md)).
  Restart after copying: everything loads at startup.

### Log line `artifacts_missing ... mode=degraded`

- **Cause.** Same as above, logged at startup with the missing file list.
- **Fix.** Match the list against the
  [artifacts reference](artifacts.md) tables.

### Log line `registry degraded`

- **Cause.** A registry (`ArtifactRegistry`, `AppExportsRegistry`, a
  spatial index) has `loaded = False`; the endpoints that need it will
  return 503 while the rest of the app works.
- **Fix.** Identify which registry from the log line's `path=` field,
  then supply the named file and restart.

## Endpoints (503 responses)

### `503 DATA_UNAVAILABLE` — "The export file app_exports/{file} is not available. Copy the contents of models/ensemble/app_exports/ from Notebook 3 into ARTIFACTS_DIR and restart the service."

- **Cause.** That app export (e.g. `county_summary.csv`,
  `metrics_table.csv`) is missing from `artifacts/app_exports/`.
- **Fix.** Copy the file from the Notebook 3 export and restart. The
  message names the exact file.

### `503 MODEL_NOT_LOADED` — "The prediction ensemble is not loaded. Copy the contents of models/ensemble/ from Notebook 3 into ARTIFACTS_DIR and restart the service."

- **Cause.** `POST /api/v1/predict` was called while the model registry
  is degraded.
- **Fix.** Supply the 8 model files ([artifacts](artifacts.md)) and
  restart.

### `503 SERVICE_UNAVAILABLE` — "PredictionService is not initialised."

- **Cause.** The service constructor did not run (or a spatial index it
  needs failed to load).
- **Fix.** Check the startup logs for the failing index; supply the
  spatial file (e.g. `kenya_places.gpkg`) and restart.

## Endpoints (422 validation)

All of these are caller errors; the message names the allowed values.

| Message fragment | Cause | Fix |
|---|---|---|
| `prop_type must be one of ['Land', 'Farm', 'Commercial']` | non-canonical type sent | use a canonical type (from `/listings/options` or `/predict/options`) |
| `county must match a county in the data` | unknown county | use a county from `/counties/row_counts` |
| `sort must be one of ...` | unsupported sort key | use `listed_over_predicted`, `listed_price_per_acre_ksh`, `predicted_price_per_acre_ksh`, or `size_acres` |
| `order must be one of ['asc', 'desc']` | bad order | `asc` or `desc` |
| `scored_by must be one of oof/test` | bad split tag | `oof` or `test` |
| `radius_km must be one of ...` | bad amenity radius | use the values from `/listings/options` |
| `group must be 'prop_type' or 'size_band'` | bad `/data/price-by-group` group | one of the two |
| `No listing with listing_no ...` | unknown listing | pick a `listing_no` from `/listings/scored` |

## Frontend

### "Data may be incomplete — some model files are not loaded" banner

- **Cause.** The polled `/health` reports `degraded`.
- **Fix.** Supply the model artifacts (or dismiss the banner — the
  listing-backed pages still work).

### Cards show "Data unavailable" + Retry on one page but not others

- **Cause.** Only the queries whose artifact is missing fail; the page
  keeps rendering (per-card error states, by design).
- **Fix.** Identify the missing artifact from the browser network tab
  (the 503 body names the file), then see the
  [artifacts reference](artifacts.md).

### Every API call fails with "Failed to fetch" from the frontend

- **Cause.** CORS: the frontend origin is not in `ALLOWED_ORIGINS`.
  The dev default covers `http://localhost:3000` and
  `http://localhost:5173` but **not** `http://127.0.0.1:5173` or deployed
  preview URLs (those need `ALLOWED_ORIGINS_REGEX`).
- **Fix.** Add the origin to `ALLOWED_ORIGINS` (or the regex) and restart
  the backend; or open the frontend via a listed origin.

### The USD toggle is disabled with "not available"

- **Cause.** `FX_KSH_PER_USD` is unset — the backend never guesses a
  rate (see [configuration](configuration.md)).
- **Fix.** Set `FX_KSH_PER_USD` (and optionally `FX_AS_OF`,
  `FX_SOURCE`) in the environment and restart.

## Tests

### `ModuleNotFoundError: No module named 'shap'` in `backend/tests/test_predict.py`

- **Cause.** `shap` is not installed in the test environment.
- **Fix.** `uv sync --extra dev` (or `pip install shap`).

### `test_settings.py::test_settings_defaults` fails: `assert 'test' == 'development'`

- **Cause.** A `.env` file (or exported `APP_ENV`) overrides the default
  the test expects. Documented in RUN.md as environment-dependent.
- **Fix.** Run the suite without a root `.env`, or from a checkout
  without one.

### `bun run build` fails on `src/lib/i18n/__tests__/parity.test.ts` (TS6133 unused variable)

- **Cause.** Pre-existing strictness failure in the parity test
  (`'k' is declared but its value is never read`).
- **Fix.** Maintainer: remove the unused loop in that test. (Not fixed
  in this documentation round — no application code was changed.)

## Data quality

### Many rows marked "Suspect data" (2,335 of 5,879 on the fixture corpus)

- **Cause.** Expected: the suspect gate flags
  `listed_over_predicted` outside [0.05, 20] or non-finite sizes. On the
  fixture corpus 1,910 rows have no usable size.
- **Fix.** None needed — suspects are excluded from verdicts by design.
  With real (notebook-produced) artifacts the ratio differs.

### Predictions shifted after loading a new `xgb_model.json`

- **Cause.** An XGBoost 3.x-written file loses `base_score` under the
  pinned 2.1.1 runtime ([incident 2](decisions.md#incident-2--xgboost-3x-vs-211-lost-base_score)).
- **Fix.** `python scripts/fix_xgb_base_score.py artifacts/xgb_model.json`
  (writes `.bak`), then restart and rerun
  `scripts/parity_check.py`.
