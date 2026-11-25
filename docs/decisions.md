# Decisions and incidents log

Two-line summary: short, dated records of the judgement calls that shaped
this repo (context → decision → consequence), plus three incident notes
(what happened, cause, fix, prevention). Longer architecture decisions
live in the ADRs this file links to.

For: reviewers assessing engineering judgement, and maintainers who need
to know why a rule exists before changing it.

Existing ADRs (not duplicated here):
[0001 Use FastAPI](decisions/0001-use-fastapi.md),
[0002 Model versioning and safe promotion](decisions/0002-model-versioning.md).
The consolidated "reported, not fixed" list lives in
[known-gaps.md](known-gaps.md).

## Decisions

### D1 — Size parsing: structured-first, description-last (2026-11)

- **Context.** The original Notebook 1 Cells 45+49 parsed sizes only from
  the scraped `size` text and a description regex. On real rows they
  produced wrong values six ways (failure modes a–f in
  `src/landval/cleaning/size.py`): `erf_size` (2,187 non-null) was never
  consulted; thousands separators truncated ("2,077 acre" → 77); m² was
  not recognised; "0.12 m²" actually meant 0.12 acres; 19 rows had
  `size_acres = 0.0` producing `price_per_acre = inf`; scraper
  truncation artifacts ("077") passed through.
- **Decision.** Source priority **column → erf_size → description**,
  recorded per row in `size_source ∈ {column, erf_size, nlp_description,
  missing}`; unit order m² → ha → sqft → acres; thousands-separator-aware
  number tokens; m² sanity rule (< 100 sqm reinterpreted as acres);
  truncation guard `^0\d+$`; structured-vs-description conflict > 2× keeps
  the structured value with `size_conflict`; non-positive/non-finite
  sizes become NaN, never 0.
- **Consequence.** 553 sizes changed, 153 conflicts flagged, 19 zero-size
  and 18 `inf` price rows eliminated; usable per-acre rows 3,929 → 3,958;
  median price/acre moved KSh 34.8M → KSh 30.5M (the legacy median was
  inflated by bad sizes). Rows with no usable size (1,908) are honestly
  missing and flow into the suspect gate as `non_finite_size` rather than
  being dropped silently.

### D2 — Price basis: convert, with a conflict flag (2026-11)

