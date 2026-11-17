"""Response schemas for the read-only data endpoints.

Every schema mirrors the **actual** columns written by Notebook 3 Phase 9
(verified against Cells 9.3, 9.4, 9.5, 9.6, 9.7 — see the per-class
docstrings for the cell citation).  Cell 9.7's ``manifest.json`` carries
the authoritative ``columns`` / ``dtypes`` lists for each file, so the
OpenAPI docs generated from these schemas stay accurate without needing
the data files present at schema-build time.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

# ----------------------------------------------------------------------
# Shared envelope for paginated responses
# ----------------------------------------------------------------------


class PaginationMeta(BaseModel):
    """Standard pagination block returned by every list endpoint."""

    page: int = Field(..., ge=1, description="Current page (1-indexed)")
    page_size: int = Field(..., ge=1, description="Rows returned per page")
    total_rows: int = Field(..., ge=0, description="Total rows matching the filter")
    total_pages: int = Field(..., ge=0, description="Total pages at this page_size")
    filters: dict[str, Any] = Field(
        default_factory=dict,
        description="The filters actually applied (echoed for the client).",
    )


# ----------------------------------------------------------------------
# Market Insights — GET /api/v1/counties/summary
# Source: app_exports/county_summary.csv (Cell 9.5)
# ----------------------------------------------------------------------


class CountySummaryRow(BaseModel):
    """One row of ``county_summary.csv`` — Cell 9.5 builds it as a
    per-county groupby over ``df_model``.
    """

    county: str = Field(..., description="Kenya county name")
    n_listings: int = Field(..., description="Listings in the modelling frame")
    median_price_per_acre_ksh: float = Field(..., description="Median KSh per acre for the county")
    q1_price_per_acre_ksh: float = Field(..., description="25th percentile KSh per acre")
    q3_price_per_acre_ksh: float = Field(..., description="75th percentile KSh per acre")
    mean_log_price_per_acre: float = Field(
        ..., description="Mean of the log target (log KSh per acre)"
    )
    water_body_distance_share: float = Field(
        ..., description="Share of listings with a measured water-body distance"
    )
    n_below_min_county_n: bool = Field(
        ...,
        description=(
            "True when n_listings < CONFIG.MIN_COUNTY_N (Cell 9.5). The "
            "county's summary statistics rest on too few listings to trust."
        ),
    )


class CountySummaryResponse(BaseModel):
    """Response for GET /api/v1/counties/summary."""

    counties: list[CountySummaryRow]
    n_counties: int
    min_county_n: int = Field(
        ..., description="CONFIG.MIN_COUNTY_N from the manifest (small-n threshold)"
    )


# ----------------------------------------------------------------------
# Model Performance — GET /api/v1/model/metrics
# Sources: app_exports/metrics_table.csv + metrics.json (Cell 9.3)
# ----------------------------------------------------------------------


class MetricsTableRow(BaseModel):
    """One row of ``metrics_table.csv`` — Cell 9.3 writes one row per
    (run, model) pair.  The production run's ``weighted_ensemble`` row
    also carries the trimmed-test result and interval_coverage_* fields,
    which are optional here because every other row leaves them blank.
    """

    run: str
    model: str
    cv_rmse_mean: float
    cv_rmse_se: float
    test_R2: float
    test_RMSE: float
    test_MAE: float
    test_MedAPE_pct: float
    test_MAE_KSh_per_acre: float
    ci95_R2_lo: float
    ci95_R2_hi: float
    ci95_RMSE_lo: float
    ci95_RMSE_hi: float
    ci95_MAE_lo: float
    ci95_MAE_hi: float
    county_group_cv_rmse: float | None = Field(
        None, description="County-grouped CV RMSE; NaN for models without one."
    )
    ensemble_weight: float | None = Field(
        None,
        description="Member's ensemble weight; NaN when the model is not in MODEL_ORDER.",
    )
    # Production-run weighted_ensemble only:
    trimmed_test_rmse: float | None = Field(None)
    trimmed_test_rows: int | None = Field(None)
    interval_coverage_50: float | None = Field(None)
    interval_width_ratio_50: float | None = Field(None)
    interval_coverage_80: float | None = Field(None)
    interval_width_ratio_80: float | None = Field(None)
    interval_coverage_90: float | None = Field(None)
    interval_width_ratio_90: float | None = Field(None)


class MetricsTableResponse(BaseModel):
    """Response for the table half of GET /api/v1/model/metrics."""

    rows: list[MetricsTableRow]
    n_runs: int
    n_models_per_run: int


class MetricsJsonResponse(BaseModel):
    """The ``metrics.json`` half of GET /api/v1/model/metrics — returned
    verbatim (the file's structure is nested and stable, so exposing it
    as a free-form dict keeps the endpoint faithful to the notebook).
    """

    model_config = ConfigDict(protected_namespaces=())

    production_run: str
    created: str
    runs: dict[str, Any]
    interval_coverage_weighted_ensemble: list[dict[str, Any]]


class MetricsResponse(BaseModel):
    """Full GET /api/v1/model/metrics response — table + JSON together."""

    table: MetricsTableResponse
    metrics_json: MetricsJsonResponse


# ----------------------------------------------------------------------
# Model Performance — GET /api/v1/model/feature-evaluation
# Source: app_exports/feature_evaluation.csv (Cell 3.8's ranked_table)
# ----------------------------------------------------------------------


class FeatureEvaluationRow(BaseModel):
    """One row of ``feature_evaluation.csv`` — Cell 3.8's ``ranked_table``,
    written out by Cell 9.3.  Every value is on the development set.
    """

    feature: str
    group: str = Field(..., description="Phase 3 FEATURE_GROUPS membership")
    available: str = Field(..., description="Phase 3 AVAILABILITY flag ('Yes' / 'No')")
    missing_pct: float = Field(
        ...,
        description="Share of dev-set rows with the feature missing (%)",
        alias="missing_%",
    )
    mutual_info: float | None = Field(
        None, description="Mutual information vs the target; NaN when not computed."
    )
    perm_delta_rmse: float = Field(
        ...,
        description=(
            "Permutation importance — RMSE increase when the feature is "
            "shuffled within the dev fold (Cell 3.6)."
        ),
    )
    mean_abs_shap: float | None = Field(
        None, description="Mean |SHAP| on the dev set; NaN for non-tree-screened features."
    )
    selection_votes: int = Field(..., description="Votes across the Phase 3 selection methods")
    in_selected_set: bool


class FeatureEvaluationResponse(BaseModel):
    rows: list[FeatureEvaluationRow]
    n_features: int


# ----------------------------------------------------------------------
# Explainability — GET /api/v1/model/explainability
# Sources: shap_global.csv + feature_importance.csv + feature_labels.json (Cell 9.4)
# ----------------------------------------------------------------------


class ShapGlobalRow(BaseModel):
    """One row of ``shap_global.csv`` — Cell 9.4 builds one row per
    (model, feature) pair for the two tree models (xgb, catboost).
    """

    model: str = Field(..., description="'xgb' or 'catboost'")
    feature: str
    mean_abs_shap: float


class FeatureImportanceRow(BaseModel):
    """One row of ``feature_importance.csv`` — Cell 9.4 builds one row per
    (model, feature) pair for all three models, with ``method`` recording
    how the importance was computed.
    """

    model: str = Field(..., description="'xgb', 'catboost', or 'tabnet'")
    feature: str
    importance: float
    method: str = Field(
        ...,
        description=(
            "xgb = gain; catboost = PredictionValuesChange (or "
            "'mean_abs_shap (fallback; ...)' when the native importance is "
            "unavailable on a loaded model); tabnet = permutation on the "
            "development set (5 shuffles, seed from manifest.config.SEED)."
        ),
    )


class FeatureLabel(BaseModel):
    """One entry of ``feature_labels.json:features`` — Cell 9.4."""

    label: str
    unit: str
    description: str
    source: str
    in_production_set: bool
    available_at_prediction_time: str | bool | None


class ExplainabilityResponse(BaseModel):
    """GET /api/v1/model/explainability — combines shap_global,
    feature_importance and feature_labels in one payload so the tab can
    render the global-importance chart and the plain-English feature
    labels in a single round-trip."""

    production_run: str
    shap_global: list[ShapGlobalRow]
    feature_importance: list[FeatureImportanceRow]
    feature_labels: dict[str, FeatureLabel]
    ensemble_shap_coverage: dict[str, Any] = Field(
        ...,
        description=(
            "From the manifest — the weighted sum of member SHAP values "
            "explains the tree share; the TabNet share is NOT covered. "
            "Reports ``tree_share_explained_by_shap`` and "
            "``tabnet_share_not_covered`` plus the notebook's note."
        ),
    )


# ----------------------------------------------------------------------
# Deal Finder — GET /api/v1/listings/scored
# Source: app_exports/listings_scored.parquet (Cell 9.6)
# ----------------------------------------------------------------------


class ListingsScoredRow(BaseModel):
    """One row of ``listings_scored.parquet`` — Cell 9.6.

    The identifier columns (Cell 9.2's ``ID_COLUMNS``) plus the size,
    the listed / predicted / low / high per-acre prices, the
    listed-over-predicted ratio, the scored-by tag (oof / test), the
    verdict (underpriced / overpriced / fair) and a data-quality flag.
    """

    listing_url: str | None = Field(None, description="Source URL (may be empty)")
    listing_no: str | None
    title: str | None
    location: str | None
    county: str | None
    prop_type: str | None
    latitude: float | None
    longitude: float | None
    price_ksh: float | None = Field(None, description="Listed total price (KSh)")
    size_acres: float
    listed_price_per_acre_ksh: float
    predicted_price_per_acre_ksh: float
    low_price_per_acre_ksh: float
    high_price_per_acre_ksh: float
    listed_over_predicted: float = Field(
        ..., description="Listed / predicted ratio (>1 = listed above model)"
    )
    scored_by: str = Field(..., description="'oof' (dev) or 'test'")
    verdict: str = Field(..., description="'underpriced' / 'fair' / 'overpriced'")
    data_quality_flag: bool = Field(
        ...,
        description=(
            "True when the listing's log price per acre falls outside the "
            "development target's 1st-99th percentile window (Cell 9.6)."
        ),
    )


class ListingsScoredResponse(BaseModel):
    """GET /api/v1/listings/scored — paginated + filtered."""

    pagination: PaginationMeta
    listings: list[ListingsScoredRow]
