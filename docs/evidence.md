# Evidence

Two-line summary: what was actually run, when, at which commit — test
results, the parity check, four fixture-backed sample predictions (one
suspect-data case), and degraded-mode behaviour. Nothing here is quoted
from memory; every number is from a command listed beside it.

For: reviewers deciding whether to believe the app works.

All results below were produced on **2026-11-25** at commit
**e1584c1** (the head of the repository snapshot), with
`PYTHONPATH=backend:src`. The trained artifacts are **not in the repo
snapshot** (`artifacts/` is empty), so the **real-ensemble parity check
and the live `/predict` path against the real model were not run in this
pass**; the owner-run parity report and the owner-provided metrics are
included below as labelled, owner-provided evidence (dates noted inline).

## Test results

| Suite | Command | Result | Notes |
|---|---|---|---|
| Backend (full) | `python -m pytest backend/tests/` | **379 passed, 7 skipped, 1 failed** (31.51s) | the 7 skips are artifact-gated parity tests needing the trained model; the 1 failure is `test_resilience.py::TestOpenAPISnapshot::test_snapshot_matches_current_schema` — OpenAPI snapshot drift (see next row). Failure rate 1/387 = 0.26%. |
| Frontend | `cd frontend && bun run test` | **155 passed** (11.50s) | vitest; includes the en/sw i18n key-parity test |
| OpenAPI snapshot | `python scripts/check_openapi_snapshot.py` | **diff detected (nonzero exit)** | the live schema differs from the frozen `docs/openapi.snapshot.json` — numeric serialisation (`exclusiveMinimum: 0` vs `0.0`, `maximum: 50` vs `50.0`) and a `title: "Lon"` field. The snapshot is frozen by policy (do not edit), so this stays failing and is **not** caused by the docs revision. |

**The one test failure, stated once.** `test_resilience.py::TestOpenAPISnapshot::test_snapshot_matches_current_schema`
fails because the code-generated OpenAPI schema has drifted from the
frozen `docs/openapi.snapshot.json` (numeric fields serialise as `0.0`/
`50.0` in the live schema but `0`/`50` in the snapshot, plus a `Lon`
title field). It is a pre-existing schema-drift, not an assertion against
model logic, and it is not fixed here because the snapshot and the
application code are both out of scope for this revision pass. No test
file was edited.

Real-ensemble parity check: not run.

## Owner-provided metrics (FACTS, not reproduced here)

These are the owner-confirmed test-set metrics of the weighted ensemble
(Run B), from `artifacts/metadata.json` — **owner-provided, 2026-11-25**.
They are *not* reproduced in this pass because the trained artifacts are
not in the repo snapshot; they are the same numbers quoted in the
[model card](model-card.md). All metrics measure error on **asking
prices**, which embed seller optimism — not accuracy against transaction
prices.

| Metric | Value | Meaning |
|---|---|---|
| R² | 0.738 | variance explained on log price/acre |
| RMSE | 1.187 | log-scale root mean squared error |
| MAE | 0.763 | log-scale mean absolute error |
| MedAPE | 43.4% | median absolute percentage error (money scale) |
| MAE (money) | KSh 45.5M/acre | mean absolute error on the KSh-per-acre scale |
| CV ensemble RMSE | 1.2504 ± 0.0043 (5-fold × 2 repeats) | development-set generalisation |

Data split (owner-provided, from `artifacts/metadata.json`, training run
2026-11-21): modelling **4,479** / development **3,807** (train **3,136**
+ validation **671**) / test **672**.

## Parity check (owner run, post-training — owner-provided)

Command: `python scripts/parity_check.py --artifacts-dir ./artifacts`.
Report: `artifacts/parity_check_report.json` (uploaded by the owner
2026-11-24; training run created 2026-11-21 08:24:23, Run B). This is the
owner's run against their trained artifacts — **not** a run from this
revision pass (artifacts are not in the repo snapshot).

**Result: FAILED — 0% pass rate on both stored-prediction layers.**

| Layer | Rows compared | Within tolerance (±0.001 log) | Pass rate |
|---|---|---|---|
| Test predictions (`test_predictions.parquet`) | 640 of 672 | 0 | **0.0%** |
| OOF predictions (`oof_predictions.parquet`) | 3,586 of 3,807 | 0 | **0.0%** |

(Comparisons skipped for rows with no fixture match or a NaN
`log_size_acres` — 32 test, 221 OOF.)

The mismatches are not marginal. Stored log predictions sit at 17–21
(i.e. KSh 24M–1.3B per acre); the backend's recomputed ensemble returns
−4 to −7 (i.e. fractions of a KSh per acre) — a ~24-log-unit shift on
every row.

**What the report itself shows** (from
`parity_check_report.json` + `metadata.json` + `ensemble_weights.json`):

