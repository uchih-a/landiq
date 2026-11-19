"""Response schemas for the read-only data endpoints.

Every schema mirrors the **actual** columns written by Notebook 3 Phase 9
(verified against Cells 9.3, 9.4, 9.5, 9.6, 9.7 — see the per-class
docstrings for the cell citation).  Cell 9.7's ``manifest.json`` carries
the authoritative ``columns`` / ``dtypes`` lists for each file, so the
OpenAPI docs generated from these schemas stay accurate without needing
the data files present at schema-build time.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# P3b: the canonical CountySummaryRow / CountySummaryResponse live in
# ``app.schemas.counties``; re-exported here so existing imports keep
# working (the ``as`` aliases mark deliberate re-exports).
from app.schemas.counties import (
    CountySummaryResponse as CountySummaryResponse,
)
from app.schemas.counties import (
    CountySummaryRow as CountySummaryRow,
)
from app.schemas.counties import (
    PriceBandEdge as PriceBandEdge,
)
from app.schemas.counties import (
    PropertyTypeCount as PropertyTypeCount,
)
from app.schemas.pagination import PaginationMeta as PaginationMeta

# ----------------------------------------------------------------------
# Shared envelope for paginated responses
# ----------------------------------------------------------------------


# ----------------------------------------------------------------------
# Market Insights — GET /api/v1/counties/summary
# Source: app_exports/county_summary.csv (Cell 9.5)
# ----------------------------------------------------------------------
# P3b: the canonical CountySummaryRow / CountySummaryResponse live in
# ``app.schemas.counties`` (where the P3b additive fields were added);
# they are re-exported here so existing imports keep working.  The
# ``as`` aliases mark them as deliberate re-exports (ruff F401 exempt).
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
    """Full GET /api/v1/model/metrics response — table + JSON together.

    P5b additions (all nullable, additive):
    - ``ensemble_model`` — the production run's ensemble row's model
      name (identified by the backend), null when no such row exists.
      The frontend resolves the ensemble row by THIS value only (no
      substring/heuristic fallbacks).
    - ``production_run_label`` — the production run's name + created
      date from the response, for the card subtitle.
    - ``interval_levels`` — the nominal interval coverage levels present
      in the data: derived from
      ``metrics_json.interval_coverage_weighted_ensemble[*].level`` when
      the artifact carries them; else from the ensemble row's populated
      ``interval_coverage_*`` columns; else null.
    - ``interval_method`` — documented backend constant describing the
      interval implementation (the modeling code implements the
      multiplicative split-conformal interval — see
      ``src/landval/modelling/predict.py``); null when unknown.
    - ``n_test`` / ``n_dev`` — row counts of the loaded prediction
      parquets (test_predictions / oof_predictions); null when the file
      is not loaded.
    - ``model_info`` — per-model ``display_name`` + ``family`` from the
      backend's documented model registry mapping (facts about the
      model implementations, not UI copy).
    - ``default_interval_level`` — the app's standard level (the same
      canonical constant the predict options endpoint serves).
    """

    model_config = ConfigDict(protected_namespaces=())

    table: MetricsTableResponse
    metrics_json: MetricsJsonResponse
    ensemble_model: str | None = None
    production_run_label: str | None = None
    interval_levels: list[float] | None = None
    default_interval_level: float | None = None
    interval_method: str | None = None
    n_test: int | None = None
    n_dev: int | None = None
    model_info: dict[str, dict[str, str]] = {}


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


class ExplainabilityCoverage(BaseModel):
    """The ``ensemble_shap_coverage`` block on the explainability payload
    (P6b) — normalised to FRACTIONS in [0, 1] with documented keys, plus the
    ``source`` flag so the UI can say where the numbers come from.

    - ``source="recomputed"`` — computed by the backend from the weights of
      the actually-loaded (post-pruning, renormalised) ensemble via the ONE
      shared function (``landval.modelling.coverage``).  ``explained_members``
      / ``unexplained_members`` list the real kept members in this case.
    - ``source="manifest"`` — the notebook-time values from
      ``manifest.json:ensemble_shap_coverage`` (pre-pruning), normalised to
      fractions (values above 1 are treated as percentages).  Members are
      ``None`` in this case: the manifest does not record them, and the
      backend never invents member names.
    - ``source=None`` — neither path produced shares (e.g. the manifest block
      is absent and the model registry is not loaded).
    """

    model_config = ConfigDict(protected_namespaces=())

    tree_share_explained_by_shap: float | None = Field(
        None, description="Fraction in [0,1] of the ensemble blend the SHAP values explain."
    )
    tabnet_share_not_covered: float | None = Field(
        None,
        description="Fraction in [0,1] of the blend SHAP does NOT explain (kept for name compatibility — the share of every non-tree member, 0 when none are kept).",
    )
    explained_members: list[str] | None = Field(
        None, description="Kept members the SHAP values cover (source='recomputed' only)."
    )
    unexplained_members: list[str] | None = Field(
        None, description="Kept members SHAP does not cover (source='recomputed' only)."
    )
    source: Literal["recomputed", "manifest"] | None = Field(
        None, description="'recomputed' (loaded ensemble) or 'manifest' (training-time report)."
    )
    note: str | None = Field(
        None, description="The notebook's explanatory note, passed through when present."
    )


class ExplainabilityModel(BaseModel):
    """One ensemble member on the explainability payload (P6b).

    ``ensemble_weight`` is the member's weight in the loaded (renormalised)
    ensemble — ``None`` when the model registry is not loaded.  ``has_shap``
    is True when the member has rows in ``shap_global.csv`` (i.e. the bars
    card can chart it).  ``display_name`` / ``family`` come from the
    backend's documented model registry mapping (``app.schemas.canonical.
    MODEL_INFO``) so the frontend never re-types them.
    """

    model_config = ConfigDict(protected_namespaces=())
    key: str = Field(
        ..., description="Member key exactly as the data uses it ('xgb', 'catboost', 'tabnet')"
    )
    display_name: str = Field(
        ..., description="Human-readable name from the backend model registry mapping"
    )
    family: str | None = Field(
        None,
        description="'tree' / 'neural' / 'ensemble' / 'baseline' from the backend mapping; null for unknown keys",
    )
    ensemble_weight: float | None = Field(
        None, description="Weight in the loaded ensemble; null when the registry is not loaded"
    )
    has_shap: bool = Field(..., description="True when the member has rows in shap_global.csv")


class ExplainabilityResponse(BaseModel):
    """GET /api/v1/model/explainability — combines shap_global,
    feature_importance and feature_labels in one payload so the tab can
    render the global-importance chart and the plain-English feature
    labels in a single round-trip.

    P6b additions (all nullable / defaulting, additive — older payloads
    without them still validate):
    - ``models`` — the ensemble member list (key, display_name, family,
      ensemble_weight, has_shap), ordered by ensemble weight descending.
      Built from the loaded registry when available, else from the
      distinct models in shap_global.csv (weights null).
    - ``default_model`` — the SHAP-covered member with the highest
      ensemble weight (the bars card's default selection); the first
      SHAP-covered member in file order when no weights are available;
      null when no member has SHAP rows.
    - ``ensemble_shap_coverage`` — see ``ExplainabilityCoverage``.
    - ``typical_price_per_acre_ksh`` / ``combined_base_value`` — the
      load-time baseline price (exp of the weighted sum of tree-member
      base values — the SAME baseline every /predict response reports).
      Null when the model registry / explanation service is unavailable
      (never invented).
    """

    model_config = ConfigDict(protected_namespaces=())
    production_run: str
    shap_global: list[ShapGlobalRow]
    feature_importance: list[FeatureImportanceRow]
    feature_labels: dict[str, FeatureLabel]
    ensemble_shap_coverage: ExplainabilityCoverage
    models: list[ExplainabilityModel] = Field(default_factory=list)
    default_model: str | None = None
    typical_price_per_acre_ksh: float | None = None
    combined_base_value: float | None = None


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
