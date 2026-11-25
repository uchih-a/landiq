# Model card — Kenya Land Valuation ensemble

Two-line summary: an XGBoost + CatBoost + TabNet weighted ensemble
predicting a parcel's **log price per acre** from three production
features, with a split-conformal 80% range, trained on 4,479 scraped
ASKING-price listings. Intended as a market-signal tool, not a valuation
certificate.

For: reviewers assessing the modelling judgement, and anyone deciding
whether to trust a number the app shows them.

![Data and model pipeline: the Raw listings CSV is cleaned in three stages — size parsing, price basis, feature engineering — then branched to XGBoost, CatBoost and TabNet, combined into a weighted ensemble, wrapped in a split-conformal 80% range, and passed through a serve-time suspect gate; test metrics and split sizes are listed beneath](assets/diagrams/02-data-model-pipeline.png)

*Figure — data and model pipeline: cleaning order, the three-model weighted ensemble, and the 80% range. Values shown are owner-provided, 2026-11-25.*

## Model facts

| Fact | Value | Source |
|---|---|---|
| Target | `log_price_per_acre` — natural log of KSh per acre (a median-scale quantity on the log axis) | `notebook/03_modelling.ipynb` Cell 0 |
| Production run | **Run B (selected features)** | `artifacts/metadata.json` |
| Production features | **3: `log_size_acres`, `dist_to_county_town_km`, `longitude`** (all numeric; no categoricals), chosen by the "fewest features within one standard error" rule (see below) | `artifacts/feature_list.json` |
| Members | XGBoost, CatBoost, TabNet | Notebook 3 Phase 4 |
| Ensemble weights | non-negative simplex weights fitted on development-set OOF predictions: **0.2295 (xgb) / 0.6683 (catboost) / 0.1022 (tabnet)** | `artifacts/ensemble_weights.json` |
| Interval | split-conformal on the log scale, calibrated on 3,807 OOF residuals; multiplicative in KSh | Notebook 3 Cell 9.1 |
| Confidence levels | 0.50 / 0.80 / 0.90 served; 0.80 is the app default | `backend/app/schemas/canonical.py` |
| Serving pins | `xgboost==2.1.1`, `catboost==1.2.5`, Python 3.12 | `pyproject.toml` |
| Training environment (last run) | xgboost **3.4.1**, catboost 1.2.10, Python (Colab), seed 42, CPU | `artifacts/metadata.json` |

**The three production features.** Notebook 3 Phase 3 evaluates candidates
on the development set only (group ablation, permutation importance, SHAP
screening, greedy forward/backward selection, CatBoost confirmation,
stability). Cell 8.1 then picks the production run: among runs whose CV
ensemble RMSE is within one pooled standard error of the best, **the one
with the fewest features wins** (better CV breaks feature-count ties). An
availability gate excludes any run depending on a feature with no value at
prediction time. Run B won with `log_size_acres`,
`dist_to_county_town_km`, and `longitude`; Run A (the 9 geographic
features, also listed in `feature_list.json`) remains registered for
comparison. All three are obtainable at prediction time: the user's size
input, the distance to the county town computed from the map point
(`reference_data.json:county_towns`), and the map point's longitude.
Imputation medians for missing inputs come from
`artifacts/preprocessing.json` (`log_size_acres` 0.0 i.e. 1 acre,
`dist_to_county_town_km` 24.67 km, `longitude` 36.809).

