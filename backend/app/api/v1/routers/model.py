"""Model Performance + Explainability endpoints.

Model Performance:
  GET /api/v1/model/metrics
      Returns ``metrics_table.csv`` (Cell 9.3) and ``metrics.json`` together
      — CV RMSE mean/se, test metrics with bootstrap 95% CIs, county-grouped
      CV, ensemble weights, and (on the production run's weighted_ensemble
      row) the trimmed-test result and interval coverage at 50/80/90%.
  GET /api/v1/model/feature-evaluation
      Returns ``feature_evaluation.csv`` (Cell 3.8's ranked_table) — the
      Phase 3 feature ranking with availability, missing %, mutual info,
      permutation importance, mean |SHAP|, selection votes, in-selected-set.
  GET /api/v1/model/predictions
      Returns ``oof_predictions.parquet`` + ``test_predictions.parquet``
      (Cell 9.2) — per-listing actual vs. predicted values for the
      actual-vs-predicted scatter and calibration checks.  Supports an
      optional ``sample`` query param for deterministic random sampling
      when the full row count is large.
  GET /api/v1/model/error-by-support
      Returns ``error_by_support.csv`` (Cell 9.9) — OOF error broken down
      by listing-count support bands (county listings + nearby within 50km).

Explainability:
  GET /api/v1/model/explainability
      Returns ``shap_global.csv``, ``feature_importance.csv`` and
      ``feature_labels.json`` (Cell 9.4) in one payload — the global
      mean-|SHAP| ranking for both tree models, native + permutation
      importances for all three models, and the plain-English feature
      labels.  Per-listing SHAP is out of scope here; see B2's predict
      endpoint and the SHAP-in-scope note in the B2 final report.
      P6b additions: the ensemble ``models`` list + ``default_model`` (so
      the bars card is model-driven, never keyed to a hard-coded 'xgb');
      the ``ensemble_shap_coverage`` block is normalised to fractions,
      recomputed from the loaded ensemble's weights when the model
      registry is up (``source: "recomputed"``) and only falling back to
      the notebook-time manifest (``source: "manifest"``); and the
      load-time ``typical_price_per_acre_ksh`` / ``combined_base_value``
      when the explanation service is available.

All endpoints return 503 ``DATA_UNAVAILABLE`` (not 500) when their
source file is missing.
"""

from __future__ import annotations

from typing import Any

import pandas as pd
from fastapi import APIRouter, Query, Request

from app.schemas.app_exports import (
    ExplainabilityResponse,
    FeatureEvaluationResponse,
    FeatureEvaluationRow,
    FeatureImportanceRow,
    FeatureLabel,
    MetricsJsonResponse,
    MetricsResponse,
    MetricsTableResponse,
    MetricsTableRow,
    ShapGlobalRow,
)
from app.schemas.predictions import (
    ErrorBySupportResponse,
    ErrorBySupportRow,
    ModelPredictionsResponse,
    PredictionRow,
    SupportMeasureOption,
)
from app.services.explainability import (
    build_coverage_block,
    build_models_list,
    compute_typical_price,
)


def _band_sort_key(band: str) -> tuple[int, int]:
    r"""Sort key for band labels: the leading number in the label ("\<5"
    -> 5, "10-19" -> 10, "50+" -> 50); labels without a number sort last.
    A "\<N" band sorts before the "N-..." band that shares its number
    (the "\<10" band is BELOW the 10-19 band)."""
    import re as _re

    m = _re.search(r"\d+", band)
    num = int(m.group()) if m else 10**9
    lt = 0 if band.lstrip().startswith("<") else 1
    return (num, lt)


router = APIRouter(tags=["model"])


# ----------------------------------------------------------------------
# Helpers — NaN -> None coercion for clean JSON (NaN is not valid JSON)
# ----------------------------------------------------------------------


def _maybe_nan(v: Any) -> Any:
    """Convert numpy NaN / pandas NA to None so Pydantic renders null."""
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    return v


def _maybe_float(v: Any) -> float | None:
    v = _maybe_nan(v)
    return None if v is None else float(v)


# ----------------------------------------------------------------------
# GET /api/v1/model/metrics
# ----------------------------------------------------------------------


