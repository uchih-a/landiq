"""GET /api/v1/predict/options — the lists + bounds + defaults the
Predictor page renders.

Returns the canonical property-type list (with per-type row counts), the
parcel-size bounds (1st/99th percentile + median from the loaded frame),
the default + allowed confidence levels, and the ten infrastructure
checklist keys — so the frontend never re-types any of them.

Degraded mode: 503 ``DATA_UNAVAILABLE`` when ``listings_scored.parquet``
is not loaded (the canonical lists cannot be population-checked without
the frame).  The frontend shows an error state with retry and disables
submit.
"""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.schemas.predict_options import PredictOptionsResponse
from app.services.predict_options import compute_predict_options

router = APIRouter(tags=["predict"])


@router.get("/predict/options", response_model=PredictOptionsResponse)
async def predict_options(request: Request) -> PredictOptionsResponse:
    """Read-only options for the Predictor form."""
    app_exports = request.app.state.app_exports
    df = app_exports.require("listings_scored_df", "listings_scored.parquet")
    return compute_predict_options(df)
