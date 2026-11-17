# Merge Notes — Visual-Fidelity Track Delivery (2026-11-17)

This file is the merge guide for the **visual-fidelity + audit delivery**,
zip dated 2026-11-17. It supersedes the older `docs/MERGE_NOTES.md`
(unified backend+frontend delivery, kept for history). Reconcile THIS
zip against your already-running local clone — **do not blindly
overwrite your working copy**, because you may have local edits since
the last delivery (2026-11-15).

The delivery is one tree containing backend + frontend + docs + the new
`artifacts/README.md`. Build caches, virtualenvs, node_modules, and
real model artifacts are excluded — see "Delivery-safety checks" below.

## TL;DR — what's new since the last zip

The last zip shipped the backend (B0–B12) and the original frontend
(F0–F10) but **before** any visual-fidelity work. Since then, this
track ran nine focused fidelity passes (G0 + G1–G3 + P4–P6 +
P-fidelity round) plus this audit pass. Every change is listed in
"Files changed since 2026-11-15" below; everything else is byte-for-byte
identical to the last delivery.

## Files changed since 2026-11-15

### Frontend — shared shell & nav (G0)

| File | Status | Notes |
|---|---|---|
| `frontend/src/main.tsx` | CHANGED | Now imports `index.css` (was missing — app rendered unstyled before G0) |
| `frontend/src/app/LayoutShell.tsx` | REWRITTEN | Split mobile/desktop headers, transparent floating rail with split groups, floating pill mobile dock |
| `frontend/src/app/nav-config.ts` | CHANGED | Documented the per-breakpoint icon decision (KEEP web+mobile icon sets as-is) |
| `frontend/tailwind.config.ts` | CHANGED | Added `earth-dark` / `earth-deep` / `canvas-cool` tokens |
| `frontend/src/components/PillButton.tsx` | CHANGED | Hover/active states fixed |
| `frontend/src/components/ScoreRing.tsx` | CHANGED | Added `color` prop for per-ring colors |
| `frontend/src/components/HoneycombBadge.tsx` | CHANGED | Tier-based orange colors |
| `frontend/src/components/KpiStatBlock.tsx` | CHANGED | Label typography fixed |

### Frontend — Overview page (P1/G1)

| File | Status | Notes |
|---|---|---|
| `frontend/src/features/overview/PriceDistanceChart.tsx` | CHANGED | Diagonal-hatch fill via Recharts `<defs><pattern>` |
| `frontend/src/features/overview/DealSignalsCard.tsx` | CHANGED | Replaced Recharts bar with CSS pill + 3-column mini cards |
| `frontend/src/features/overview/KpiRow.tsx` | CHANGED | Removed ValuationCard wrappers (KPIs directly on canvas) |
| `frontend/src/features/overview/CountyHexViz.tsx` | CHANGED | Fixed scale inversion bug + tier-based orange colors |
| `frontend/src/features/overview/overview-helpers.ts` | CHANGED | Haversine verified numerically identical to backend |

### Frontend — Predictor page (P2/G2)

| File | Status | Notes |
|---|---|---|
| `frontend/src/features/predictor/PredictResult.tsx` | CHANGED | Added confidence-interval bar with Low/Median/High gradient |
| `frontend/src/features/predictor/DriversList.tsx` | CHANGED | Driver colors: orange (positive) / slate (negative), not green/red |
| `frontend/src/features/predictor/NearbyInfrastructure.tsx` | CHANGED | Per-ring score colors (Amenities=orange, Accessibility=deep-orange, Infrastructure=amber) |
| `frontend/src/features/predictor/predictor-helpers.ts` | CHANGED | Fixed `deriveResultState` — uses `nearby_listings === 0` (not `county_listings === 0`) for unsupported state |

### Frontend — Market Insights page (P3/G3)

| File | Status | Notes |
|---|---|---|
| `frontend/src/features/market-insights/index.tsx` | CHANGED | Stale docstring fixed (was "NOT MapLibre"); other tweaks |
| `frontend/src/features/market-insights/CountyPriceGrid.tsx` | CHANGED | Confirmed MapLibre intact; uses `bandForMedianOrange` (single-hue orange) |
| `frontend/src/features/market-insights/CountyRankList.tsx` | REWRITTEN | Top10/Bottom10 toggle + whisker/IQR bars |
| `frontend/src/features/market-insights/PriceDistanceScatter.tsx` | CHANGED | Added `TREND_MIN_POINTS = 5` guard |
| `frontend/src/features/market-insights/helpers.ts` | CHANGED | Added `bandForMedianOrange()` |

