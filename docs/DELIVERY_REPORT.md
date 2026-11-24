# Delivery Report — Kenya Land Valuation (2026-11-18)

This is the final delivery report for the work since the original
`kenya-land-valuation-20261115-1415.zip`. Two zips are attached:

1. **`kenya-land-valuation-20261118-complete.zip`** (4.83 MB, 302 files) — the
   full runnable project tree. Extract and run; see "How to run it" below.
2. **`kenya-land-valuation-20261118-changes-only.zip`** (553 KB, 188 files) —
   only the files changed since the original zip, preserving paths. Includes
   `CHANGED_FILES.txt` listing every path with `A` (added) / `M` (modified) /
   `D` (deleted).

## 1. Task status table

| Task | Status | Evidence | Checks run |
|---|---|---|---|
| **O1** Backend `GET /api/v1/overview/summary` | **DONE** | `backend/app/api/v1/routers/overview.py`; `backend/app/services/overview.py`; `backend/tests/test_overview.py` (12 tests) | pytest, OpenAPI snapshot |
| **O2** Overview frontend (all cards, URL filters, mobile) | **DONE** | `frontend/src/features/overview/*`; `__tests__/KpiRow.test.tsx`; screenshots `overview-final/` desktop + mobile (1380×1200 + 390×1200) | typecheck, lint, build, vitest, Playwright |
| **O3** No-hard-coded-values sweep | **DONE** | `docs/hardcoded-values-audit.md`; `scripts/check-hardcoded.sh` + `scripts/hardcoded-allowlist.txt`; FX rate on `/meta` (`test_meta_fx.py`, `test_meta_p8b.py`); canonical three enforced via `app/schemas/canonical.py` | `bash scripts/check-hardcoded.sh` → `No hardcoded-value violations.` |
| **P2b** Predictor: options endpoint, three types, no typed values | **DONE** | `backend/app/api/v1/routers/predict_options.py`; `backend/app/services/predict_options.py`; `backend/app/schemas/predict_options.py`; `backend/tests/test_predict_options.py`; `frontend/src/features/predictor/*` + `__tests__/predictor-helpers.test.ts` (15 tests) | pytest, typecheck, lint, build, vitest, Playwright |
| **P3b** Market Insights: filter wired, quantile bands, distance-profile | **DONE** | `backend/app/api/v1/routers/counties.py` (+ `test_counties_p3b.py`); `backend/app/services/county_summary.py`; `frontend/src/features/market-insights/*` + `__tests__/helpers.test.ts` (11 tests); screenshots `market-insights/` | pytest, typecheck, lint, build, vitest, Playwright |
| **P4b** Deal Finder: server-side sort, exact filters, options, nearby, streaming export | **DONE** | `backend/app/api/v1/routers/listings.py`; `backend/app/services/listings_options.py`; `backend/app/schemas/listings_options.py`; `backend/tests/test_listings_p4b.py` (24 tests); `frontend/src/features/deal-finder/*` + `__tests__/helpers.test.ts` (15 tests); screenshots `p4b-p5b-screenshots/` | pytest, typecheck, lint, build, vitest, OpenAPI snapshot, Playwright |
| **P5b** Model Performance: unit fixes, production-run filter, EBS + AvP audit | **DONE** | `backend/app/api/v1/routers/model.py`; `backend/app/schemas/predictions.py`; `backend/tests/test_model_p5b.py` (12 tests); `frontend/src/features/model-performance/*` + `__tests__/metrics-helpers.test.ts` (10 tests); screenshots `p4b-p5b-screenshots/` | pytest, typecheck, lint, build, vitest, Playwright |
| **P6b** Explainability: honest coverage, model list, One-estimate mode | **DONE** | `backend/app/services/explainability.py`; `src/landval/modelling/coverage.py`; `backend/tests/test_model_p6b.py`; `frontend/src/features/explainability/OneEstimatePanel.tsx` + `__tests__/explainability.test.tsx`; screenshots in `p6b-final/` | pytest, typecheck, lint, build, vitest, Playwright |
| **P7b** Data Explorer: sourced thresholds, i18n, honest placeholder tabs | **DONE** | `backend/app/api/v1/routers/data_explorer.py` (+ `test_data_explorer.py`); `frontend/src/features/data-explorer/{index,sections,helpers}.tsx`; screenshots in `p7b-p8b-screenshots/` | pytest, typecheck, lint, build, vitest, Playwright |
| **P8b** About + Settings: data-driven copy, counties from data, FX from /meta, storage helper | **DONE** (Settings partial — known-gaps #47, #48 — visual pass only, out of scope) | `backend/app/api/v1/routers/meta.py` (+ `test_meta_p8b.py`, `test_meta_fx.py`); `frontend/src/features/about/*`; `frontend/src/features/settings/*` + `__tests__/settings.test.tsx`; `frontend/src/lib/{storage,county-preference,ordinal}.ts`; screenshots in `p7b-p8b-screenshots/` | pytest, typecheck, lint, build, vitest, Playwright |

## 2. What changed, by area

### Backend endpoints (additive, backward-compatible unless flagged)

| Endpoint | Status | Example request → response shape |
|---|---|---|
| `GET /api/v1/overview/summary` | NEW | `?county=&prop_type=&verdict=` → `{totals, verdicts, by_property_type, by_size_band, by_distance_band, trend, scatter_sample, county_top_n, filters, band_edges}` |
| `GET /api/v1/predict/options` | NEW | (no params) → `{property_types, counties, amenities, size_units, ..., model_version, defaults}` |
| `GET /api/v1/listings/options` | NEW (P4b) | (no params) → `{property_types, counties, verdicts, amenities, radii_km, page_sizes, default_page_size, max_page_size, sort_keys, export, amenity_filter_available, unmapped_prop_type_rows}` |
| `GET /api/v1/listings/scored` | MODIFIED (P4b) | added `order: "asc"|"desc"`; `prop_type` + `county` now EXACT case-insensitive (breaking — was substring); `pagination` now also returns `max_page_size` + `default_page_size` |
| `GET /api/v1/listings/{listing_no}/nearby` | NEW (P4b) | `?radius_km=&limit=` → `{listing_no, radius_km, nearby: [{listing_no, latitude, longitude, verdict, listed_price_per_acre_ksh, distance_km}], n_returned, reason}` |
| `GET /api/v1/listings/scored/export.csv` | NEW (P4b) | streaming; same filters as `/scored`; UTF-8 BOM; raw KSh money columns; `X-Export-Truncated` + `X-Export-Total` headers when `LISTINGS_EXPORT_MAX_ROWS` env caps |
| `GET /api/v1/counties/summary` | MODIFIED (P3b) | added `prop_type` filter + `property_types` echo + quantile-derived `price_bands` |
| `GET /api/v1/counties/{county}/distance-profile` | NEW (P3b) | `?prop_type=` → `{county, n_listings, bands: [{index, lower_km, upper_km, n_listings, median_price_per_acre_ksh, mean_log_price_per_acre}]}` |
| `GET /api/v1/data/price-distribution` | NEW | (no params) → `{bins: [{index, lower, upper, n_listings}], percentiles: {p1, p10, p50, p90, p99}, n_usable, n_flagged}` |
| `GET /api/v1/model/metrics` | MODIFIED (P5b) | additive: `ensemble_model`, `interval_levels`, `default_interval_level`, `n_test`, `n_dev`, `model_info: {name: {display_name, family}}`, `interval_method`, `production_run_label` |
| `GET /api/v1/model/error-by-support` | MODIFIED (P5b) | additive per-row `band_order` + `support_measures: [{value, label_key}]` |
| `GET /api/v1/model/predictions` | NEW (P5 wiring) | `?sample=N` → `{oof: [...], test: [...], oof_count, test_count, sampled, sample_size}` |
| `GET /api/v1/meta` | MODIFIED (P8b) | additive `fx_rate_to_usd`, `fx_rate_source`, `fx_rate_updated_at`, `model_version`, `min_county_n`, `data_cutoff_date` |
| `GET /api/v1/health` | MODIFIED | additive `artifacts_loaded`, `version`, `mode` (`degraded`/`live`) |

### Frontend pages touched

| Page | Files |
|---|---|
| Overview | `features/overview/{index,KpiRow,CountyHexViz,DealSignalsCard,PriceDistanceChart,PriceByPropertyType,PriceBySizeBand,FiltersSheet,overview-helpers}.tsx` |
| Predictor | `features/predictor/{index,LocationStep,AboutStep,PredictResult,DriversList,NearbyInfrastructure,SimilarListings,TriStatePill,predictor-helpers}.tsx` |
| Market Insights | `features/market-insights/{index,CountyPriceGrid,CountyRankList,PriceDistanceScatter,helpers}.tsx` |
| Deal Finder | `features/deal-finder/{index,FiltersBar,ResultsTable,DealMap,ListingDetailPanel,CorpusSummary,csv-export,verdict-styles}.tsx` |
| Model Performance | `features/model-performance/{index,MetricsKpiRow,ModelComparison,CoverageBars,EnsembleWeights,ActualVsPredicted,ErrorBySupportBars,metrics-helpers}.tsx` |
| Explainability | `features/explainability/{index,CoverageDonut,GlobalShapBars,GlossaryPanel,OneEstimatePanel,helpers}.tsx` |
| Data Explorer | `features/data-explorer/{index,sections,helpers}.tsx` |
| About | `features/about/index.tsx` |
| Settings | `features/settings/index.tsx` |
| Shell | `app/{LayoutShell,nav-config}.tsx`; `main.tsx` (was missing `index.css` import) |

### Shared components touched

`components/{PillButton,PillDropdown,ScoreRing,HoneycombBadge,KpiStatBlock,index}.tsx` — visual fidelity fixes only (no API changes).

`lib/api/{hooks,types}.ts` — added hooks + types for every new endpoint above.
`lib/currency/format.ts` — added `formatCompactMoney` (shared KSh/USD-aware compact formatter).
`lib/i18n/{index,useLocale}.ts` — added en + sw strings for every page; locale helper replaces `toLocaleString('en-KE')`.
`lib/ui/chart-tokens.ts` — single source of truth for chart hex colours (added in P6b; extended with `CHART_COLOR_ON_SURFACE` + `CHART_COLOR_TERTIARY` in this final P5b pass).
`lib/{storage,county-preference,ordinal}.ts` + `lib/store/lastEstimate.ts` — P8b safe-storage + default-county hook.

### New dependencies

| Package | Version | Why |
|---|---|---|
| `slowapi` | 0.1.10 | Rate-limiting on POST `/predict` (B7). Backend only. |
| `structlog` | 26.1.0 | Structured logging (B7). Backend only. |
| `pyarrow` | 26.0.1 | Parquet I/O for `listings_scored.parquet` etc. Backend only. |
| `shap` | 0.54.1 | Live SHAP explanations on `/predict` (P6b). Backend only. |
| `pytest-randomly` | 5.1.0 | Test-order randomization (already in original `pyproject.toml`; needed for CI parity). Dev only. |

No new frontend dependencies — the existing `package.json` covers everything.

### New environment variables

| Name | Meaning | Default |
|---|---|---|
| `LISTINGS_EXPORT_MAX_ROWS` | Optional cap on `/listings/scored/export.csv` row count. When set and the export matches more rows, the response is truncated and the `X-Export-Truncated: true` + `X-Export-Total` headers are sent. | unset (no cap) |
| `ALLOWED_ORIGINS_REGEX` | Optional regex for Vercel preview URLs (in `.env.example`). | empty |
| `PREDICT_RATE_LIMIT_PER_MINUTE` | Per-client rate limit on POST `/predict`. | 20 |
| `REDIS_URL` | Shared rate-limit storage across replicas. Empty = in-memory. | empty |
| `VITE_API_BASE_URL` | Frontend API base URL. | `http://localhost:8000/api/v1` |
| `VITE_REPORT_EMAIL` | Frontend About page "Report a listing" mailto target. | empty (link hidden) |

### Database / artifact changes

**None.** The `artifacts/` folder contains only `README.md` (2.4 KB). No model files, parquet, GPKG, or geo data are shipped — restore them from your production artifact store. The backend runs in degraded mode (503 DATA_UNAVAILABLE on artifact-dependent endpoints) without them; this is intentional and tested.

## 3. Breaking / behaviour changes you must know about

1. **`prop_type` + `county` filters on `GET /listings/scored` are now EXACT case-insensitive matches** (P4b-B, P4b-D). Previously they were substring matches. Unknown values now return 422 with an `allowed` list. **Verified**: no frontend caller relied on substring behaviour. Documented in `docs/api.md`.

2. **`prop_type` is restricted to the canonical three: `Land`, `Farm`, `Commercial`** (everywhere — Overview, Predictor, Market Insights, Deal Finder, Model Performance). Any other `prop_type` string in the source frame is surfaced via `/listings/options.unmapped_prop_type_rows` + a warning log; it is NOT silently relabelled. Inspect your production frame.

3. **Sort on `/listings/scored` now requires `order` for explicit direction** (P4b-A). The default direction per sort key is preserved (existing callers see no change), but the client-side re-sort is deleted — sort is now server-side and stable with a `listing_no` tiebreaker.

4. **`/model/metrics` returns `ensemble_model` instead of relying on substring matching** (P5b-E). If your production artifact doesn't have an ensemble row identified by name, the frontend shows "not available" rather than falling back to a single model.

5. **Coverage levels on `/model/metrics` come from `interval_levels`** (P5b-D) — the typed `{level:'50% range', target:0.5}` array is gone. The KPI tile uses `default_interval_level`.

6. **CSV export is now streaming server-side** (P4b-H). The client-side page-walking `EXPORT_ROW_CAP=2000` + `window.alert` are deleted. Truncation is surfaced via response headers, not alerts.

7. **Deal Finder URL state**: `?county=&type=&verdict=&flagged=&amenity=&radius=&sort=&order=&page=&size=` is now read/written. Existing bookmarks with old params still work (unknown values are ignored, never crash).

8. **`PropertyTypeCount` schema class consolidated** (this delivery): the duplicate class in `app/schemas/overview.py` is removed; both `counties.py` and `overview.py` now use the one in `counties.py`. This fixes a pydantic-v2 schema-naming flake in the OpenAPI snapshot test (the snapshot was non-deterministic depending on import order). No API shape change — the response JSON is identical.

## 4. Decisions you need to make

1. **Unmapped `prop_type` values in production data.** The canonical three are `Land`, `Farm`, `Commercial`. Run `curl /api/v1/listings/options` against production and inspect `unmapped_prop_type_rows`. **Recommendation**: relabel or filter them in the source frame; the backend will not silently remap. **Consequence of doing nothing**: those rows are excluded from canonical-type-filtered queries but still appear in "All" queries with their original label, which may confuse end users.

2. **Export row cap policy.** `LISTINGS_EXPORT_MAX_ROWS` defaults to unset (no cap). **Recommendation**: leave unset unless you have a memory/disk constraint; the streaming endpoint handles large corpora fine. **Consequence of setting a cap**: exports above the cap are truncated with a non-blocking in-page notice; users can refine filters to get under the cap.

3. **One-estimate mode design (P6b).** The Explainability page now has a One-estimate panel for when only one model is loaded. **Recommendation**: ship as-is; the panel makes the partial-coverage case honest. **Consequence of removing it**: users see an empty panel when only one model is loaded.

4. **Live FX.** Out of scope. The KSh/USD toggle uses the cached rate from `/meta` (sourced from the artifact). **Recommendation**: add a daily FX fetcher in the backend if you want a live rate; the schema is already there. **Consequence of leaving as-is**: the USD toggle uses the artifact's rate, which may be stale.

5. **Wrong-listing report destination.** `VITE_REPORT_EMAIL` gates the mailto link on the About page. **Recommendation**: set it to a real address (e.g. `data-quality@yourdomain`) before shipping. **Consequence of leaving empty**: the link is hidden.

6. **Kiswahili native review.** All sw strings are marked "needs native review" in `docs/known-gaps.md`. **Recommendation**: have a native speaker review `frontend/src/lib/i18n/index.ts` before shipping to a sw-primary audience. **Consequence of skipping**: technical terms may be awkward but the meaning is correct.

7. **`amenity_filter_available` gate.** When the POI/roads data is missing, the Deal Finder amenity control is disabled with a tooltip rather than failing at click time. **Recommendation**: ship as-is. **Consequence of changing**: 503 at click time is worse UX than a disabled control.

8. **Verdict rule wording.** The verdict chip help popover shows the rule text templated from the response (interval comparison basis + empirical ratio cut-offs + match rate). **Recommendation**: approve the wording. **Consequence of changing**: edit `backend/app/services/listings_options.py` `_verdict_rules()`.

## 5. Known gaps updated

`docs/known-gaps.md` grew from ~50 entries (original) to 185 numbered entries. Highlights:

- **RESOLVED entries (86 total)**: every B0–B12 backend item, every F0–F9 frontend item, every G1–G3 + P4–P8 visual-fidelity item, every P2b–P8b real-data item.
- **New entries added in this delivery track**: G1 (#51–54), G2 (#55–61), G3 (#62–68), P4 (#69–77), P5 (#78–80), P6 (#81), P7 SUPERSEDED (#82–83), P-fidelity round (#84–88), P2b (#89–101), P3b (#102–107), P4b (#122–131), P5b (#132–142b), P6b (#143–155), P7b (#156–170), P8b (#171–184).
- **Still open (by design)**: #47 (Settings visual pass — partial), #48 (Data Review workflow — needs backend state), #176 (report-a-listing destination — gated by `VITE_REPORT_EMAIL`), Kiswahili native review (multiple entries).

The full known-gaps doc is in the zip at `docs/known-gaps.md`.

## 6. What could not be verified and why

- **Map tiles blank in screenshots** — the sandbox has no internet, so MapLibre's raster tiles don't load. The map UI, markers, and nearby-listings overlay are verified; only the background tiles are blank. Not a bug.
- **No real model artifacts** — `artifacts/` ships only `README.md`. Backend runs in degraded mode (503 on artifact-dependent endpoints). The endpoints are tested against synthetic fixtures in `backend/tests/`. Restore real artifacts from your production store before deploying.
- **Kiswahili strings** — every sw string is in `frontend/src/lib/i18n/index.ts` but marked "needs native review". The meaning is correct; idiomatic phrasing may need a native speaker's polish.
- **USD toggle screenshot** (`mp-desktop-usd-toggle.png`) — the JS click in the render script didn't find the toggle button by text, so the screenshot shows the default KSh state. The toggle's behaviour is verified by `metrics-helpers.test.ts (f)`.
- **Pydantic v2 schema-naming flake** (fixed in this delivery) — the OpenAPI snapshot test was flaky (1 failure in ~3 runs) because `app/schemas/overview.py` re-declared `PropertyTypeCount` (duplicate of the one in `counties.py`), and pydantic v2's schema naming for duplicate classes depends on import order. Fixed by consolidating on the `counties.py` class. Verified stable across 5 pytest-randomly seeds (100, 200, 300, 42, 99999).

## 7. How to run it

### Backend

```bash
# From the repo root:
uv sync                              # install backend deps
# Optional extras the sandbox needed (already in pyproject.toml):
#   slowapi, structlog, pyarrow, shap, pytest-randomly, ruff

# Run the dev server:
uv run uvicorn app.main:app --reload --port 8000

# Run tests:
python -m pytest backend/tests/      # 307 passed, 1 skipped

# Lint + format:
ruff check backend/ src/             # All checks passed!
ruff format --check backend/ src/    # 92 files already formatted

# OpenAPI snapshot:
python scripts/check_openapi_snapshot.py
# → "OpenAPI snapshot: no diff — schema matches the committed snapshot."

# Hardcoded-values guardrail:
bash scripts/check-hardcoded.sh
# → "No hardcoded-value violations."
```

### Frontend

```bash
cd frontend
npm ci                               # 441 packages, ~9s

npm run dev                          # vite dev server on :5173
# Or build + preview:
npm run build                        # 605 modules, ~7s
npm run preview

# Checks:
npm run typecheck                    # 0 errors
npm run lint                         # 0 warnings
npm run build                        # ✓ built
npm run test                         # 135 tests across 12 files
```

### Full check status (verified in a fresh unzip on 2026-11-18)

| Check | Result |
|---|---|
| `python -m pytest backend/tests/ --randomly-seed=200` | **307 passed, 1 skipped** |
| `ruff check backend/ src/` | **All checks passed!** |
| `ruff format --check backend/ src/` | **92 files already formatted** |
| `python scripts/check_openapi_snapshot.py` | **no diff — schema matches the committed snapshot** |
| `bash scripts/check-hardcoded.sh` | **No hardcoded-value violations.** |
| `cd frontend && npm run typecheck` | **0 errors** |
| `cd frontend && npm run lint` | **0 warnings** |
| `cd frontend && npm run build` | **✓ built in 6.83s** (chunk-size advisory only on `maplibre-gl`) |
| `cd frontend && npm run test` | **135 tests passed across 12 files** |

### CI parity

The repo's `.github/workflows/{ci.yml, ci-frontend.yml}` run the same checks. The OpenAPI snapshot gate (B10) is enforced — any schema change must be a conscious decision documented in `docs/api.md` + committed alongside the code change.
