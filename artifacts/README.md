# Artifacts

This directory holds model files, spatial data, and app exports produced by
Notebook 1 and Notebook 3. **These files are git-ignored** — they are too
large for git and must be mounted as a read-only volume at runtime.

## Expected files

`ARTIFACTS_DIR` is the ensemble directory written by Notebook 3 Phase 8/9
(`models/ensemble/`). Copy **its contents** (the files plus the
`backend_exports/` and `app_exports/` sub-directories) into `ARTIFACTS_DIR`
so the layout below is preserved:

```
ARTIFACTS_DIR/
├── xgb_model.json                     <- Notebook 3 Cell 8.2 (XGBoost JSON)
├── catboost_model.cbm                 <- Notebook 3 Cell 8.2 (CatBoost binary)
├── tabnet_model.zip                   <- Notebook 3 Cell 8.2 (only if listed
│                                         in serving_manifest.json)
├── ensemble_weights.json              <- Notebook 3 Cell 8.2
├── feature_list.json                  <- Notebook 3 Cell 8.2
├── preprocessing.json                 <- Notebook 3 Cell 8.2
├── metadata.json                      <- Notebook 3 Cell 8.2
├── backend_exports/
│   ├── serving_manifest.json          <- Notebook 3 Cell 9.8 (master file:
│   │                                     which models to load, renormalised
│   │                                     weights, feature list, imputation,
│   │                                     category levels)
│   ├── coverage_rules.json            <- Notebook 3 Cell 9.9
│   └── error_by_support.csv           <- Notebook 3 Cell 9.9
└── app_exports/
    ├── conformal.json                 <- Notebook 3 Cell 9.1
    ├── oof_predictions.parquet        <- Notebook 3 Cell 9.2
    ├── test_predictions.parquet       <- Notebook 3 Cell 9.2
    ├── metrics_table.csv              <- Notebook 3 Cell 9.3 (read by B3)
    ├── metrics.json                   <- Notebook 3 Cell 9.3 (read by B3)
    ├── feature_evaluation.csv         <- Notebook 3 Cell 3.8 / 9.3 (read by B3)
    ├── shap_values.parquet            <- Notebook 3 Cell 9.4 (per-listing SHAP)
    ├── shap_global.csv                <- Notebook 3 Cell 9.4 (read by B3)
    ├── feature_importance.csv         <- Notebook 3 Cell 9.4 (read by B3)
    ├── feature_labels.json            <- Notebook 3 Cell 9.4 (read by B3)
    ├── county_summary.csv             <- Notebook 3 Cell 9.5 (read by B3)
    ├── listings_scored.parquet        <- Notebook 3 Cell 9.6 (read by B3)
    ├── manifest.json                  <- Notebook 3 Cell 9.7 (read by B3)
    └── APP_EXPORTS_README.md          <- Notebook 3 Cell 9.7 (documentation only)
```

Plus the B1 feature-pipeline config (from Notebook 1 Phase 10):

```
ARTIFACTS_DIR/
├── scoring_params.json
├── reference_data.json
├── feature_manifest.json
├── kenya_counties.gpkg     <- spatial indexes (lazy-loaded by B1 for point-in-polygon)
├── kenya_counties_simplified.geojson  <- scripts/download_county_boundaries.py
│                             (GADM Level 1, Cell 4.9's source, simplified via
│                             Douglas-Peucker for choropleth rendering). Backs
│                             GET /api/v1/counties/boundaries. Git-ignored.
├── kenya_pois.gpkg         <- Cell 5.2 (no `name` tag — B1 uses this for scores)
├── kenya_pois_named.gpkg   <- scripts/extract_poi_names.py (Cell 5.2 + `name`)
│                             ALONGSIDE kenya_pois.gpkg, not replacing it.
│                             Backs GET /api/v1/places/nearby + predict's
│                             named_pois field. Git-ignored.
├── kenya_places.gpkg       <- scripts/extract_poi_names.py (places gazetteer
│                             from the PBF's `places` layer). Backs
│                             GET /api/v1/places/search. Git-ignored.
├── kenya_roads.gpkg
├── gadm41_KEN.gpkg         <- scripts/download_county_boundaries.py (full-resolution
│                             GADM source; kept for re-simplification at different
│                             tolerances. Git-ignored.)
├── extraction_manifest.json <- scripts/extract_poi_names.py (row counts + limitations)
└── county_boundaries_manifest.json <- scripts/download_county_boundaries.py
                              (tolerance + file size + n_counties)
```