@router.get("/model/metrics", response_model=MetricsResponse)
async def model_metrics(request: Request) -> MetricsResponse:
    """CV + test metrics with bootstrap CIs, ensemble weights, interval coverage.

    P5b additions: ``ensemble_model`` (the production run's ensemble row,
    identified by the backend — the frontend resolves the row by this
    value only, no substring heuristics), ``production_run_label``,
    ``interval_levels`` (derived from the data — see the schema),
    ``default_interval_level``, ``interval_method`` (documented backend
    constant), ``n_test`` / ``n_dev`` (row counts of the loaded
    prediction parquets), and ``model_info`` (per-model display_name +
    family from the backend's documented registry mapping).
    """
    app_exports = request.app.state.app_exports
    table_df = app_exports.require("metrics_table_df", "metrics_table.csv")
    metrics_json = app_exports.require("metrics_json", "metrics.json")

    rows = [_metrics_table_row_from_series(r) for _, r in table_df.iterrows()]
    n_runs = int(table_df["run"].nunique()) if "run" in table_df.columns else 0
    n_models_per_run = int(len(table_df) // max(n_runs, 1))

    production_run = str(metrics_json.get("production_run", ""))

    # ---- ensemble_model: the production run's weighted_ensemble row (P5b).
    # Identified by the backend — the frontend matches table rows by this
    # value only.  Null when the production run has no weighted_ensemble
    # row (the frontend then shows "not available", no fallbacks). ----
    ensemble_model: str | None = None
    prod_mask = table_df["run"] == production_run
    if prod_mask.any():
        prod_models = set(table_df.loc[prod_mask, "model"].astype(str).tolist())
        if "weighted_ensemble" in prod_models:
            ensemble_model = "weighted_ensemble"
    # ---- interval_levels (P5b): derived from the data.  Prefer the
    # artifact's interval_coverage_weighted_ensemble[*].level entries;
    # fall back to the levels whose interval_coverage_* columns are
    # populated on the ensemble row; else null. ----
    coverage_entries = metrics_json.get("interval_coverage_weighted_ensemble", [])
    levels: list[float] | None = None
    if isinstance(coverage_entries, list) and coverage_entries:
        lvl = [
            float(e.get("level"))
            for e in coverage_entries
            if isinstance(e, dict) and e.get("level") is not None
        ]
        if lvl:
            levels = sorted(lvl)
    if not levels and ensemble_model is not None:
        we_rows = table_df[
            (table_df["run"] == production_run) & (table_df["model"] == ensemble_model)
        ]
        if len(we_rows):
            r = we_rows.iloc[0]
            lvl = []
            for col in ("interval_coverage_50", "interval_coverage_80", "interval_coverage_90"):
                v = _maybe_float(r.get(col))
                if v is not None:
                    lvl.append(float(col.rsplit("_", 1)[1]) / 100.0)
            if lvl:
                levels = sorted(lvl)

    # ---- n_test / n_dev from the loaded prediction parquets (P5b). ----
    n_test = (
        int(len(app_exports.test_predictions_df))
        if getattr(app_exports, "test_predictions_df", None) is not None
        else None
    )
    n_dev = (
        int(len(app_exports.oof_predictions_df))
        if getattr(app_exports, "oof_predictions_df", None) is not None
        else None
    )

    # ---- model_info: the backend's documented registry mapping (P5b).
    # Only the models that actually appear in the table are reported. ----
    from app.schemas.canonical import DEFAULT_CONFIDENCE_LEVEL, INTERVAL_METHOD, MODEL_INFO

    present_models = sorted(set(table_df["model"].astype(str).tolist()))
    model_info = {m: MODEL_INFO[m] for m in present_models if m in MODEL_INFO}

    created = str(metrics_json.get("created", ""))
    run_label = f"{production_run} · {created}" if created else (production_run or None)

    return MetricsResponse(
        table=MetricsTableResponse(rows=rows, n_runs=n_runs, n_models_per_run=n_models_per_run),
        metrics_json=MetricsJsonResponse(
            production_run=production_run,
            created=created,
            runs=metrics_json.get("runs", {}),
            interval_coverage_weighted_ensemble=coverage_entries,
        ),
        ensemble_model=ensemble_model,
        production_run_label=run_label,
        interval_levels=levels,
        default_interval_level=DEFAULT_CONFIDENCE_LEVEL,
        interval_method=INTERVAL_METHOD,
        n_test=n_test,
        n_dev=n_dev,
        model_info=model_info,
    )


def _metrics_table_row_from_series(r: pd.Series) -> MetricsTableRow:
    """Build a MetricsTableRow from a pandas Series, treating the
    interval_coverage_* / trimmed_test_* / county_group_cv_rmse /
    ensemble_weight columns as optional (only the production run's
    weighted_ensemble row populates them)."""
    return MetricsTableRow(
        run=str(r["run"]),
        model=str(r["model"]),
        cv_rmse_mean=float(r["cv_rmse_mean"]),
        cv_rmse_se=float(r["cv_rmse_se"]),
        test_R2=float(r["test_R2"]),
        test_RMSE=float(r["test_RMSE"]),
        test_MAE=float(r["test_MAE"]),
        test_MedAPE_pct=float(r["test_MedAPE_pct"]),
        test_MAE_KSh_per_acre=float(r["test_MAE_KSh_per_acre"]),
        ci95_R2_lo=float(r["ci95_R2_lo"]),
        ci95_R2_hi=float(r["ci95_R2_hi"]),
        ci95_RMSE_lo=float(r["ci95_RMSE_lo"]),
        ci95_RMSE_hi=float(r["ci95_RMSE_hi"]),
        ci95_MAE_lo=float(r["ci95_MAE_lo"]),
        ci95_MAE_hi=float(r["ci95_MAE_hi"]),
        county_group_cv_rmse=_maybe_float(r.get("county_group_cv_rmse")),
        ensemble_weight=_maybe_float(r.get("ensemble_weight")),
        trimmed_test_rmse=_maybe_float(r.get("trimmed_test_rmse")),
        trimmed_test_rows=(
            int(r["trimmed_test_rows"])
            if _maybe_nan(r.get("trimmed_test_rows")) is not None
            else None
        ),
        interval_coverage_50=_maybe_float(r.get("interval_coverage_50")),
        interval_width_ratio_50=_maybe_float(r.get("interval_width_ratio_50")),
        interval_coverage_80=_maybe_float(r.get("interval_coverage_80")),
        interval_width_ratio_80=_maybe_float(r.get("interval_width_ratio_80")),
        interval_coverage_90=_maybe_float(r.get("interval_coverage_90")),
        interval_width_ratio_90=_maybe_float(r.get("interval_width_ratio_90")),
    )


# ----------------------------------------------------------------------
# GET /api/v1/model/feature-evaluation
# ----------------------------------------------------------------------


@router.get("/model/feature-evaluation", response_model=FeatureEvaluationResponse)
async def feature_evaluation(request: Request) -> FeatureEvaluationResponse:
    """Phase 3 ranked feature table (Cell 3.8, written by Cell 9.3)."""
    app_exports = request.app.state.app_exports
    df = app_exports.require("feature_evaluation_df", "feature_evaluation.csv")

    rows = [
        FeatureEvaluationRow(
            feature=str(r["feature"]),
            group=str(r["group"]),
            available=str(r["available"]),
            **{"missing_%": float(r["missing_%"])},
            mutual_info=_maybe_float(r.get("mutual_info")),
            perm_delta_rmse=float(r["perm_delta_rmse"]),
            mean_abs_shap=_maybe_float(r.get("mean_abs_shap")),
            selection_votes=int(r["selection_votes"]),
            in_selected_set=bool(r["in_selected_set"]),
        )
        for _, r in df.iterrows()
    ]
    return FeatureEvaluationResponse(rows=rows, n_features=len(rows))


# ----------------------------------------------------------------------
# GET /api/v1/model/explainability
# ----------------------------------------------------------------------


@router.get("/model/explainability", response_model=ExplainabilityResponse)
async def explainability(request: Request) -> ExplainabilityResponse:
    """Global mean-|SHAP| + native & permutation importance + feature labels.

    P6b additions: ``models`` (the ensemble member list with display names,
    families, weights and a has_shap flag) + ``default_model``; the
    ``ensemble_shap_coverage`` block is now normalised to fractions with a
    ``source`` flag — recomputed from the actually-loaded ensemble's weights
    when the model registry is loaded (the same shared computation the live
    /predict coverage block uses), else the notebook-time manifest values;
    ``typical_price_per_acre_ksh`` / ``combined_base_value`` carry the
    load-time baseline when the explanation service is available.
    """
    app_exports = request.app.state.app_exports
    shap_df = app_exports.require("shap_global_df", "shap_global.csv")
    imp_df = app_exports.require("feature_importance_df", "feature_importance.csv")
    labels_json = app_exports.require("feature_labels_json", "feature_labels.json")
    manifest = app_exports.require("manifest", "manifest.json")

    shap_rows = [
        ShapGlobalRow(
            model=str(r["model"]),
            feature=str(r["feature"]),
            mean_abs_shap=float(r["mean_abs_shap"]),
        )
        for _, r in shap_df.iterrows()
    ]
    imp_rows = [
        FeatureImportanceRow(
            model=str(r["model"]),
            feature=str(r["feature"]),
            importance=float(r["importance"]),
            method=str(r["method"]),
        )
        for _, r in imp_df.iterrows()
    ]

    # feature_labels.json:features is a dict {feature_name: {label, unit, ...}}.
    features_dict = labels_json.get("features", {}) if isinstance(labels_json, dict) else {}
    labels = {
        name: FeatureLabel(
            label=str(f.get("label", name)),
            unit=str(f.get("unit", "")),
            description=str(f.get("description", "")),
            source=str(f.get("source", "")),
            in_production_set=bool(f.get("in_production_set", False)),
            available_at_prediction_time=f.get("available_at_prediction_time"),
        )
        for name, f in features_dict.items()
    }

    # ---- P6b additions: member list, coverage block, load-time baseline. ----
    registry = getattr(request.app.state, "model_registry", None)
    explanation_service = getattr(request.app.state, "explanation_service", None)
    coverage_block = build_coverage_block(manifest, registry)
    models, default_model = build_models_list(shap_df, registry)
    combined_base, typical_price = compute_typical_price(registry, explanation_service)

    return ExplainabilityResponse(
        production_run=str(manifest.get("production_run", "")),
        shap_global=shap_rows,
        feature_importance=imp_rows,
        feature_labels=labels,
        ensemble_shap_coverage=coverage_block,
        models=models,
        default_model=default_model,
        typical_price_per_acre_ksh=typical_price,
        combined_base_value=combined_base,
    )


# ----------------------------------------------------------------------
# GET /api/v1/model/predictions — oof + test prediction parquets (Cell 9.2)
# ----------------------------------------------------------------------

# Columns in the prediction parquets (Cell 9.2's _prediction_export):
# ID_COLUMNS (9): listing_url, listing_no, title, location, county,
#                  prop_type, latitude, longitude, price_ksh
# y_true, pred_xgb, pred_catboost, pred_tabnet, pred_simple_average,
# pred_weighted_ensemble, fold, split
_PREDICTION_COLUMNS = [
    "listing_url",
    "listing_no",
    "title",
    "location",
    "county",
    "prop_type",
    "latitude",
    "longitude",
    "price_ksh",
    "y_true",
    "pred_xgb",
    "pred_catboost",
    "pred_tabnet",
    "pred_simple_average",
    "pred_weighted_ensemble",
    "fold",
    "split",
]


@router.get("/model/predictions", response_model=ModelPredictionsResponse)
async def model_predictions(
    request: Request,
    sample: int | None = Query(
        None,
        ge=10,
        le=10000,
        description=(
            "If set, return a deterministic random sample of this many rows "
            "from each split (oof + test) rather than every row.  Useful for "
            "scatter plots where the full row count would be wasteful.  "
            "The sample is deterministic (seed=42) so the same request always "
            "returns the same rows."
        ),
    ),
) -> ModelPredictionsResponse:
    """Per-listing actual vs. predicted values for both splits.

    Returns both the development-set out-of-fold predictions and the test-set
    predictions in one payload.  Each row carries the identifier columns
    (listing_url, listing_no, county, prop_type, etc.) so the frontend can
    link a scatter point back to its listing.
    """
    app_exports = request.app.state.app_exports
    oof_df = app_exports.require("oof_predictions_df", "oof_predictions.parquet")
    test_df = app_exports.require("test_predictions_df", "test_predictions.parquet")

    oof_count = int(len(oof_df))
    test_count = int(len(test_df))
    sampled = sample is not None

    if sampled:
        # Deterministic sample (seed=42) so the same request always returns
        # the same rows — important for chart stability in the frontend.
        oof_df = oof_df.sample(n=min(sample, oof_count), random_state=42)
        test_df = test_df.sample(n=min(sample, test_count), random_state=42)

    oof_rows = [_prediction_row_from_series(r) for _, r in oof_df.iterrows()]
    test_rows = [_prediction_row_from_series(r) for _, r in test_df.iterrows()]

    return ModelPredictionsResponse(
        oof=oof_rows,
        test=test_rows,
        oof_count=oof_count,
        test_count=test_count,
        sampled=sampled,
        sample_size=sample if sampled else None,
    )


def _prediction_row_from_series(r: pd.Series) -> PredictionRow:
    """Build a PredictionRow from a pandas Series — handles NaN coercion."""
    return PredictionRow(
        listing_url=_maybe_nan(r.get("listing_url")),
        listing_no=_maybe_nan(r.get("listing_no")),
        title=_maybe_nan(r.get("title")),
        location=_maybe_nan(r.get("location")),
        county=_maybe_nan(r.get("county")),
        prop_type=_maybe_nan(r.get("prop_type")),
        latitude=_maybe_nan(r.get("latitude")),
        longitude=_maybe_nan(r.get("longitude")),
        price_ksh=_maybe_float(r.get("price_ksh")),
        y_true=float(r["y_true"]),
        pred_xgb=float(r["pred_xgb"]),
        pred_catboost=float(r["pred_catboost"]),
        pred_tabnet=float(r["pred_tabnet"]),
        pred_simple_average=float(r["pred_simple_average"]),
        pred_weighted_ensemble=float(r["pred_weighted_ensemble"]),
        fold=int(r["fold"]),
        split=str(r["split"]),
    )


# ----------------------------------------------------------------------
# GET /api/v1/model/error-by-support — error_by_support.csv (Cell 9.9)
# ----------------------------------------------------------------------


@router.get("/model/error-by-support", response_model=ErrorBySupportResponse)
async def error_by_support(request: Request) -> ErrorBySupportResponse:
    """OOF error broken down by listing-count support bands.

    Returns ``error_by_support.csv`` (Cell 9.9) — two groups of bands:
    - ``county_listings``: error by the number of listings in the county
      (<10 / 10-19 / 20-49 / 50+)
    - ``nearby_within_50km``: error by the number of listings within 50km
      (<5 / 5-9 / 10-19 / 20-49 / 50+)
    """
    # error_by_support.csv is loaded by the ModelRegistry (B2), not by the
    # AppExportsRegistry — it lives under backend_exports/, not app_exports/.
    model_reg = getattr(request.app.state, "model_registry", None)
    if model_reg is None or not getattr(model_reg, "loaded", False):
        # error_by_support.csv lives under backend_exports/ and is loaded
        # by the ModelRegistry (B2), not by the AppExportsRegistry.
        from app.core.exceptions import AppError

        raise AppError(
            code="DATA_UNAVAILABLE",
            message=(
                "error_by_support.csv is not available — the model registry "
                "is not loaded. This file lives under backend_exports/ and "
                "is loaded by the ModelRegistry at startup."
            ),
            status_code=503,
            details={"file": "backend_exports/error_by_support.csv"},
        )

    rows_data = model_reg.error_by_support
    if not rows_data:
        from app.core.exceptions import AppError

        raise AppError(
            code="DATA_UNAVAILABLE",
            message="error_by_support.csv loaded but is empty or unreadable.",
            status_code=503,
            details={"file": "backend_exports/error_by_support.csv"},
        )

    rows = [
        ErrorBySupportRow(
            support_measure=str(r.get("support_measure", "")),
            band=str(r.get("band", "")),
            n_listings=int(r.get("n_listings", 0)),
            oof_rmse=float(r.get("oof_rmse", 0.0)),
            oof_mae=float(r.get("oof_mae", 0.0)),
            band_order=0,
        )
        for r in rows_data
    ]

    # ---- P5b: band_order (ascending ordinal within each support_measure
    # group) + support_measures (the distinct groups with i18n label
    # keys).  The band label is served verbatim; the frontend never
    # re-derives any embedded threshold. ----

    grouped: dict[str, list[ErrorBySupportRow]] = {}
    for row in rows:
        grouped.setdefault(row.support_measure, []).append(row)
    measure_order: list[str] = []
    for measure, group in grouped.items():
        if measure not in measure_order:
            measure_order.append(measure)
        order_by_band = {
            b: i for i, b in enumerate(sorted((row.band for row in group), key=_band_sort_key))
        }
        for row in group:
            row.band_order = order_by_band[row.band]

    _MEASURE_LABEL_KEYS = {
        "county_listings": "model.errorBySupport.measure.countyListings",
        "nearby_within_50km": "model.errorBySupport.measure.nearby",
    }
    support_measures = [
        SupportMeasureOption(
            value=measure,
            label_key=_MEASURE_LABEL_KEYS.get(measure, f"model.errorBySupport.measure.{measure}"),
        )
        for measure in measure_order
    ]
    return ErrorBySupportResponse(rows=rows, n_rows=len(rows), support_measures=support_measures)