1. The loaded ensemble's `kept_weights_renormalised` are
   **0.6211 / 0.2929 / 0.0860** (xgb/catboost/tabnet) — the stale
   serving-manifest weights from
   [incident 3](decisions.md#incident-3--stale-serving-manifest), not
   the `ensemble_weights.json` values **0.2295 / 0.6683 / 0.1022** that
   reproduce the stored ensemble.
2. `metadata.json` records the training environment as **xgboost
   3.4.1**, while the backend pins **2.1.1** — the version mismatch from
   [incident 2](decisions.md#incident-2--xgboost-3x-vs-211-lost-base_score),
   where a 3.x-written model file loses `base_score` under the 2.x
   runtime and silently shifts every prediction.

**Fix path** (both documented, run in this order, then re-run parity):

```bash
python scripts/fix_xgb_base_score.py artifacts/xgb_model.json   # repairs base_score (writes .bak)
python scripts/repair_serving_manifest.py --artifacts-dir ./artifacts  # re-aligns weights
python scripts/parity_check.py --artifacts-dir ./artifacts       # must pass before serving
```

Until parity passes, the served `/predict` values do not match the
trained model. **Do not serve this export.** The registry's guards and
the runbook's release checklist
([retrain-runbook.md](retrain-runbook.md)) encode exactly this gate.

## Fixture-backed plumbing check, not the real model

The four rows below are served by the app backed with the **fixture-built**
`listings_scored.parquet` — a plumbing check of the serve path, **not the
real model**. The fixture's `predicted_price_per_acre_ksh` is the
deterministic **global median of the corrected listed per-acre prices**,
KSh 30,492,055 (see `backend/tests/fixtures/listings_scored_fixture.py`),
so every row shows the same predicted value and range. With the real
artifacts the predicted values change; the verdict logic, suspect gate,
pagination and sorting asserted here do not. The real-ensemble metrics
are the owner-provided table above.

| # | listing_no | Title | Size (ac) | Listed KSh/ac | Predicted KSh/ac | 80% range KSh/ac | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | 116868314 | Vacant Land / Plot for Sale in Ruiru | 4.0 | 1,550,000 | 30,492,055 | 18,295,233 – 45,738,082 | Underpriced |
| 2 | -1274 | 0.1 ha Residential Land at Kamangu | 0.229568 | 18,295,233 | 30,492,055 | 18,295,233 – 45,738,082 | Fair |
| 3 | 114301476 | Vacant Land / Plot for Sale in Naivasha | 5,202,342.82 | 0.58 | 30,492,055 | 18,295,233 – 45,738,082 | **Suspect data** |
| 4 | 116972511 | Vacant Land / Plot for Sale in South C | 0.086487 | 867,182,351 | 30,492,055 | 18,295,233 – 45,738,082 | **Suspect data** |

- **#1** — listed KSh 1.55M/acre sits 91.5% below the low bound of the
  80% range (KSh 18.3M) → `underpriced`.
- **#3** — the suspect-data case: `listed_over_predicted = 1.9e-08`
  (ratio below 0.05) and an implausible 5.2M-acre size →
  `suspect_reason = listed_far_below_model`, rendered as a grey
  "Suspect data" chip, **excluded** from the verdict corpus counts.
- **#4** — the opposite gate arm: `listed_over_predicted = 28.44`
  (> 20) → `listed_far_above_model`.

Corpus counts (fixture parquet, from `/overview/summary`):
underpriced 1,238, fair 645, overpriced 1,661 (excluding suspects),
`n_suspect = 2,335`, total 5,879. Suspect reasons: 1,910
`non_finite_size`, 377 `listed_far_below_model`, 48
`listed_far_above_model`.

## Screenshots (fixture-backed unless noted)

Screenshots 01 and 02 are **fixture-backed**: the app was booted with the
fixture `listings_scored.parquet` (global-median predictions), not the
real model. Same viewport, same sample listing throughout; no personal
data is visible.

- [01-prediction.png](assets/screenshots/01-prediction.png) —
  **fixture-backed.** The Deal Finder table: asking KSh/acre, the model
  estimate (global median), 80% range, and verdict chip for listing
  116868314 (the Ruiru row, top of "Best Value first").
- [02-suspect.png](assets/screenshots/02-suspect.png) —
  **fixture-backed.** The same table with the "Data anomalies only"
  toggle switched off, revealing the grey Suspect data chips; corpus
  5,879 listings.
- [03-swahili-help.png](assets/screenshots/03-swahili-help.png) — the
  Kiswahili UI with the Help dialog open (bilingual user help).
- [04-api-docs.png](assets/screenshots/04-api-docs.png) — the Swagger UI
  at `/docs`, 24 operations listed.
- [05-degraded.png](assets/screenshots/05-degraded.png) — the
  degraded-mode banner ("Data may be incomplete — some model files are
  not loaded") with the app otherwise functional.

## Degraded-mode behaviour (verified 2026-11-25)

Boot the backend with no model artifacts (only the fixture
`listings_scored.parquet`):

- `GET /api/v1/health` → `{"status": "degraded", "artifacts_loaded":
  false, "version": "0.1.0"}` — the app still starts.
- `GET /api/v1/overview/summary`, `/listings/scored`,
  `/listings/options`, `/data/*` → 200 with real data.
- `GET /api/v1/model/metrics` → **503** `DATA_UNAVAILABLE`, body naming
  the missing file and how to produce it.
- The frontend shows the dismissible "Data may be incomplete" banner and
  per-card error+retry states; pages that need the missing artifacts
  render honest empty/error cards, never a blank screen
  ([05-degraded.png](assets/screenshots/05-degraded.png)).

## What is NOT evidenced here

- A **passing** parity run and live `/predict` output against the real
  ensemble — the owner-run parity failed 0% (above); re-run after the two
  fixes and record the passing report here. The real-ensemble parity
  check was not run in this revision pass (artifacts not in the repo
  snapshot).
- County-choropleth rendering (needs `kenya_counties_simplified.geojson`
  spatial data).
- Interval coverage at 50/80/90% — recorded per run in
  `artifacts/app_exports/metrics.json` (`interval_coverage_*`), not part
  of the uploaded artifact set.
