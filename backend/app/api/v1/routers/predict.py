"""POST /api/v1/predict — point estimate + multiplicative conformal range
+ live SHAP driver breakdown + nearby-listing comparables.

Returns the median KSh-per-acre price for a Kenyan land parcel, the
multiplicative confidence range at the requested level, a low-support
warning when the point's county or 50 km neighbourhood has too few
modelling-set listings to trust the estimate, the live driver breakdown
(``explain_spec.md``'s ``effect = exp(s) - 1`` rule applied to the
combined tree-member SHAP values), and the nearest comparable listings
from ``listings_scored.parquet``.
"""

# NOTE: no `from __future__ import annotations` here — slowapi's @limiter.limit
# decorator wraps the function in a way that breaks Pydantic's forward-ref
# resolution when annotations are strings. Without the future import, the
# annotations are actual objects, so FastAPI can introspect them directly.

from fastapi import APIRouter, Request

from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.core.rate_limit import limiter, predict_limit
from app.schemas.predict import (
    ComparableListingResponse,
    CoverageWarningResponse,
    DriverContributionResponse,
    EnsembleShapCoverage,
    LiveExplanationResponse,
    PredictNamedPOI,
    PredictRequest,
    PredictResponse,
)

router = APIRouter(tags=["predict"])
logger = get_logger("app.predict")


