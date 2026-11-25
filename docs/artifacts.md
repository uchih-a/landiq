# Artifacts reference

Owner: [NAME]
Last verified: 2026-11-24

Two-line summary: every file the backend loads from `artifacts/`, which
notebook cell produces it, and what breaks when it is missing. Artifacts
are git-ignored — produce them by running Notebooks 1–3 (see the
[retrain runbook](retrain-runbook.md)).

For: maintainers placing artifacts on a new machine or debugging a
degraded boot.

![Artifacts and version-pin map: Notebook 3 and the extraction scripts write into artifacts/ (models, serving manifest, app exports, spatial layers); version pins, export guards, registry startup guards and the parity check verify them; a five-step local reproduce path sits beneath](assets/diagrams/04-artifacts-version-map.png)

*Figure — artifacts and version-pin map: what is generated, what checks it, how to reproduce. Owner-provided, 2026-11-25.*

## The same-run rule

`serving_manifest.json` must be exported from **the same Notebook 3 run**
as `ensemble_weights.json` and the model files next to it. A manifest from
a different run silently serves wrong ensemble weights (see
[incident 3](decisions.md#incident-3--stale-serving-manifest) — recurred
in the 2026-11-21 run, where the manifest carried 0.6211/0.2929/0.0860
against the weights file's 0.2295/0.6683/0.1022 and parity failed 0%).
`scripts/repair_serving_manifest.py` can fix weights only; it refuses when
models were pruned or imputation values disagree with
`preprocessing.json` — in that case re-export from Cell 9.8.

## Current artifact set (2026-11-21 training run, uploaded 2026-11-24)

The JSON/parquet artifacts from the latest run are committed under
`artifacts/` for documentation (the model binaries remain git-ignored):
`metadata.json` (Run B, created 2026-11-21 08:24:23), `feature_list.json`
(3 features), `ensemble_weights.json`, `preprocessing.json`,
`coverage_rules.json` (min county n=10, min nearby n=5, radius 50 km),
`scoring_params.json` + `reference_data.json` + `feature_manifest.json` +
`extraction_manifest.json` (Notebook 1 Phase 10 exports: scoring
parameters, county towns/water bodies, feature definitions and parity
tolerances, POI extraction inventory), and the parity pair
`parity_fixture.parquet` (5,875 rows) + `parity_check_report.json`
(**failed 0%** — see [evidence.md](evidence.md#parity-check-owner-run-post-training)).

## Model + config files (`ArtifactRegistry`, loaded at startup)

Required for `/predict` and a `healthy` `/health` (from
`backend/app/services/artifact_registry.py`):

| File | Produced by | Notes |
|---|---|---|
| `xgb_model.json` | NB3 Phase 8 | pin `xgboost==2.1.1`; a 3.x-written file loses `base_score` ([incident 2](decisions.md#incident-2--xgboost-3x-vs-211-lost-base_score), recurred 2026-11-21 — trained with 3.4.1) — repair with `scripts/fix_xgb_base_score.py` |
| `catboost_model.cbm` | NB3 Phase 8 | |
| `tabnet_model.zip` | NB3 Phase 8 | |
| `ensemble_weights.json` | NB3 Cell 5.1 | `model_order` + simplex weights; the authoritative weights |
| `feature_list.json` | NB3 Phase 8 | the production feature set |
| `preprocessing.json` | NB3 Phase 8 | medians for imputation; the registry checks the manifest against this |
| `metadata.json` | NB3 Phase 8 | `model_version`, `data_date` → served by `/meta` |
| `coverage_rules.json` | NB3 Cell 9.9 | low-support thresholds |

## App exports (`AppExportsRegistry`, `artifacts/app_exports/`)

From `backend/app/services/app_exports.py`; missing files degrade their
endpoints individually, never the whole app:

| File | Produced by | Feeds |
|---|---|---|
| `manifest.json` | NB3 Cell 9.7 | row counts/columns/dtypes (self-describing manifest) |
| `metrics.json` | NB3 Cell 9.3 | `/model/metrics` |
| `feature_labels.json` | NB3 Cell 9.4 | `/model/explainability` labels |
| `county_summary.csv` | NB3 Cell 9.5 | `/counties/summary`, Market Insights |
| `metrics_table.csv` | NB3 Cell 9.3 | Model Performance table |
| `feature_evaluation.csv` | NB3 Cell 9.3 | Phase 3 feature ranking |
| `shap_global.csv` | NB3 Cell 9.4 | Explainability |
| `feature_importance.csv` | NB3 Cell 9.4 | Explainability |
| `listings_scored.parquet` | NB3 Cell 9.6 | Deal Finder, Overview, Data Explorer, `/listings/scored` |
| `oof_predictions.parquet` | NB3 Cell 9.2 | parity check |
| `test_predictions.parquet` | NB3 Cell 9.2 | parity check |

Also present in a full export: `conformal.json` (Cell 9.1 — interval
quantiles), `shap_values.parquet` (Cell 9.4), `error_by_support.csv`
(Cell 9.9), `explain_spec.md` (Cell 9.10), `APP_EXPORTS_README.md`
(documentation only), and the parity pair
`parity_fixture.parquet` / `parity_check_report.json` (produced by the
parity scripts, not the notebook).

## Backend exports (`artifacts/backend_exports/`)

| File | Produced by | Feeds |
|---|---|---|
| `serving_manifest.json` | NB3 Cell 9.8 | what the backend loads (weight-pruned); must match the same run |
| `coverage_rules.json` | NB3 Cell 9.9 | low-support rules |
| `error_by_support.csv` | NB3 Cell 9.9 | `/model/error-by-support` |
| `explain_spec.md` | NB3 Cell 9.10 | SHAP effects in money terms |

## Spatial data (loaded lazily by the geo services)

| File | Feeds | How to get it |
|---|---|---|
| `kenya_counties_simplified.geojson` | `/counties/boundaries` choropleth | `python scripts/download_county_boundaries.py` |
| `kenya_places.gpkg` | `/places/search`, geocoding | OSM extract (see notebook 1) |
| `kenya_pois_named.gpkg` | `/places/nearby`, amenity proximity | `python scripts/extract_poi_names.py` |
| `kenya_pois.gpkg`, `kenya_roads.gpkg`, `kenya_counties.gpkg` | feature building at prediction time | OSM extract pipeline |
| `kenya-latest.osm.pbf`, `gadm41_KEN.gpkg` | upstream inputs for the above | Geofabrik / GADM |

## Minimal vs full artifact sets

- **Deal Finder / Overview / Data Explorer / Listings only:**
  `app_exports/listings_scored.parquet` is enough (the run package ships
  a fixture-built copy). Everything else degrades honestly.
- **Full app:** all tables above + the 8 model/config files + the spatial
  GPKGs. `/health` then reports `status: "ok"`.

Placing artifacts: copy the notebook output into `./artifacts/`
preserving the `app_exports/` and `backend_exports/` subdirectories, then
restart the backend (all registries load at startup).