**To produce `kenya_counties_simplified.geojson`:**

```bash
python scripts/download_county_boundaries.py --out-dir ./artifacts
# Downloads gadm41_KEN.gpkg from geodata.ucdavis.edu (~15 MB), simplifies at
# 0.005° tolerance (~550 m), writes kenya_counties_simplified.geojson (~500 KB).
```

**To produce `kenya_pois_named.gpkg` and `kenya_places.gpkg`:**

```bash
# Download kenya-latest.osm.pbf from Geofabrik (~700 MB)
wget https://download.geofabrik.de/africa/kenya-latest.osm.pbf

# Run the extraction (requires GDAL: apt install gdal-bin)
python scripts/extract_poi_names.py --pbf kenya-latest.osm.pbf --out-dir ./artifacts
```

The `ArtifactRegistry` (backend/app/services/artifact_registry.py) checks
for the flat top-level files at startup. The `ModelRegistry`
(src/landval/modelling/registry.py) reads `serving_manifest.json` and
loads every model file the manifest lists, plus `conformal.json`,
`coverage_rules.json` and `error_by_support.csv`. The `AppExportsRegistry`
(backend/app/services/app_exports.py, phase B3) loads the read-only data
files under `app_exports/` — `county_summary.csv`, `metrics_table.csv` /
`metrics.json`, `feature_evaluation.csv`, `shap_global.csv` /
`feature_importance.csv` / `feature_labels.json`, `listings_scored.parquet`,
`manifest.json` — each independently, so a missing file sets its attribute
to `None` and the corresponding read-only endpoint returns 503
`DATA_UNAVAILABLE`.

## How to populate

### Local development

Copy the contents of the Notebook 3 ensemble directory (preserving the
sub-directory layout) plus the Notebook 1 backend exports:

```bash
cp -r /path/to/models/ensemble/* ./artifacts/
cp /path/to/notebook1/interim/backend_exports/{scoring_params,reference_data,feature_manifest}.json ./artifacts/
cp /path/to/notebook1/interim/spatial/*.gpkg ./artifacts/
```

### Railway

Use the Railway CLI to upload to a persistent volume:

```bash
railway volume add
railway upload ./artifacts/ /app/artifacts
```

### Podman (local)

The `compose.yaml` mounts `./artifacts` at `/app/artifacts:ro` automatically.

## Degraded mode

If any expected file is missing, the app enters "degraded" mode:
- `/health` returns `status: "degraded"`, `artifacts_loaded: false`
- `/meta` returns `null` fields
- `/api/v1/predict` returns 503 `MODEL_NOT_LOADED` with the missing-file list
- `/api/v1/counties/summary`, `/api/v1/counties/boundaries`,
  `/api/v1/counties/{county}/listings`, `/api/v1/counties/row_counts`,
  `/api/v1/model/metrics`, `/api/v1/model/feature-evaluation`,
  `/api/v1/model/explainability`, `/api/v1/listings/scored` return 503 `DATA_UNAVAILABLE` when their
  specific source file is missing (independent per file)
- The app still starts (for development, testing, and CI)

The `ModelRegistry`'s missing-file list (visible in the 503 response's
`details.missing_files`) names every file referenced by `serving_manifest.json`
that is absent, so a single restart after copying them in is enough.