**Serving caveat (from the last training run).** The training environment
used xgboost 3.4.1 while the backend pins 2.1.1, and the exported serving
manifest carried stale weights (0.6211/0.2929/0.0860) instead of the
`ensemble_weights.json` values above. The parity check failed 0% as a
result — see [evidence.md](evidence.md#parity-check-owner-run-post-training).
Run `fix_xgb_base_score.py` + `repair_serving_manifest.py` and re-run
parity before serving; both incidents are documented in
[decisions.md](decisions.md).

## Data split

From `artifacts/metadata.json` (training run 2026-11-21):

| Split | Rows |
|---|---|
| Modelling frame (target filters passed) | 4,479 |
| Development (5-fold × 2-repeat CV, OOF predictions) | 3,807 |
| — train / validation | 3,136 / 671 |
| Test (read once, final evaluation only) | 672 |

- Development / test split per the archived M3 rule; the test set is
  never used for selection.
- Development rows carry out-of-fold (OOF) predictions; test rows carry
  predictions from development-fitted models (asserted in Cell 9.6).
- County-grouped CV (Cell 4.1/6.2) is reported next to the standard CV
  score to expose geographic generalisation.

## Metrics

Test-set metrics of the weighted ensemble (Run B, from
`artifacts/metadata.json`; single evaluation of the development-fitted
models on the 672-row test set):

| Metric | Value | Meaning |
|---|---|---|
| R² | **0.738** | variance explained on log price/acre |
| RMSE | **1.187** | log-scale root mean squared error |
| MAE | **0.763** | log-scale mean absolute error |
| MedAPE | **43.4%** | median absolute percentage error (money scale) |
| MAE (money) | **KSh 45.5M/acre** | mean absolute error on the KSh-per-acre scale |
| CV ensemble RMSE | 1.2504 ± 0.0043 (5-fold × 2 repeats) | development-set generalisation |

Served by `/model/metrics` from `artifacts/app_exports/metrics.json` /
`metrics_table.csv` (per-run × per-model CV RMSE mean/se, trimmed-test
RMSE, county-grouped CV RMSE, interval coverage at 50/80/90%). All
metrics measure error on **asking prices**, which embed seller optimism
and listing strategy; they are not accuracy against transaction prices.

## What the 80% range means

The split-conformal quantile `q` is calibrated on OOF absolute residuals
on the log scale using the finite-sample `ceil((n+1)·level)`-th smallest
residual. The served range is multiplicative:
`[prediction × exp(−q), prediction × exp(+q)]`. Empirically it should hold
~80% of the time (80% empirical coverage on test is reported, never used
for selection). The interval width is **constant in log space** — the same
multiplicative band for a KSh 100k/acre plot and a KSh 100M/acre ranch —
which understates uncertainty where the data is thin (small counties, few
comparables). The `/predict` response flags low-support inputs
(`is_low_support`, coverage rules from
`artifacts/coverage_rules.json`).

## How verdicts use the range

For each Deal Finder listing: listed per-acre price below the low bound →
`underpriced`; above the high bound → `overpriced`; inside → `fair`.
Suspect listings (below) are excluded from these counts entirely.

## The suspect gate

The suspect gate is not part of `/predict`; it runs on listings via
`GET /api/v1/listings/scored` (Deal Finder). Verdict chips on `/predict`
come from the comparable listings in the response.

`backend/app/services/suspect_gate.py` (canonical thresholds
`SUSPECT_RATIO_LOW = 0.05`, `SUSPECT_RATIO_HIGH = 20.0`):

- `listed_over_predicted < 0.05` → `listed_far_below_model`
- `listed_over_predicted > 20` → `listed_far_above_model`
- non-finite / non-positive `size_acres` → `non_finite_size`

On the fixture-built corpus: 2,335 of 5,879 rows are suspect (1,910
non-finite size, 377 far below, 48 far above) — see
[evidence.md](evidence.md). The gate runs at serve time and is never
persisted into the artifacts.

## Limitations

- **Asking prices, not sales.** The entire target is what sellers listed.
  No transaction, registry, or official valuation data was used.
- Small sample (4,479 modelling rows; 3,958 usable per-acre listings),
  scraped from **Property24 Kenya** only — BuyRentKenya is a secondary
  source the scraper targets, but its rows are **not** in the committed
  CSV or this model. Coverage across Kenya's 47 counties is uneven and
  the app flags low-support counties.
- Constant multiplicative interval width (see above); thin-data regions
  are more uncertain than the range suggests.
- Geocoding confidence varies; some listings carry no coordinates, which
  removes their distance features.
- Text-derived scores (amenity/accessibility from listing descriptions)
  reflect what sellers wrote, not ground truth; the production feature set
  deliberately prefers OSM-derived scores.
- Scraped data contains errors: unit mistakes, comma-truncated numbers,
  per-acre prices recorded as totals. The cleaning rules
  ([data dictionary](data-dictionary.md)) and the suspect gate reduce but
  do not eliminate these.

## Intended and unintended use

**Intended:** market-signal exploration for people comparing land asking
prices across Kenyan counties; a screening tool that surfaces listings
worth a professional's time; education about what drives per-acre prices.

**Not intended (unacceptable):** formal valuation for lending, taxation,
compensation, or litigation; pricing individual transactions without a
human valuer; discriminatory screening of buyers or neighbourhoods;
reliance on any single number without its 80% range and support flags.

**This app does not produce a valuation certificate.**

## User help (same copy as the in-app Help dialog)

- **Verdict chips** — Underpriced, Fair, or Overpriced by comparing the
  asking price with the model's estimate range.
- **80% range** — the model's split-conformal interval: the price band
  that holds 80% of the time.
- **Suspect data** — an asking price implausible relative to the model's
  location-aware estimate; excluded from verdicts and counted separately.
- **Data-quality flag** — per-acre price outside the dataset's 1st–99th
  percentile window; a possible scraping or unit error, excluded from
  training.

Available in English and Kiswahili (`en` / `sw`).
