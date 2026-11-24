# Kenya Land Valuation — running the application

This package is the **entire application** with the A1/A2/B data-quality
fixes applied, plus a real `artifacts/app_exports/listings_scored.parquet`
generated from `property24_kenya_finals.csv` (5,875 rows) via the corrected
cleaning pipeline. The frontend is pre-built (`frontend/dist/`).

## What is in this package

```
.
├── src/landval/            # feature + cleaning modules (A1 size.py, A2 price_basis.py)
├── backend/                # FastAPI app + tests + fixtures
│   └── app/services/suspect_gate.py     # Part B gate
├── frontend/               # React + Vite app (source + pre-built dist/)
├── scripts/                # replay_cleaning.py, dump_suspect_api_response.py, ...
├── notebook_patch/         # NB1_replacement_cells.py (drop-in cells for Notebook 1)
├── docs/                   # openapi.snapshot.json (regenerated), known-gaps.md
├── artifacts/
│   └── app_exports/
│       └── listings_scored.parquet      # REAL, built from the CSV (A1/A2-corrected)
├── property24_kenya_finals.csv          # the dataset (5,875 rows)
├── .env, pyproject.toml, Makefile, Dockerfile, compose.yaml
└── RUN.md (this file)
```

## What works out of the box

The Deal Finder, Overview, Data Explorer, Counties, Listings-Options and
Meta endpoints all serve real data — they need only
`artifacts/app_exports/listings_scored.parquet`, which is included.

The suspect-listing gate (Part B) is live:
- `GET /api/v1/listings/scored?is_suspect=true` → 2,335 suspect rows
- `GET /api/v1/listings/scored?is_suspect=false` → 3,544 clean rows
- `GET /api/v1/overview/summary` → `verdicts.n_suspect = 2335`, and the
  underpriced/fair/overpriced counts EXCLUDE suspects
  (underpriced 1238, fair 645, overpriced 1661).
- `GET /api/v1/listings/scored/export.csv` carries `is_suspect` +
  `suspect_reason` columns.

## What needs the real model artifacts (not in this package)

`/api/v1/predict`, `/api/v1/places`, amenity-proximity, county boundaries,
and the Model-Performance / Explainability / Market-Insights tabs need the
trained model + spatial GPKGs that live under `artifacts/` in your
environment (`xgb_model.json`, `catboost_model.cbm`, `tabnet_model.zip`,
`ensemble_weights.json`, `kenya_places.gpkg`, `kenya_pois_named.gpkg`,
`kenya_counties_simplified.geojson`, `metrics.json`, `shap_global.csv`,
`county_summary.csv`, …). They are binary and were not uploaded. Drop your
real `artifacts/` over this package's `artifacts/app_exports/` (keep the
included `listings_scored.parquet`, or replace it with your Cell 9.6
output) and those endpoints come alive. Until then `/health` reports
`status: degraded` and those endpoints return 503 `DATA_UNAVAILABLE` — by
design.

## Run the backend

```bash
cd kenya-land-valuation        # this package's root
pip install fastapi uvicorn[standard] pydantic pydantic-settings pandas numpy \
            pyarrow slowapi structlog prometheus-client python-multipart
# (or: uv sync  if you use uv — see pyproject.toml / uv.lock)

export PYTHONPATH=backend:src
export ARTIFACTS_DIR=./artifacts
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Open http://localhost:8000/docs (Swagger UI). Smoke-test the gate:

```bash
curl -s 'http://localhost:8000/api/v1/listings/scored?is_suspect=true&page_size=2' | jq '.pagination.total_rows'
curl -s 'http://localhost:8000/api/v1/overview/summary' | jq '.verdicts'
```

## Run the frontend

```bash
cd frontend
bun install          # or npm install
bun run dev          # http://localhost:5173  (Vite dev server)
# or serve the pre-built bundle:
bun run build        # already built — output in frontend/dist/
```

The Deal Finder page loads with the "Hide possible data errors" toggle ON
by default, so suspect rows are hidden on first load. Toggle it off to see
the grey "Suspect data" chips.

## Run the tests

```bash
# Backend
export PYTHONPATH=backend:src
python -m pytest backend/tests/ -v
# Just the A1/A2/B fixes:
python -m pytest backend/tests/test_cleaning_size.py \
                  backend/tests/test_cleaning_price_basis.py \
                  backend/tests/test_suspect_gate.py -v

# Frontend
cd frontend && bun run test
```

Expected: **330 backend tests pass** (5 pre-existing failures —
`test_predict.py` needs `shap` + the trained model; `test_settings_defaults`
reads `.env` `LOG_LEVEL=DEBUG` while the test expects the `INFO` default —
neither is caused by these changes). **139 frontend tests pass.**

## Replay the cleaning pipeline (legacy vs corrected)

```bash
PYTHONPATH=backend:src python scripts/replay_cleaning.py
```

Prints the before/after table for the 8 fixture listings and the corpus
aggregates (usable ppa 3929→3958; size==0 19→0; inf ppa 18→0; 553 sizes
changed; 153 conflicts; n_suspect 2335).

## Apply the fixes to Notebook 1

`notebook_patch/NB1_replacement_cells.py` has labelled drop-in code for
Cells 45, 47, 49, 167, and the FINAL_COLUMNS additions in Cell 169. Paste
each block into the matching cell, ensure `landval` is importable
(`sys.path.insert(0, "/path/to/src")`), then rerun Notebooks 1 → 3.