- **Context.** 679 of 3,929 usable rows carry a "per acre" phrase in the
  description, and many listed prices are per-acre ("selling at 250K per
  acre" with price KSh 250,000). The legacy Cell 167 divided every price
  by size, turning KSh 250,000/acre into KSh 62.5/acre.
- **Decision.** `detect_price_basis` (in
  `src/landval/cleaning/price_basis.py`) classifies each row
  `per_acre` / `total` / `unknown`; the production mode
  `PRICE_BASIS_MODE = "convert"` **reinterprets** per-acre listings
  (price_per_acre = listed; total = listed × size) instead of only
  flagging them. A per-acre phrase with no matching amount keeps
  `total` and sets `price_basis_conflict = True`. A total-indicator word
  inside the ±40-char window disqualifies an amount as a per-acre
  candidate.
- **Consequence.** 354 rows convert; the alternatives (`"exclude"`,
  `"flag_only"`) remain available for a stricter rerun. Converting
  preserves sample size for county aggregates; the cost is trust in the
  phrase-matching, which is why every converted row is auditable via
  `price_basis` + the listing URL.

### D3 — Three production features, "fewest within one SE" (2026-11, Notebook 3)

- **Context.** Phase 3 evaluates every candidate feature on the
  development set only (group ablation, permutation importance, SHAP
  screening, greedy selection, CatBoost confirmation, stability). Runs
  A (9 geographic features) and B (selected) sit within noise of each
  other on CV ensemble RMSE.
- **Decision.** Cell 8.1: among runs within **one pooled standard error**
  of the best CV ensemble RMSE, the run with the **fewest features**
  becomes production (better CV breaks ties); an availability gate
  excludes any run using a feature with no value at prediction time.
- **Consequence.** The production model uses 3 features — simpler to
  serve, less overfitting risk, every input obtainable at prediction
  time. The exact 3-feature list is recorded in the run's
  `artifacts/feature_list.json` (TBC against your local artifacts; the
  notebooks ship without outputs). Registered alternatives remain in
  `metrics_table.csv` for comparison.

### D4 — Suspect-gate thresholds 0.05 and 20 (2026-11, Part B)

- **Context.** Deal verdicts were polluted by listings whose asking price
  is implausible against the model (typos, unit errors, per-acre/total
  confusion surviving cleaning), and by rows with non-finite sizes.
- **Decision.** A serve-time gate (never persisted): `is_suspect = true`
  when `listed_over_predicted < 0.05` or `> 20.0` (canonical
  `SUSPECT_RATIO_LOW`/`SUSPECT_RATIO_HIGH` in
  `backend/app/schemas/canonical.py`) or `size_acres` is
  non-finite/non-positive. Reasons: `listed_far_below_model`,
  `listed_far_above_model`, `non_finite_size`.
- **Consequence.** On the fixture corpus 2,335 of 5,879 rows are suspect
  (1,910 size, 377 below, 48 above) and are excluded from verdict counts
  and rendered as grey "Suspect data" chips. The thresholds are wide
  (20× / 1/20×) so the gate catches only clear impossibilities, not
  genuine bargains.

### D5 — Asking prices stated everywhere (ongoing)

- **Context.** The corpus is what sellers listed; there is no transaction
  data.
- **Decision.** Every accuracy or metric discussion (model card, API
  docs, in-app footer) states that prices are asking prices, not sale
  prices, and that the app is not a valuation certificate.
- **Consequence.** No user can mistake the output for a formal valuation;
  reviewers see the limitation without hunting for it.

## Incidents

### Incident 1 — Wrong size/price reads (comma truncation, missing erf_size)

- **What happened.** The original cleaning produced wrong per-acre prices
  corpus-wide: "2,077 acre" parsed as 77 acres; the structured
  `erf_size` field was ignored; per-acre listings were divided by size
  again; 19 rows had size 0 → `price_per_acre = inf`; median price/acre
  was inflated to KSh 34.8M.
- **Cause.** Notebook 1's regexes predates the `landval` library: number
  tokens dropped thousands separators; no source priority; no
  price-basis detection; no non-finite guard.
- **Fix.** `src/landval/cleaning/size.py` + `price_basis.py` (D1, D2),
  wired into Notebook 1 via `notebook_patch/NB1_replacement_cells.py`
  (Cells 45, 47, 49, 167, and the FINAL_COLUMNS addition in Cell 169).
  Verified by `backend/tests/test_cleaning_size.py` /
  `test_cleaning_price_basis.py` (28 tests) and
  `scripts/replay_cleaning.py` (before/after table on 8 fixture
  listings + corpus aggregates).
- **Prevention.** Cleaning lives in tested library code, not notebook
  cells; the fixture listings (8 real rows incl. the comma-truncation
  cases 110468626, 116846923, -6) pin the behaviour; replay script
  makes any regression visible as a before/after diff.

### Incident 2 — XGBoost 3.x vs 2.1.1: lost base_score

- **What happened.** A model file written by XGBoost 3.x was loaded by
  the pinned 2.1.1 runtime: 2.x cannot parse `base_score` written as a
  bracketed vector string (`"[1.6979546E1]"`), silently falls back to
  the default 0.5, and **shifts every prediction** by
  `base_score − 0.5` with no error.
- **Cause.** XGBoost changed the JSON schema of
  `learner_model_param.base_score` between major versions; the silent
  fallback hides the incompatibility.
- **Fix.** `pyproject.toml` pins `xgboost==2.1.1` (training and serving
  must match). `scripts/fix_xgb_base_score.py` repairs an affected file
  in place (strips the brackets, writes `.bak` first, refuses
  multi-target vectors).
- **Prevention.** The pin is in the lockfile; the repair script prints
  the writer version and the raw `base_score` so a mismatch is visible;
  the parity check (below) would catch shifted predictions.

### Incident 3 — Stale serving manifest

- **What happened.** The live `serving_manifest.json` shipped weights
  0.6211/0.2929/0.0860 (xgb/catboost/tabnet) while
  `ensemble_weights.json` — the file that reproduces the stored ensemble
  to 7e-15 — says 0.2295316/0.6682573/0.1022111. Every served ensemble
  prediction was wrong.
- **Cause.** The manifest was exported from a different training run
  than the weights file next to it: Notebook 3 Cell 9.8 writes a fresh
  manifest per run, and a partial re-export left the two inconsistent.
- **Fix.** `scripts/repair_serving_manifest.py` rewrites the manifest's
  weights from `ensemble_weights.json`, refusing to run (exit 2) when
  models were pruned, the model sets differ, or the manifest's
  imputation values disagree with `preprocessing.json` (a repair cannot
  fix a cross-run manifest — re-export from Cell 9.8 instead).
  ADR [0002 model versioning](decisions/0002-model-versioning.md)
  defines versioned promotion so a run's artifacts stay together.
- **Prevention.** The serving manifest must come from **the same
  training run** as the artifacts it describes; the registry's Part 2b
  guard checks `imputation_values` against `preprocessing.json` medians
  (tolerance 1e-9); `scripts/parity_check.py` verifies served
  predictions against stored OOF/test predictions after any artifact
  change.