@router.post("/predict", response_model=PredictResponse)
@limiter.limit(predict_limit)
async def predict(request: Request, body: PredictRequest) -> PredictResponse:
    """Predict the price per acre of a Kenyan land parcel.

    Returns 503 ``MODEL_NOT_LOADED`` when the ensemble is not loaded
    (degraded mode — copy the artefacts into ``ARTIFACTS_DIR`` and restart).
    The live explanation and comparables blocks are added when their
    respective services are available; they degrade to ``null`` / ``[]``
    independently (e.g. when ``listings_scored.parquet`` is missing the
    prediction still returns, just without comparables).
    """
    reg: object = getattr(request.app.state, "model_registry", None)
    if reg is None or not getattr(reg, "loaded", False):
        raise AppError(
            code="MODEL_NOT_LOADED",
            message=(
                "The prediction ensemble is not loaded. Copy the contents of "
                "models/ensemble/ from Notebook 3 into ARTIFACTS_DIR and "
                "restart the service."
            ),
            status_code=503,
            details={
                "loaded": bool(reg) and getattr(reg, "loaded", False),
                "missing_files": getattr(reg, "missing_files", []) if reg else [],
            },
        )

    service = getattr(request.app.state, "prediction_service", None)
    if service is None:
        # Should not happen if reg.loaded is True — the lifespan hook builds
        # the service alongside the registry.  Surface as 500 regardless.
        raise AppError(
            code="SERVICE_UNAVAILABLE",
            message="PredictionService is not initialised.",
            status_code=500,
        )

    # ---- 1. The core prediction (Cell 8.3 + Cell 9.1) ----
    import time as _time

    from app.core.metrics import (
        predict_inference_seconds,
        predict_low_support_total,
        predict_shap_seconds,
    )

    _t_inference_start = _time.perf_counter()
    result = service.predict(
        lat=body.lat,
        lon=body.lon,
        size_acres=body.size_acres,
        prop_type=body.prop_type,
        parcel_features=body.to_parcel_dict(),
        level=body.confidence_level,
    )
    _t_inference = _time.perf_counter() - _t_inference_start
    predict_inference_seconds.observe(_t_inference)

    # ---- Record the low-support product signal (B9) ----
    # Labeled counter: how often /predict returns a low-support/unsupported
    # result, by county.  This is the product signal — where the model is
    # extrapolating beyond its training coverage.
    _county_label = result.county or "(unknown)"
    predict_low_support_total.labels(
        county=_county_label,
        is_low_support=str(result.coverage.is_low_support),
    ).inc()

    # ---- 2. Live SHAP driver breakdown (Cell 9.4 + Cell 9.10) ----
    explanation_response: LiveExplanationResponse | None = None
    explanation_service = getattr(request.app.state, "explanation_service", None)
    if explanation_service is not None and result.frame is not None:
        try:
            _t_shap_start = _time.perf_counter()
            explanation = explanation_service.explain(result.frame)
            predict_shap_seconds.observe(_time.perf_counter() - _t_shap_start)
            explanation_response = LiveExplanationResponse(
                drivers=[
                    DriverContributionResponse(
                        feature=d.feature,
                        label=d.label,
                        shap_value=d.shap_value,
                        effect_pct=d.effect_pct,
                        direction=d.direction,
                    )
                    for d in explanation.drivers
                ],
                coverage=EnsembleShapCoverage(
                    tree_share_explained_by_shap=explanation.tree_share_explained_by_shap,
                    tabnet_share_not_covered=explanation.tabnet_share_not_covered,
                    explained_members=explanation.explained_members,
                    unexplained_members=explanation.unexplained_members,
                    combined_base_value=explanation.combined_base_value,
                    typical_price_per_acre_ksh=explanation.typical_price_per_acre_ksh,
                    latency_ms=explanation.latency_ms,
                ),
            )
        except Exception as e:
            # The prediction itself is valid; the explanation is a soft
            # failure.  Log and return null rather than 500-ing the whole
            # request — the operator can investigate via the log.
            logger.warning(
                "live_explanation_failed",
                error=str(e),
                error_type=type(e).__name__,
            )

    # ---- 3. Comparables (Cell 9.6 listings_scored.parquet) ----
    comparables_response: list[ComparableListingResponse] = []
    comparables_service = getattr(request.app.state, "comparables_service", None)
    if comparables_service is not None:
        try:
            comparables = comparables_service.find_comparables(
                lat=body.lat,
                lon=body.lon,
                county=result.county,
                limit=10,
            )
            comparables_response = [
                ComparableListingResponse(
                    listing_no=c.listing_no,
                    title=c.title,
                    location=c.location,
                    county=c.county,
                    size_acres=c.size_acres,
                    listed_price_per_acre_ksh=c.listed_price_per_acre_ksh,
                    predicted_price_per_acre_ksh=c.predicted_price_per_acre_ksh,
                    verdict=c.verdict,
                    distance_km=c.distance_km,
                )
                for c in comparables
            ]
        except Exception as e:
            logger.warning(
                "comparables_failed",
                error=str(e),
                error_type=type(e).__name__,
            )

    # ---- 4. Named POIs (kenya_pois_named.gpkg — Cell 5.2 with name added) ----
    # For the "Nearby & Infrastructure" list.  Soft-failure: when the
    # named-POI layer isn't loaded (the extraction hasn't been run), the
    # field is an empty list — the prediction itself is still valid.
    named_pois_response: list[PredictNamedPOI] = []
    named_poi_index = getattr(request.app.state, "named_poi_index", None)
    if named_poi_index is not None and named_poi_index.loaded:
        try:
            pois = named_poi_index.nearby_named_pois(
                lat=body.lat, lon=body.lon, radius_km=5.0, limit=10
            )
            named_pois_response = [
                PredictNamedPOI(
                    name=p.name,
                    category=p.category,
                    distance_km=p.distance_km,
                    is_fallback=p.is_fallback,
                )
                for p in pois
            ]
        except Exception as e:
            logger.warning(
                "named_pois_failed",
                error=str(e),
                error_type=type(e).__name__,
            )

    cov = result.coverage
    return PredictResponse(
        price_per_acre_ksh=result.price_per_acre_ksh,
        price_per_acre_low_ksh=result.price_per_acre_low_ksh,
        price_per_acre_high_ksh=result.price_per_acre_high_ksh,
        total_price_ksh=result.total_price_ksh,
        total_price_low_ksh=result.total_price_low_ksh,
        total_price_high_ksh=result.total_price_high_ksh,
        confidence_level=result.confidence_level,
        county=result.county,
        coverage=CoverageWarningResponse(
            is_low_support=cov.is_low_support,
            county_listings=cov.county_listings,
            nearby_listings=cov.nearby_listings,
            radius_km=cov.radius_km,
            min_county_n=cov.min_county_n,
            min_nearby_n=cov.min_nearby_n,
            reason=cov.reason,
        ),
        ensemble_members=result.ensemble_members,
        diagnostics=result.diagnostics,
        explanation=explanation_response,
        comparables=comparables_response,
        named_pois=named_pois_response,
    )
