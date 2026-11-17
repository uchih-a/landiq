"""Schemas for GET /api/v1/model/predictions + GET /api/v1/model/error-by-support.

Both endpoints serve data that already exists as artifact files from
Notebook 3 but were never exposed via the API in B3.  The columns below
match the actual file contents — verified against Cell 9.2's
``_prediction_export`` function (for the prediction parquets) and Cell 9.9's
``_support_rows`` function (for error_by_support.csv).
"""

from __future__ import annotations

from pydantic import BaseModel, Field

# ----------------------------------------------------------------------
# GET /api/v1/model/predictions
# Source: app_exports/oof_predictions.parquet + test_predictions.parquet (Cell 9.2)
#
# Cell 9.2's _prediction_export writes:
#   ID_COLUMNS (9): listing_url, listing_no, title, location, county,
#                    prop_type, latitude, longitude, price_ksh
#   y_true: log price per acre (the target)
#   pred_xgb, pred_catboost, pred_tabnet, pred_simple_average,
#   pred_weighted_ensemble: log-scale per-model predictions
#   fold: held-out fold of first CV repeat (-1 for test)
#   split: "dev" (oof) or "test"
# Total: 17 columns
# ----------------------------------------------------------------------


class PredictionRow(BaseModel):
    """One row from oof_predictions or test_predictions parquet."""

    listing_url: str | None = None
    listing_no: str | None = None
    title: str | None = None
    location: str | None = None
    county: str | None = None
    prop_type: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    price_ksh: float | None = Field(None, description="Listed total price (KSh)")
    y_true: float = Field(..., description="Log price per acre (the target)")
    pred_xgb: float = Field(..., description="XGBoost log-scale prediction")
    pred_catboost: float = Field(..., description="CatBoost log-scale prediction")
    pred_tabnet: float = Field(..., description="TabNet log-scale prediction")
    pred_simple_average: float = Field(
        ..., description="Simple average of member predictions (log scale)"
    )
    pred_weighted_ensemble: float = Field(
        ..., description="Weighted ensemble prediction (log scale)"
    )
    fold: int = Field(..., description="Held-out fold of first CV repeat (-1 for test rows)")
    split: str = Field(..., description="'dev' (out-of-fold) or 'test'")


class ModelPredictionsResponse(BaseModel):
    """GET /api/v1/model/predictions response — both OOF + test sets together."""

    oof: list[PredictionRow] = Field(
        ...,
        description="Development-set out-of-fold predictions (each row predicted by models that never trained on it)",
    )
    test: list[PredictionRow] = Field(
        ..., description="Test-set predictions (models fitted on development data only)"
    )
    oof_count: int = Field(
        ..., description="Total OOF rows in the file (may differ from len(oof) when sampling)"
    )
    test_count: int = Field(
        ..., description="Total test rows in the file (may differ from len(test) when sampling)"
    )
    sampled: bool = Field(
        False,
        description="True when a sample parameter was used — the returned rows are a deterministic subset",
    )
    sample_size: int | None = Field(
        None, description="The sample size requested (null when no sampling)"
    )


# ----------------------------------------------------------------------
# GET /api/v1/model/error-by-support
# Source: backend_exports/error_by_support.csv (Cell 9.9)
#
# Cell 9.9's _support_rows writes:
#   support_measure: "county_listings" or "nearby_within_50km"
#   band: the support band label (e.g. "<10 (below COVERAGE_MIN_COUNTY_N)")
#   n_listings: count of listings in that band
#   oof_rmse: OOF RMSE for that band (4dp)
#   oof_mae: OOF MAE for that band (4dp)
# Total: 5 columns
# ----------------------------------------------------------------------


class ErrorBySupportRow(BaseModel):
    """One row from error_by_support.csv."""

    support_measure: str = Field(..., description="'county_listings' or 'nearby_within_50km'")
    band: str = Field(
        ...,
        description="Support band label (e.g. '<10 (below COVERAGE_MIN_COUNTY_N)', '10-19', '50+')",
    )
    n_listings: int = Field(..., description="Count of listings in that band")
    oof_rmse: float = Field(..., description="OOF RMSE for that band (log scale)")
    oof_mae: float = Field(..., description="OOF MAE for that band (log scale)")


class ErrorBySupportResponse(BaseModel):
    """GET /api/v1/model/error-by-support response."""

    rows: list[ErrorBySupportRow]
    n_rows: int