### Frontend — Deal Finder page (P4)

| File | Status | Notes |
|---|---|---|
| `frontend/src/features/deal-finder/index.tsx` | CHANGED | Eyebrow label, export count, 3 parallel verdict-count queries, methodology footer |
| `frontend/src/features/deal-finder/CorpusSummary.tsx` | NEW | Real verdict counts via 3 parallel `useListingsScored` calls |
| `frontend/src/features/deal-finder/FiltersBar.tsx` | CHANGED | Amenity chips + radius selector, Hide errors toggle, Reset filters |
| `frontend/src/features/deal-finder/ResultsTable.tsx` | CHANGED | 6 design columns, selected-row orange dot, verdict chips, Notice column, `table-fixed` + colgroup |
| `frontend/src/features/deal-finder/ListingDetailPanel.tsx` | CHANGED | "Active Target Deal" eyebrow, 80% range visualizer, dark "Open original listing" button |

### Frontend — Model Performance page (P5)

| File | Status | Notes |
|---|---|---|
| `frontend/src/features/model-performance/index.tsx` | CHANGED | Wired in `/model/predictions` + `/model/error-by-support` (#49 RESOLVED); replaced placeholder text |
| `frontend/src/features/model-performance/ActualVsPredicted.tsx` | NEW | Log-log scatter, 1:1 parity line, ±30% hatched band |
| `frontend/src/features/model-performance/ErrorBySupportBars.tsx` | NEW | 5 buckets, hatched sparse bucket |

### Frontend — Explainability page (P6)

| File | Status | Notes |
|---|---|---|
| `frontend/src/features/explainability/index.tsx` | CHANGED | Fixed crash: `r.model.toLowerCase()` on undefined → simplified to `r.model === 'xgb'` |
| `frontend/src/features/explainability/GlobalShapBars.tsx` | CHANGED | Render improvements |

### Frontend — Data Explorer page (P-fidelity round)

| File | Status | Notes |
|---|---|---|
| `frontend/src/features/data-explorer/index.tsx` | REWRITTEN | Full data-quality tab matching 09_data_explorer_quality + m12: 5-pill tab group with `?tab=` URL state, 4 stat tiles, missing-values card, log-scale price histogram, listings-per-county bars, provenance card frame, county table + mobile card list |
| `frontend/src/features/data-explorer/sections.tsx` | NEW | Section components for the data-quality tab |
| `frontend/src/features/data-explorer/helpers.ts` | NEW | Helpers for bin formatting, missing-values derivation, etc. |

### Frontend — About page (P-fidelity round)

| File | Status | Notes |
|---|---|---|
| `frontend/src/features/about/index.tsx` | REWRITTEN | Built to m13_about: eyebrow pill, live-system card, 6-step pipeline stepper with connecting line, 7 accessible accordion rows with API-derived numbers, mailto report button (`VITE_REPORT_EMAIL`-gated), footer disclaimer |

### Frontend — shared API layer (P5 + P-fidelity round)

| File | Status | Notes |
|---|---|---|
| `frontend/src/lib/api/types.ts` | CHANGED | Added `PredictionRow`, `ModelPredictionsResponse`, `ErrorBySupportRow`, `ErrorBySupportResponse`, `PriceBin`, `PriceDistributionResponse` |
| `frontend/src/lib/api/hooks.ts` | CHANGED | Added `useModelPredictions(sample=500)`, `useErrorBySupport()`, `usePriceDistribution()` |
| `frontend/src/lib/currency/format.ts` | CHANGED | Added `formatCompactMoney()` for compact "KSh 3.4M" formatting in tight table cells |

### Backend (P-fidelity round)

| File | Status | Notes |
|---|---|---|
| `backend/app/api/v1/routers/data_explorer.py` | NEW | `GET /api/v1/data/price-distribution` — log-spaced 24-bin histogram of per-acre asking prices, with p1/p10/p50/p90/p99 percentiles, n_usable + n_flagged counts |
| `backend/app/schemas/data_explorer.py` | NEW | Pydantic schemas: `PriceBin`, `PriceDistributionResponse` |
| `backend/app/main.py` | CHANGED | Registered the new `data_explorer` router |
| `backend/tests/test_data_explorer.py` | NEW + EDITED | 5 tests for the new endpoint (happy path, flagged count, degraded 503, empty-prices degenerate, bins-cover-all-prices). **Audit-pass fix:** removed 5 ruff issues (unused `pandas` import, ambiguous `l` variable, `zip` without `strict=`, two unused `lower_edge`/`upper_edge` locals). |

### Docs

| File | Status | Notes |
|---|---|---|
| `docs/known-gaps.md` | CHANGED | Grew from ~50 items to 88: added G1 (51–54), G2 (55–61), G3 (62–68), P4 (69–77), P5 (78–80), P6 (81), P7 SUPERSEDED note (82–83), P-fidelity round (84–88). Updated #15, #37–#40, #41 (icon decision), #47 (Data Explorer + About RESOLVED), #49 (#49 RESOLVED — frontend wired in P5). |
| `docs/openapi.snapshot.json` | CHANGED | Regenerated to include the new `/api/v1/data/price-distribution` endpoint |
| `docs/MERGE_NOTES.md` | UNCHANGED | The older unified-delivery merge notes — kept for history. This root file supersedes it for the fidelity-track delivery. |

### Root

| File | Status | Notes |
|---|---|---|
| `MERGE_NOTES.md` | NEW (this file) | Root merge guide for the fidelity-track delivery |
| `artifacts/README.md` | NEW | The expected placeholder (gitignored dir's lone committed file). Was missing from the working tree; restored to match prior deliveries. |

## Files UNCHANGED since 2026-11-15

For a targeted merge, you can leave these alone — they are byte-identical
to the previous zip:

- `backend/app/**` (everything except `main.py`, `api/v1/routers/data_explorer.py`, `schemas/data_explorer.py`)
- `backend/tests/**` (everything except `test_data_explorer.py`)
- `src/landval/**` (shared Python library)
- `frontend/src/features/{settings,more,not-found,component-preview}/**` (Settings is still PARTIAL per known-gaps #47/#48)
- `frontend/src/features/{predictor,predict,deal-finder,model-performance,explainability,market-insights}/*` files NOT listed above (e.g., `DealMap.tsx`, `csv-export.ts`, `CoverageBars.tsx`, `EnsembleWeights.tsx`, `MetricsKpiRow.tsx`, `ModelComparison.tsx`, `metrics-helpers.ts`, `predict-helpers.ts`, etc.)
- `frontend/src/components/{EmptyState,KpiStatBlock (was changed),PillDropdown,PillInput,MapLibreMap,ScoreRing (was changed)}/**`
- `frontend/src/lib/{api/client.ts, api/hooks.ts (was changed), i18n/**, currency/format.ts (was changed)}`
- `frontend/src/index.css`, `frontend/src/app/{App.tsx, QueryProvider.tsx}`
- `frontend/{index.html, package.json, package-lock.json, vite.config.ts, tsconfig.json, tsconfig.node.json, postcss.config.js, eslint.config.js, README.md}`
- `frontend/.env.example`
- Root: `README.md`, `LICENSE`, `pyproject.toml`, `uv.lock`, `Dockerfile`, `Makefile`, `compose.yaml`, `.dockerignore`, `.gitignore`, `.pre-commit-config.yaml`, `.env.example`
- `.github/workflows/{ci.yml, ci-frontend.yml}`
- `scripts/**` (extraction + validation + CI scripts)
- `docs/{api.md, api-contract.md, architecture.md, features.md, deploy_railway_vercel.md, decisions/**}`

## Audit-pass checks (2026-11-17)

This pass confirmed before zipping:

- **Frontend typecheck:** `tsc --noEmit` — 0 errors
- **Frontend lint:** `eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0` — 0 warnings
- **Frontend build:** `tsc -b && vite build` — 595 modules transformed, dist files generated (informational chunk-size advisory only on `maplibre-gl` chunk — inherent to using MapLibre)
- **Backend lint:** `ruff check backend/ src/` — `All checks passed!`
- **Backend format:** `ruff format --check backend/ src/` — `70 files already formatted`
- **Backend tests:** `pytest backend/tests/` — **179 passed, 1 skipped** (was 174 passed in the prior delivery; +5 from the new `test_data_explorer.py`)
- **Every page renders** at desktop (1380×1200) and mobile (390×1200) widths against a mock API. Screenshots in `/home/z/my-project/work/screenshots/audit-final/`. No horizontal overflow on mobile (scrollWidth === innerWidth === 390 for all 9 pages).
- **`docs/known-gaps.md` audit:** every item the fidelity track actually fixed is marked RESOLVED/FIXED/ADDED in place. No item marked resolved that wasn't finished. Settings remains the only PARTIAL item (#47, #48) — explicitly out of this round's scope.

Two pages (Deal Finder, Model Performance) initially appeared blank during the audit render — root cause was a mock-API shape mismatch (mock returned `{total}` instead of `{pagination:{total_rows, ...}}` for `/listings/scored`, and `{sample, rows}` instead of `{oof, test, oof_count, test_count, sampled, sample_size}` for `/model/predictions`). After fixing the mock fixture to conform to the typed schemas in `lib/api/types.ts`, both pages render real content. **No app code changed to fix this** — the typed hooks are correct; the mock was wrong. (Defensive-coding note for a future hardening pass: `underpricedQ.data?.pagination.total_rows` in `features/deal-finder/index.tsx` would crash if the backend ever returned a `data` payload without a `pagination` field. TypeScript guarantees `pagination` is present, so this only matters if the runtime response is malformed.)

## Delivery-safety checks (2026-11-17)

| Check | Status |
|---|---|
| No `.git` directory | ✓ confirmed (none was created) |
| No real `.env` files | ✓ only `.env.example` (root) and `frontend/.env.example` — both with placeholders only |
| No secrets / API keys | ✓ grep for `sk-…`, `AKIA…`, `ghp_…`, `password=…`, `secret=…`, `token=…` in backend/, frontend/src/, docs/, .env.example — 0 matches |
| `node_modules/` excluded | ✓ excluded from zip |
| `frontend/dist/` excluded | ✓ excluded from zip |
| `__pycache__/` excluded | ✓ excluded from zip |
| `.venv/` excluded | ✓ excluded from zip |
| `.pytest_cache/`, `.ruff_cache/`, `.mypy_cache/` excluded | ✓ excluded from zip |
| `backend/artifacts/` — README only | ✓ the directory now contains only `README.md`; no model binaries, parquet, GPKG, or geo data shipped |

## Suggested merge procedure

1. **Diff first, copy second.** For each CHANGED file above, run
   `diff <your-local>/path/to/file <zip>/path/to/file` and reconcile
   your local edits (if any) with the new content. Most files are
   small enough to eyeball.
2. **The NEW files are safe to add** — they don't collide with anything
   in your local tree unless you've added files with the exact same
   path/name yourself.
3. **For `docs/known-gaps.md`** — this is the file most likely to have
   diverged if you've been keeping your own notes. The 88 items are
   grouped by phase (B0–B12 → Cross-phase → Frontend round → F0–F9 →
   G1 → G2 → G3 → P4 → P5 → P6 → P7 SUPERSEDED → P-fidelity round).
   If you've added your own entries, splice them in by phase header.
4. **For `docs/openapi.snapshot.json`** — regenerated verbatim from
   the running app. Safe to replace unless you've manually edited it
   (you shouldn't have — it's generated by `make openapi-snapshot`).
5. **For `backend/app/main.py`** — only change is the new
   `data_explorer` router registration line. One-line addition; safe
   to splice in.
6. **For `frontend/src/lib/api/{types.ts,hooks.ts}`** — additions
   only (no changes to existing exports). Safe to splice the new
   types/hooks at the bottom of each file.
7. **After merging**, run `make lint && make test` (backend) and
   `npm run typecheck && npm run lint && npm run build` (frontend)
   to confirm the merge is clean.

## What is NOT in this delivery (deliberately)

- **Real model artifacts** — no parquet, GPKG, manifest.json, or
  shap_values shipped. Backend runs in degraded mode without them.
- **`node_modules/` / `.venv/` / `dist/`** — install with
  `npm install` (frontend) and `uv sync` (backend) after merge.
- **`.git/`** — the zip is not a git repo; merge into your local clone.
- **Settings page visual pass** — explicitly out of scope for this
  round (known-gaps #47, #48). The Settings page is functional but
  not restyled against `m15_more`.
- **Data Review workflow** — needs backend state (review queue,
  audit log) that doesn't exist. Reported in known-gaps #82, #83.
